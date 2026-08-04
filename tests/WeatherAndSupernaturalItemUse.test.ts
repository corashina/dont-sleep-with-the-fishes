import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import type {
  BorrowedSupplyActor,
  SupplyAdditivePose,
} from '../src/survival/BoatSupplyDisplay';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import {
  DANGEROUS_WATERS_ITEM_DURATION,
  DangerousWatersPresentation,
} from '../src/survival/DangerousWatersPresentation';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import { supernaturalItemUseDuration } from '../src/survival/supernaturalEventChoreography';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
import {
  eventItemUseDuration,
  resolveEventItemUseContext,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
import { weatherItemUseDuration } from '../src/survival/weatherEventChoreography';

const CASES = [
  ['shower-night', 'umbrella', 'umbrella', 'umbrella-overhead'],
  ['thunderstorm', 'anchor', 'anchor', 'anchor-drop'],
  ['restless-waves', 'swimRing', 'swimRing', 'throw-target'],
  ['man-in-the-fog', 'compass', 'compass', 'compass-search'],
  ['man-in-the-fog', 'spyglass', 'spyglass', 'binocular-look'],
  ['ghosts', 'flareGun', 'flareGun', 'flare-target'],
  ['eerie-melody', 'bucket', 'bucket', 'bucket-cover'],
  ['eerie-melody', 'ductTape', 'ductTape', 'tape-stretch'],
  ['face-on-the-moon', 'umbrella', 'umbrella', 'umbrella-shield'],
] as const satisfies readonly (
  readonly [string, string, ItemId, string]
)[];

const SUPERNATURAL_EVENTS = new Set(['ghosts', 'eerie-melody', 'face-on-the-moon']);

function createEventModels(): EventModelLibrary {
  return {
    create: () => {
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
      return root;
    },
    animations: () => [],
    dispose: () => undefined,
  } as unknown as EventModelLibrary;
}

function createHarness(itemId: ItemId) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
  camera.position.set(0, 1.35, 2.65);
  camera.lookAt(0, 0.72, -0.4);
  scene.add(camera);
  const instanceId = `${itemId}-1` as ItemInstanceId;
  const root = new Group();
  const basePosition = new Vector3(1.45, 0.34, -0.2);
  root.position.copy(basePosition);
  scene.add(root);
  const release = vi.fn();
  const actor: BorrowedSupplyActor = {
    instanceId,
    root,
    applyPose: (pose: SupplyAdditivePose) => {
      root.position.set(
        basePosition.x + pose.x,
        basePosition.y + pose.y,
        basePosition.z + pose.z,
      );
      root.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
    },
    releaseOnNextSync: vi.fn(),
    release,
  };
  const supplies = {
    itemType: vi.fn(() => itemId),
    borrowEventActor: vi.fn(() => actor),
    clearEventPose: vi.fn(),
    clearEventMotion: vi.fn(),
    resetEventPoseForFrame: vi.fn(),
    pinEventActor: vi.fn(() => true),
    releaseEventActor: vi.fn(),
    releaseEventActorOnNextSync: vi.fn(),
    applyEventItemPose: vi.fn(() => true),
    applyEventAmbientPose: vi.fn(),
  } as unknown as BoatSupplyDisplay;
  const effects = new EventItemEffects();
  const adapter = new EventItemUseAdapter(camera, effects);
  const applySharedPose = vi.spyOn(adapter, 'apply');
  scene.add(effects.root);
  return {
    scene,
    camera,
    instanceId,
    supplies,
    effects,
    adapter,
    applySharedPose,
    release,
  };
}

describe('weather and supernatural shared item use', () => {
  it.each(CASES)(
    'uses shared %s %s choreography without camera translation',
    async (eventId, choiceId, itemId, expectedContext) => {
      const harness = createHarness(itemId);
      const cameraBase = harness.camera.position.toArray();
      const context = resolveEventItemUseContext(eventId, choiceId, itemId);
      expect(context).toBe(expectedContext);
      const cameraRig = new Group();
      const animator = SUPERNATURAL_EVENTS.has(eventId)
        ? new SupernaturalEventAnimator(
            cameraRig,
            harness.supplies,
            harness.adapter,
            createEventModels(),
            harness.camera,
          )
        : new WeatherEventAnimator(
            cameraRig,
            harness.supplies,
            harness.adapter,
            createEventModels(),
            harness.camera,
          );
      harness.scene.add(animator.worldRoot);
      if (animator instanceof WeatherEventAnimator) harness.scene.add(animator.boatRoot);
      animator.stage(eventId);

      const itemUse = animator.playItemUse(eventId, choiceId, harness.instanceId);
      const duration = SUPERNATURAL_EVENTS.has(eventId)
        ? supernaturalItemUseDuration(eventId, choiceId)
          ?? eventItemUseDuration(expectedContext as EventItemUseContext)
        : weatherItemUseDuration(eventId, choiceId)!;
      const sampleTime = duration * 0.5;
      animator.update(sampleTime, sampleTime);
      expect(harness.applySharedPose).toHaveBeenCalled();
      expect(harness.camera.position.toArray()).toEqual(cameraBase);
      if (expectedContext === 'binocular-look') expect(harness.camera.fov).toBeLessThan(62);

      animator.update(duration, duration - sampleTime);
      await expect(itemUse).resolves.toBe(true);
      expect(harness.camera.position.toArray()).toEqual(cameraBase);
      expect(harness.camera.fov).toBe(62);
      expect(harness.effects.root.children.every(({ visible }) => !visible)).toBe(true);

      animator.dispose();
      harness.adapter.dispose();
    },
  );

  it('clears shared flare and flashlight effects after item completion', async () => {
    for (const [eventId, choiceId, itemId, effectName] of [
      ['ghosts', 'flareGun', 'flareGun', 'event-item-flare'],
      ['man-in-the-fog', 'flashlight', 'flashlight', 'event-item-flashlight-beam'],
    ] as const) {
      const harness = createHarness(itemId);
      const cameraRig = new Group();
      const animator = eventId === 'ghosts'
        ? new SupernaturalEventAnimator(
            cameraRig,
            harness.supplies,
            harness.adapter,
            createEventModels(),
            harness.camera,
          )
        : new WeatherEventAnimator(
            cameraRig,
            harness.supplies,
            harness.adapter,
            createEventModels(),
            harness.camera,
      );
      animator.stage(eventId);
      const itemUse = animator.playItemUse(eventId, choiceId, harness.instanceId);
      const duration = eventId === 'ghosts'
        ? supernaturalItemUseDuration(eventId, choiceId)!
        : weatherItemUseDuration(eventId, choiceId)!;
      const sampleTime = duration * 0.5;
      animator.update(sampleTime, sampleTime);
      expect(harness.effects.root.getObjectByName(effectName)?.visible).toBe(true);

      animator.update(duration, duration - sampleTime);
      await itemUse;
      expect(harness.effects.root.getObjectByName(effectName)?.visible).toBe(false);

      animator.dispose();
      harness.adapter.dispose();
    }
  });

  it('bounds the Ghosts flare at its exact choreography peak', async () => {
    const harness = createHarness('flareGun');
    const animator = new SupernaturalEventAnimator(
      new Group(),
      harness.supplies,
      harness.adapter,
      createEventModels(),
      harness.camera,
    );
    harness.scene.add(animator.worldRoot);
    animator.stage('ghosts');
    const itemUse = animator.playItemUse('ghosts', 'flareGun', harness.instanceId);
    const duration = supernaturalItemUseDuration('ghosts', 'flareGun')!;
    const peakTime = duration * 0.47;

    animator.update(peakTime, peakTime);

    const flare = animator.worldRoot.getObjectByName('supernatural-flare-flash')!;
    const size = new Box3().setFromObject(flare).getSize(new Vector3());
    expect(flare.visible).toBe(true);
    expect(Math.max(size.x, size.y)).toBeLessThanOrEqual(1.6);

    animator.update(duration, duration - peakTime);
    await itemUse;
    animator.dispose();
    harness.adapter.dispose();
  });

  it('uses shared map motion for Dangerous Waters and releases its actor', async () => {
    const harness = createHarness('map');
    expect(resolveEventItemUseContext('dangerous-waters', 'map', 'map')).toBe('map-read');
    const presentation = new DangerousWatersPresentation({
      supplyDisplay: harness.supplies,
      itemUseAdapter: harness.adapter,
    });
    presentation.stage();
    const cameraBase = harness.camera.position.toArray();

    const itemUse = presentation.playItemUse('map', harness.instanceId);
    presentation.update(0.5, 0.5);
    expect(harness.applySharedPose).toHaveBeenCalled();
    expect(harness.camera.position.toArray()).toEqual(cameraBase);

    presentation.update(
      DANGEROUS_WATERS_ITEM_DURATION,
      DANGEROUS_WATERS_ITEM_DURATION - 0.5,
    );
    await itemUse;
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.camera.position.toArray()).toEqual(cameraBase);

    presentation.dispose();
    harness.adapter.dispose();
  });
});
