import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import type { BorrowedSupplyActor } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
  eventItemUseDuration,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

function shot(secondsAfterCue: number) {
  const sample = createEventItemUseSample();
  const cue = eventItemActionCueProgresses('shotgun-fire')[0]!;
  sampleEventItemUse(
    'shotgun-fire', 'shotgun',
    cue + secondsAfterCue / eventItemUseDuration('shotgun-fire'), sample,
  );
  return sample;
}

describe('shotgun discharge', () => {
  it('holds steady before the audio cue, kicks quickly, and recovers more slowly', () => {
    const ready = shot(-0.1);
    const before = shot(-0.001);
    const fire = shot(0);
    const kick = shot(0.06);
    const recovering = shot(0.22);
    const recovered = shot(0.6);

    expect(before.viewZ).toBe(ready.viewZ);
    expect(before.roll).toBe(ready.roll);
    expect(before.recoilPitch).toBe(0);
    expect(before.effectKind).toBe('none');
    expect(fire.primaryEffect).toBe(1);
    expect(kick.viewZ - ready.viewZ).toBeGreaterThan(0.15);
    expect(kick.recoilPitch).toBeGreaterThan(0.15);
    expect(recovering.viewZ).toBeLessThan(kick.viewZ);
    expect(recovering.viewZ).toBeGreaterThan(ready.viewZ);
    expect(recovered.viewZ).toBe(ready.viewZ);
    expect(recovered.recoilPitch).toBe(0);
    expect(recovered.primaryEffect).toBe(0);
    expect(recovered.secondaryEffect).toBeGreaterThan(0);
    expect(shot(1).effectKind).toBe('none');
  });

  it.each([[-6, -2], [6, -2], [0, -6], [0, 6]])(
    'holds the stored shotgun upright and recoils upward toward target %s, %s', (x, z) => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1.5, 0);
    const boat = new Group();
    boat.rotation.set(0.12, 0.4, -0.15);
    boat.position.set(2, 0.2, -1);
    const root = new Group();
    boat.add(root);
    const stored = boatSupplyTransform('shotgun', 0);
    root.position.copy(stored.position);
    root.rotation.copy(stored.rotation);
    const target = new Group();
    target.position.set(x, 0, z);
    const actor: BorrowedSupplyActor = {
      root, instanceId: 'shotgun-1', release: vi.fn(), releaseOnNextSync: vi.fn(),
      applyPose: (pose) => {
        root.position.copy(stored.position).add(new Vector3(pose.x, pose.y, pose.z));
        root.rotation.copy(stored.rotation);
        root.rotateY(pose.yaw);
        root.rotateX(pose.pitch);
        root.rotateZ(pose.roll);
      },
    };
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    adapter.begin(actor, 'shotgun', target);
    adapter.apply(shot(-0.01));
    const orientation = root.getWorldQuaternion(new Quaternion());
    const ready = new Vector3(0, 0, -1).applyQuaternion(orientation);
    const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
    const targetDirection = target.position.clone().sub(root.getWorldPosition(new Vector3()));
    targetDirection.y = 0;
    expect(ready.distanceTo(targetDirection.normalize())).toBeLessThan(1e-6);
    expect(up.y).toBeGreaterThan(0.999);
    adapter.apply(shot(0.065));
    const kicked = new Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(orientation));
    expect(ready.y).toBeCloseTo(0);
    expect(kicked.y).toBeGreaterThan(0.15);
    adapter.apply(shot(0.65));
    const settled = new Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(orientation));
    expect(settled.distanceTo(ready)).toBeLessThan(1e-6);
    adapter.dispose();
  });

  it('places the flash at the scaled muzzle and leaves smoke behind during recoil', () => {
    const scene = new Group();
    const boat = new Group();
    boat.position.set(2, 0.2, -3);
    boat.rotation.set(0.12, 0.5, -0.08);
    const actor = new Group();
    actor.scale.setScalar(0.7);
    boat.add(actor);
    const effects = new EventItemEffects();
    scene.add(boat, effects.root);
    effects.apply(shot(0), actor);
    const muzzle = new Vector3(0, 0.076, -0.5).applyMatrix4(actor.matrixWorld);
    const flash = effects.root.getObjectByName('event-item-shotgun-flash')!;
    const smoke = effects.root.getObjectByName('event-item-shotgun-smoke')!;
    expect(flash.getWorldPosition(new Vector3()).distanceTo(muzzle)).toBeLessThan(1e-6);
    const discharge = smoke.getWorldPosition(new Vector3());

    boat.position.x += 4;
    actor.rotation.x = 0.2;
    effects.apply(shot(0.3), actor);
    const drifting = smoke.getWorldPosition(new Vector3());
    expect(flash.visible).toBe(false);
    expect(smoke.visible).toBe(true);
    expect(drifting.distanceTo(discharge)).toBeLessThan(0.1);
    expect(drifting.y).toBeGreaterThan(discharge.y);

    effects.clear();
    expect(effects.root.getObjectByName('event-item-shotgun-blast')!.visible).toBe(false);
    effects.apply(shot(0), actor);
    const nextMuzzle = new Vector3(0, 0.076, -0.5).applyMatrix4(actor.matrixWorld);
    expect(smoke.getWorldPosition(new Vector3()).distanceTo(nextMuzzle)).toBeLessThan(1e-6);
    effects.dispose();
  });

  it('clears recoil and discharge when the same sample is reused for another item', () => {
    const sample = shot(0.06);
    sampleEventItemUse('base', 'cannedFood', 1, sample);
    expect(sample.recoilPitch).toBe(0);
    expect(sample.effectKind).toBe('none');
    expect(sample.primaryEffect).toBe(0);
    expect(sample.secondaryEffect).toBe(0);
  });
});
