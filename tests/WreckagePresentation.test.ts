import {
  BoxGeometry,
  Group,
  type InstancedMesh,
  Matrix4,
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
  const created: string[] = [];
  const cloned: string[] = [];
  const environment = {
    eventModels: {
      create: vi.fn((id: string) => {
        created.push(id);
        if (id === 'ghost') return options.ghost ?? namedGroup('model:ghost');
        return { root: namedGroup(`model:${id}`), dispose: vi.fn() };
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
    dive: {
      play: vi.fn(options.divePlay ?? (async () => undefined)),
      clear: vi.fn(),
      settleForVisibilityChange: vi.fn(),
    },
    delegateCarlitos: vi.fn(async (retrieve: () => Promise<void>) => retrieve()),
  } as unknown as DedicatedEventEnvironment;
  return { environment, created, cloned };
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
    expect(created).toEqual(['containerShip', 'ghost']);
    expect(cloned).toEqual(['anglerFish', 'driftingBarrel']);
    expect(presentation.worldRoot.getObjectByName('wreckage-wreck')?.visible).toBe(true);
    expect(environment.dive.clear).not.toHaveBeenCalled();
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
    const reaction = presentation.react(outcomePresentation(key));
    presentation.update(0, 3);
    await reaction;
    expect(presentation.worldRoot.getObjectByName(visibleName)?.visible).toBe(true);
    expect(environment.dive.clear).not.toHaveBeenCalled();
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

  it('applies debris approach and falling-debris choreography', () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    const matrix = new Matrix4();
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const debris = presentation.worldRoot.getObjectByName(
      'wreckage-surface-debris',
    ) as InstancedMesh;
    debris.getMatrixAt(0, matrix);
    const startingY = matrix.elements[13]!;
    const startingZ = matrix.elements[14]!;

    presentation.playChoice('search');
    presentation.update(0, 0.8);
    debris.getMatrixAt(0, matrix);
    expect(matrix.elements[14]).toBeGreaterThan(startingZ);

    presentation.react(outcomePresentation('wreckage.dive-collapse'));
    presentation.update(0.8, 0.9);
    debris.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeLessThan(startingY);
    presentation.dispose();
  });

  it('shows injury effects only for the injury result', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });

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
