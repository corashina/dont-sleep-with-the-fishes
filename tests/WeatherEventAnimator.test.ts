// Importance: 4/5. Protects readable fog staging and camera-safe flashlight motion.
import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
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
  const camera = new PerspectiveCamera(65, 1280 / 720, 0.08, 1000);
  camera.position.set(0, 0.88, 1.72);
  camera.lookAt(new Vector3(0, 0.88, -1.55));
  cameraRig.position.y = 0.22;
  cameraRig.add(camera);
  const animator = new WeatherEventAnimator(
    cameraRig,
    createSupplyDisplay(canPinEventActor),
    createEventModels(),
  );
  return { animator, camera, cameraRig };
}

describe('WeatherEventAnimator fog staging', () => {
  it('keeps the normalized fog man large, central, and high-contrast at reveal', async () => {
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
    expect(screen.width).toBeGreaterThanOrEqual(150);
    expect(screen.width).toBeLessThanOrEqual(320);
    expect(screen.height).toBeGreaterThanOrEqual(160);
    expect(screen.height).toBeLessThanOrEqual(340);
    expect(screen.x).toBeGreaterThanOrEqual(440);
    expect(screen.x).toBeLessThanOrEqual(840);
    expect(screen.y).toBeGreaterThanOrEqual(240);
    expect(screen.y).toBeLessThanOrEqual(520);
    expect(figure.material.opacity).toBeGreaterThanOrEqual(0.9);
    expect(
      Math.max(
        figure.material.emissive.r,
        figure.material.emissive.g,
        figure.material.emissive.b,
      ) * figure.material.emissiveIntensity,
    ).toBeGreaterThanOrEqual(0.12);

    animator.clear();
    await reveal;
    expect(silhouette.visible).toBe(false);
    animator.dispose();
  });

  it('keeps the flashlight beam wholly forward and the figure hidden during use', async () => {
    const { animator } = createAnimator();
    animator.stage('man-in-the-fog');
    const itemUse = animator.playItemUse(
      'man-in-the-fog',
      'flashlight',
      'flashlight-1',
    );

    animator.update(0.675, 0.675);

    const beam = animator.boatRoot.getObjectByName('weather-flashlight-beam-cone')!;
    const bounds = new Box3().setFromObject(beam);
    expect(beam.parent?.visible).toBe(true);
    expect(bounds.max.z).toBeLessThanOrEqual(-0.35);
    expect(animator.worldRoot.getObjectByName('fog-man-silhouette')?.visible)
      .toBe(false);

    animator.clear();
    await expect(itemUse).resolves.toBe(false);
    animator.dispose();
  });
});

describe('WeatherEventAnimator itemless outcome reactions', () => {
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

  it('shows and clears a Man in the Fog attack without an item actor', async () => {
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
    expect(silhouette.visible).toBe(true);
    expect(cameraRig.position.x).toBeLessThan(-0.1);

    animator.update(0.84, 0.47);
    await reaction;
    expect(silhouette.visible).toBe(false);
    expect(cameraRig.position.x).toBe(0);
    animator.dispose();
  });
});
