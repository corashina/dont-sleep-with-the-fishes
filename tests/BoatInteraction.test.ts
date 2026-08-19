// Importance: 8/10 (scaled from 4/5). Protects survival action targets.
import { describe, expect, it } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import {
  ACTION_FOR_ITEM,
  createBoatObjectBoundsCache,
  projectBoatAnchor,
  projectBoatBounds,
  projectCachedBoatObjectBounds,
  projectBoatObjectBounds,
} from '../src/survival/BoatInteraction';

describe('BoatInteraction', () => {
  it('maps recovered tools to approved actions', () => {
    expect(ACTION_FOR_ITEM).toEqual({
      cannedFood: 'eat',
      ductTape: 'repairItem',
      medicalKit: 'treat',
      bottledPaper: 'sendMessage',
      energyBar: 'useEnergyBar',
      scubaSet: 'dive',
    });
  });

  it('projects visible anchors and hides points behind the camera', () => {
    const camera = new PerspectiveCamera(65, 2, 0.1, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    expect(projectBoatAnchor(new Vector3(0, 0, -2), camera, 1000, 500)).toMatchObject({
      x: 500,
      y: 250,
      visible: true,
    });
    expect(projectBoatAnchor(new Vector3(0, 0, 2), camera, 1000, 500).visible).toBe(false);
  });

  it('projects item bounds with padding, a minimum target, and camera depth', () => {
    const camera = new PerspectiveCamera(65, 2, 0.1, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const bounds = new Box3(
      new Vector3(-0.05, -0.05, -2.05),
      new Vector3(0.05, 0.05, -1.95),
    );

    const projected = projectBoatBounds(bounds, camera, 1000, 500);

    expect(projected.visible).toBe(true);
    expect(projected.x).toBeCloseTo(500);
    expect(projected.y).toBeCloseTo(250);
    expect(projected.width).toBeGreaterThanOrEqual(44);
    expect(projected.height).toBeGreaterThanOrEqual(44);
    expect(projected.depth).toBeCloseTo(2);
  });

  it('keeps object bounds stable when the boat and camera move through waves together', () => {
    const rig = new Group();
    const camera = new PerspectiveCamera(65, 2, 0.1, 100);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const item = new Mesh(
      new BoxGeometry(0.4, 0.3, 0.2),
      new MeshBasicMaterial(),
    );
    item.position.set(-0.5, 0.2, 0);
    rig.add(camera, item);

    const settled = projectBoatObjectBounds(item, camera, 1000, 500);
    rig.position.set(3, 1.2, -4);
    rig.rotation.set(0.28, 0, -0.22);
    const ridingWave = projectBoatObjectBounds(item, camera, 1000, 500);

    expect(ridingWave.visible).toBe(true);
    expect(ridingWave.x).toBeCloseTo(settled.x);
    expect(ridingWave.y).toBeCloseTo(settled.y);
    expect(ridingWave.width).toBeCloseTo(settled.width);
    expect(ridingWave.height).toBeCloseTo(settled.height);
    expect(ridingWave.depth).toBeCloseTo(settled.depth);

    item.geometry.dispose();
    item.material.dispose();
  });

  it('matches live traversal after a cached root moves', () => {
    const camera = new PerspectiveCamera(65, 2, 0.1, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const root = new Group();
    const nested = new Group();
    nested.position.set(0.3, -0.2, 0.1);
    nested.rotation.z = 0.25;
    const item = new Mesh(
      new BoxGeometry(0.4, 0.3, 0.2),
      new MeshBasicMaterial(),
    );
    nested.add(item);
    root.add(nested);
    root.position.set(2, 1, -8);
    root.rotation.y = 0.4;
    const cache = createBoatObjectBoundsCache(root);

    expect(cache).not.toBeNull();
    const cached = projectCachedBoatObjectBounds(root, cache, camera, 1280, 720);
    const live = projectBoatObjectBounds(root, camera, 1280, 720);
    expect(cached.visible).toBe(live.visible);
    expect(cached.x).toBeCloseTo(live.x);
    expect(cached.y).toBeCloseTo(live.y);
    expect(cached.width).toBeCloseTo(live.width);
    expect(cached.height).toBeCloseTo(live.height);
    expect(cached.depth).toBeCloseTo(live.depth);

    item.geometry.dispose();
    item.material.dispose();
  });

  it('falls back when a root has no mesh bounds', () => {
    const camera = new PerspectiveCamera(65, 2, 0.1, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const root = new Group();
    root.position.z = -4;
    const cache = createBoatObjectBoundsCache(root);

    expect(cache).toBeNull();
    expect(projectCachedBoatObjectBounds(root, cache, camera, 1280, 720))
      .toEqual(projectBoatObjectBounds(root, camera, 1280, 720));
  });

  it('clips partial bounds and hides empty, off-screen, and behind-camera bounds', () => {
    const camera = new PerspectiveCamera(65, 2, 0.1, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const partial = projectBoatBounds(
      new Box3(new Vector3(-3, -0.2, -2), new Vector3(-1, 0.2, -2)),
      camera,
      1000,
      500,
    );
    expect(partial.visible).toBe(true);
    expect(partial.x - partial.width / 2).toBeGreaterThanOrEqual(0);

    expect(projectBoatBounds(new Box3(), camera, 1000, 500).visible).toBe(false);
    expect(projectBoatBounds(
      new Box3(new Vector3(50, 50, -2), new Vector3(51, 51, -1)),
      camera,
      1000,
      500,
    ).visible).toBe(false);
    expect(projectBoatBounds(
      new Box3(new Vector3(-1, -1, 1), new Vector3(1, 1, 2)),
      camera,
      1000,
      500,
    ).visible).toBe(false);
  });
});
