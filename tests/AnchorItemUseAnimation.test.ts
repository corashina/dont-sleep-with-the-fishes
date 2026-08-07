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
  eventItemActionCueProgresses,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';

function anchorSample(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemUse('anchor-drop', 'anchor', progress, sample);
  return sample;
}

describe('anchor item use animation', () => {
  it('looks toward starboard before releasing the anchor', () => {
    const beforeLook = anchorSample(0.25);
    const turning = anchorSample(0.36);
    const release = anchorSample(0.54);
    const apex = anchorSample(0.71);
    const impact = anchorSample(0.88);

    expect(beforeLook.cameraYaw).toBeCloseTo(0);
    expect(turning.cameraYaw).toBeLessThan(-0.2);
    expect(release.cameraYaw).toBeCloseTo(-0.62);
    expect(apex.cameraPitch).toBeGreaterThan(0);
    expect(impact.cameraPitch).toBeLessThan(0);
  });

  it('uses a short high throw and keeps the chain after water contact', () => {
    const release = anchorSample(0.54);
    const apex = anchorSample(0.71);
    const impact = anchorSample(0.88);

    expect(release.targetBlend).toBe(0);
    expect(release.effectKind).toBe('chain');
    expect(apex.targetBlend).toBeCloseTo(0.5);
    expect(apex.flightArc).toBe(1);
    expect(apex.flightArcHeight).toBeGreaterThan(2.2);
    expect(apex.flightTarget).toBe('starboard-water');
    expect(apex.itemVisible).toBe(true);
    expect(impact.targetBlend).toBeCloseTo(1);
    expect(impact.itemVisible).toBe(false);
    expect(impact.effectKind).toBe('chain');
    expect(impact.primaryEffect).toBeCloseTo(1);
    expect(eventItemActionCueProgresses('anchor-drop')).toEqual([0.88]);
  });

  it('lands beside the starboard gunwale instead of at the event target', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0, 1.7, 1.72);
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const root = new Group();
    actorParent.add(root);
    const basePosition = root.position.clone();
    const actor: BorrowedSupplyActor = {
      instanceId: 'anchor-1' as ItemInstanceId,
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
    const eventTarget = new Group();
    eventTarget.position.set(12, 0.4, -18);
    scene.add(eventTarget);
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());

    adapter.begin(actor, 'anchor', eventTarget);
    const release = anchorSample(0.54);
    adapter.apply(release);
    const releaseWorld = actor.root.getWorldPosition(new Vector3());
    adapter.apply(anchorSample(0.71));
    const apex = actor.root.getWorldPosition(new Vector3());
    expect(apex.y).toBeGreaterThan((releaseWorld.y + 0.04) * 0.5 + 2.6);
    camera.updateWorldMatrix(true, false);
    const projectedApex = apex.clone().project(camera);
    expect(Math.abs(projectedApex.x)).toBeLessThan(1);
    expect(Math.abs(projectedApex.y)).toBeLessThan(1);

    adapter.apply(anchorSample(0.88));
    const impact = actor.root.getWorldPosition(new Vector3());
    expect(impact.x).toBeCloseTo((lifeboatHullHalfWidthAt(0.55) ?? 1.63) + 0.48);
    expect(impact.y).toBeCloseTo(0.04);
    expect(impact.z).toBeCloseTo(0.55);
    expect(impact.distanceTo(eventTarget.position)).toBeGreaterThan(10);
    expect(actor.root.visible).toBe(false);

    adapter.dispose();
  });
});
