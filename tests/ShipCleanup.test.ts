// Importance: 10/10. Protects ship construction rollback and ordered cleanup continuation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
  Points,
  Vector3,
} from 'three';
import { createCrowsNest } from '../src/world/CrowsNest';
import { createShip } from '../src/world/Ship';
import { createShipFurniture } from '../src/world/ShipFurniture';
import { createShipGeometry } from '../src/world/ShipGeometry';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import type { ShipLayoutSpec } from '../src/world/ShipLayoutTypes';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { createShipRigging } from '../src/world/ShipRigging';
import { ShipSmoke } from '../src/world/ShipSmoke';
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

function meshGeometries(root: Object3D): BufferGeometry[] {
  const geometries = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof Mesh || object instanceof Points) geometries.add(object.geometry);
  });
  return [...geometries];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ship cleanup', () => {
  it('continues final geometry cleanup after undefined and stays idempotent', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const geometries = meshGeometries(build.root);
    const firstDispose = vi.spyOn(geometries[0]!, 'dispose').mockImplementation(() => {
      throw undefined;
    });
    const laterError = new Error('later geometry cleanup failed');
    const secondDispose = vi.spyOn(geometries[1]!, 'dispose').mockImplementation(() => {
      throw laterError;
    });
    const lastDispose = vi.spyOn(geometries.at(-1)!, 'dispose');

    expect(thrownBy(() => build.disposeGeometry())).toBeUndefined();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(lastDispose).toHaveBeenCalledOnce();

    build.disposeGeometry();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(lastDispose).toHaveBeenCalledOnce();
    materials.dispose();
  });

  it('rolls back partial final geometry and preserves its construction error', () => {
    const materials = createShipMaterials();
    const constructionError = new Error('balcony source failed');
    const cleanupError = new Error('partial geometry cleanup failed');
    const layout = { ...SHIP_LAYOUT } as ShipLayoutSpec;
    Object.defineProperty(layout, 'balconies', {
      get: () => { throw constructionError; },
    });
    const originalDispose = BufferGeometry.prototype.dispose;
    let disposalCount = 0;
    const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose').mockImplementation(function (
      this: BufferGeometry,
    ) {
      disposalCount += 1;
      if (disposalCount === 1) throw cleanupError;
      originalDispose.call(this);
    });

    expect(thrownBy(() => createShipGeometry(materials, layout))).toBe(constructionError);
    expect(disposalCount).toBeGreaterThan(1);

    dispose.mockRestore();
    materials.dispose();
  });

  it('continues material cleanup into textures and preserves null', () => {
    const materials = createShipMaterials();
    const ownedMaterials = materials.ownedMaterialsForTest();
    const ownedTextures = materials.ownedTexturesForTest();
    const firstDispose = vi.spyOn(ownedMaterials[0]!, 'dispose').mockImplementation(() => {
      throw null;
    });
    const laterDispose = vi.spyOn(ownedMaterials[1]!, 'dispose').mockImplementation(() => {
      throw new Error('later material cleanup failed');
    });
    const textureDispose = vi.spyOn(ownedTextures.at(-1)!, 'dispose');

    expect(thrownBy(() => materials.dispose())).toBeNull();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(laterDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();

    materials.dispose();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(laterDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it('keeps furniture cleanup idempotent after its owned geometry throws', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const build = createShipFurniture(materials, library);
    const rack = build.root.getObjectByName('cargo-rack-top') as Mesh;
    const dispose = vi.spyOn(rack.geometry, 'dispose').mockImplementation(() => {
      throw null;
    });

    expect(thrownBy(() => build.disposeGeometry())).toBeNull();
    build.disposeGeometry();
    expect(dispose).toHaveBeenCalledOnce();

    materials.dispose();
    library.dispose();
  });

  it('continues crow\'s nest cleanup after an early geometry throws', () => {
    const materials = createShipMaterials();
    const build = createCrowsNest(
      materials,
      SHIP_LAYOUT.rigging.masts[0]!,
      SHIP_LAYOUT.rigging.crowsNest,
    );
    const geometries = meshGeometries(build.root);
    const firstDispose = vi.spyOn(geometries[0]!, 'dispose').mockImplementation(() => {
      throw undefined;
    });
    const lastDispose = vi.spyOn(geometries.at(-1)!, 'dispose');

    expect(thrownBy(() => build.disposeGeometry())).toBeUndefined();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(lastDispose).toHaveBeenCalledOnce();
    build.disposeGeometry();
    expect(lastDispose).toHaveBeenCalledOnce();
    materials.dispose();
  });

  it('continues rigging cleanup after crow\'s nest cleanup throws', () => {
    const materials = createShipMaterials();
    const build = createShipRigging(materials, SHIP_LAYOUT.rigging);
    const nest = build.root.getObjectByName('crows-nest:mainmast-lookout')!;
    const failedGeometry = meshGeometries(nest)[0]!;
    const sail = build.root.getObjectByName('sail:mainsail') as Mesh;
    const firstDispose = vi.spyOn(failedGeometry, 'dispose').mockImplementation(() => {
      throw null;
    });
    const sailDispose = vi.spyOn(sail.geometry, 'dispose');

    expect(thrownBy(() => build.disposeGeometry())).toBeNull();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(sailDispose).toHaveBeenCalledOnce();
    build.disposeGeometry();
    expect(sailDispose).toHaveBeenCalledOnce();
    materials.dispose();
  });

  it('continues smoke cleanup into its material and preserves undefined', () => {
    const smoke = new ShipSmoke([new Vector3(), new Vector3()]);
    const geometryDispose = vi.spyOn(smoke.points.geometry, 'dispose').mockImplementation(() => {
      throw undefined;
    });
    const materialDispose = vi.spyOn(smoke.points.material, 'dispose').mockImplementation(() => {
      throw new Error('later smoke material cleanup failed');
    });

    expect(thrownBy(() => smoke.dispose())).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    smoke.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

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

  it('preserves the ship construction error when rollback cleanup throws', () => {
    const library = createTestShipFurniture();
    const constructionError = new Error('furniture clone failed');
    const cleanupError = new Error('ship rollback cleanup failed');
    vi.spyOn(library, 'clone').mockImplementation(() => {
      throw constructionError;
    });
    const originalGeometryDispose = BufferGeometry.prototype.dispose;
    let geometryDisposalCount = 0;
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose').mockImplementation(function (
      this: BufferGeometry,
    ) {
      geometryDisposalCount += 1;
      if (geometryDisposalCount === 1) throw cleanupError;
      originalGeometryDispose.call(this);
    });
    const originalMaterialDispose = Material.prototype.dispose;
    const materialDispose = vi.spyOn(Material.prototype, 'dispose').mockImplementation(function (
      this: Material,
    ) {
      originalMaterialDispose.call(this);
    });

    expect(thrownBy(() => createShip(library, 1))).toBe(constructionError);
    expect(geometryDisposalCount).toBeGreaterThan(1);
    expect(materialDispose).toHaveBeenCalled();

    geometryDispose.mockRestore();
    materialDispose.mockRestore();
    library.dispose();
  });
});
