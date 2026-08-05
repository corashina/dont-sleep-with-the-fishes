import { Box3, Mesh, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import {
  DOROTHY_WRECK_PART_NAMES,
  DOROTHY_WRECK_POSITION,
  SunkenDorothyWreck,
} from '../src/menu/SunkenDorothyWreck';

it('builds one large buried Dorothy silhouette', () => {
  const wreck = new SunkenDorothyWreck();
  expect(wreck.root.name).toBe('menu:dorothy-wreck');
  expect(wreck.root.position.toArray()).toEqual([...DOROTHY_WRECK_POSITION]);
  for (const name of DOROTHY_WRECK_PART_NAMES) {
    expect(wreck.root.getObjectByName(name)).toBeInstanceOf(Mesh);
  }
  wreck.root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(wreck.root);
  expect(bounds.getSize(new Vector3()).z).toBeGreaterThan(12);
  const hull = wreck.root.getObjectByName('menu:dorothy-wreck-hull') as Mesh;
  const dispose = vi.spyOn(hull.geometry, 'dispose');
  wreck.dispose();
  wreck.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
