import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createInactiveVortexWaveState } from '../src/ocean/WaveField';
import { WreckagePresentation } from '../src/survival/events/WreckagePresentation';
import type {
  DedicatedEventEnvironment,
  EventOutcomePresentation,
} from '../src/survival/eventPresentationTypes';

function namedGroup(name: string): Group {
  const group = new Group();
  group.name = name;
  return group;
}

function outcomePresentation(key: EventOutcomePresentation['outcome']['eventPresentationKey'])
: EventOutcomePresentation {
  return {
    outcome: {
      accepted: true,
      code: 'event',
      message: '',
      deltas: {},
      cue: 'none',
      eventPresentationKey: key,
    },
    resourceDeltas: {},
    gainedInstanceIds: [],
    brokenInstanceIds: [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: null,
    selectedCondition: null,
    targetInstanceId: null,
  };
}

interface EnvironmentOptions {
  readonly divePlay?: () => Promise<void>;
  readonly diveClear?: () => void;
  readonly diveSettle?: () => void;
  readonly ghost?: Group;
}

function deferredVoid(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createEnvironment(options: EnvironmentOptions = {}) {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  const cameraEffectsRoot = new Group();
  const created: string[] = [];
  const cloned: string[] = [];
  const ownedModelDispose = vi.fn();
  const environment = {
    eventModels: {
      create: vi.fn((id: string) => {
        created.push(id);
        if (id === 'ghost') return options.ghost ?? namedGroup('model:ghost');
        return {
          root: namedGroup(`model:${id}`),
          dispose: () => ownedModelDispose(id),
        };
      }),
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    },
    featuredModels: {
      clone: vi.fn((id: string) => {
        cloned.push(id);
        return namedGroup(`featured:${id}`);
      }),
    },
    supplies: { setPresentationItemHidden: vi.fn() },
    carlitos: {},
    vortexWave: createInactiveVortexWaveState(),
    sampleWorldWaveInto: vi.fn(),
    readWorldWaveAmplitudeScale: () => 1,
    camera,
    cameraEffectsRoot,
    dive: {
      play: vi.fn(options.divePlay ?? (async () => undefined)),
      clear: vi.fn(options.diveClear),
      settleForVisibilityChange: vi.fn(options.diveSettle),
    },
    delegateCarlitos: vi.fn(async (retrieve: () => Promise<void>) => retrieve()),
  } as unknown as DedicatedEventEnvironment;
  return { environment, created, cloned, cameraEffectsRoot, ownedModelDispose };
}

describe('WreckagePresentation', () => {
  it('stages debris and holds the wreck after scuba entry', async () => {
    const { environment, created, cloned } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 17 });
    const reveal = presentation.reveal();
    presentation.update(0, 1.2);
    await reveal;
    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();
    presentation.update(1.2, 3);
    await expect(dive).resolves.toBe(true);
    expect(environment.dive.play).toHaveBeenCalledWith('scubaSet-1', {
      onWaterImpact: expect.any(Function),
      revealUnderwaterScene: true,
    });
    expect(created).toEqual(['containerShip', 'leakPlanks', 'ghost']);
    expect(cloned).toEqual(['anglerFish', 'driftingBarrel']);
    expect(presentation.worldRoot.getObjectByName('wreckage-surface-debris')?.children)
      .toHaveLength(4);
    expect(presentation.worldRoot.getObjectByName('wreckage-wreck')?.visible).toBe(true);
    expect(environment.dive.clear).not.toHaveBeenCalled();
    presentation.dispose();
  });

  it('keeps every underwater actor hidden until scuba entry completes', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 17 });

    const reveal = presentation.reveal();
    presentation.update(0, 0.6);
    expect(presentation.worldRoot.getObjectByName('wreckage-wreck')?.visible).toBe(false);
    presentation.update(0.6, 0.6);
    await reveal;
    await presentation.react(outcomePresentation('wreckage.search-food'));

    for (const name of [
      'wreckage-wreck',
      'wreckage-loot',
      'wreckage-silt',
      'wreckage-creature',
      'wreckage-ghost',
    ]) {
      expect(presentation.worldRoot.getObjectByName(name)?.visible).toBe(false);
    }

    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();
    presentation.update(1.2, 0.9);
    expect(presentation.worldRoot.getObjectByName('wreckage-wreck')?.visible).toBe(true);
    presentation.update(2.1, 2.1);
    await dive;
    presentation.dispose();
  });

  it.each([
    ['wreckage.dive-loot', 'wreckage-loot'],
    ['wreckage.dive-collapse', 'wreckage-silt'],
    ['wreckage.dive-creature', 'wreckage-creature'],
    ['wreckage.dive-ghost', 'wreckage-ghost'],
  ] as const)('plays %s reaction', async (key, visibleName) => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 17 });
    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();
    presentation.update(0, 3);
    await dive;
    const reaction = presentation.react(outcomePresentation(key));
    presentation.update(0, 3);
    await reaction;
    expect(presentation.worldRoot.getObjectByName(visibleName)?.visible).toBe(true);
    expect(environment.dive.clear).toHaveBeenCalledOnce();
    presentation.dispose();
  });

  it('keeps the borrowed dive through return and releases it once', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 17 });

    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();
    presentation.update(0, 3);
    await expect(dive).resolves.toBe(true);
    expect(environment.dive.clear).not.toHaveBeenCalled();

    const reaction = presentation.react(outcomePresentation('wreckage.dive-loot'));
    presentation.update(3, 1.2);
    expect(environment.dive.clear).not.toHaveBeenCalled();
    presentation.update(4.2, 0.8);
    await reaction;

    expect(environment.dive.clear).toHaveBeenCalledOnce();
    expect(presentation.worldRoot.visible).toBe(false);
    presentation.dispose();
    expect(environment.dive.clear).toHaveBeenCalledOnce();
  });

  it('delegates only the surface search to Carlitos', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const delegated = presentation.playChoice('delegate-carlitos');
    presentation.update(0, 1.4);
    await delegated;
    expect(environment.delegateCarlitos).toHaveBeenCalledOnce();
    await expect(presentation.playItemUse('search', 'scubaSet-1')).resolves.toBe(false);
    presentation.dispose();
  });

  it('does not call shared dive cleanup when no dive was borrowed', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const leave = presentation.playChoice('leave');
    presentation.settleForVisibilityChange();
    await leave;
    presentation.dispose();
    presentation.dispose();
    expect(environment.dive.settleForVisibilityChange).not.toHaveBeenCalled();
    expect(environment.dive.clear).not.toHaveBeenCalled();
  });

  it('settles a borrowed dive and resolves its item use once', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();

    presentation.settleForVisibilityChange();
    await expect(dive).resolves.toBe(false);

    expect(environment.dive.settleForVisibilityChange).toHaveBeenCalledOnce();
    expect(environment.dive.clear).not.toHaveBeenCalled();
    presentation.dispose();
  });

  it('settles the active beat after dive settlement fails', async () => {
    const cleanupError = new Error('dive settle failed');
    const { environment } = createEnvironment({ diveSettle: () => {
      throw cleanupError;
    } });
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();

    expect(() => presentation.settleForVisibilityChange()).toThrow(cleanupError);
    await expect(dive).resolves.toBe(false);
    presentation.dispose();
  });

  it('settles the planned return before it releases the borrowed dive', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();
    presentation.update(0, 3);
    await dive;

    const reaction = presentation.react(outcomePresentation('wreckage.dive-creature'));
    presentation.settleForVisibilityChange();
    await reaction;

    expect(environment.dive.settleForVisibilityChange).toHaveBeenCalledOnce();
    expect(environment.dive.clear).not.toHaveBeenCalled();
    expect(presentation.worldRoot.visible).toBe(false);
    presentation.update(3, 2);
    expect(environment.dive.clear).not.toHaveBeenCalled();
    presentation.dispose();
  });

  it('does not start an underwater hold after clear interrupts dive entry', async () => {
    const pendingDive = deferredVoid();
    const { environment } = createEnvironment({ divePlay: () => pendingDive.promise });
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });

    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    presentation.clear();
    pendingDive.resolve();
    await expect(dive).resolves.toBe(false);

    expect(environment.dive.clear).toHaveBeenCalledOnce();
    expect(presentation.worldRoot.visible).toBe(false);
    presentation.dispose();
  });

  it('cancels an active underwater hold and releases the borrowed dive once', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });

    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();
    presentation.clear();
    await expect(dive).resolves.toBe(false);

    expect(environment.dive.clear).toHaveBeenCalledOnce();
    presentation.dispose();
    expect(environment.dive.clear).toHaveBeenCalledOnce();
  });

  it('finishes clear state after dive cleanup fails', async () => {
    const cleanupError = new Error('dive clear failed');
    const { environment } = createEnvironment({ diveClear: () => {
      throw cleanupError;
    } });
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();

    expect(() => presentation.clear()).toThrow(cleanupError);
    await expect(dive).resolves.toBe(false);
    expect(presentation.worldRoot.visible).toBe(false);
    expect(presentation.boatRoot.visible).toBe(false);
    presentation.dispose();
  });

  it('finishes owned cleanup after dive cleanup fails during disposal', async () => {
    const cleanupError = new Error('dive clear failed');
    const { environment, ownedModelDispose } = createEnvironment({ diveClear: () => {
      throw cleanupError;
    } });
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();

    expect(() => presentation.dispose()).toThrow(cleanupError);
    await expect(dive).resolves.toBe(false);
    expect(presentation.worldRoot.children).toHaveLength(0);
    expect(presentation.boatRoot.children).toHaveLength(0);
    expect(ownedModelDispose.mock.calls.map(([id]) => id)).toEqual([
      'containerShip',
      'leakPlanks',
    ]);
  });

  it('moves only the seeded debris piece during Carlitos retrieval', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 5 });
    const debris = presentation.worldRoot.getObjectByName(
      'wreckage-surface-debris',
    ) as Group;
    const before = debris.children.map((plank) => plank.position.z);

    const retrieve = presentation.playChoice('delegate-carlitos');
    presentation.update(0, 0.8);
    const movedIndices = debris.children.flatMap((plank, index) => (
      plank.position.z === before[index] ? [] : [index]
    ));
    expect(movedIndices).toEqual([1]);
    presentation.update(0.8, 0.6);
    await retrieve;
    presentation.dispose();
  });

  it('floats every plank at the waterline during reveal and surface hold', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const debris = presentation.worldRoot.getObjectByName(
      'wreckage-surface-debris',
    ) as Group;

    const reveal = presentation.reveal();
    presentation.update(0, 0.6);
    const firstFrame = debris.children.map((plank) => plank.position.y);
    presentation.update(0.6, 0.6);
    await reveal;
    presentation.update(1.4, 0);
    const secondFrame = debris.children.map((plank) => plank.position.y);
    expect(secondFrame).not.toEqual(firstFrame);
    expect(secondFrame.every((y) => y >= -0.08 && y <= 0.18)).toBe(true);
    presentation.dispose();
  });

  it('keeps the surface planks at the waterline during a collapse', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const debris = presentation.worldRoot.getObjectByName(
      'wreckage-surface-debris',
    ) as Group;
    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    await Promise.resolve();
    presentation.update(0, 3);
    await dive;

    presentation.react(outcomePresentation('wreckage.dive-collapse'));
    presentation.update(0, 0.9);
    expect(debris.children.every((plank) => (
      plank.position.y >= -0.08 && plank.position.y <= 0.18
    ))).toBe(true);
    presentation.dispose();
  });

  it('shows injury effects only after the complete search choice', async () => {
    const { environment, cameraEffectsRoot } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });

    const search = presentation.playChoice('search');
    presentation.update(0, 0.7);
    expect(presentation.worldRoot.getObjectByName('wreckage-search-injury-flash')?.visible).toBe(false);
    expect(cameraEffectsRoot.rotation.x).toBe(0);
    expect(cameraEffectsRoot.rotation.z).toBeCloseTo(0);
    presentation.update(0.7, 0.7);
    await search;

    await presentation.react(outcomePresentation('wreckage.search-repair'));
    expect(presentation.boatRoot.getObjectByName('wreckage-recovered-debris')?.visible).toBe(true);
    expect(presentation.worldRoot.getObjectByName('wreckage-search-injury-flash')?.visible).toBe(false);

    await presentation.react(outcomePresentation('wreckage.carlitos-empty'));
    expect(presentation.boatRoot.getObjectByName('wreckage-recovered-debris')?.visible).toBe(false);
    expect(presentation.worldRoot.getObjectByName('wreckage-search-injury-flash')?.visible).toBe(false);

    const injury = presentation.react(outcomePresentation('wreckage.search-injury'));
    presentation.update(0, 0.7);
    expect(presentation.worldRoot.getObjectByName('wreckage-search-injury-flash')?.visible).toBe(true);
    presentation.update(0.7, 0.7);
    await injury;
    presentation.dispose();
  });

  it('disposes GPU resources owned by the ghost clone', () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    const ghost = namedGroup('model:ghost');
    ghost.add(new Mesh(geometry, material));
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const { environment } = createEnvironment({ ghost });
    const presentation = new WreckagePresentation(environment);

    presentation.dispose();

    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(disposeTexture).toHaveBeenCalledOnce();
  });
});
