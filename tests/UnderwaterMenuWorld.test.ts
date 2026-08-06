import {
  AnimationClip,
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { expect, it, vi } from 'vitest';
import { UnderwaterMenuWorld } from '../src/menu/UnderwaterMenuWorld';

it('creates the approved fixed composition once', () => {
  const created: string[] = [];
  const disposers: ReturnType<typeof vi.fn>[] = [];
  const models = {
    create: vi.fn((id: string) => {
      created.push(id);
      const animations = id === 'shark'
        ? [new AnimationClip('Armature|Swim', 1.25, [
          new NumberKeyframeTrack('.rotation[y]', [0, 1.25], [0, 0.1]),
        ])]
        : [];
      const dispose = vi.fn();
      disposers.push(dispose);
      return { root: new Group(), animations, dispose };
    }),
  };
  const componentDisposers: ReturnType<typeof vi.fn>[] = [];
  const createComponent = (name: string) => {
    const root = new Group();
    root.name = name;
    const dispose = vi.fn();
    componentDisposers.push(dispose);
    return { root, dispose };
  };
  const signsRoot = new Group();
  signsRoot.name = 'menu:signs';
  const titleRoot = new Group();
  titleRoot.name = 'menu:title-sign';
  const guideRoot = new Group();
  guideRoot.name = 'menu:guide-sign';
  const guideHitTarget = new Mesh(
    new BoxGeometry(1, 1, 0.1),
    new MeshStandardMaterial(),
  );
  guideHitTarget.name = 'menu:guide-sign-board';
  guideRoot.add(guideHitTarget);
  signsRoot.add(titleRoot, guideRoot);
  const signsDispose = vi.fn();
  componentDisposers.push(signsDispose);
  const setGuideHighlighted = vi.fn();
  const components = {
    createSigns: vi.fn(() => ({
      root: signsRoot,
      guideHitTarget,
      setGuideHighlighted,
      dispose: signsDispose,
    })),
    createDorothyWreck: vi.fn(() => createComponent('menu:dorothy-wreck')),
    createDistantSeabed: vi.fn(() => createComponent('menu:distant-seabed')),
  };
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const world = new UnderwaterMenuWorld(
    scene,
    camera,
    models as never,
    components,
  );

  expect(created).toEqual(expect.arrayContaining([
    'boat', 'rockA', 'rockB', 'rockC',
    'skull',
    'shark', 'sardine', 'clownfish', 'seaweed',
  ]));
  expect(created).not.toContain('fishBone');
  expect(created).not.toContain('largeBone');
  expect(created.filter((id) => id === 'skull')).toHaveLength(1);
  expect(created.filter((id) => id === 'shark')).toHaveLength(2);
  expect(created.filter((id) => id === 'sardine')).toHaveLength(6);
  expect(created.filter((id) => id === 'clownfish')).toHaveLength(6);
  expect(created.filter((id) => id === 'seaweed')).toHaveLength(3);
  expect(camera.userData.menuCameraFixed).toBe(true);
  expect(camera.position.toArray()).toEqual([0, 1.35, 7.8]);
  const expected = new PerspectiveCamera();
  expected.position.set(0, 1.35, 7.8);
  expected.lookAt(new Vector3(0, 2.0, -4.8));
  expect(camera.quaternion.angleTo(expected.quaternion)).toBeLessThan(1e-8);
  const seabed = world.root.getObjectByName('menu:seabed') as Mesh;
  const caustics = world.root.getObjectByName('menu:caustic-overlay') as Mesh;
  world.root.updateMatrixWorld(true);
  expect(new Box3().setFromObject(seabed).max.z).toBeGreaterThan(camera.position.z);
  expect(new Box3().setFromObject(caustics).max.z).toBeGreaterThan(camera.position.z);
  expect(world.root.getObjectByName('menu:boat')).toBeDefined();
  expect(world.root.getObjectByName('menu:seated-skeleton')).toBeUndefined();
  expect(world.root.getObjectByName('menu:skull')).toBeDefined();
  expect(world.root.getObjectByName('menu:title-sign')).toBeDefined();
  expect(world.root.getObjectByName('menu:guide-sign')).toBeDefined();
  expect(world.root.getObjectByName('menu:dorothy-wreck')).toBeDefined();
  expect(world.root.getObjectByName('menu:distant-seabed')).toBeDefined();
  const skullPosition = world.root.getObjectByName('menu:skull')!.getWorldPosition(new Vector3());
  const boatPosition = world.root.getObjectByName('menu:boat')!.getWorldPosition(new Vector3());
  expect(skullPosition.distanceTo(boatPosition)).toBeLessThan(1.25);
  expect(world.actors.sharks[0].clip.name).toBe('Armature|Swim');
  expect(world.actors.sharks[1].clip.name).toBe('Armature|Swim');
  expect(world.fishSchools[0].children).toHaveLength(6);
  expect(world.fishSchools[1].children).toHaveLength(6);
  world.setGuideSignHighlighted(true);
  expect(setGuideHighlighted).toHaveBeenCalledWith(true);

  const kelp = world.root.getObjectByName('menu:procedural-kelp');
  expect(kelp).toBeInstanceOf(InstancedMesh);
  expect((kelp as InstancedMesh).count).toBe(24);
  const bubbles = world.root.getObjectByName('menu:bubbles');
  const matter = world.root.getObjectByName('menu:suspended-matter');
  expect(bubbles).toBeInstanceOf(Points);
  expect(matter).toBeInstanceOf(Points);
  expect((bubbles as Points).geometry.getAttribute('basePosition').count).toBe(72);
  expect((matter as Points).geometry.getAttribute('basePosition').count).toBe(96);
  expect((bubbles as Points).material).toBeInstanceOf(ShaderMaterial);
  const bubbleGeometryDispose = vi.spyOn((bubbles as Points).geometry, 'dispose');
  const matterGeometryDispose = vi.spyOn((matter as Points).geometry, 'dispose');
  const bubbleMaterialDispose = vi.spyOn(
    (bubbles as Points).material as ShaderMaterial,
    'dispose',
  );
  const matterMaterialDispose = vi.spyOn(
    (matter as Points).material as ShaderMaterial,
    'dispose',
  );

  world.dispose();
  world.dispose();
  for (const dispose of disposers) expect(dispose).toHaveBeenCalledTimes(1);
  for (const dispose of componentDisposers) expect(dispose).toHaveBeenCalledTimes(1);
  expect(bubbleGeometryDispose).toHaveBeenCalledTimes(1);
  expect(matterGeometryDispose).toHaveBeenCalledTimes(1);
  expect(bubbleMaterialDispose).toHaveBeenCalledTimes(1);
  expect(matterMaterialDispose).toHaveBeenCalledTimes(1);
  expect(scene.getObjectByName('menu:underwater-world')).toBeUndefined();
});

it('rolls back completed work and preserves a component creation error', () => {
  const primaryError = new Error('Dorothy creation failed');
  const titleCleanupError = new Error('Title cleanup failed');
  const modelDisposers: ReturnType<typeof vi.fn>[] = [];
  const models = {
    create: vi.fn((id: string) => {
      const animations = id === 'shark'
        ? [new AnimationClip('Armature|Swim', 1.25)]
        : [];
      const dispose = vi.fn();
      modelDisposers.push(dispose);
      return { root: new Group(), animations, dispose };
    }),
  };
  const signsDispose = vi.fn(() => {
    throw titleCleanupError;
  });
  const guideHitTarget = new Mesh(
    new BoxGeometry(1, 1, 0.1),
    new MeshStandardMaterial(),
  );
  const components = {
    createSigns: vi.fn(() => ({
      root: new Group(),
      guideHitTarget,
      setGuideHighlighted: vi.fn(),
      dispose: signsDispose,
    })),
    createDorothyWreck: vi.fn(() => {
      throw primaryError;
    }),
    createDistantSeabed: vi.fn(),
  };

  let thrown: unknown;
  try {
    new UnderwaterMenuWorld(
      new Scene(),
      new PerspectiveCamera(),
      models as never,
      components as never,
    );
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(primaryError);
  expect(signsDispose).toHaveBeenCalledTimes(1);
  for (const dispose of modelDisposers) expect(dispose).toHaveBeenCalledTimes(1);
  expect(components.createDistantSeabed).not.toHaveBeenCalled();
});
