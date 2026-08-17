import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from 'three';
import { expect, it } from 'vitest';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';

it('keeps the Man in the Fog reveal camera still and places the figure farther away', async () => {
  const camera = new PerspectiveCamera();
  camera.position.set(0.4, 1.2, 3.8);
  camera.rotation.set(-0.08, 0.12, 0);
  const basePosition = camera.position.toArray();
  const baseQuaternion = camera.quaternion.toArray();
  const model = new Group();
  const figure = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial());
  model.add(figure);
  const eventModels = {
    create: () => model,
  } as unknown as EventModelLibrary;
  const supplies = {
    resetEventPoseForFrame: () => undefined,
    clearEventPose: () => undefined,
    applyEventAmbientPose: () => undefined,
  } as unknown as BoatSupplyDisplay;
  const animator = new WeatherEventAnimator(
    new Group(),
    supplies,
    eventModels,
    camera,
  );

  animator.stage('man-in-the-fog', 0);
  const reveal = animator.reveal('man-in-the-fog');
  animator.update(2.6, 2.6);

  expect(camera.position.toArray()).toEqual(basePosition);
  expect(camera.quaternion.toArray()).toEqual(baseQuaternion);
  expect(animator.worldRoot.getObjectByName('fog-man-silhouette')?.position.z)
    .toBe(-13.5);
  expect(animator.worldRoot.getObjectByName('fog-man-silhouette')?.position.x)
    .toBe(-2.6);
  expect((figure.material as MeshStandardMaterial).opacity).toBeCloseTo(0.44);

  animator.clear();
  await reveal;
  animator.stage('man-in-the-fog', 1);
  expect(animator.worldRoot.getObjectByName('fog-man-silhouette')?.position.x)
    .toBe(2.6);
  animator.dispose();
});
