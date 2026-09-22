// Importance: 90/100. Shared model geometry and line attachment must remain correct after deformation.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { FishingRodBend } from '../src/survival/FishingRodBend';

it('bends the shaft and attached tip, preserves shared geometry, and restores it', () => {
  const root = new Group();
  const original = new BoxGeometry(0.05, 0.05, 2, 1, 1, 12);
  original.translate(0, 0, 1);
  const mesh = new Mesh(original, new MeshStandardMaterial());
  const tip = new Object3D();
  tip.position.z = 2;
  root.add(mesh, tip);
  const before = Array.from(original.getAttribute('position').array);
  const bend = new FishingRodBend(root, tip);
  bend.update(1, new Vector3(0, -2, 4));
  expect(tip.position.y).toBeLessThan(-0.3);
  expect(tip.position.z).toBeLessThan(2);
  expect(mesh.geometry).not.toBe(original);
  expect(Array.from(original.getAttribute('position').array)).toEqual(before);
  const positions = mesh.geometry.getAttribute('position');
  expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
  // Two opposite tip vertices average to the same bent center as the line origin.
  const source = original.getAttribute('position');
  const center = new Vector3();
  let count = 0;
  for (let i = 0; i < source.count; i++) {
    if (source.getZ(i) !== 2) continue;
    center.add(new Vector3().fromBufferAttribute(positions, i));
    count++;
  }
  center.divideScalar(count);
  expect(center.distanceTo(tip.position)).toBeLessThan(1e-6);
  bend.update(0, new Vector3());
  expect(tip.position.toArray()).toEqual([0, 0, 2]);
  expect(Array.from(positions.array)).toEqual(before);
  bend.dispose();
  expect(mesh.geometry).toBe(original);
  original.dispose();
  mesh.material.dispose();
});
