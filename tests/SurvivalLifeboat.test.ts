import {
  Box3,
  BufferGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createLifeboat } from '../src/world/Lifeboat';
import {
  SURVIVAL_LIFEBOAT_DIMENSIONS,
  createSurvivalLifeboat,
} from '../src/survival/SurvivalLifeboat';

function disposeBuild(root: ReturnType<typeof createSurvivalLifeboat>['root'], textures: readonly Texture[]): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    assigned.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

describe('survival lifeboat builder', () => {
  it('builds an 18–22 percent larger named rounded hull', () => {
    const build = createSurvivalLifeboat();
    const hull = build.root.getObjectByName('survival-hull-geometry')!;
    const size = new Box3().setFromObject(hull).getSize(new Vector3());
    const scavenging = createLifeboat();
    const scavengingHullBounds = new Box3();
    for (const name of ['hull-port', 'hull-starboard', 'boat-bow', 'boat-stern', 'boat-floor']) {
      scavengingHullBounds.union(new Box3().setFromObject(scavenging.root.getObjectByName(name)!));
    }
    const scavengingSize = scavengingHullBounds.getSize(new Vector3());
    expect(size.x).toBeCloseTo(SURVIVAL_LIFEBOAT_DIMENSIONS.width, 1);
    expect(size.z).toBeCloseTo(SURVIVAL_LIFEBOAT_DIMENSIONS.length, 1);
    expect(size.x / scavengingSize.x).toBeGreaterThanOrEqual(1.18);
    expect(size.x / scavengingSize.x).toBeLessThanOrEqual(1.22);
    expect(size.z / scavengingSize.z).toBeGreaterThanOrEqual(1.18);
    expect(size.z / scavengingSize.z).toBeLessThanOrEqual(1.22);
    expect(hull.children.filter(({ name }) => name.startsWith('hull-segment-')).length)
      .toBeGreaterThanOrEqual(16);
    disposeBuild(build.root, build.textures);
    disposeBuild(scavenging.root, []);
  });

  it('provides named storage, repair, cue, paddle, and fitting objects', () => {
    const build = createSurvivalLifeboat();
    expect(build.root.name).toBe('lifeboat');
    expect(build.storageRoot.name).toBe('lifeboat-storage');
    expect(build.root.getObjectByName('damaged-plank-patch')).toBeDefined();
    expect(build.root.getObjectByName('fishing-line')?.visible).toBe(false);
    expect(build.root.getObjectByName('fishing-catch')?.visible).toBe(false);
    expect(build.root.getObjectByName('paddle-port')).toBeDefined();
    expect(build.root.getObjectByName('paddle-starboard')).toBeDefined();
    expect(build.root.getObjectByName('survival-gunwale')).toBeDefined();
    expect(build.root.getObjectByName('survival-floor')).toBeDefined();
    expect(build.root.getObjectByName('survival-ribs')?.children).toHaveLength(3);
    expect(build.root.getObjectByName('survival-fittings')?.children.length)
      .toBeGreaterThanOrEqual(10);
    disposeBuild(build.root, build.textures);
  });

  it('connects each named paddle blade to its matching shaft', () => {
    const build = createSurvivalLifeboat();
    for (const side of ['port', 'starboard'] as const) {
      const blade = build.root.getObjectByName(`paddle-blade-${side}`)!;
      const shaft = build.root.getObjectByName(`paddle-shaft-${side}`)!;
      const bladeBounds = new Box3().setFromObject(blade);
      const shaftBounds = new Box3().setFromObject(shaft);
      expect(
        bladeBounds.intersectsBox(shaftBounds),
        `${side} paddle blade must overlap its matching shaft`,
      ).toBe(true);
    }
    disposeBuild(build.root, build.textures);
  });

  it('uses all procedural texture families and matching interior exclusions', () => {
    const build = createSurvivalLifeboat();
    const maps = new Set<Texture>();
    build.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      assigned.forEach((material) => {
        if (material instanceof MeshStandardMaterial) {
          if (material.map) maps.add(material.map);
          if (material.roughnessMap) maps.add(material.roughnessMap);
        }
      });
    });
    expect(build.textures).toHaveLength(6);
    expect(maps).toEqual(new Set(build.textures));
    expect(build.interiorBounds.min.toArray()).toEqual([-1.45, -0.50, -2.96]);
    expect(build.interiorBounds.max.toArray()).toEqual([1.45, 1.00, 2.96]);
    expect(build.waterExclusion).toEqual({ halfWidth: 1.50, halfLength: 3.00 });
    disposeBuild(build.root, build.textures);
  });
});
