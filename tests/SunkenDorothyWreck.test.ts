import { Box3, Mesh, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import {
  DOROTHY_WRECK_PART_NAMES,
  DOROTHY_WRECK_POSITION,
  DOROTHY_WRECK_ROTATION,
  SunkenDorothyWreck,
} from '../src/menu/SunkenDorothyWreck';

it('builds a long simplified Dorothy wreck in a distant side view', () => {
  const wreck = new SunkenDorothyWreck();
  expect(DOROTHY_WRECK_POSITION[2]).toBeLessThanOrEqual(-18);
  expect(DOROTHY_WRECK_POSITION[2]).toBeGreaterThanOrEqual(-22);
  expect(Math.abs(DOROTHY_WRECK_ROTATION[1])).toBeGreaterThan(1.25);
  expect(Math.abs(DOROTHY_WRECK_ROTATION[1])).toBeLessThan(1.57);

  for (const name of DOROTHY_WRECK_PART_NAMES) {
    expect(wreck.root.getObjectByName(name)).toBeInstanceOf(Mesh);
  }
  for (const name of [
    'menu:dorothy-wreck-hull',
    'menu:dorothy-wreck-deck',
    'menu:dorothy-wreck-deckhouse-aft',
    'menu:dorothy-wreck-deckhouse-forward',
    'menu:dorothy-wreck-funnel-port',
    'menu:dorothy-wreck-funnel-starboard',
    'menu:dorothy-wreck-mast',
    'menu:dorothy-wreck-rail-port',
    'menu:dorothy-wreck-rail-starboard',
  ]) {
    expect(DOROTHY_WRECK_PART_NAMES).toContain(name);
  }

  wreck.root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(wreck.root);
  const size = bounds.getSize(new Vector3());
  expect(size.x).toBeGreaterThan(15);
  expect(size.y).toBeGreaterThan(4);
  expect(size.z).toBeLessThan(10);
  expect(bounds.min.y).toBeLessThan(0.15);

  const hull = wreck.root.getObjectByName('menu:dorothy-wreck-hull') as Mesh;
  const dispose = vi.spyOn(hull.geometry, 'dispose');
  wreck.dispose();
  wreck.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
