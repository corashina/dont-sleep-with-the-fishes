import {
  Box3,
  BufferGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createLifeboat } from '../src/world/Lifeboat';

function disposeBuild(root: ReturnType<typeof createLifeboat>['root'], textures: readonly Texture[]): void {
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

  it('provides named storage, repair, cue, paddle, and fitting objects', () => {
    const build = createLifeboat();
    expect(build.root.name).toBe('lifeboat');
    expect(build.storageRoot.name).toBe('lifeboat-storage');
    expect(build.root.getObjectByName('damaged-plank-patch')).toBeDefined();
    expect(build.root.getObjectByName('hull-repair-tools')).toBeDefined();
    expect(build.root.getObjectByName('repair-tool-plank')).toBeDefined();
    expect(build.root.getObjectByName('repair-tool-hammer')).toBeDefined();
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

  it('overlaps the floor beneath every side-wall segment and excludes water from the seam', () => {
    const build = createLifeboat();
    const floor = build.root.getObjectByName('survival-floor') as Mesh;
    const segments: Mesh[] = [];
    build.root.traverse((object) => {
      if (object instanceof Mesh && object.name.startsWith('hull-segment-')) {
        segments.push(object);
      }
    });
    expect(segments).toHaveLength(16);

    build.root.updateWorldMatrix(true, true);
    const raycaster = new Raycaster();
    const downward = new Vector3(0, -1, 0);
    const seamSamples: Vector3[] = [];

    for (const segment of segments) {
      segment.geometry.computeBoundingBox();
      const localBounds = segment.geometry.boundingBox!;
      const halfLength = (localBounds.max.z - localBounds.min.z) / 2;
      const inward = segment.position.x < 0 ? 1 : -1;
      const wallBounds = new Box3().setFromObject(segment);
      expect(floor.position.y, `${segment.name} leaves a vertical floor gap`)
        .toBeGreaterThan(wallBounds.min.y);

      for (const fraction of [-0.9, 0, 0.9]) {
        const sample = segment.localToWorld(new Vector3(
          inward * 0.08,
          0,
          fraction * halfLength,
        ));
        sample.y = 1;
        raycaster.set(sample, downward);
        expect(
          raycaster.intersectObject(floor, false),
          `${segment.name} has no floor below its inner edge`,
        ).not.toHaveLength(0);
        seamSamples.push(sample);
      }
    }

    const margin = 0.02;
    for (const sample of seamSamples) {
      expect(Math.abs(sample.x) + margin).toBeLessThanOrEqual(
        build.waterExclusion.halfWidth,
      );
      expect(Math.abs(sample.z) + margin).toBeLessThanOrEqual(
        build.waterExclusion.halfLength,
      );
    }
    const floorBounds = new Box3().setFromObject(floor);
    expect(Math.max(Math.abs(floorBounds.min.x), Math.abs(floorBounds.max.x)) + margin)
      .toBeLessThanOrEqual(build.waterExclusion.halfWidth);
    expect(Math.max(Math.abs(floorBounds.min.z), Math.abs(floorBounds.max.z)) + margin)
      .toBeLessThanOrEqual(build.waterExclusion.halfLength);

    disposeBuild(build.root, build.textures);
  });

});
