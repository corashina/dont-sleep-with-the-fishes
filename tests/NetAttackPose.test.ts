import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { NetAttackPose } from '../src/survival/NetAttackPose';
import { createEventItemUseSample, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { NET_ATTACK_CONTACT, NET_ATTACK_GRIP } from '../src/survival/netAttackChoreography';

function setup() {
  const boat = new Group();
  boat.position.set(1, -0.3, 2);
  boat.rotation.set(0.06, 0.7, -0.1);
  const root = new Group();
  root.scale.setScalar(0.5);
  const target = new Group();
  const camera = new PerspectiveCamera();
  camera.position.set(0.1, 1.6, 2);
  boat.add(root, camera, target);
  camera.updateWorldMatrix(true, false);
  return { root, target, camera, solver: new NetAttackPose(), sample: createEventItemUseSample() };
}

describe('net grip and target placement', () => {
  it.each([[0, 1.35, -5.13], [3.4, 0.15, -1.2]])('hits the explicit target at (%s, %s, %s)', (x, y, z) => {
    const { root, target, camera, solver, sample } = setup();
    target.position.set(x, y, z);
    sampleEventItemUse('net-slap', 'fishingNet', 0.62, sample);
    solver.apply(root, sample, camera.matrixWorld, target);
    const rim = root.localToWorld(new Vector3(...NET_ATTACK_CONTACT));
    const aim = target.getWorldPosition(new Vector3());
    expect(rim.distanceTo(aim)).toBeLessThan(1e-6);
  });

  it('keeps the grip fixed while the rim sweeps through an arc', () => {
    const { root, target, camera, solver, sample } = setup();
    target.position.set(0, 1.35, -5.13);
    const grips: Vector3[] = [];
    const rims: Vector3[] = [];
    for (const progress of [0.5, 0.58, 0.62, 0.68]) {
      sampleEventItemUse('net-slap', 'fishingNet', progress, sample);
      solver.apply(root, sample, camera.matrixWorld, target);
      grips.push(root.localToWorld(new Vector3(...NET_ATTACK_GRIP)));
      rims.push(root.localToWorld(new Vector3(...NET_ATTACK_CONTACT)));
    }
    for (let index = 1; index < grips.length; index += 1) {
      expect(grips[index]!.distanceTo(grips[0]!)).toBeLessThan(1e-6);
      expect(rims[index]!.distanceTo(grips[index]!)).toBeCloseTo(0.66, 6);
      expect(rims[index]!.distanceTo(rims[index - 1]!)).toBeGreaterThan(0.1);
    }
  });
});
