// Importance: 10/10. Protects ship construction rollback and ordered cleanup continuation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Material,
  Mesh,
  Points,
} from 'three';
import { createShip } from '../src/world/Ship';
import { createTestShipFurniture } from './helpers/shipFurniture';

function thrownBy(action: () => void): unknown {
  let didThrow = false;
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    didThrow = true;
    thrown = error;
  }
  expect(didThrow).toBe(true);
  return thrown;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ship cleanup', () => {

  it('continues the assembled ship cleanup chain and preserves null', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 1);
    const smoke = ship.root.getObjectByName('freighter-smoke') as Points;
    const sail = ship.root.getObjectByName('sail:mainsail') as Mesh;
    const rack = ship.root.getObjectByName('cargo-rack-top') as Mesh;
    const hull = ship.root.getObjectByName('main-hull-body') as Mesh;
    const smokeGeometryDispose = vi.spyOn(smoke.geometry, 'dispose').mockImplementation(() => {
      throw null;
    });
    const smokeMaterialDispose = vi.spyOn(smoke.material as Material, 'dispose');
    const sailDispose = vi.spyOn(sail.geometry, 'dispose');
    const rackDispose = vi.spyOn(rack.geometry, 'dispose');
    const hullDispose = vi.spyOn(hull.geometry, 'dispose');
    const hullMaterialDispose = vi.spyOn(hull.material as Material, 'dispose');

    expect(thrownBy(() => ship.dispose())).toBeNull();
    [
      smokeGeometryDispose,
      smokeMaterialDispose,
      sailDispose,
      rackDispose,
      hullDispose,
      hullMaterialDispose,
    ].forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());

    ship.dispose();
    [
      smokeGeometryDispose,
      smokeMaterialDispose,
      sailDispose,
      rackDispose,
      hullDispose,
      hullMaterialDispose,
    ].forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    library.dispose();
  });
});
