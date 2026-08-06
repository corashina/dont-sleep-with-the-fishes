import { PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import {
  MENU_FADE_SECONDS,
  createMenuMotionSample,
  sampleMenuFade,
  sampleMenuMotionInto,
} from '../src/menu/menuChoreography';
import {
  MENU_CAMERA_FIELD_OF_VIEW,
  MENU_CAMERA_POSITION,
  MENU_CAMERA_TARGET,
} from '../src/menu/MenuSceneLayout';

const SHARK_TARGET_DIMENSION = 4.8;
const FISH_SCHOOL_WIDTH = 5 * 0.72 + 0.68;
const MINIMUM_SCREEN_GAP = 0.04;

it('loops every actor without replacing output arrays', () => {
  const sample = createMenuMotionSample();
  const firstShark = sample.sharks[0].position;
  const firstFish = sample.fishSchools[0].position;

  sampleMenuMotionInto(sample, 0);
  const start = [...sample.sharks[0].position];
  sampleMenuMotionInto(sample, 26);

  expect(sample.sharks[0].position).toBe(firstShark);
  expect(sample.fishSchools[0].position).toBe(firstFish);
  expect(sample.sharks[0].position).toEqual(start);
});

it('keeps animal groups separated while they cover both sides', () => {
  const sample = createMenuMotionSample();
  const sharkX = [Infinity, -Infinity, Infinity, -Infinity];
  const fishX = [Infinity, -Infinity, Infinity, -Infinity];

  for (let step = 0; step <= 192; step += 1) {
    sampleMenuMotionInto(sample, step * 0.25);
    const sharkDistance = Math.hypot(
      sample.sharks[0].position[0] - sample.sharks[1].position[0],
      sample.sharks[0].position[1] - sample.sharks[1].position[1],
      sample.sharks[0].position[2] - sample.sharks[1].position[2],
    );
    const fishDistance = Math.hypot(
      sample.fishSchools[0].position[0] - sample.fishSchools[1].position[0],
      sample.fishSchools[0].position[1] - sample.fishSchools[1].position[1],
      sample.fishSchools[0].position[2] - sample.fishSchools[1].position[2],
    );
    expect(sharkDistance).toBeGreaterThan(2.2);
    expect(fishDistance).toBeGreaterThan(4);
    sharkX[0] = Math.min(sharkX[0]!, sample.sharks[0].position[0]);
    sharkX[1] = Math.max(sharkX[1]!, sample.sharks[0].position[0]);
    sharkX[2] = Math.min(sharkX[2]!, sample.sharks[1].position[0]);
    sharkX[3] = Math.max(sharkX[3]!, sample.sharks[1].position[0]);
    fishX[0] = Math.min(fishX[0]!, sample.fishSchools[0].position[0]);
    fishX[1] = Math.max(fishX[1]!, sample.fishSchools[0].position[0]);
    fishX[2] = Math.min(fishX[2]!, sample.fishSchools[1].position[0]);
    fishX[3] = Math.max(fishX[3]!, sample.fishSchools[1].position[0]);
  }

  expect(sharkX[0]).toBeLessThan(-15);
  expect(sharkX[3]).toBeGreaterThan(20);
  expect(fishX[0]).toBeLessThan(-14);
  expect(fishX[3]).toBeGreaterThan(16);
});

it('keeps shark and fish-school silhouettes separate through the 34 second loop', () => {
  const camera = new PerspectiveCamera(MENU_CAMERA_FIELD_OF_VIEW, 16 / 9, 0.08, 1000);
  camera.position.set(...MENU_CAMERA_POSITION);
  camera.lookAt(...MENU_CAMERA_TARGET);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const sample = createMenuMotionSample();
  const cameraRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const sharkCenter = new Vector3();
  const fishCenter = new Vector3();
  const projectedShark = new Vector3();
  const projectedFish = new Vector3();
  const projectedEdge = new Vector3();
  const violations: Array<{
    readonly elapsedSeconds: number;
    readonly pair: string;
    readonly clearance: number;
  }> = [];

  const projectedHalfSize = (center: Vector3, width: number): number => {
    projectedEdge.copy(center).addScaledVector(cameraRight, width * 0.5).project(camera);
    return Math.abs(projectedEdge.x - center.clone().project(camera).x);
  };

  for (let step = 0; step <= 136; step += 1) {
    const elapsedSeconds = step * 0.25;
    sampleMenuMotionInto(sample, elapsedSeconds);
    for (let sharkIndex = 0; sharkIndex < sample.sharks.length; sharkIndex += 1) {
      sharkCenter.fromArray(sample.sharks[sharkIndex]!.position);
      projectedShark.copy(sharkCenter).project(camera);
      const sharkHalfSize = projectedHalfSize(sharkCenter, SHARK_TARGET_DIMENSION);
      for (let fishIndex = 0; fishIndex < sample.fishSchools.length; fishIndex += 1) {
        fishCenter.fromArray(sample.fishSchools[fishIndex]!.position);
        projectedFish.copy(fishCenter).project(camera);
        const fishHalfSize = projectedHalfSize(fishCenter, FISH_SCHOOL_WIDTH);
        const centerGap = Math.hypot(
          projectedShark.x - projectedFish.x,
          projectedShark.y - projectedFish.y,
        );
        const clearance = centerGap - sharkHalfSize - fishHalfSize;
        if (clearance < MINIMUM_SCREEN_GAP) {
          violations.push({
            elapsedSeconds,
            pair: `shark-${sharkIndex + 1}/fish-school-${fishIndex + 1}`,
            clearance: Number(clearance.toFixed(4)),
          });
        }
      }
    }
  }

  expect.soft(
    violations.filter(({ elapsedSeconds }) => elapsedSeconds === 13),
    '13 second silhouettes',
  ).toEqual([]);
  expect.soft(
    violations.filter(({ elapsedSeconds }) => elapsedSeconds === 34),
    '34 second silhouettes',
  ).toEqual([]);
  expect(violations, 'full-loop shark and fish-school silhouette clearance').toEqual([]);
});

it('keeps both shark silhouettes separate at supported aspect ratios', () => {
  const sample = createMenuMotionSample();
  const centerOne = new Vector3();
  const centerTwo = new Vector3();
  const projectedOne = new Vector3();
  const projectedTwo = new Vector3();
  const projectedEdge = new Vector3();
  const cameraRight = new Vector3();
  const violations: Array<{
    readonly aspect: number;
    readonly elapsedSeconds: number;
    readonly clearance: number;
  }> = [];

  for (const aspect of [1365 / 768, 2560 / 1080]) {
    const camera = new PerspectiveCamera(MENU_CAMERA_FIELD_OF_VIEW, aspect, 0.08, 1000);
    camera.position.set(...MENU_CAMERA_POSITION);
    camera.lookAt(...MENU_CAMERA_TARGET);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (let step = 0; step <= 272; step += 1) {
      const elapsedSeconds = step * 0.125;
      sampleMenuMotionInto(sample, elapsedSeconds);
      centerOne.fromArray(sample.sharks[0].position);
      centerTwo.fromArray(sample.sharks[1].position);
      projectedOne.copy(centerOne).project(camera);
      projectedTwo.copy(centerTwo).project(camera);
      projectedEdge.copy(centerOne)
        .addScaledVector(cameraRight, SHARK_TARGET_DIMENSION * 0.5)
        .project(camera);
      const halfSizeOne = Math.abs(projectedEdge.x - projectedOne.x) * aspect;
      projectedEdge.copy(centerTwo)
        .addScaledVector(cameraRight, SHARK_TARGET_DIMENSION * 0.5)
        .project(camera);
      const halfSizeTwo = Math.abs(projectedEdge.x - projectedTwo.x) * aspect;
      const centerGap = Math.hypot(
        (projectedOne.x - projectedTwo.x) * aspect,
        projectedOne.y - projectedTwo.y,
      );
      const clearance = centerGap - halfSizeOne - halfSizeTwo;
      if (clearance < MINIMUM_SCREEN_GAP) {
        violations.push({
          aspect: Number(aspect.toFixed(4)),
          elapsedSeconds,
          clearance: Number(clearance.toFixed(4)),
        });
      }
    }
  }

  expect(violations, 'full-loop shark silhouette clearance').toEqual([]);
});

it('clamps the 0.7 second fade', () => {
  expect(MENU_FADE_SECONDS).toBe(0.7);
  expect(sampleMenuFade(-1)).toBe(0);
  expect(sampleMenuFade(0.35)).toBeCloseTo(0.5);
  expect(sampleMenuFade(0.7)).toBe(1);
  expect(sampleMenuFade(2)).toBe(1);
});
