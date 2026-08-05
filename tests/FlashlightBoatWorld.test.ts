// Importance: 4/5. Protects the visible flashlight pose in the survival world.
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import type { BorrowedSupplyActor } from '../src/survival/BoatSupplyDisplay';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { BoatWorld } from '../src/survival/BoatWorld';
import { eventItemUseDuration } from '../src/survival/eventItemUseChoreography';
import { SurvivalInventoryState } from '../src/survival/inventory';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';
import { createTestMoonTexture } from './helpers/skyAssets';

const FLASHLIGHT: ItemInstance = {
  instanceId: 'flashlight-1',
  type: 'flashlight',
};

function snapshot(): SurvivalSnapshot {
  return {
    state: 'day',
    endingReason: 'standard',
    day: 1,
    pressure: 0,
    health: 100,
    hunger: 20,
    energy: 80,
    hull: 80,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueProgress: 0,
    chest: { state: 'none', acquiredDay: null },
    eventFlags: [],
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: new SurvivalInventoryState([FLASHLIGHT]).snapshot(),
    savedItems: [FLASHLIGHT],
    pendingEventId: 'flowers',
    pendingEventTargetId: null,
    pendingDriftingLootVariant: null,
    captainWhiskers: null,
    lastOutcome: null,
    seed: 8,
  };
}

describe('flashlight in BoatWorld', () => {
  it('places the held model in the lower-right camera view', async () => {
    const camera = new PerspectiveCamera(63, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      [FLASHLIGHT],
    );
    world.syncInventory(snapshot());
    world.stageEvent('flowers');

    const use = world.playEventItemUse(
      'flowers',
      'flashlight',
      FLASHLIGHT.instanceId,
    );
    const duration = eventItemUseDuration('flashlight-flash');
    world.update(duration, duration);
    await use;

    const actor = borrowActor.mock.results.at(-1)!.value as BorrowedSupplyActor;
    const cameraPosition = camera.worldToLocal(
      actor.root.getWorldPosition(new Vector3()),
    );
    expect(actor.root.visible).toBe(true);
    expect(cameraPosition.x).toBeCloseTo(0.3);
    expect(cameraPosition.y).toBeCloseTo(-0.3);
    expect(cameraPosition.z).toBeCloseTo(-0.78);

    const forward = new Vector3(-1, 0, 0)
      .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()))
      .normalize();
    expect(forward.y).toBeCloseTo(0);

    world.dispose();
    borrowActor.mockRestore();
    propModels.dispose();
  });
});
