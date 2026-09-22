import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { NetAttackPose } from '../src/survival/NetAttackPose';
import { createEventItemUseSample, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { LIFEBOAT_GUNWALE_SURFACE_Y, lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';

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
  it.each([-1])('clears the boat side throughout the attack and return (%s)', (side) => {
    const { root, target, camera, solver, sample } = setup();
    camera.position.set(0, 1.15, 1.75);
    camera.updateWorldMatrix(true, false);
    target.position.set(side * 2.1, 0.6, -0.5);
    const point = new Vector3();
    const probes = Array.from({ length: 33 }, (_, section) => new Vector3(0, 0.095, 0.82 - section * 0.05));
    // Cover the hoop and hanging mesh as well as the handle.
    for (const x of [-0.21, 0, 0.21]) {
      for (const y of [-0.14, 0.095, 0.14]) {
        for (const z of [-0.82, -0.65, -0.45]) probes.push(new Vector3(x, y, z));
      }
    }
    for (let frame = 80; frame <= 192; frame += 1) {
      sampleEventItemUse('net-slap', 'fishingNet', frame / 200, sample);
      solver.apply(root, sample, camera.matrixWorld, target);
      root.updateMatrix();
      for (const probe of probes) {
        point.copy(probe).applyMatrix4(root.matrix);
        const width = lifeboatHullHalfWidthAt(point.z);
        if (width === null || Math.abs(Math.abs(point.x) - width) > 0.15) continue;
        expect(point.y, `Rail contact at progress ${frame / 200}, probe ${probe.toArray()}`)
          .toBeGreaterThan(LIFEBOAT_GUNWALE_SURFACE_Y + 0.04);
      }
    }
  });
});
