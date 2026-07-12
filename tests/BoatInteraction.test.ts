import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ACTION_FOR_ITEM, projectBoatAnchor } from '../src/survival/BoatInteraction';

describe('BoatInteraction', () => {
  it('maps recovered tools to approved actions', () => {
    expect(ACTION_FOR_ITEM).toMatchObject({
      fishingRod: 'fish',
      scubaSet: 'dive',
      cannedFood: 'eat',
      medicalKit: 'treat',
      waterJug: 'rest',
      repairKit: 'repair',
    });
    expect(ACTION_FOR_ITEM.ductTape).toBeUndefined();
    expect(ACTION_FOR_ITEM.energyBar).toBeUndefined();
    expect(ACTION_FOR_ITEM.chest).toBeUndefined();
    expect(ACTION_FOR_ITEM.flareGun).toBeUndefined();
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
});
