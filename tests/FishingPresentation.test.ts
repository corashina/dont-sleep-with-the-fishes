// Importance: 10/10. Protects fishing visuals, timing, projection, and cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import {
  FISHING_PLAYER_SEAT,
  FishingPresentation,
  type FishingCatchPresentationLibrary,
} from '../src/survival/FishingPresentation';
import { FishingBiteParticles } from '../src/survival/FishingBiteParticles';
import type { FishingCatchId } from '../src/survival/fishingCatalog';

class TestCatchLibrary implements FishingCatchPresentationLibrary {
  readonly prepare = vi.fn(async (catchId: FishingCatchId): Promise<Object3D> => {
    const root = new Group();
    root.name = `test-catch:${catchId}`;
    root.add(new Mesh(new BoxGeometry(0.8, 0.5, 0.35), new MeshBasicMaterial()));
    return root;
  });
  readonly hide = vi.fn();
  readonly dispose = vi.fn();
}

function createRig() {
  const worldRoot = new Scene();
  const boatRoot = new Group();
  worldRoot.add(boatRoot);
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  camera.position.set(0, 0.88, 1.56);
  camera.lookAt(0, 0.88, -1.55);
  const basePosition = camera.position.clone();
  const baseQuaternion = camera.quaternion.clone();
  worldRoot.add(camera);

  const cameraControl = {
    restoreBasePose: vi.fn(() => {
      camera.position.copy(basePosition);
      camera.quaternion.copy(baseQuaternion);
    }),
    interpolateToBasePose: vi.fn((
      startPosition: Readonly<Vector3>,
      startQuaternion: Readonly<Quaternion>,
      progress: number,
    ) => {
      camera.position.lerpVectors(startPosition, basePosition, progress);
      camera.quaternion.copy(startQuaternion).slerp(baseQuaternion, progress);
    }),
  };
  const resetBasePresentation = vi.fn();
  const rodPivot = new Group();
  rodPivot.position.set(0, 0.56, -2.28);
  rodPivot.rotation.x = -0.38;
  const rod = new Group();
  const rodMesh = new Mesh(new BoxGeometry(0.08, 0.08, 1.4), new MeshBasicMaterial());
  rodMesh.position.set(0.35, 0.42, 0.05);
  rod.add(rodMesh);
  rodPivot.add(rod);
  boatRoot.add(rodPivot);
  const catches = new TestCatchLibrary();
  const biteParticles = new FishingBiteParticles();
  const sampleWaveInto = vi.fn((
    output: {
      height: number;
      displacementX: number;
      displacementZ: number;
      normal: { x: number; y: number; z: number };
    },
    time: number,
    x: number,
    z: number,
    amplitudeScale: number,
  ) => {
    output.height = 0.2 + time * 0.01 + x * 0.001 + z * 0.002;
    output.displacementX = 0;
    output.displacementZ = 0;
    output.normal.x = 0;
    output.normal.y = 1;
    output.normal.z = 0;
  });
  const presentation = new FishingPresentation({
    camera,
    cameraControl,
    resetBasePresentation,
    sampleWaveInto,
    waveAmplitudeScale: () => 0.75,
    rodPivot,
    rod,
    catches,
    biteParticles,
    boatRoot,
    worldRoot,
  });
  return {
    presentation,
    worldRoot,
    boatRoot,
    camera,
    cameraControl,
    resetBasePresentation,
    rodPivot,
    catches,
    biteParticles,
    sampleWaveInto,
    basePosition,
    baseQuaternion,
  };
}

describe('FishingPresentation', () => {
  it('enters the authored bow view and keeps repeat entry settled', async () => {
    const rig = createRig();
    const entry = rig.presentation.enterView();

    expect(rig.presentation.phaseForTest()).toBe('entering');
    rig.presentation.update(1.1, 1.1);
    await entry;

    expect(rig.presentation.phaseForTest()).toBe('ready');
    expect(rig.camera.position).toEqual(expect.objectContaining(FISHING_PLAYER_SEAT));
    await expect(rig.presentation.enterView()).resolves.toBeUndefined();
    expect(rig.presentation.phaseForTest()).toBe('ready');
    expect(rig.resetBasePresentation).toHaveBeenCalledOnce();
    rig.presentation.dispose();
  });

  it('keeps screen casts bounded and preserves the centered cast', () => {
    const rig = createRig();
    rig.presentation.settleForVisibilityChange();
    void rig.presentation.enterView();
    rig.presentation.settleForVisibilityChange();

    const point = rig.presentation.castPointFromScreen(400, 300, 800, 600);
    expect(point).toEqual({ x: 0, z: -6.004666666666667 });
    expect(Object.isFrozen(point)).toBe(true);
    expect(rig.presentation.castPointFromScreen(0, 0, 800, 600)).toBeNull();
    expect(rig.presentation.castPointFromScreen(-1, 300, 800, 600)).toBeNull();
    expect(rig.presentation.castPointFromScreen(400, 300, 0, 600)).toBeNull();

    const centered = rig.presentation.centeredCast();
    expect(centered).toEqual({ x: 0, z: -6.4 });
    expect(Object.isFrozen(centered)).toBe(true);
    expect(() => rig.presentation.playCast({ x: 2.71, z: -6.4 })).toThrow(RangeError);
    expect(() => rig.presentation.playCast({ x: 0, z: Number.NaN })).toThrow(RangeError);
    rig.presentation.dispose();
  });

  it('casts, follows waves, and settles into waiting with the authored line', async () => {
    const rig = createRig();
    const point = rig.presentation.centeredCast();
    const cast = rig.presentation.playCast(point);
    const line = rig.worldRoot.getObjectByName('fishing-line')!;
    const bobber = rig.worldRoot.getObjectByName('fishing-bobber')!;

    expect(rig.presentation.phaseForTest()).toBe('casting');
    expect(line.visible).toBe(true);
    rig.presentation.update(0.4, 0.4);
    expect(bobber.position.y).toBeGreaterThan(0.2);
    rig.presentation.update(0.8, 0.4);
    await cast;

    expect(rig.presentation.phaseForTest()).toBe('waiting');
    expect(line.visible).toBe(true);
    expect(bobber.visible).toBe(true);
    expect(rig.sampleWaveInto).toHaveBeenLastCalledWith(
      expect.any(Object),
      0.8,
      0,
      -6.4,
      0.75,
    );
    const positions = (line as unknown as {
      geometry: { getAttribute(name: string): { array: Float32Array } };
    })
      .geometry.getAttribute('position').array;
    expect(Array.from(positions)).not.toEqual(new Array(15).fill(0));
    rig.presentation.dispose();
  });

  it('shows a bite, emits particles, and reuses its projected target', () => {
    const rig = createRig();
    rig.presentation.showBite(rig.presentation.centeredCast());

    expect(rig.presentation.phaseForTest()).toBe('bite');
    expect(rig.biteParticles.activeCount()).toBeGreaterThan(0);
    const first = rig.presentation.projectBite(800, 600);
    const second = rig.presentation.projectBite(1280, 720);
    expect(second).toBe(first);
    expect(first).toMatchObject({ width: 52, height: 52, visible: true });
    expect(first.x).toBeCloseTo(640);
    expect(first.y).toBeCloseTo(327.5919650972957);
    expect(first.depth).toBeCloseTo(5.112455805267838);

    rig.presentation.showWaiting(rig.presentation.centeredCast());
    expect(rig.biteParticles.activeCount()).toBe(0);
    expect(rig.presentation.projectBite(800, 600)).toMatchObject({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      depth: 0,
      visible: false,
    });
    rig.presentation.dispose();
  });

  it('reels a catch to the bow rest and projects the landed result', async () => {
    const rig = createRig();
    rig.presentation.showBite(rig.presentation.centeredCast());
    const reel = rig.presentation.playReel('cod');
    await vi.waitFor(() => expect(rig.presentation.phaseForTest()).toBe('reeling'));

    expect(rig.worldRoot.getObjectByName('fishing-bobber')?.visible).toBe(false);
    rig.presentation.update(1, 1);
    await reel;

    const catchDisplay = rig.worldRoot.getObjectByName('fishing-catch-display')!;
    const catchRest = rig.worldRoot.getObjectByName('fishing-catch-bow-rest')!;
    expect(rig.presentation.phaseForTest()).toBe('landed');
    expect(catchDisplay.parent).toBe(catchRest);
    expect(catchDisplay.position.toArray()).toEqual([0, 0, 0]);
    expect(catchRest.position.toArray()).toEqual([0, 0.43, -2.52]);
    const firstProjection = rig.presentation.projectCatch(800, 600);
    const secondProjection = rig.presentation.projectCatch(1280, 720);
    expect(firstProjection).not.toBeNull();
    expect(secondProjection).toBe(firstProjection);
    expect(secondProjection).toMatchObject({ visible: true });
    rig.presentation.dispose();
  });

  it('plays a miss and returns to the exact base camera pose', async () => {
    const rig = createRig();
    const miss = rig.presentation.playMiss();
    expect(rig.presentation.phaseForTest()).toBe('missing');
    rig.presentation.update(0.8, 0.8);
    await miss;

    const exit = rig.presentation.exitView();
    expect(rig.presentation.phaseForTest()).toBe('returning');
    rig.presentation.update(1.9, 1.1);
    await exit;

    expect(rig.presentation.phaseForTest()).toBe('idle');
    expect(rig.camera.position).toEqual(rig.basePosition);
    expect(rig.camera.quaternion.toArray()).toEqual(rig.baseQuaternion.toArray());
    expect(rig.cameraControl.restoreBasePose).toHaveBeenCalledOnce();
    rig.presentation.dispose();
  });

  it('settles replaced work and preserves the bow view when cleared', async () => {
    const rig = createRig();
    const entry = rig.presentation.enterView();
    const cast = rig.presentation.playCast(rig.presentation.centeredCast());
    await entry;
    expect(rig.presentation.phaseForTest()).toBe('casting');

    const bowPosition = rig.camera.position.clone();
    rig.presentation.clear();
    await cast;
    expect(rig.presentation.phaseForTest()).toBe('ready');
    expect(rig.resetBasePresentation).toHaveBeenCalledOnce();
    expect(rig.camera.position).toEqual(bowPosition);
    for (const name of [
      'fishing-line',
      'fishing-bobber',
      'fishing-splash',
      'fishing-catch-display',
    ]) expect(rig.worldRoot.getObjectByName(name)?.visible).toBe(false);
    rig.presentation.dispose();
  });

  it('settles entry and return work on visibility changes', async () => {
    const rig = createRig();
    const entry = rig.presentation.enterView();
    rig.presentation.settleForVisibilityChange();
    await entry;
    expect(rig.presentation.phaseForTest()).toBe('ready');
    expect(rig.camera.position).toEqual(expect.objectContaining(FISHING_PLAYER_SEAT));

    const exit = rig.presentation.exitView();
    rig.presentation.settleForVisibilityChange();
    await exit;
    expect(rig.presentation.phaseForTest()).toBe('idle');
    expect(rig.camera.position).toEqual(rig.basePosition);
    rig.presentation.dispose();
  });

  it('uses the frame-captured wave scale for surface updates', () => {
    const rig = createRig();
    rig.presentation.showWaiting(rig.presentation.centeredCast());
    rig.sampleWaveInto.mockClear();

    rig.presentation.updateSurface(2, 0.42);

    expect(rig.sampleWaveInto).toHaveBeenCalledWith(
      expect.any(Object),
      2,
      0,
      -6.4,
      0.42,
    );
    rig.presentation.dispose();
  });

  it('settles active handles and disposes all owned resources once', async () => {
    const rig = createRig();
    const pending = rig.presentation.playCast(rig.presentation.centeredCast());
    const line = rig.worldRoot.getObjectByName('fishing-line') as Mesh;
    const lineGeometryDispose = vi.spyOn(line.geometry, 'dispose');
    const lineMaterialDispose = vi.spyOn(line.material as MeshBasicMaterial, 'dispose');
    const particleGeometryDispose = vi.spyOn(rig.biteParticles.points.geometry, 'dispose');
    const particleMaterialDispose = vi.spyOn(rig.biteParticles.points.material, 'dispose');

    rig.presentation.dispose();
    rig.presentation.dispose();
    await pending;

    expect(rig.catches.dispose).toHaveBeenCalledOnce();
    expect(lineGeometryDispose).toHaveBeenCalledOnce();
    expect(lineMaterialDispose).toHaveBeenCalledOnce();
    expect(particleGeometryDispose).toHaveBeenCalledOnce();
    expect(particleMaterialDispose).toHaveBeenCalledOnce();
    expect(rig.worldRoot.getObjectByName('fishing-presentation')).toBeUndefined();
    expect(rig.worldRoot.getObjectByName('fishing-bite-particles')).toBeUndefined();
  });

  it('settles disposal from every active fishing stage', async () => {
    const stages: ReadonlyArray<{
      readonly name: string;
      readonly arrange: (rig: ReturnType<typeof createRig>) => Promise<{
        readonly pending?: Promise<void>;
      }>;
    }> = [
      { name: 'idle', arrange: async () => ({}) },
      { name: 'entering', arrange: async ({ presentation }) => ({
        pending: presentation.enterView(),
      }) },
      { name: 'casting', arrange: async ({ presentation }) => ({
        pending: presentation.playCast(presentation.centeredCast()),
      }) },
      { name: 'waiting', arrange: async ({ presentation }) => {
        presentation.showWaiting(presentation.centeredCast());
        return {};
      } },
      { name: 'bite', arrange: async ({ presentation }) => {
        presentation.showBite(presentation.centeredCast());
        return {};
      } },
      { name: 'reeling', arrange: async ({ presentation }) => {
        presentation.showBite(presentation.centeredCast());
        const pending = presentation.playReel('cod');
        await vi.waitFor(() => expect(presentation.phaseForTest()).toBe('reeling'));
        return { pending };
      } },
      { name: 'missing', arrange: async ({ presentation }) => ({
        pending: presentation.playMiss(),
      }) },
      { name: 'returning', arrange: async ({ presentation }) => ({
        pending: presentation.exitView(),
      }) },
    ];

    for (const stage of stages) {
      const rig = createRig();
      const particleGeometryDispose = vi.spyOn(rig.biteParticles.points.geometry, 'dispose');
      const { pending } = await stage.arrange(rig);
      rig.presentation.dispose();
      rig.presentation.dispose();
      await pending;
      expect(rig.catches.dispose, stage.name).toHaveBeenCalledOnce();
      expect(particleGeometryDispose, stage.name).toHaveBeenCalledOnce();
    }
  });

  it('preserves the first disposal error and still runs later cleanup', () => {
    const rig = createRig();
    const firstError = new Error('catch disposal failed');
    const laterError = new Error('particle disposal failed');
    rig.catches.dispose.mockImplementation(() => { throw firstError; });
    const particleDispose = vi.spyOn(rig.biteParticles, 'dispose')
      .mockImplementation(() => { throw laterError; });
    const rootRemove = vi.spyOn(rig.presentation.root, 'removeFromParent');

    expect(() => rig.presentation.dispose()).toThrow(firstError);
    expect(particleDispose).toHaveBeenCalledOnce();
    expect(rootRemove).toHaveBeenCalledOnce();
    expect(() => rig.presentation.dispose()).not.toThrow();
  });

  it('preserves construction errors while rolling back injected owners', () => {
    const worldRoot = new Scene();
    const boatRoot = new Group();
    worldRoot.add(boatRoot);
    const camera = new PerspectiveCamera();
    const rodPivot = new Group();
    const rodWithoutGeometry = new Group();
    rodPivot.add(rodWithoutGeometry);
    boatRoot.add(rodPivot);
    const catches = new TestCatchLibrary();
    const cleanupError = new Error('catch rollback failed');
    catches.dispose.mockImplementation(() => { throw cleanupError; });
    const biteParticles = new FishingBiteParticles();
    const particleDispose = vi.spyOn(biteParticles, 'dispose');

    expect(() => FishingPresentation.create({
      camera,
      cameraControl: {
        restoreBasePose: vi.fn(),
        interpolateToBasePose: vi.fn(),
      },
      resetBasePresentation: vi.fn(),
      sampleWaveInto: vi.fn(),
      waveAmplitudeScale: () => 1,
      rodPivot,
      rod: rodWithoutGeometry,
      boatRoot,
      worldRoot,
    }, {
      createCatches: () => catches,
      createBiteParticles: () => biteParticles,
    })).toThrow('Fishing rod model has no position data.');
    expect(catches.dispose).toHaveBeenCalledOnce();
    expect(particleDispose).toHaveBeenCalledOnce();
    expect(worldRoot.getObjectByName('fishing-presentation')).toBeUndefined();
    expect(worldRoot.getObjectByName('fishing-bite-particles')).toBeUndefined();
  });

  it('disposes a completed catch owner when particle construction fails', () => {
    const worldRoot = new Scene();
    const boatRoot = new Group();
    const rodPivot = new Group();
    const rod = new Group();
    rodPivot.add(rod);
    boatRoot.add(rodPivot);
    worldRoot.add(boatRoot);
    const catches = new TestCatchLibrary();
    const failure = new Error('particle construction failed');

    expect(() => FishingPresentation.create({
      camera: new PerspectiveCamera(),
      cameraControl: {
        restoreBasePose: vi.fn(),
        interpolateToBasePose: vi.fn(),
      },
      resetBasePresentation: vi.fn(),
      sampleWaveInto: vi.fn(),
      waveAmplitudeScale: () => 1,
      rodPivot,
      rod,
      boatRoot,
      worldRoot,
    }, {
      createCatches: () => catches,
      createBiteParticles: () => { throw failure; },
    })).toThrow(failure);
    expect(catches.dispose).toHaveBeenCalledOnce();
  });
});
