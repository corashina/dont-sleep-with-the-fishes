// Importance: 4/5. Protects readable fog staging and camera-safe flashlight motion.
import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { projectObjectScreenBounds } from '../src/rendering/projectScreenBounds';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';

function createSupplyDisplay(canPinEventActor = true): BoatSupplyDisplay {
  return {
    pinEventActor: vi.fn(() => canPinEventActor),
    applyEventItemPose: vi.fn(() => true),
    applyEventAmbientPose: vi.fn(),
    clearEventMotion: vi.fn(),
    clearEventPose: vi.fn(),
    releaseEventActor: vi.fn(),
    releaseEventActorOnNextSync: vi.fn(),
    resetEventPoseForFrame: vi.fn(),
  } as unknown as BoatSupplyDisplay;
}

function createEventModels(): EventModelLibrary {
  return {
    create: vi.fn(() => {
      const root = new Group();
      const geometry = new BoxGeometry(5.2, 4.84, 1.05);
      geometry.translate(0, 2.42, 0);
      root.add(new Mesh(
        geometry,
        new MeshStandardMaterial(),
      ));
      const normalizedScale = 2.4 / 5.2;
      root.scale.setScalar(normalizedScale);
      root.position.y = 1.2 - 2.42 * normalizedScale;
      return root;
    }),
    animations: vi.fn(() => []),
    dispose: vi.fn(),
  } as unknown as EventModelLibrary;
}

function createAnimator(canPinEventActor = true) {
  const cameraRig = new Group();
  const supplyDisplay = createSupplyDisplay(canPinEventActor);
  const camera = new PerspectiveCamera(65, 1280 / 720, 0.08, 1000);
  camera.position.set(0, 0.88, 1.72);
  camera.lookAt(new Vector3(0, 0.88, -1.55));
  cameraRig.position.y = 0.22;
  cameraRig.add(camera);
  const animator = new WeatherEventAnimator(
    cameraRig,
    supplyDisplay,
    createEventModels(),
  );
  return { animator, camera, cameraRig, supplyDisplay };
}

describe('WeatherEventAnimator fog staging', () => {
  it('keeps the normalized fog man distant and faint during its longer reveal', async () => {
    const { animator, camera } = createAnimator();
    animator.stage('man-in-the-fog');
    const reveal = animator.reveal('man-in-the-fog');

    animator.update(2.31, 2.31);

    const silhouette = animator.worldRoot.getObjectByName('fog-man-silhouette')!;
    const figure = silhouette.getObjectByProperty(
      'type',
      'Mesh',
    ) as Mesh<BoxGeometry, MeshStandardMaterial>;
    const screen = projectObjectScreenBounds(silhouette, camera, 1280, 720);
    expect(silhouette.visible).toBe(true);
    expect(screen.visible).toBe(true);
    expect(screen.width).toBeGreaterThanOrEqual(80);
    expect(screen.width).toBeLessThanOrEqual(180);
    expect(screen.height).toBeGreaterThanOrEqual(80);
    expect(screen.height).toBeLessThanOrEqual(200);
    expect(silhouette.position.z).toBeLessThanOrEqual(-9);
    expect(figure.material.opacity).toBeGreaterThan(0.2);
    expect(figure.material.opacity).toBeLessThanOrEqual(0.38);

    animator.clear();
    await reveal;
    expect(silhouette.visible).toBe(false);
    animator.dispose();
  });

  it('uses only the camera during a fog Flashlight choice', async () => {
    const { animator, cameraRig, supplyDisplay } = createAnimator();
    animator.stage('man-in-the-fog');
    const itemUse = animator.playItemUse(
      'man-in-the-fog',
      'flashlight',
      'flashlight-1',
    );

    animator.update(0.675, 0.675);

    const beam = animator.boatRoot.getObjectByName('weather-flashlight-beam-cone')!;
    expect(beam.parent?.visible).toBe(false);
    expect(animator.worldRoot.getObjectByName('fog-man-silhouette')?.visible)
      .toBe(false);
    expect(Math.abs(cameraRig.rotation.y)).toBeGreaterThan(0.05);
    expect(supplyDisplay.pinEventActor).not.toHaveBeenCalled();
    expect(supplyDisplay.applyEventItemPose).not.toHaveBeenCalled();

    animator.clear();
    await expect(itemUse).resolves.toBe(false);
    animator.dispose();
  });
});

describe('WeatherEventAnimator itemless outcome reactions', () => {
  it('keeps Restless Waves supplies fixed during reveal and item use', async () => {
    const { animator, cameraRig, supplyDisplay } = createAnimator();
    animator.stage('restless-waves');
    const reveal = animator.reveal('restless-waves');
    animator.update(1.9, 1.9);
    expect(supplyDisplay.applyEventAmbientPose).not.toHaveBeenCalled();
    animator.clear();
    await reveal;

    const itemUse = animator.playItemUse('restless-waves', 'anchor', 'anchor-1');
    animator.update(0.875, 0.875);
    expect(cameraRig.position.z).toBeLessThan(0);
    expect(supplyDisplay.pinEventActor).not.toHaveBeenCalled();
    expect(supplyDisplay.applyEventItemPose).not.toHaveBeenCalled();
    animator.clear();
    await expect(itemUse).resolves.toBe(false);
    animator.dispose();
  });

  it('shows a Restless Waves hull impact without an item actor', async () => {
    const { animator, cameraRig } = createAnimator(false);
    animator.stage('restless-waves');

    const reaction = animator.react(
      'restless-waves',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The waves damage the boat.',
        deltas: { hull: -25 },
        cue: 'impact',
      },
      null,
    );
    animator.update(0.2, 0.2);

    expect(cameraRig.position.x).toBeGreaterThan(0.1);

    animator.update(0.84, 0.64);
    await reaction;
    expect(cameraRig.position.x).toBe(0);
    animator.dispose();
  });

  it('shows a Man in the Fog hull impact without an item actor', async () => {
    const { animator, cameraRig } = createAnimator(false);
    animator.stage('man-in-the-fog');

    const reaction = animator.react(
      'man-in-the-fog',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The boat is damaged.',
        deltas: { hull: -20, pressure: 1 },
        cue: 'darkness',
      },
      null,
    );
    animator.update(0.21, 0.21);

    expect(cameraRig.position.x).toBeGreaterThan(0.03);

    animator.update(0.84, 0.63);
    await reaction;
    expect(cameraRig.position.x).toBe(0);
    animator.dispose();
  });

  it('uses only camera motion for a Man in the Fog attack', async () => {
    const { animator, cameraRig } = createAnimator(false);
    animator.stage('man-in-the-fog');

    const reaction = animator.react(
      'man-in-the-fog',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'You are injured.',
        deltas: { health: -20, pressure: 1, energy: 2 },
        cue: 'darkness',
      },
      null,
    );
    animator.update(0.37, 0.37);

    const silhouette = animator.worldRoot.getObjectByName('fog-man-silhouette')!;
    expect(silhouette.visible).toBe(false);
    expect(cameraRig.position.x).toBeLessThan(-0.1);

    animator.update(0.84, 0.47);
    await reaction;
    expect(silhouette.visible).toBe(false);
    expect(cameraRig.position.x).toBe(0);
    animator.dispose();
  });
});
