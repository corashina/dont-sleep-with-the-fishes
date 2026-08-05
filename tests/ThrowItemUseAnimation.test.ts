import { Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type {
  BorrowedSupplyActor,
  SupplyAdditivePose,
} from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import {
  createEventItemUseSample,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

function useSample(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemUse('throw-target', 'cannedFood', progress, sample);
  return sample;
}

function flightSample(progress: number) {
  return useSample(0.7 + progress * 0.3);
}

describe('thrown event item animation', () => {
  it('holds the item in view before a short wind-up', () => {
    const held = useSample(0.5);
    const woundUp = useSample(0.7);

    expect(held.cameraSpaceBlend).toBe(1);
    expect(held.viewX).toBeGreaterThan(0.25);
    expect(held.viewY).toBeLessThan(-0.3);
    expect(held.targetBlend).toBe(0);
    expect(woundUp.viewX).toBeGreaterThan(held.viewX + 0.2);
    expect(woundUp.viewZ).toBeGreaterThan(held.viewZ + 0.1);
    expect(woundUp.cameraYaw).toBeLessThan(0);
  });

  it('starts continuously, follows an arc, and hides at water contact', () => {
    const release = useSample(0.7);
    const start = flightSample(0);
    const apex = flightSample(0.5);
    const impact = flightSample(1);

    expect(start).toMatchObject({
      cameraSpaceBlend: release.cameraSpaceBlend,
      viewX: release.viewX,
      viewY: release.viewY,
      viewZ: release.viewZ,
      yaw: release.yaw,
      pitch: release.pitch,
      roll: release.roll,
      cameraYaw: release.cameraYaw,
      cameraPitch: release.cameraPitch,
    });
    expect(apex.targetBlend).toBeCloseTo(0.5);
    expect(apex.ballisticFlight).toBe(true);
    expect(apex.flightArc).toBe(1);
    expect(apex.itemVisible).toBe(true);
    expect(impact.targetBlend).toBe(1);
    expect(impact.flightArc).toBe(0);
    expect(impact.itemVisible).toBe(false);

    const settled = createEventItemUseSample();
    sampleEventItemOutcome(
      'throw-target',
      'cannedFood',
      'depart',
      0,
      settled,
    );
    expect(settled.itemVisible).toBe(false);
  });

  it('moves above the direct path before reaching the water target', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0, 1.7, 0);
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const root = new Group();
    actorParent.add(root);
    const basePosition = root.position.clone();
    const actor: BorrowedSupplyActor = {
      instanceId: 'cannedFood-1' as ItemInstanceId,
      root,
      applyPose: (pose: SupplyAdditivePose) => {
        root.position.set(
          basePosition.x + pose.x,
          basePosition.y + pose.y,
          basePosition.z + pose.z,
        );
        root.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      },
      releaseOnNextSync: vi.fn(),
      release: vi.fn(),
    };
    const target = new Group();
    target.position.set(3, 1.8, -6);
    scene.add(target);
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());

    adapter.begin(actor, 'cannedFood', target);
    const release = flightSample(0);
    const releaseWorld = camera.localToWorld(new Vector3(
      release.viewX,
      release.viewY,
      release.viewZ,
    ));
    adapter.apply(flightSample(0.5));
    const apex = actor.root.getWorldPosition(new Vector3());
    const directPathY = (releaseWorld.y + 0.04) * 0.5;
    expect(apex.y).toBeGreaterThan(directPathY + 0.5);

    adapter.apply(flightSample(1));
    const impact = actor.root.getWorldPosition(new Vector3());
    expect(impact.x).toBeCloseTo(target.position.x);
    expect(impact.y).toBeCloseTo(0.04);
    expect(impact.z).toBeCloseTo(target.position.z);
    expect(actor.root.visible).toBe(false);

    adapter.dispose();
  });
});
