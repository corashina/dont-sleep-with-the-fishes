import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { NetAttackPose } from '../src/survival/NetAttackPose';
import { createEventItemUseSample, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { NET_ATTACK_CONTACT, NET_ATTACK_GRIP } from '../src/survival/netAttackChoreography';
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
  it.each([[0, 1.35, -5.13], [3.4, 0.15, -1.2]])('flies to (%s, %s, %s) and contacts it broadside', (x, y, z) => {
    const { root, target, camera, solver, sample } = setup();
    target.position.set(x, y, z);
    sampleEventItemUse('net-slap', 'fishingNet', 0.68, sample);
    solver.apply(root, sample, camera.matrixWorld, target);
    const rim = root.localToWorld(new Vector3(...NET_ATTACK_CONTACT));
    const grip = root.localToWorld(new Vector3(...NET_ATTACK_GRIP));
    const heldGrip = new Vector3(sample.viewX, sample.viewY, sample.viewZ).applyMatrix4(camera.matrixWorld);
    const aim = target.getWorldPosition(new Vector3());
    expect(grip.distanceTo(heldGrip)).toBeGreaterThan(0.42);
    expect(rim.distanceTo(aim)).toBeLessThan(1e-6);
    const approach = aim.clone().sub(heldGrip).normalize();
    expect(grip.clone().sub(aim).dot(approach)).toBeLessThan(-0.5);
    // The head must cross the target sideways, rather than thrust toward it.
    sampleEventItemUse('net-slap', 'fishingNet', 0.679, sample);
    solver.apply(root, sample, camera.matrixWorld, target);
    const before = root.localToWorld(new Vector3(...NET_ATTACK_CONTACT));
    sampleEventItemUse('net-slap', 'fishingNet', 0.681, sample);
    solver.apply(root, sample, camera.matrixWorld, target);
    const velocity = root.localToWorld(new Vector3(...NET_ATTACK_CONTACT)).sub(before).normalize();
    const cameraUp = new Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
    const right = approach.clone().cross(cameraUp).normalize();
    expect(velocity.dot(right)).toBeLessThan(-0.9);
    expect(Math.abs(velocity.dot(approach))).toBeLessThan(0.2);
    expect(velocity.dot(cameraUp)).toBeLessThan(0);
  });

  it('holds the net head above the hand before it flies to the target', () => {
    const { root, target, camera, solver, sample } = setup();
    target.position.set(0, 1.35, -5.13);
    sampleEventItemUse('net-slap', 'fishingNet', 0.5, sample);
    solver.apply(root, sample, camera.matrixWorld, target);
    const rim = root.localToWorld(new Vector3(...NET_ATTACK_CONTACT));
    const grip = root.localToWorld(new Vector3(...NET_ATTACK_GRIP));
    const heldGrip = new Vector3(sample.viewX, sample.viewY, sample.viewZ).applyMatrix4(camera.matrixWorld);
    const cameraUp = new Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
    expect(grip.distanceTo(heldGrip)).toBeLessThan(1e-6);
    expect(rim.sub(grip).normalize().dot(cameraUp)).toBeGreaterThan(0.9);
    expect(sample.targetBlend).toBe(0);
  });

  it('keeps the grip fixed while the rim sweeps through an arc', () => {
    const { root, target, camera, solver, sample } = setup();
    target.position.set(0, 1.35, -5.13);
    const grips: Vector3[] = [];
    const rims: Vector3[] = [];
    for (const progress of [0.64, 0.664, 0.68]) {
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

  it.each([-1, 1])('clears the boat side throughout the attack and return (%s)', (side) => {
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
