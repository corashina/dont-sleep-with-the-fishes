import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FlashlightBeam } from '../src/survival/FlashlightBeam';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { createEventItemUseSample, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import type { BorrowedSupplyActor } from '../src/survival/BoatSupplyDisplay';

function model(width = 4, height = 5, depth = 2): Mesh<BoxGeometry, MeshStandardMaterial> {
  return new Mesh(new BoxGeometry(width, height, depth), new MeshStandardMaterial());
}

function meshCorners(mesh: Mesh): Vector3[] {
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox!;
  return Array.from({ length: 8 }, (_, index) => new Vector3(
    index & 1 ? bounds.max.x : bounds.min.x,
    index & 2 ? bounds.max.y : bounds.min.y,
    index & 4 ? bounds.max.z : bounds.min.z,
  ).applyMatrix4(mesh.matrixWorld));
}

function expectCoverage(beam: FlashlightBeam, meshes: Mesh[]): void {
  expect(beam.visible).toBe(true);
  beam.updateWorldMatrix(true, true);
  let furthest = 0;
  for (const mesh of meshes) {
    for (const corner of meshCorners(mesh)) {
      beam.beam.worldToLocal(corner);
      expect(corner.x).toBeGreaterThan(0);
      expect(corner.x).toBeLessThanOrEqual(1 + 1e-6);
      // All corners fit inside even the narrowest part of each polygon face.
      expect(Math.hypot(corner.y, corner.z)).toBeLessThanOrEqual(
        corner.x * Math.cos(Math.PI / 32) + 1e-6,
      );
      furthest = Math.max(furthest, corner.x);
    }
  }
  // The far face ends exactly at the target's farthest bound.
  expect(furthest).toBeCloseTo(1, 6);
}

describe('FlashlightBeam', () => {

  it('aims the held flashlight upward and fits the effect in a rotated actor frame', () => {
    const target = model(14, 2, 6);
    target.position.set(90, 28, -70);
    const actor: BorrowedSupplyActor = {
      instanceId: 'flashlight-1', root: new Group(), applyPose: vi.fn(),
      releaseOnNextSync: vi.fn(), release: vi.fn(),
    };
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(new PerspectiveCamera(), effects);
    const sample = createEventItemUseSample();
    try {
      adapter.begin(actor, 'flashlight', target);
      sampleEventItemUse('flashlight-threat-beam', 'flashlight', 0.6, sample);
      adapter.apply(sample);
      const direction = new Vector3(1, 0, 0).applyQuaternion(actor.root.quaternion);
      expect(direction.dot(target.position.clone().normalize())).toBeCloseTo(1, 5);
      expectCoverage(effects.flashlight, [target]);
      const length = effects.flashlight.beam.scale.x;
      target.position.set(0, 28, -70);
      adapter.apply(sample);
      expectCoverage(effects.flashlight, [target]);
      expect(effects.flashlight.beam.scale.x).toBeLessThan(length);
      adapter.clear();
      expect(effects.flashlight.beam.visible).toBe(false);
      expect(effects.flashlight.copyTargetCenter(new Vector3())).toBe(false);
    } finally {
      adapter.dispose();
      target.geometry.dispose();
      target.material.dispose();
    }
  });
});
