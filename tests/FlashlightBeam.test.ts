import {
  BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FlashlightBeam } from '../src/survival/FlashlightBeam';
import { ItemAimTarget } from '../src/survival/ItemAimTarget';
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
  it('covers a nearby monster through an aim marker and stops at its far edge', () => {
    const monster = model();
    monster.position.set(0, 2, -6);
    const marker = new ItemAimTarget(monster);
    marker.position.set(0.6, 0.4, 0.7);
    monster.add(marker);
    const beam = new FlashlightBeam();
    try {
      beam.setTarget(marker);
      beam.updateTarget();
      beam.apply(new Object3D(), 1, 1);
      expectCoverage(beam, [monster]);
    } finally {
      beam.dispose();
      monster.geometry.dispose();
      monster.material.dispose();
    }
  });

  it('tracks a distant plane and its moving parts without rebuilding geometry', () => {
    const plane = new Group();
    const body = model(2, 2, 8);
    const wings = model(12, 0.3, 2);
    plane.add(body, wings);
    plane.position.set(90, 28, -70);
    plane.rotation.y = Math.PI / 3;
    const beam = new FlashlightBeam();
    const geometry = beam.beam.geometry;
    const actor = new Object3D();
    try {
      beam.setTarget(plane);
      for (const x of [90, 0, -140]) {
        plane.position.x = x;
        wings.rotation.z += 0.2;
        beam.updateTarget();
        beam.apply(actor, 1, 1);
        expectCoverage(beam, [body, wings]);
        expect(beam.beam.scale.x).toBeGreaterThan(70);
        expect(beam.beam.geometry).toBe(geometry);
        const direction = new Vector3(1, 0, 0).applyQuaternion(beam.quaternion);
        expect(direction.y).toBeGreaterThan(0);
        expect(beam.light.distance).toBeCloseTo(beam.beam.scale.x);
      }
    } finally {
      beam.dispose();
      for (const mesh of [body, wings]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  });

  it('keeps coverage fixed while flashing and excludes hidden model parts', () => {
    const target = new Group();
    const visible = model();
    const hidden = model(100, 100, 100);
    const hiddenGroup = new Group();
    hiddenGroup.visible = false;
    hiddenGroup.add(hidden);
    target.add(visible, hiddenGroup);
    target.position.x = 10;
    const beam = new FlashlightBeam();
    try {
      beam.setTarget(target);
      beam.updateTarget();
      beam.apply(new Object3D(), 1, 1);
      const scale = beam.beam.scale.clone();
      beam.apply(new Object3D(), 0.2, 0);
      expect(beam.beam.scale).toEqual(scale);
      expectCoverage(beam, [visible]);
      expect(beam.beam.scale.x).toBeCloseTo(12);
      target.visible = false;
      beam.updateTarget();
      beam.apply(new Object3D(), 1, 1);
      expect(beam.visible).toBe(false);
      expect(beam.light.intensity).toBe(0);
    } finally {
      beam.dispose();
      for (const mesh of [visible, hidden]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  });

  it('clears the previous target and handles empty or enclosing bounds', () => {
    const target = model();
    const beam = new FlashlightBeam();
    try {
      for (const next of [target, new Group(), null]) {
        beam.setTarget(next);
        beam.updateTarget();
        beam.apply(new Object3D(), 1, 1);
        expect(beam.visible).toBe(false);
        expect(beam.light.intensity).toBe(0);
      }
    } finally {
      beam.dispose();
      target.geometry.dispose();
      target.material.dispose();
    }
  });

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
      expect(effects.flashlight.visible).toBe(false);
      expect(effects.flashlight.copyTargetCenter(new Vector3())).toBe(false);
    } finally {
      adapter.dispose();
      target.geometry.dispose();
      target.material.dispose();
    }
  });
});
