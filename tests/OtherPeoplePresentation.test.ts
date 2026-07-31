import {
  Group,
  Material,
  Mesh,
  PerspectiveCamera,
  SpotLight,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { DEFAULT_WAVES } from '../src/ocean/WaveField';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { ChestDisplay } from '../src/survival/ChestDisplay';
import type {
  FocusedEventPresentationDependencies,
} from '../src/survival/FocusedEventPresentation';
import { OtherPeoplePresentation } from '../src/survival/OtherPeoplePresentation';
import type {
  ActionOutcome,
  SurvivalInventorySnapshot,
  SurvivalSnapshot,
} from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

const flareGunId = 'flareGun-1' as ItemInstanceId;
const flashlightId = 'flashlight-1' as ItemInstanceId;
const inventory: SurvivalInventorySnapshot = {
  [flareGunId]: {
    instanceId: flareGunId,
    type: 'flareGun' as const,
    condition: 'usable' as const,
  },
  [flashlightId]: {
    instanceId: flashlightId,
    type: 'flashlight' as const,
    condition: 'usable' as const,
  },
};
const outcome: ActionOutcome = {
  accepted: true,
  code: 'event-resolved',
  message: 'Resolved.',
  deltas: {},
  cue: 'none',
};

function snapshot(): SurvivalSnapshot {
  return {
    state: 'nightEvent',
    day: 24,
    pressure: 3,
    health: 100,
    hunger: 10,
    energy: 2,
    hull: 100,
    food: 2,
    bait: 2,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 1,
    rescueProgress: 15,
    chest: { state: 'none', acquiredDay: null },
    eventFlags: [],
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory,
    savedItems: [],
    pendingEventId: 'other-people',
    pendingDriftingLootVariant: null,
    lastOutcome: null,
    seed: 8,
  };
}

function createHarness(withContainerShip = true) {
  const propModels = createTestPropModels();
  if (!withContainerShip) {
    const createEventModel = propModels.createEventModel.bind(propModels);
    vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => (
      id === 'containerShip' ? null : createEventModel(id)
    ));
  }
  const boat = new Group();
  const supplyDisplay = new BoatSupplyDisplay(propModels, boat, []);
  supplyDisplay.sync(snapshot());
  const chestDisplay = new ChestDisplay();
  const cameraRig = new Group();
  cameraRig.position.set(0.15, 0.22, -0.31);
  cameraRig.rotation.set(0.03, -0.05, 0.01);
  cameraRig.add(new PerspectiveCamera());
  const dependencies: FocusedEventPresentationDependencies = {
    propModels,
    waves: DEFAULT_WAVES,
    cameraRig,
    supplyDisplay,
    chestDisplay,
  };
  const presentation = new OtherPeoplePresentation(dependencies);
  boat.add(presentation.root);
  const dispose = () => {
    presentation.dispose();
    chestDisplay.dispose();
    supplyDisplay.dispose();
    propModels.dispose();
  };
  return {
    boat,
    cameraRig,
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

function result(
  resultId: 'people-rescue' | 'people-missed' | 'people-pass',
  choiceId: 'flareGun' | 'flashlight' | 'pass',
) {
  return {
    eventId: 'other-people' as const,
    choiceId,
    resultId,
  };
}

describe('OtherPeoplePresentation', () => {
  it('shows two weak lights before the selected ship silhouette', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.update(0.12, 0.12);

    expect(
      harness.presentation.root.getObjectByName(
        'other-people-horizon-light-port',
      )?.visible,
    ).toBe(true);
    expect(
      harness.presentation.root.getObjectByName(
        'other-people-horizon-light-starboard',
      )?.visible,
    ).toBe(true);
    expect(
      harness.presentation.root.getObjectByName(
        'other-people-container-ship',
      )?.visible,
    ).toBe(false);

    await finish(harness, reveal, 2);
    expect(harness.presentation.root.userData.revealOrder)
      .toEqual(['light-port', 'light-starboard', 'ship']);
    expect(
      harness.presentation.root.getObjectByName(
        'event-model:containerShip',
      ),
    ).toBeDefined();
    harness.dispose();
  });

  it('keeps open water and uses a steady path without wave bobbing', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const ship = harness.presentation.root.getObjectByName(
      'other-people-container-ship',
    )!;
    const position = ship.position.clone();
    const quaternion = ship.quaternion.clone();

    harness.presentation.update(100, 0);
    harness.presentation.update(200, 0);

    expect(ship.position.toArray()).toEqual(position.toArray());
    expect(ship.quaternion.toArray()).toEqual(quaternion.toArray());
    expect(ship.userData.motionSource).toBe('steady-authored-path');
    expect(harness.presentation.root.userData.openWaterDistance)
      .toBeGreaterThan(15);
    harness.dispose();
  });

  it('fires one Flare and lights both vessels red', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'flareGun',
      instanceId: flareGunId,
      condition: 'usable',
    });
    harness.presentation.update(1, 0.72);
    harness.supplyDisplay.update(0);

    const flare = harness.presentation.root.getObjectByName(
      'other-people-flare',
    )!;
    const boatWash = harness.presentation.root.getObjectByName(
      'other-people-flare-lifeboat-wash',
    ) as SpotLight;
    const shipWash = harness.presentation.root.getObjectByName(
      'other-people-flare-ship-wash',
    ) as SpotLight;
    expect(flare.visible).toBe(true);
    expect(flare.position.y).toBeGreaterThan(3);
    expect(boatWash.color.getHex()).toBe(0xff3b2f);
    expect(shipWash.color.getHex()).toBe(0xff3b2f);
    expect(boatWash.intensity).toBeGreaterThan(0);
    expect(shipWash.intensity).toBeGreaterThan(0);

    await finish(harness, choice, 2);
    expect(harness.presentation.root.userData.flareLaunches).toBe(1);
    harness.dispose();
  });

  it('sends three readable Flashlight signal pulses', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const flashlight = harness.supplyDisplay.recordFor('flashlight')!.root;
    const base = flashlight.position.clone();
    const choice = harness.presentation.playChoice({
      choiceId: 'flashlight',
      instanceId: flashlightId,
      condition: 'usable',
    });

    harness.presentation.update(0.2, 0.2);
    harness.supplyDisplay.update(0);
    expect(flashlight.position.toArray()).not.toEqual(base.toArray());
    await finish(harness, choice, 2);
    expect(harness.presentation.root.userData.signalPulses).toBe(3);
    expect(
      harness.presentation.root.getObjectByName(
        'other-people-flashlight-beam',
      )?.visible,
    ).toBe(false);
    harness.dispose();
  });

  it('answers, turns, approaches, and holds rescue', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const ship = harness.presentation.root.getObjectByName(
      'other-people-container-ship',
    )!;
    const start = ship.position.clone();
    const reaction = harness.presentation.react(
      result('people-rescue', 'flareGun'),
      outcome,
    );
    await finish(harness, reaction);

    expect(harness.presentation.root.userData.answerPulses).toBe(1);
    expect(harness.presentation.root.userData.courseTurns).toBe(1);
    expect(ship.position.z).toBeGreaterThan(start.z);
    expect(harness.presentation.root.userData.openWaterDistance)
      .toBeGreaterThan(15);
    expect(harness.presentation.root.userData.state).toBe('held-rescue');

    harness.presentation.clear();
    expect(harness.presentation.root.visible).toBe(true);
    expect(ship.visible).toBe(true);
    harness.dispose();
  });

  it('keeps course and exits when the Flashlight signal is missed', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const ship = harness.presentation.root.getObjectByName(
      'other-people-container-ship',
    )!;
    const yaw = ship.rotation.y;
    const reaction = harness.presentation.react(
      result('people-missed', 'flashlight'),
      outcome,
    );
    await finish(harness, reaction);

    expect(harness.presentation.root.userData.courseTurns).toBe(0);
    expect(ship.rotation.y).toBeCloseTo(yaw);
    expect(ship.visible).toBe(false);
    expect(harness.presentation.root.userData.state).toBe('held-missed');
    harness.presentation.clear();
    expect(harness.presentation.root.visible).toBe(false);
    harness.dispose();
  });

  it('keeps all signal lights dark while passing', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'pass',
      instanceId: null,
      condition: null,
    });
    await finish(harness, choice);
    const reaction = harness.presentation.react(
      result('people-pass', 'pass'),
      outcome,
    );
    await finish(harness, reaction, 2);

    expect(harness.presentation.root.userData.signalPulses).toBe(0);
    expect(harness.presentation.root.userData.flareLaunches).toBe(0);
    for (const name of [
      'other-people-flare-lifeboat-wash',
      'other-people-flare-ship-wash',
      'other-people-flashlight-beam-light',
    ]) {
      expect(
        (harness.presentation.root.getObjectByName(name) as SpotLight)
          .intensity,
      ).toBe(0);
    }
    harness.dispose();
  });

  it('uses its procedural fallback when the ship model is missing', () => {
    const harness = createHarness(false);
    const ship = harness.presentation.root.getObjectByName(
      'other-people-container-ship',
    )!;
    expect(ship.userData.modelKind).toBe('procedural');
    expect(
      ship.getObjectByName('other-people-ship-fallback-hull'),
    ).toBeDefined();
    harness.dispose();
  });

  it('settles promises and restores supplies and camera exactly', async () => {
    const harness = createHarness();
    const cameraPosition = harness.cameraRig.position.clone();
    const cameraQuaternion = harness.cameraRig.quaternion.clone();
    const flashlight = harness.supplyDisplay.recordFor('flashlight')!.root;
    const flashlightPosition = flashlight.position.clone();
    harness.presentation.stage();
    const pending = harness.presentation.playChoice({
      choiceId: 'flashlight',
      instanceId: flashlightId,
      condition: 'usable',
    });
    harness.presentation.settleForVisibilityChange();
    await pending;

    harness.presentation.clear();
    harness.supplyDisplay.update(0);
    expect(harness.cameraRig.position.toArray())
      .toEqual(cameraPosition.toArray());
    expect(harness.cameraRig.quaternion.toArray())
      .toEqual(cameraQuaternion.toArray());
    expect(flashlight.position.toArray())
      .toEqual(flashlightPosition.toArray());
    harness.dispose();
  });

  it('disposes the ship clone and authored light shadows once', () => {
    const harness = createHarness();
    const shipMesh = harness.presentation.root.getObjectByName(
      'model:containerShip',
    )?.children[0] as Mesh;
    const geometryDispose = vi.spyOn(shipMesh.geometry, 'dispose');
    const shipMaterial = Array.isArray(shipMesh.material)
      ? shipMesh.material[0]!
      : shipMesh.material;
    const materialDispose = vi.spyOn(
      shipMaterial as Material,
      'dispose',
    );
    const wash = harness.presentation.root.getObjectByName(
      'other-people-flare-ship-wash',
    ) as SpotLight;
    const shadowDispose = vi.spyOn(wash.shadow, 'dispose');

    harness.presentation.dispose();
    harness.presentation.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(shadowDispose).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it('routes only stable Other People result IDs', () => {
    const harness = createHarness();
    harness.presentation.stage();
    expect(() => harness.presentation.react({
      eventId: 'other-people',
      choiceId: 'flashlight',
      resultId: 'tour-pass',
    }, outcome)).toThrow('Unsupported Other People result');
    harness.dispose();
  });
});
