import { Box3, Mesh, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import {
  DISTANT_DEBRIS_COUNT, DISTANT_MOUNTAIN_COUNT, DISTANT_PLANT_COUNT, DISTANT_RIDGE_COUNT,
  DISTANT_ROCK_COUNT, DistantSeabed,
} from '../src/menu/DistantSeabed';

it('builds broad deterministic depth and mountain layers', () => {
  const distant = new DistantSeabed();
  expect(distant.root.name).toBe('menu:distant-seabed');
  expect(distant.root.getObjectByName('menu:distant-ridges')?.children).toHaveLength(DISTANT_RIDGE_COUNT);
  expect(distant.root.getObjectByName('menu:distant-mountains')?.children).toHaveLength(DISTANT_MOUNTAIN_COUNT);
  expect(distant.root.getObjectByName('menu:distant-rocks')?.children).toHaveLength(DISTANT_ROCK_COUNT);
  expect(distant.root.getObjectByName('menu:distant-plants')?.children).toHaveLength(DISTANT_PLANT_COUNT);
  expect(distant.root.getObjectByName('menu:distant-debris')?.children).toHaveLength(DISTANT_DEBRIS_COUNT);
  const bounds = new Box3().setFromObject(distant.root);
  expect(bounds.getSize(new Vector3()).x).toBeGreaterThan(140);
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
  const dispose = vi.spyOn(first.geometry, 'dispose');
  distant.dispose();
  distant.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
