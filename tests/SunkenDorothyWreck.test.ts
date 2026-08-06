import { Box3, Mesh, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import {
  DOROTHY_WRECK_PART_NAMES,
  DOROTHY_WRECK_POSITION,
  DOROTHY_WRECK_ROTATION,
  DOROTHY_WRECK_SCALE,
  SunkenDorothyWreck,
} from '../src/menu/SunkenDorothyWreck';
import { menuSeabedHeight } from '../src/menu/MenuSceneLayout';

it('builds a long simplified Dorothy wreck in a distant side view', () => {
  const wreck = new SunkenDorothyWreck();
  expect(DOROTHY_WRECK_POSITION[2]).toBeLessThanOrEqual(-18);
  expect(DOROTHY_WRECK_POSITION[2]).toBeGreaterThanOrEqual(-22);
  expect(DOROTHY_WRECK_POSITION[1]).toBe(1.8);
  expect(Math.abs(DOROTHY_WRECK_ROTATION[1])).toBeGreaterThan(1.25);
  expect(Math.abs(DOROTHY_WRECK_ROTATION[1])).toBeLessThan(1.57);
  expect(DOROTHY_WRECK_SCALE).toBe(2);
  expect(wreck.root.scale.toArray()).toEqual([2, 2, 2]);

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
  expect(size.x).toBeGreaterThan(30);
  expect(size.y).toBeGreaterThan(8);
  expect(size.z).toBeLessThan(20);
  expect(bounds.min.y).toBeLessThan(0.15);

  const keelEnds = [
    wreck.root.localToWorld(new Vector3(0, -1.15, -8.15)),
    wreck.root.localToWorld(new Vector3(0, -1.1, 8.1)),
  ];
  for (const point of keelEnds) {
    const clearance = point.y - menuSeabedHeight(point.x, point.z);
    expect(clearance).toBeGreaterThan(-0.4);
    expect(clearance).toBeLessThan(0.4);
  }

  const hull = wreck.root.getObjectByName('menu:dorothy-wreck-hull') as Mesh;
  hull.geometry.computeBoundingBox();
  expect(hull.geometry.boundingBox?.max.z).toBe(9);
  expect(hull.geometry.boundingBox?.min.z).toBe(-9);
  expect(hull.geometry.boundingBox?.getSize(new Vector3()).z).toBe(18);

  const funnelPort = wreck.root.getObjectByName('menu:dorothy-wreck-funnel-port') as Mesh;
  const funnelStarboard = wreck.root.getObjectByName('menu:dorothy-wreck-funnel-starboard') as Mesh;
  expect(funnelPort.geometry).toBe(funnelStarboard.geometry);

  const railPort = wreck.root.getObjectByName('menu:dorothy-wreck-rail-port') as Mesh;
  const railStarboard = wreck.root.getObjectByName('menu:dorothy-wreck-rail-starboard') as Mesh;
  expect(railPort.geometry).toBe(railStarboard.geometry);

  const dispose = vi.spyOn(hull.geometry, 'dispose');
  wreck.dispose();
  wreck.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
