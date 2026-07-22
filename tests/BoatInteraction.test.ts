import { describe, expect, it } from 'vitest';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import {
  ACTION_FOR_ITEM,
  projectBoatAnchor,
  projectBoatBounds,
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
