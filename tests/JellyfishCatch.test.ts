// Importance: 92/100. Detached catch models must return to their owner on cleanup and replay.
import { expect, it, vi } from 'vitest';
import { Group, InstancedMesh, Matrix4, ShaderMaterial, Vector3 } from 'three';
import { DEFAULT_WAVES, sampleWaveField, sampleWaveFieldInto } from '../src/ocean/WaveField';
import { JellyfishPresentation } from '../src/survival/JellyfishPresentation';
import type { DriftingWater } from '../src/survival/DriftingWaveMotion';

const water: DriftingWater = {
  readAmplitudeScale: () => 0.75,
  sampleWaveInto: (output, time, x, z, amplitude) => sampleWaveFieldInto(output, DEFAULT_WAVES, time, x, z, amplitude),
};

// Importance: 95/100. Camera turns must retain the colony without separate models or materials per creature.
it('instances the colony around the boat, follows waves, and releases shared resources once', () => {
  const clone = vi.fn(() => new Group());
  const presentation = new JellyfishPresentation({ clone }, new Group(), water);
  presentation.stage();
  const batches: InstancedMesh[] = [];
  presentation.root.traverse((object) => {
    if (object instanceof InstancedMesh) batches.push(object);
  });
  expect(batches).toHaveLength(4);
  const nearby = batches.filter((batch) => batch.name.startsWith('jellyfish-batch:'));
  expect(nearby.map((batch) => batch.count)).toEqual([10, 10, 10]);
  expect(new Set(batches.map((batch) => batch.material)).size).toBe(1);
  const background = presentation.root.getObjectByName('jellyfish-background') as InstancedMesh;
  expect(background).toBeInstanceOf(InstancedMesh);
  expect(background.count).toBe(1152);
  expect(clone.mock.calls).toEqual([['flowersHeart']]);
  expect(presentation.waterGlow).toHaveLength(30);
  const positions = presentation.waterGlow;
  const firstPulse = positions[1]!.w;
  presentation.update(1.3, 0.1);
  const matrix = new Matrix4();
  const position = new Vector3();
  expect(presentation.waterGlow).toBe(positions);
  expect(positions[1]!.w).not.toBe(firstPulse);
  for (let index = 0; index < 30; index += 1) {
    const batch = nearby[index % 3]!;
    expect(batch.material).toBeInstanceOf(ShaderMaterial);
    batch.getMatrixAt(Math.floor(index / 3), matrix);
    position.setFromMatrixPosition(matrix);
    expect(positions[index]!.x).toBeCloseTo(position.x);
    expect(positions[index]!.y).toBeCloseTo(position.z);
    expect(positions[index]!.w).toBeGreaterThan(0);
    const surface = sampleWaveField(DEFAULT_WAVES, 1.3, position.x, position.z, water.readAmplitudeScale());
    expect(position.y).toBeLessThan(surface.height);
    if (index === 0) expect(position.distanceTo(presentation.itemAimTarget()!.position)).toBeLessThan(0.00001);
  }
  // Every camera heading needs nearby and distant creatures, including the right-facing net view.
  const nearSectors = new Array<number>(12).fill(0);
  const farSectors = new Array<number>(12).fill(0);
  for (let index = 0; index < background.count; index += 1) {
    background.getMatrixAt(index, matrix);
    position.setFromMatrixPosition(matrix);
    const sector = Math.floor((Math.atan2(position.z, position.x) + Math.PI) / (2 * Math.PI) * 12) % 12;
    const radius = Math.hypot(position.x, position.z);
    if (radius < 20) nearSectors[sector]! += 1;
    if (radius > 100) farSectors[sector]! += 1;
    expect(radius).toBeGreaterThan(4.5);
    const surface = sampleWaveField(DEFAULT_WAVES, 1.3, position.x, position.z, water.readAmplitudeScale());
    expect(position.y).toBeLessThan(surface.height);
  }
  expect(nearSectors.every((count) => count >= 6)).toBe(true);
  expect(farSectors.every((count) => count >= 40)).toBe(true);
  const disposals = [
    ...batches.map((batch) => vi.spyOn(batch, 'dispose')),
    ...batches.map((batch) => vi.spyOn(batch.geometry, 'dispose')),
    vi.spyOn(batches[0]!.material as ShaderMaterial, 'dispose'),
  ];
  presentation.clear();
  presentation.stage();
  expect(presentation.itemAimTarget()).not.toBeNull();
  expect(background.count).toBe(1152);
  presentation.dispose();
  presentation.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
});

it.each(['fishingNet', 'bucket'] as const)('carries the brain in %s and clears it on release, cancellation, and replay', (itemId) => {
  const presentation = new JellyfishPresentation({ clone: () => new Group() }, new Group(), water);
  const net = new Group();
  presentation.stage();
  const piece = presentation.root.getObjectByName('flowers-heart-piece')!;
  expect(piece.visible).toBe(false);
  presentation.itemCatch.capture(net, itemId);
  expect(piece.parent).toBe(net);
  expect(net.children).toEqual([piece]);
  expect(piece.visible).toBe(true);
  presentation.itemCatch.release();
  expect(piece.visible).toBe(false);
  expect(piece.parent).not.toBe(net);
  presentation.stage();
  presentation.itemCatch.capture(net, itemId);
  presentation.clear();
  expect(piece.visible).toBe(false);
  expect(piece.parent).not.toBe(net);
  presentation.stage();
  presentation.itemCatch.capture(net, itemId);
  presentation.dispose();
  expect(net.children).toHaveLength(0);
});
