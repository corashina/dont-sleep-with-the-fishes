import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { DistantSeabed } from '../src/menu/DistantSeabed';
import {
  MENU_MODEL_PLACEMENTS,
  MENU_PROTECTED_FOOTPRINTS,
  type MenuGroundFootprint,
} from '../src/menu/MenuSceneLayout';
import {
  KELP_SWEEP_RADIUS,
  UnderwaterPlantField,
} from '../src/menu/UnderwaterPlantField';

interface SceneFootprint {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function layoutFootprint(footprint: MenuGroundFootprint): SceneFootprint {
  return {
    id: footprint.id,
    minX: footprint.position[0] - footprint.halfSize[0],
    maxX: footprint.position[0] + footprint.halfSize[0],
    minZ: footprint.position[2] - footprint.halfSize[1],
    maxZ: footprint.position[2] + footprint.halfSize[1],
  };
}

function overlaps(first: SceneFootprint, second: SceneFootprint): boolean {
  return first.minX < second.maxX && first.maxX > second.minX
    && first.minZ < second.maxZ && first.maxZ > second.minZ;
}

it('keeps assembled menu details and swept kelp outside model footprints', () => {
  const distant = new DistantSeabed();
  const plants = new UnderwaterPlantField();
  const layout = [
    ...MENU_PROTECTED_FOOTPRINTS,
    ...MENU_MODEL_PLACEMENTS,
  ].map(layoutFootprint);
  const detailGroups = [
    distant.root.getObjectByName('menu:distant-rocks')!,
    distant.root.getObjectByName('menu:distant-plants')!,
    distant.root.getObjectByName('menu:distant-debris')!,
  ];
  const detailConflicts = detailGroups.flatMap((group) => group.children)
    .flatMap((detail) => {
      const bounds = new Box3().setFromObject(detail);
      const footprint = {
        id: detail.name,
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
      };
      return layout.filter((entry) => overlaps(entry, footprint))
        .map((entry) => `${detail.name}/${entry.id}`);
    });

  const matrix = new Matrix4();
  const center = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const kelpConflicts: string[] = [];
  for (let index = 0; index < plants.kelp.count; index += 1) {
    plants.kelp.getMatrixAt(index, matrix);
    matrix.decompose(center, rotation, scale);
    const radius = KELP_SWEEP_RADIUS * Math.max(scale.x, scale.z);
    const footprint = {
      id: `menu:procedural-kelp-${index + 1}`,
      minX: center.x - radius,
      maxX: center.x + radius,
      minZ: center.z - radius,
      maxZ: center.z + radius,
    };
    for (const entry of layout) {
      if (overlaps(entry, footprint)) kelpConflicts.push(`${footprint.id}/${entry.id}`);
    }
  }

  distant.dispose();
  plants.dispose();
  expect.soft(detailConflicts, 'distant detail/model intersections').toEqual([]);
  expect(kelpConflicts, 'swept kelp/model intersections').toEqual([]);
});
