import {
  Group,
  Material,
  Mesh,
  PointLight,
  PerspectiveCamera,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type {
  ItemInstanceId,
} from '../src/game/ItemState';
import { DEFAULT_WAVES } from '../src/ocean/WaveField';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { ChestDisplay } from '../src/survival/ChestDisplay';
import type {
  FocusedEventPresentationDependencies,
} from '../src/survival/FocusedEventPresentation';
import { NightTraderPresentation } from '../src/survival/NightTraderPresentation';
import type {
  ActionOutcome,
  SurvivalInventorySnapshot,
  SurvivalSnapshot,
} from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

const outcome: ActionOutcome = {
  accepted: true,
  code: 'event-resolved',
  message: 'Resolved.',
  deltas: {},
  cue: 'none',
};

function snapshot(): SurvivalSnapshot {
  const mapId = 'map-1' as ItemInstanceId;
  const umbrellaId = 'umbrella-1' as ItemInstanceId;
  const inventory: SurvivalInventorySnapshot = {
    [mapId]: {
      instanceId: mapId,
      type: 'map' as const,
      condition: 'usable' as const,
    },
    [umbrellaId]: {
      instanceId: umbrellaId,
      type: 'umbrella' as const,
      condition: 'usable' as const,
    },
  };
  return {
    state: 'nightEvent',
    day: 20,
    pressure: 2,
    health: 100,
    hunger: 10,
    energy: 2,
    hull: 100,
    food: 2,
    bait: 2,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 1,
    rescueProgress: 0,
    chest: { state: 'closed', acquiredDay: 4 },
    eventFlags: [],
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory,
    savedItems: [],
    pendingEventId: 'night-trader',
    pendingDriftingLootVariant: null,
    lastOutcome: null,
    seed: 8,
  };
}

function createHarness(options: {
  readonly missingEventModel?: boolean;
  readonly missingLantern?: boolean;
} = {}) {
  const propModels = createTestPropModels();
  if (options.missingEventModel === true) {
    vi.spyOn(propModels, 'createEventModel').mockReturnValue(null);
  }
  if (options.missingLantern === true) {
    vi.spyOn(propModels, 'createPracticalLight').mockImplementation(() => {
      throw new Error('Missing lantern.');
    });
  }
  const boat = new Group();
  const supplyDisplay = new BoatSupplyDisplay(propModels, boat, []);
  supplyDisplay.sync(snapshot());
  const chestDisplay = new ChestDisplay();
  chestDisplay.sync({ state: 'closed', acquiredDay: 4 });
  boat.add(chestDisplay.root);
  const cameraRig = new Group();
  cameraRig.add(new PerspectiveCamera());
  const dependencies: FocusedEventPresentationDependencies = {
    propModels,
    waves: DEFAULT_WAVES,
    cameraRig,
    supplyDisplay,
    chestDisplay,
  };
  const presentation = new NightTraderPresentation(dependencies);
  boat.add(presentation.root);
  const dispose = () => {
    presentation.dispose();
    chestDisplay.dispose();
    supplyDisplay.dispose();
    propModels.dispose();
  };
  return {
    boat,
    propModels,
    supplyDisplay,
    presentation,
    dispose,
  };
}

async function finish(
  harness: ReturnType<typeof createHarness>,
  pending: Promise<void>,
  time = 1,
): Promise<void> {
  harness.presentation.update(time, 10);
  harness.supplyDisplay.update(0);
  await pending;
}

describe('NightTraderPresentation', () => {
  it('shows the Lantern before the rowboat, then rows exactly twice', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.update(0.15, 0.15);

    expect(
      harness.presentation.root.getObjectByName('night-trader-lantern')
        ?.visible,
    ).toBe(true);
    expect(
      harness.presentation.root.getObjectByName('night-trader-rowboat')
        ?.visible,
    ).toBe(false);
    expect(
      harness.presentation.root.getObjectByName(
        'night-trader-lantern-reflection',
      )?.visible,
    ).toBe(true);

    await finish(harness, reveal, 2);
    expect(harness.presentation.root.userData.revealOrder)
      .toEqual(['lantern', 'rowboat']);
    expect(harness.presentation.root.userData.oarStrokes).toBe(2);
    expect(
      harness.presentation.root.getObjectByName('event-model:traderRowboat'),
    ).toBeDefined();
    expect((harness.presentation.root.getObjectByName(
      'night-trader-lantern-light',
    ) as PointLight).intensity).toBeGreaterThan(5);
    expect((harness.presentation.root.getObjectByName(
      'night-trader-cool-fill',
    ) as PointLight).intensity).toBeGreaterThan(1.5);
    harness.dispose();
  });

  it('samples the shared wave field while held', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const vessel = harness.presentation.root.getObjectByName(
      'night-trader-vessel',
    )!;

    harness.presentation.update(3, 0);
    const firstY = vessel.position.y;
    const firstHeight = vessel.userData.waveHeight as number;
    harness.presentation.update(9, 0);

    expect(vessel.userData.motionSource).toBe('shared-wave-field');
    expect(vessel.userData.waveSampleTime).toBe(9);
    expect(vessel.position.y).not.toBe(firstY);
    expect(vessel.userData.waveHeight).not.toBe(firstHeight);
    harness.dispose();
  });

  it('moves a selected physical payment into the case before its reward', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const map = harness.supplyDisplay.recordFor('map')!.root;
    const basePosition = map.position.clone();
    const baseScale = map.scale.clone();

    const choice = harness.presentation.playChoice({
      choiceId: 'map',
      instanceId: 'map-1' as ItemInstanceId,
      condition: 'usable',
    });
    harness.presentation.update(2, 0.45);
    harness.supplyDisplay.update(0);
    expect(map.position.toArray()).not.toEqual(basePosition.toArray());
    expect(
      harness.presentation.root.getObjectByName(
        'night-trader-reward-compass',
      ),
    ).toBeUndefined();
    await finish(harness, choice, 3);

    expect(harness.presentation.root.userData.paymentAtCase).toBe(true);
    expect(harness.presentation.root.userData.paymentVisible).toBe(false);
    expect(map.scale.x).toBeCloseTo(0.001);

    const reaction = harness.presentation.react({
      eventId: 'night-trader',
      choiceId: 'map',
      resultId: 'trader-reward',
    }, outcome);
    const reward = harness.presentation.root.getObjectByName(
      'night-trader-reward-compass',
    )!;
    expect(reward.visible).toBe(true);
    expect(reward.userData.itemType).toBe('compass');
    expect(harness.presentation.root.userData.exchangeOverlap).toBe(false);
    await finish(harness, reaction, 4);

    harness.presentation.clear();
    harness.supplyDisplay.update(0);
    expect(map.position.toArray()).toEqual(basePosition.toArray());
    expect(map.scale.toArray()).toEqual(baseScale.toArray());
    harness.dispose();
  });

  it('uses authored Food and Bait payment tokens', async () => {
    const harness = createHarness();
    for (const choiceId of ['food', 'bait'] as const) {
      harness.presentation.stage();
      const choice = harness.presentation.playChoice({
        choiceId,
        instanceId: null,
        condition: null,
      });
      const token = harness.presentation.root.getObjectByName(
        `night-trader-payment-${choiceId}-token`,
      )!;
      expect(token.userData.tokenKind).toBe(choiceId);
      expect(
        token.getObjectByName(
          `night-trader-payment-${choiceId}-token-${
            choiceId === 'food' ? 'tin-seam' : 'bait-mark'
          }`,
        ),
      ).toBeDefined();
      harness.presentation.settleForVisibilityChange();
      await choice;
      harness.presentation.clear();
    }
    harness.dispose();
  });

  it('returns one authored Food actor for the fallback result', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reaction = harness.presentation.react({
      eventId: 'night-trader',
      choiceId: 'map',
      resultId: 'trader-food-fallback',
    }, outcome);
    await finish(harness, reaction);

    const food = harness.presentation.root.getObjectByName(
      'night-trader-reward-food-token',
    )!;
    expect(food.userData.itemType).toBe('cannedFood');
    expect(
      harness.presentation.root.getObjectByName(
        'night-trader-reward-actors',
      )?.children,
    ).toHaveLength(1);
    expect(harness.presentation.root.userData.state).toBe('held-food');
    harness.dispose();
  });

  it('closes the case and removes the boat when refused', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const choice = harness.presentation.playChoice({
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });
    await finish(harness, choice, 2);
    expect(
      harness.presentation.root.getObjectByName('night-trader-case-lid')
        ?.rotation.x,
    ).toBeCloseTo(0);

    const reaction = harness.presentation.react({
      eventId: 'night-trader',
      choiceId: 'sleep',
      resultId: 'trader-refuse',
    }, outcome);
    await finish(harness, reaction, 3);
    expect(
      harness.presentation.root.getObjectByName('night-trader-vessel')
        ?.visible,
    ).toBe(false);
    expect(harness.presentation.root.userData.refuseRows).toBe(2);
    expect(harness.presentation.root.userData.state).toBe('held-refused');
    harness.dispose();
  });

  it('uses procedural fallbacks for missing rowboat and Lantern models', () => {
    const harness = createHarness({
      missingEventModel: true,
      missingLantern: true,
    });
    expect(
      harness.presentation.root.getObjectByName('night-trader-vessel')
        ?.userData.modelKind,
    ).toBe('procedural');
    expect(
      harness.presentation.root.getObjectByName('night-trader-lantern')
        ?.userData.modelKind,
    ).toBe('procedural');
    expect(
      harness.presentation.root.getObjectByName(
        'night-trader-rowboat-fallback-hull',
      ),
    ).toBeDefined();
    harness.dispose();
  });

  it('settles active promises and disposes owned resources once', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const pending = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await pending;

    const rowboatMesh = harness.presentation.root
      .getObjectByName('model:traderRowboat')
      ?.children[0] as Mesh;
    const lanternMesh = harness.presentation.root
      .getObjectByName('model:lantern')
      ?.children[0] as Mesh;
    const rowboatDispose = vi.spyOn(rowboatMesh.geometry, 'dispose');
    const lanternDispose = vi.spyOn(lanternMesh.geometry, 'dispose');
    const rowboatMaterial = Array.isArray(rowboatMesh.material)
      ? rowboatMesh.material[0]!
      : rowboatMesh.material;
    const materialDispose = vi.spyOn(
      rowboatMaterial as Material,
      'dispose',
    );
    const light = harness.presentation.root.getObjectByName(
      'night-trader-lantern-light',
    ) as PointLight;
    const shadowDispose = vi.spyOn(light.shadow, 'dispose');
    harness.presentation.dispose();
    harness.presentation.dispose();
    expect(rowboatDispose).toHaveBeenCalledOnce();
    expect(lanternDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(shadowDispose).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it('routes only stable Night Trader result IDs', () => {
    const harness = createHarness();
    harness.presentation.stage();
    expect(() => harness.presentation.react({
      eventId: 'night-trader',
      choiceId: 'map',
      resultId: 'handyman-reward',
    }, outcome)).toThrow('Unsupported Night Trader result');
    harness.dispose();
  });
});
