// Importance: 8/10. Protects the menu horizon, mountain scale, and shadow scope.
import {
  Box3,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Texture,
  Vector3,
} from 'three';
import { expect, it } from 'vitest';
import {
  DISTANT_MOUNTAIN_COUNT,
  DistantSeabed,
  LEFT_SEABED_INSTANCE_COUNT,
  MOUNTAIN_PLANT_INSTANCE_COUNT,
  NEAR_WRECK_DEBRIS_COUNT,
  SEABED_PLANT_INSTANCE_COUNT,
  SEABED_ROCK_INSTANCE_COUNT,
  SEABED_STONE_INSTANCE_COUNT,
} from '../src/menu/DistantSeabed';

function instancePositions(mesh: InstancedMesh): Vector3[] {
  const matrix = new Matrix4();
  const position = new Vector3();
  const positions: Vector3[] = [];
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    positions.push(position.setFromMatrixPosition(matrix).clone());
  }
  return positions;
}

it('builds three large smooth mountain layers against a pale horizon', () => {
  const seabed = new DistantSeabed(new Texture());
  const mountains = seabed.root.getObjectByName('menu:distant-mountains')!;
  const horizon = seabed.root.getObjectByName('menu:distant-horizon') as Mesh;

  expect(mountains.children).toHaveLength(DISTANT_MOUNTAIN_COUNT);
  expect(horizon.material).toBeInstanceOf(MeshBasicMaterial);
  expect((horizon.material as MeshBasicMaterial).vertexColors).toBe(true);

  const offsets = new Set<number>();
  for (const mountain of mountains.children as Mesh[]) {
    const position = mountain.geometry.getAttribute('position');
    const normal = mountain.geometry.getAttribute('normal');
    expect(position.count).toBeGreaterThan(900);
    expect(normal.count).toBe(position.count);
    expect(new Box3().setFromObject(mountain).getSize(new Vector3()).y)
      .toBeGreaterThan(8);
    expect(mountain.castShadow).toBe(false);
    offsets.add(mountain.position.x);
  }
  expect(offsets.size).toBe(DISTANT_MOUNTAIN_COUNT);
  seabed.dispose();
});

it('fills the complete seabed view with three fixed instanced batches', () => {
  const seabed = new DistantSeabed(new Texture());
  const nearDebris = seabed.root.getObjectByName('menu:near-wreck-debris')!;
  const batches = [
    ['menu:scatter-rocks', SEABED_ROCK_INSTANCE_COUNT],
    ['menu:scatter-stones', SEABED_STONE_INSTANCE_COUNT],
    ['menu:scatter-plants', SEABED_PLANT_INSTANCE_COUNT],
  ] as const;

  expect(nearDebris.children).toHaveLength(NEAR_WRECK_DEBRIS_COUNT);
  expect(nearDebris.children.every((object) => (
    (object as Mesh).castShadow && (object as Mesh).receiveShadow
  ))).toBe(true);
  for (const [name, count] of batches) {
    const batch = seabed.root.getObjectByName(name);
    expect(batch).toBeInstanceOf(InstancedMesh);
    expect((batch as InstancedMesh).count).toBe(count);
    expect((batch as InstancedMesh).castShadow).toBe(false);
    const positions = instancePositions(batch as InstancedMesh);
    expect(positions.some(({ z }) => z > -12)).toBe(true);
    expect(positions.some(({ z }) => z < -28 && z > -52)).toBe(true);
    expect(positions.some(({ z }) => z < -62)).toBe(true);
    expect(positions.some(({ x }) => x < -8)).toBe(true);
    expect(positions.some(({ x }) => Math.abs(x) < 3)).toBe(true);
    expect(positions.some(({ x }) => x > 8)).toBe(true);
  }
  seabed.dispose();
});

it('moves existing scatter into near sand across a wide viewport', () => {
  const seabed = new DistantSeabed(new Texture());
  const rocks = instancePositions(
    seabed.root.getObjectByName('menu:scatter-rocks') as InstancedMesh,
  ).filter(({ z }) => z > 2.2);
  const stones = instancePositions(
    seabed.root.getObjectByName('menu:scatter-stones') as InstancedMesh,
  ).filter(({ z }) => z > 2.2);
  const plants = instancePositions(
    seabed.root.getObjectByName('menu:scatter-plants') as InstancedMesh,
  ).filter(({ z }) => z > 2.2);
  const foreground = [...rocks, ...stones, ...plants];

  expect(rocks.length).toBeGreaterThanOrEqual(28);
  expect(stones.length).toBeGreaterThanOrEqual(55);
  expect(plants.length).toBeGreaterThanOrEqual(38);
  expect(foreground.some(({ x }) => x < -4)).toBe(true);
  expect(stones.some(({ x }) => Math.abs(x) < 2)).toBe(true);
  expect(foreground.some(({ x }) => x > 4)).toBe(true);
  seabed.dispose();
});

it('moves mountain rock budget left of the guide sign', () => {
  const seabed = new DistantSeabed(new Texture());
  const batches = [
    seabed.root.getObjectByName('menu:scatter-rocks') as InstancedMesh,
    seabed.root.getObjectByName('menu:scatter-stones') as InstancedMesh,
    seabed.root.getObjectByName('menu:scatter-plants') as InstancedMesh,
  ];

  expect(LEFT_SEABED_INSTANCE_COUNT).toBe(20);
  expect(seabed.root.getObjectByName('menu:mountain-rocks')).toBeUndefined();
  for (const batch of batches) {
    const left = instancePositions(batch).filter(({ x, z }) => (
      x < -4.1 && z > 0.2 && z < 6.3
    ));
    expect(left.length).toBeGreaterThanOrEqual(LEFT_SEABED_INSTANCE_COUNT);
  }
  seabed.dispose();
});

it('keeps the boat sightline clear of large scatter rocks', () => {
  const seabed = new DistantSeabed(new Texture());
  const rocks = instancePositions(
    seabed.root.getObjectByName('menu:scatter-rocks') as InstancedMesh,
  );

  expect(rocks.some(({ x, z }) => (
    Math.abs(x) < 2.4 && z > -4.4 && z < 1.8
  ))).toBe(false);
  seabed.dispose();
});

it('covers every mountain layer with low-detail shadow-free instances', () => {
  const seabed = new DistantSeabed(new Texture());
  const batches = [
    ['menu:mountain-plants', MOUNTAIN_PLANT_INSTANCE_COUNT],
  ] as const;

  for (const [name, count] of batches) {
    const batch = seabed.root.getObjectByName(name) as InstancedMesh;
    expect(batch).toBeInstanceOf(InstancedMesh);
    expect(batch.count).toBe(count);
    expect(batch.geometry.getAttribute('position').count).toBeLessThan(100);
    expect(batch.castShadow).toBe(false);
    expect(batch.receiveShadow).toBe(false);
    const positions = instancePositions(batch);
    expect(positions.some(({ z }) => z > -41)).toBe(true);
    expect(positions.some(({ z }) => z < -41 && z > -61)).toBe(true);
    expect(positions.some(({ z }) => z < -61)).toBe(true);
  }
  seabed.dispose();
});
