import {
  AnimationClip,
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
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
import { MENU_PROTECTED_FOOTPRINTS } from '../src/menu/MenuSceneLayout';
import { UnderwaterMenuWorld } from '../src/menu/UnderwaterMenuWorld';
import { BUBBLE_COUNT } from '../src/menu/UnderwaterParticles';
import { LIGHT_SHAFT_COUNT } from '../src/menu/UnderwaterLightShafts';
import { ITEM_AMBIENT_OCCLUSION_LAYER } from '../src/rendering/ItemAmbientOcclusion';

it('creates the approved fixed composition once', () => {
  const created: string[] = [];
  const disposers: ReturnType<typeof vi.fn>[] = [];
  const models = {
    create: vi.fn((id: string) => {
      created.push(id);
      const animations = id === 'shark' || id === 'redSnapper'
        ? [new AnimationClip('Armature|Swim', 1.25, [
          new NumberKeyframeTrack('.rotation[y]', [0, 1.25], [0, 0.1]),
        ])]
        : [];
      const dispose = vi.fn();
      disposers.push(dispose);
      const root = new Group();
      if (id === 'redSnapper') {
        root.add(new Mesh(new BoxGeometry(0.1, 0.1, 0.1)));
      }
      return { root, animations, dispose };
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
  const startRoot = new Group();
  startRoot.name = 'menu:start-sign';
  const guideRoot = new Group();
  guideRoot.name = 'menu:guide-sign';
  const guideHitTarget = new Mesh(
    new BoxGeometry(1, 1, 0.1),
    new MeshStandardMaterial(),
  );
  guideHitTarget.name = 'menu:guide-sign-board';
  const startHitTarget = new Mesh(
    new BoxGeometry(1, 1, 0.1),
    new MeshStandardMaterial(),
  );
  startHitTarget.name = 'menu:start-sign-board';
  startRoot.add(startHitTarget);
  guideRoot.add(guideHitTarget);
  signsRoot.add(startRoot, guideRoot);
  const signsDispose = vi.fn();
  componentDisposers.push(signsDispose);
  const setGuideHighlighted = vi.fn();
  const setStartHighlighted = vi.fn();
  const components = {
    createSigns: vi.fn(() => ({
      root: signsRoot,
      startHitTarget,
      guideHitTarget,
      setStartHighlighted,
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
    'coral', 'starfish', 'skull',
    'shark', 'redSnapper', 'seaweed',
  ]));
  expect(created).not.toContain('fishBone');
  expect(created).not.toContain('largeBone');
  expect(created.filter((id) => id === 'skull')).toHaveLength(1);
  expect(created.filter((id) => id === 'rockA')).toHaveLength(6);
  expect(created.filter((id) => id === 'rockB')).toHaveLength(6);
  expect(created.filter((id) => id === 'rockC')).toHaveLength(6);
  expect(created.filter((id) => id === 'coral')).toHaveLength(10);
  expect(created.filter((id) => id === 'starfish')).toHaveLength(1);
  expect(created.filter((id) => id === 'shark')).toHaveLength(2);
  expect(created.filter((id) => id === 'redSnapper')).toHaveLength(12);
  expect(created.filter((id) => id === 'seaweed')).toHaveLength(14);
  expect(camera.userData.menuCameraFixed).toBe(true);
  expect(camera.position.toArray()).toEqual([0, 1.35, 7.8]);
  const expected = new PerspectiveCamera();
  expected.position.set(0, 1.35, 7.8);
  expected.lookAt(new Vector3(0, 2.0, -4.8));
  expect(camera.quaternion.angleTo(expected.quaternion)).toBeLessThan(1e-8);
  const seabed = world.root.getObjectByName('menu:seabed') as Mesh;
  const caustics = world.root.getObjectByName('menu:caustic-overlay') as Mesh;
  const lightShafts = world.root.getObjectByName('menu:light-shafts') as Group;
  const sandPosition = seabed.geometry.getAttribute('position');
  const sandColor = seabed.geometry.getAttribute('color');
  expect(sandColor).toBeDefined();
  expect(sandColor.count).toBe(sandPosition.count);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  const colors = new Set<string>();
  for (let index = 0; index < sandPosition.count; index += 1) {
    minHeight = Math.min(minHeight, sandPosition.getY(index));
    maxHeight = Math.max(maxHeight, sandPosition.getY(index));
    colors.add([
      sandColor.getX(index).toFixed(3),
      sandColor.getY(index).toFixed(3),
      sandColor.getZ(index).toFixed(3),
    ].join(':'));
  }
  expect(maxHeight - minHeight).toBeGreaterThan(0.55);
  expect(colors.size).toBeGreaterThan(8);
  expect((seabed.material as MeshStandardMaterial).vertexColors).toBe(true);
  expect(seabed.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(true);
  expect(startHitTarget.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(true);
  expect(caustics.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(false);
  expect(lightShafts.children).toHaveLength(LIGHT_SHAFT_COUNT);
  expect(world.actors.setLightTime).toBeTypeOf('function');
  for (const shaft of lightShafts.children as Mesh[]) {
    expect(shaft.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(false);
  }
  world.root.updateMatrixWorld(true);
  expect(new Box3().setFromObject(seabed).max.z).toBeGreaterThan(camera.position.z);
  expect(new Box3().setFromObject(caustics).max.z).toBeGreaterThan(camera.position.z);
  expect(world.root.getObjectByName('menu:boat')).toBeDefined();
  expect(world.root.getObjectByName('menu:seated-skeleton')).toBeUndefined();
  expect(world.root.getObjectByName('menu:skull')).toBeDefined();
  expect(world.root.getObjectByName('menu:start-sign')).toBeDefined();
  expect(world.root.getObjectByName('menu:guide-sign')).toBeDefined();
  expect(world.root.getObjectByName('menu:dorothy-wreck')).toBeDefined();
  expect(world.root.getObjectByName('menu:distant-seabed')).toBeDefined();
  const skullPosition = world.root.getObjectByName('menu:skull')!.getWorldPosition(new Vector3());
  const boatPosition = world.root.getObjectByName('menu:boat')!.getWorldPosition(new Vector3());
  expect(skullPosition.z).toBeGreaterThan(boatPosition.z);
  expect(skullPosition.y).toBeLessThan(0);
  expect(skullPosition.distanceTo(boatPosition)).toBeGreaterThan(3);
  expect(world.actors.sharks[0].clip.name).toBe('Armature|Swim');
  expect(world.actors.sharks[1].clip.name).toBe('Armature|Swim');
  expect(world.actors.fish).toHaveLength(12);
  expect(world.actors.fish.every(({ clip }) => clip.name === 'Armature|Swim')).toBe(true);
  expect(world.fishSchools[0].children).toHaveLength(6);
  expect(world.fishSchools[1].children).toHaveLength(6);
  for (const school of world.fishSchools) {
    const bounds = new Box3().setFromObject(school);
    expect(bounds.getSize(new Vector3()).x).toBeGreaterThan(3.2);
  }
  world.setMenuSignHighlighted('guide', true);
  expect(setGuideHighlighted).toHaveBeenCalledWith(true);
  world.setMenuSignHighlighted('start', true);
  expect(setStartHighlighted).toHaveBeenCalledWith(true);

  const kelp = world.root.getObjectByName('menu:procedural-kelp');
  expect(kelp).toBeInstanceOf(InstancedMesh);
  expect((kelp as InstancedMesh).count).toBe(54);
  const kelpMatrix = new Matrix4();
  const kelpPosition = new Vector3();
  for (let index = 0; index < (kelp as InstancedMesh).count; index += 1) {
    (kelp as InstancedMesh).getMatrixAt(index, kelpMatrix);
    kelpPosition.setFromMatrixPosition(kelpMatrix);
    for (const footprint of MENU_PROTECTED_FOOTPRINTS) {
      const insideX = Math.abs(kelpPosition.x - footprint.position[0])
        < footprint.halfSize[0];
      const insideZ = Math.abs(kelpPosition.z - footprint.position[2])
        < footprint.halfSize[1];
      expect(insideX && insideZ, `${index} enters ${footprint.id}`).toBe(false);
    }
  }
  const bubbles = world.root.getObjectByName('menu:bubbles');
  const matter = world.root.getObjectByName('menu:suspended-matter');
  expect(bubbles).toBeInstanceOf(Points);
  expect(matter).toBeInstanceOf(Points);
  expect((bubbles as Points).geometry.getAttribute('basePosition').count)
    .toBe(BUBBLE_COUNT);
  expect((matter as Points).geometry.getAttribute('basePosition').count).toBe(180);
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
  const lightGeometryDispose = vi.spyOn(
    (lightShafts.children[0] as Mesh).geometry,
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
  expect(lightGeometryDispose).toHaveBeenCalledTimes(1);
  expect(scene.getObjectByName('menu:underwater-world')).toBeUndefined();
});

it('rolls back completed work and preserves a component creation error', () => {
  const primaryError = new Error('Dorothy creation failed');
  const titleCleanupError = new Error('Title cleanup failed');
  const modelDisposers: ReturnType<typeof vi.fn>[] = [];
  const models = {
    create: vi.fn((id: string) => {
      const animations = id === 'shark' || id === 'redSnapper'
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
  const startHitTarget = new Mesh(
    new BoxGeometry(1, 1, 0.1),
    new MeshStandardMaterial(),
  );
  const components = {
    createSigns: vi.fn(() => ({
      root: new Group(),
      startHitTarget,
      guideHitTarget,
      setStartHighlighted: vi.fn(),
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
