import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  type Object3D,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SHIP_LAYOUT } from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { createShipRigging } from '../src/world/ShipRigging';

function mesh(root: Object3D, name: string): Mesh {
  return root.getObjectByName(name) as Mesh;
}

describe('ship rigging', () => {
  it('builds the authored masts, sails, fittings, and mast-base colliders', () => {
    const materials = createShipMaterials();
    const build = createShipRigging(materials, SHIP_LAYOUT.rigging);

    expect(build.root.name).toBe('ship-rigging');
    expect(build.root.children).toHaveLength(SHIP_LAYOUT.rigging.masts.length);
    expect(materials.canvas.side).toBe(DoubleSide);
    SHIP_LAYOUT.rigging.masts.forEach((spec, index) => {
      const mast = build.root.getObjectByName(`mast:${spec.id}`)!;
      const post = mesh(mast, `mast-post:${spec.id}`);
      const sail = mesh(mast, `sail:${spec.id}`);

      expect(mast).toBe(build.root.children[index]);
      expect(mast.position.toArray()).toEqual(spec.position);
      expect(post.geometry).toBeInstanceOf(CylinderGeometry);
      expect((post.geometry as CylinderGeometry).parameters.radialSegments).toBe(12);
      expect(post.position.toArray()).toEqual([0, spec.height / 2, 0]);
      expect(post.scale.toArray()).toEqual([
        spec.baseDiameter,
        spec.height,
        spec.baseDiameter,
      ]);
      expect(sail).toBeInstanceOf(Mesh);
      expect(sail.geometry).toBeInstanceOf(BufferGeometry);
      expect(sail.material).toBe(materials.canvas);
      if (spec.sailKind === 'boom') {
        expect(mast.getObjectByName(`boom:${spec.id}`)).toBeDefined();
      }
      expect(mast.getObjectByName(`stay:${spec.id}`)).toBeDefined();
      expect(mast.getObjectByName(`pulley:${spec.id}`)).toBeDefined();

      sail.geometry.computeBoundingBox();
      const clothBounds = sail.geometry.boundingBox!;
      expect(clothBounds.min.x).toBeGreaterThanOrEqual(-2.4);
      expect(clothBounds.max.x).toBeLessThanOrEqual(2.4);
      expect(clothBounds.min.y).toBeGreaterThanOrEqual(5.2);
      expect(clothBounds.max.y).toBeLessThanOrEqual(spec.height);

      const halfBase = spec.baseDiameter / 2;
      expect(build.colliders[index]).toEqual({
        minX: spec.position[0] - halfBase,
        maxX: spec.position[0] + halfBase,
        minY: spec.position[1],
        maxY: spec.position[1] + spec.height,
        minZ: spec.position[2] - halfBase,
        maxZ: spec.position[2] + halfBase,
      });
    });
    expect(build.colliders).toHaveLength(2);

    build.disposeGeometry();
    materials.dispose();
  });

  it('updates sail transforms deterministically in place and freezes optional motion', () => {
    const materials = createShipMaterials();
    const first = createShipRigging(materials, SHIP_LAYOUT.rigging);
    const second = createShipRigging(materials, SHIP_LAYOUT.rigging);
    const firstSails = SHIP_LAYOUT.rigging.masts.map(({ id }) => mesh(first.root, `sail:${id}`));
    const secondSails = SHIP_LAYOUT.rigging.masts.map(({ id }) => mesh(second.root, `sail:${id}`));
    const neutral = firstSails.map(({ rotation }) => rotation.z);
    const rotations = firstSails.map(({ rotation }) => rotation);
    const positionArrays = firstSails.map((sail) => sail.geometry.getAttribute('position').array);
    const childCount = first.root.children.reduce((count, child) => count + child.children.length, 0);

    first.update(0.25, false);
    second.update(0.1, false);

    firstSails.forEach((sail, index) => {
      expect(sail.rotation.z).not.toBeCloseTo(neutral[index]!);
      expect(sail.rotation.z).toBeCloseTo(secondSails[index]!.rotation.z);
      expect(sail.rotation).toBe(rotations[index]);
      expect(sail.geometry.getAttribute('position').array).toBe(positionArrays[index]);
    });
    expect(first.root.children.reduce((count, child) => count + child.children.length, 0))
      .toBe(childCount);

    first.update(0.25, true);
    firstSails.forEach((sail, index) => {
      expect(sail.rotation.z).toBeCloseTo(neutral[index]!);
    });
    first.update(-1, true);
    firstSails.forEach((sail, index) => {
      expect(sail.rotation.z).toBeCloseTo(neutral[index]!);
    });

    first.disposeGeometry();
    second.disposeGeometry();
    materials.dispose();
  });

  it('disposes generated geometries once and leaves shared materials to their owner', () => {
    const materials = createShipMaterials();
    const materialDisposals = materials.ownedMaterialsForTest()
      .map((material) => vi.spyOn(material, 'dispose'));
    const build = createShipRigging(materials, SHIP_LAYOUT.rigging);
    const geometries = new Set<BufferGeometry>();
    build.root.traverse((object) => {
      if (object instanceof Mesh) geometries.add(object.geometry);
    });
    const geometryDisposals = [...geometries]
      .map((geometry) => vi.spyOn(geometry, 'dispose'));

    build.disposeGeometry();
    build.disposeGeometry();

    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    materials.dispose();
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
