import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Group, Material, Mesh } from 'three';
import type { ItemInstance } from '../src/game/ItemState';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
import { SurvivalInventoryState } from '../src/survival/inventory';
import type { ActionOutcome, SurvivalSnapshot } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

const savedItems: readonly ItemInstance[] = [
  { instanceId: 'bucket-1', type: 'bucket' },
  { instanceId: 'flashlight-1', type: 'flashlight' },
];

function snapshot(): SurvivalSnapshot {
  return {
    state: 'nightEvent',
    day: 1,
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
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: new SurvivalInventoryState(savedItems).snapshot(),
    savedItems,
    pendingEventId: null,
    lastOutcome: null,
    seed: 8,
  };
}

function outcome(deltas: ActionOutcome['deltas'] = {}): ActionOutcome {
  return {
    accepted: true,
    code: 'event-resolved',
    message: 'The night relents.',
    deltas,
    cue: 'sighting',
  };
}

function fixture() {
  const models = createTestPropModels();
  const supplyRoot = new Group();
  const supplyDisplay = new BoatSupplyDisplay(models, supplyRoot, savedItems);
  supplyDisplay.sync(snapshot());
  const cameraRig = new Group();
  const animator = new WeatherEventAnimator(cameraRig, supplyDisplay);
  return {
    animator,
    cameraRig,
    models,
    supplyDisplay,
    supplyRoot,
    dispose() {
      animator.dispose();
      supplyDisplay.dispose();
      models.dispose();
    },
  };
}

async function remainsPending(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  return !settled;
}

describe('WeatherEventAnimator', () => {
  it('reveals the fog figure during a camera search and restores the camera', async () => {
    const scene = fixture();
    scene.animator.stage('man-in-the-fog');
    const reveal = scene.animator.reveal('man-in-the-fog');

    scene.animator.update(1, 2.45);
    expect(scene.animator.worldRoot.getObjectByName('fog-man-silhouette')?.visible).toBe(true);
    expect(scene.cameraRig.rotation.y).not.toBe(0);

    scene.animator.update(2, 1.75);
    await reveal;
    expect(scene.cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(scene.cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    scene.dispose();
  });

  it('keeps the shower reveal pending for its full choreography duration', async () => {
    const scene = fixture();
    const reveal = scene.animator.reveal('shower-night');

    scene.animator.update(1, 3.39);
    expect(await remainsPending(reveal)).toBe(true);
    scene.animator.update(2, 0.01);
    await reveal;
    expect(scene.cameraRig.position.toArray()).toEqual([0, 0, 0]);
    scene.dispose();
  });

  it('preserves the authored camera base present when a timeline starts', async () => {
    const scene = fixture();
    scene.cameraRig.position.set(0.25, -0.1, 0.4);
    scene.cameraRig.rotation.set(0.03, -0.08, 0.02);
    const basePosition = scene.cameraRig.position.toArray();
    const baseRotation = scene.cameraRig.rotation.toArray().slice(0, 3);
    const reveal = scene.animator.reveal('shower-night');

    scene.animator.update(1, 3.4);
    await reveal;
    expect(scene.cameraRig.position.toArray()).toEqual(basePosition);
    expect(scene.cameraRig.rotation.toArray().slice(0, 3)).toEqual(baseRotation);
    scene.dispose();
  });

  it('settles unsupported reveals immediately', async () => {
    const scene = fixture();
    await expect(scene.animator.reveal('strange-noise')).resolves.toBeUndefined();
    scene.dispose();
  });

  it.each(['windy-night', 'restless-waves'])(
    'applies ambient supply motion during %s and restores it',
    async (eventId) => {
      const scene = fixture();
      const ambient = vi.spyOn(scene.supplyDisplay, 'applyEventAmbientPose');
      const clear = vi.spyOn(scene.supplyDisplay, 'clearEventMotion');
      const reveal = scene.animator.reveal(eventId);

      scene.animator.update(1, 1.6);
      expect(ambient).toHaveBeenCalled();
      expect(ambient.mock.calls.some(([roll, lift]) => roll !== 0 || lift !== 0)).toBe(true);
      scene.animator.update(2, 3);
      await reveal;
      expect(clear).toHaveBeenCalled();
      scene.dispose();
    },
  );

  it('brings the fog figure close only for a damaging flashlight reaction', async () => {
    const damaging = fixture();
    const response = {
      choiceId: 'flashlight',
      instanceId: 'flashlight-1' as const,
      condition: 'usable' as const,
    };
    const damageReaction = damaging.animator.react(
      'man-in-the-fog',
      outcome({ health: -20 }),
      response,
    );
    damaging.animator.update(1, 0.42);
    const closeFigure = damaging.animator.worldRoot.getObjectByName('fog-man-silhouette')!;
    expect(closeFigure.visible).toBe(true);
    expect(closeFigure.position.z).toBeGreaterThan(-5);
    damaging.animator.update(2, 1);
    await damageReaction;
    damaging.dispose();

    const safe = fixture();
    const safeReaction = safe.animator.react(
      'man-in-the-fog',
      outcome(),
      response,
    );
    safe.animator.update(1, 0.42);
    expect(safe.animator.worldRoot.getObjectByName('fog-man-silhouette')?.visible).toBe(false);
    safe.animator.update(2, 1);
    await safeReaction;
    safe.dispose();
  });

  it('clears active work exactly once and restores all borrowed state', async () => {
    const scene = fixture();
    const clearMotion = vi.spyOn(scene.supplyDisplay, 'clearEventMotion');
    const reveal = scene.animator.reveal('windy-night');
    let settlements = 0;
    void reveal.then(() => {
      settlements += 1;
    });
    scene.animator.update(1, 1.5);
    expect(scene.cameraRig.rotation.y).not.toBe(0);

    scene.animator.clear();
    scene.animator.clear();
    await reveal;
    await Promise.resolve();
    expect(settlements).toBe(1);
    expect(scene.cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(scene.cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(clearMotion).toHaveBeenCalled();
    expect(scene.animator.worldRoot.getObjectByName('fog-man-silhouette')?.visible).toBe(false);
    expect(scene.animator.boatRoot.getObjectByName('weather-flashlight-beam')?.visible).toBe(false);
    expect(scene.animator.boatRoot.getObjectByName('weather-anchor-chain')?.visible).toBe(false);
    expect(scene.animator.boatRoot.getObjectByName('weather-rain-bucket-splash')?.visible).toBe(false);
    scene.dispose();
  });

  it('disposes owned geometry and materials exactly once while settling work', async () => {
    const scene = fixture();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    for (const root of [scene.animator.worldRoot, scene.animator.boatRoot]) {
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of entries) materials.add(material);
      });
    }
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, 'dispose'));
    const use = scene.animator.playItemUse(
      'shower-night',
      'bucket',
      'bucket-1',
    );
    let settlements = 0;
    void use.then(() => {
      settlements += 1;
    });

    scene.animator.dispose();
    scene.animator.dispose();
    await expect(use).resolves.toBe(false);
    await Promise.resolve();
    expect(settlements).toBe(1);
    for (const dispose of geometryDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of materialDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    expect(scene.animator.worldRoot.parent).toBeNull();
    expect(scene.animator.boatRoot.parent).toBeNull();
    scene.supplyDisplay.dispose();
    scene.models.dispose();
  });
});
