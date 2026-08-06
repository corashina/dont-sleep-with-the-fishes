import { Box3, Mesh, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import {
  DISTANT_DEBRIS_COUNT, DISTANT_MOUNTAIN_COUNT, DISTANT_PLANT_COUNT, DISTANT_RIDGE_COUNT,
  DISTANT_ROCK_COUNT, DistantSeabed,
} from '../src/menu/DistantSeabed';
import {
  MENU_PROTECTED_FOOTPRINTS,
  menuSeabedHeight,
} from '../src/menu/MenuSceneLayout';

const getDistantDetails = (distant: DistantSeabed) => [
  distant.root.getObjectByName('menu:distant-rocks')!,
  distant.root.getObjectByName('menu:distant-plants')!,
  distant.root.getObjectByName('menu:distant-debris')!,
].flatMap((group) => group.children);

it('builds broad deterministic depth and mountain layers', () => {
  const distant = new DistantSeabed();
  expect(distant.root.name).toBe('menu:distant-seabed');
  expect(distant.root.getObjectByName('menu:distant-ridges')?.children).toHaveLength(DISTANT_RIDGE_COUNT);
  expect(distant.root.getObjectByName('menu:distant-mountains')?.children).toHaveLength(DISTANT_MOUNTAIN_COUNT);
  expect(distant.root.getObjectByName('menu:distant-rocks')?.children).toHaveLength(DISTANT_ROCK_COUNT);
  expect(distant.root.getObjectByName('menu:distant-plants')?.children).toHaveLength(DISTANT_PLANT_COUNT);
  expect(distant.root.getObjectByName('menu:distant-debris')?.children).toHaveLength(DISTANT_DEBRIS_COUNT);
  expect(DISTANT_ROCK_COUNT).toBe(24);
  expect(DISTANT_PLANT_COUNT).toBe(36);
  expect(DISTANT_DEBRIS_COUNT).toBe(20);
  const bounds = new Box3().setFromObject(distant.root);
  expect(bounds.getSize(new Vector3()).x).toBeGreaterThan(165);
  expect(bounds.getSize(new Vector3()).z).toBeGreaterThan(80);
  const mountainHeights = [1, 2, 3].map((index) => {
    const mountain = distant.root.getObjectByName(`menu:distant-mountain-${index}`)!;
    return new Box3().setFromObject(mountain).max.y;
  });
  expect(mountainHeights[1]).toBeGreaterThan(mountainHeights[0]!);
  expect(mountainHeights[2]).toBeGreaterThan(mountainHeights[1]!);
  const first = distant.root.getObjectByName('menu:distant-debris-1') as Mesh;
  const second = distant.root.getObjectByName('menu:distant-debris-2') as Mesh;
  expect(first.geometry).toBe(second.geometry);
  expect(first.material).toBe(second.material);
  const detailGroups = [
    distant.root.getObjectByName('menu:distant-rocks')!,
    distant.root.getObjectByName('menu:distant-plants')!,
    distant.root.getObjectByName('menu:distant-debris')!,
  ];
  const details = detailGroups.flatMap((group) => group.children);
  for (const group of detailGroups) {
    const sharedGeometry = (group.children[0] as Mesh).geometry;
    const sharedMaterial = (group.children[0] as Mesh).material;
    for (const child of group.children) {
      expect((child as Mesh).geometry).toBe(sharedGeometry);
      expect((child as Mesh).material).toBe(sharedMaterial);
    }
  }
  for (let firstIndex = 0; firstIndex < details.length; firstIndex += 1) {
    const firstBounds = new Box3().setFromObject(details[firstIndex]!);
    for (let secondIndex = firstIndex + 1; secondIndex < details.length; secondIndex += 1) {
      const secondBounds = new Box3().setFromObject(details[secondIndex]!);
      expect(firstBounds.intersectsBox(secondBounds), [
        details[firstIndex]!.name,
        details[secondIndex]!.name,
      ].join(' overlaps ')).toBe(false);
    }
  }
  const dispose = vi.spyOn(first.geometry, 'dispose');
  distant.dispose();
  distant.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('keeps every detail outside the Dorothy footprint', () => {
  const distant = new DistantSeabed();
  const dorothy = MENU_PROTECTED_FOOTPRINTS.find((footprint) => footprint.id === 'dorothy')!;
  const minX = dorothy.position[0] - dorothy.halfSize[0];
  const maxX = dorothy.position[0] + dorothy.halfSize[0];
  const minZ = dorothy.position[2] - dorothy.halfSize[1];
  const maxZ = dorothy.position[2] + dorothy.halfSize[1];
  const conflicts = getDistantDetails(distant).filter((detail) => {
    const bounds = new Box3().setFromObject(detail);
    return bounds.max.x >= minX && bounds.min.x <= maxX
      && bounds.max.z >= minZ && bounds.min.z <= maxZ;
  }).map((detail) => detail.name);
  expect(conflicts).toEqual([]);
  distant.dispose();
});

it('joins each distant terrain edge to the main seabed', () => {
  const distant = new DistantSeabed();
  const terrainGroups = [
    distant.root.getObjectByName('menu:distant-ridges')!,
    distant.root.getObjectByName('menu:distant-mountains')!,
  ];
  for (const mesh of terrainGroups.flatMap((group) => group.children) as Mesh[]) {
    const position = mesh.geometry.getAttribute('position');
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox!;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const isEdge = x === bounds.min.x || x === bounds.max.x
        || z === bounds.min.z || z === bounds.max.z;
      if (!isEdge) continue;
      expect(position.getY(index)).toBeCloseTo(
        menuSeabedHeight(x, z + mesh.position.z),
      );
    }
  }
  distant.dispose();
});

it('supports every detail on the seabed or distant terrain', () => {
  const distant = new DistantSeabed();
  const mainSeabedBounds = new Box3(
    new Vector3(-70, -Infinity, -75),
    new Vector3(70, Infinity, 25),
  );
  const terrainGroups = [
    distant.root.getObjectByName('menu:distant-ridges')!,
    distant.root.getObjectByName('menu:distant-mountains')!,
  ];
  const terrainBounds = [
    mainSeabedBounds,
    ...terrainGroups.flatMap((group) => group.children)
      .map((terrain) => new Box3().setFromObject(terrain)),
  ];
  const unsupported = getDistantDetails(distant).filter((detail) => {
    const detailBounds = new Box3().setFromObject(detail);
    return !terrainBounds.some((terrain) => (
      terrain.min.x <= detailBounds.min.x && terrain.max.x >= detailBounds.max.x
      && terrain.min.z <= detailBounds.min.z && terrain.max.z >= detailBounds.max.z
    ));
  }).map((detail) => detail.name);
  expect(unsupported).toEqual([]);
  distant.dispose();
});
