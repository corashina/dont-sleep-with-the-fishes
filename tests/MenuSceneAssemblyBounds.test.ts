import {
  Box3,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Texture,
  Vector3,
} from 'three';
import { expect, it } from 'vitest';
import { DistantSeabed } from '../src/menu/DistantSeabed';
import {
  MENU_MODEL_PLACEMENTS,
  MENU_PROTECTED_FOOTPRINTS,
  MENU_CAMERA_FIELD_OF_VIEW,
  MENU_CAMERA_POSITION,
  MENU_CAMERA_TARGET,
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

function horizontalNdcBounds(bounds: Box3, camera: PerspectiveCamera): readonly [number, number] {
  const corner = new Vector3();
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).project(camera);
        minimum = Math.min(minimum, corner.x);
        maximum = Math.max(maximum, corner.x);
      }
    }
  }
  return [minimum, maximum];
}

it('keeps assembled menu details and swept kelp outside model footprints', () => {
  const distant = new DistantSeabed(new Texture());
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

it('keeps relocated details and kelp visible at 1365 by 768', () => {
  const camera = new PerspectiveCamera(
    MENU_CAMERA_FIELD_OF_VIEW,
    1365 / 768,
    0.08,
    1000,
  );
  camera.position.set(...MENU_CAMERA_POSITION);
  camera.lookAt(...MENU_CAMERA_TARGET);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const distant = new DistantSeabed(new Texture());
  const plants = new UnderwaterPlantField();
  const detailGroups = [
    distant.root.getObjectByName('menu:distant-rocks')!,
    distant.root.getObjectByName('menu:distant-plants')!,
    distant.root.getObjectByName('menu:distant-debris')!,
  ];
  const hiddenDetails = detailGroups.flatMap((group) => group.children)
    .flatMap((detail) => {
      const [minimum, maximum] = horizontalNdcBounds(
        new Box3().setFromObject(detail),
        camera,
      );
      return minimum < -1 || maximum > 1 ? [detail.name] : [];
    });

  const matrix = new Matrix4();
  const center = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const kelpBounds = new Box3();
  const hiddenKelp: string[] = [];
  for (let index = 0; index < plants.kelp.count; index += 1) {
    plants.kelp.getMatrixAt(index, matrix);
    matrix.decompose(center, rotation, scale);
    if (center.z <= -10) continue;
    const radius = KELP_SWEEP_RADIUS * Math.max(scale.x, scale.z);
    kelpBounds.min.set(center.x - radius, center.y, center.z - radius);
    kelpBounds.max.set(center.x + radius, center.y + 1.8 * scale.y, center.z + radius);
    const [minimum, maximum] = horizontalNdcBounds(kelpBounds, camera);
    if (minimum < -1 || maximum > 1) {
      hiddenKelp.push(`menu:procedural-kelp-${index + 1}`);
    }
  }

  distant.dispose();
  plants.dispose();
  expect.soft(hiddenDetails, 'distant details outside 1365x768').toEqual([]);
  expect(hiddenKelp, 'near swept kelp outside 1365x768').toEqual([]);
});

it('keeps the full distant debris 4 bounds visible at 1365 by 768', () => {
  const camera = new PerspectiveCamera(
    MENU_CAMERA_FIELD_OF_VIEW,
    1365 / 768,
    0.08,
    1000,
  );
  camera.position.set(...MENU_CAMERA_POSITION);
  camera.lookAt(...MENU_CAMERA_TARGET);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const distant = new DistantSeabed(new Texture());
  const debris = distant.root.getObjectByName('menu:distant-debris-4')!;
  const [minimum, maximum] = horizontalNdcBounds(
    new Box3().setFromObject(debris),
    camera,
  );

  distant.dispose();
  expect.soft(minimum, 'left debris edge').toBeGreaterThanOrEqual(-1);
  expect(maximum, 'right debris edge').toBeLessThanOrEqual(1);
});
