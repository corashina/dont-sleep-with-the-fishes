import { Group, PerspectiveCamera } from 'three';
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

function createEnvironment() {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  const created: string[] = [];
  const cloned: string[] = [];
  const environment = {
    eventModels: {
      create: vi.fn((id: string) => {
        created.push(id);
        if (id === 'ghost') return namedGroup('model:ghost');
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
      play: vi.fn(async () => undefined),
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
    presentation.update(0, 2);
    await reaction;
    expect(presentation.worldRoot.getObjectByName(visibleName)?.visible).toBe(true);
    expect(environment.dive.clear).toHaveBeenCalledOnce();
    presentation.dispose();
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

  it('settles active work and clears the borrowed dive once', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 4 });
    const leave = presentation.playChoice('leave');
    presentation.settleForVisibilityChange();
    await leave;
    presentation.dispose();
    presentation.dispose();
    expect(environment.dive.settleForVisibilityChange).toHaveBeenCalledOnce();
    expect(environment.dive.clear).toHaveBeenCalledTimes(1);
  });
});
