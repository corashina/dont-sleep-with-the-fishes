// Importance: 8/10 (scaled from 4/5). Protects companion pose, ownership, and action restoration.
import {
  Bone,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createCarlitosPose,
  carlitosPoseState,
  sampleCarlitosPoseInto,
} from '../src/survival/carlitosMotion';
import {
  CARLITOS_PET_DURATION,
  CarlitosPresentation,
} from '../src/survival/CarlitosPresentation';
import type { CarlitosSnapshot } from '../src/survival/CarlitosState';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { createTestPropModels } from './helpers/propModels';

function snapshot(
  overrides: Partial<CarlitosSnapshot> = {},
): CarlitosSnapshot {
  return {
    alive: true,
    energy: 3,
    hunger: 5,
    sickness: 0,
    unhappiness: 0,
    pettedToday: false,
    deathCause: null,
    ...overrides,
  };
}

const HAND_CHAINS = [
  ['ThumbRoot', 'ThumbMiddle', 'ThumbTop'],
  ['IndexF_lower', 'IndexF_middle', 'IndexF_tip'],
  ['MiddleF_lower', 'MiddleF_middle', 'MiddleF_tip'],
  ['RingF_lower', 'RingF_middle', 'RingF_tip'],
  ['PinkyF_lower', 'PinkyF_middle', 'PinkyF_tip'],
] as const;

function riggedHand(): Group {
  const root = new Group();
  const bones: Bone[] = [];
  for (const chain of HAND_CHAINS) {
    let parent: Bone | null = null;
    for (const name of chain) {
      const bone = new Bone();
      bone.name = name;
      if (parent === null) root.add(bone);
      else parent.add(bone);
      bones.push(bone);
      parent = bone;
    }
  }
  const geometry = new BoxGeometry(1, 1, 1);
  const vertexCount = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(
    new Uint16Array(vertexCount * 4), 4,
  ));
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) weights[index * 4] = 1;
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.bind(new Skeleton(bones));
  root.add(mesh);
  return root;
}

describe('Carlitos motion', () => {
  it('uses the same mutable pose for a tactile pet beat', () => {
    const pose = createCarlitosPose();

    const result = sampleCarlitosPoseInto(pose, {
      status: 'hungry',
      action: 'pet',
      elapsed: 0.25,
      duration: CARLITOS_PET_DURATION,
    });

    expect(result).toBe(pose);
    expect(pose.headPitch).toBeLessThan(0);
    expect(pose.actionLean).toBeGreaterThan(0);
    expect(pose.handReach).toBeGreaterThan(0);
    expect(pose.handCurl).toBeGreaterThan(0);
  });

  it('lifts and resets the hand between two one-way pet strokes', () => {
    const pose = createCarlitosPose();
    const sample = (progress: number) => sampleCarlitosPoseInto(pose, {
      status: 'healthy',
      action: 'pet',
      elapsed: CARLITOS_PET_DURATION * progress,
      duration: CARLITOS_PET_DURATION,
    });

    sample(0.27);
    expect(pose.handContact).toBeGreaterThan(0.9);
    expect(pose.handLift).toBeCloseTo(0);
    const firstStroke = pose.handStroke;

    sample(0.44);
    expect(pose.handContact).toBeCloseTo(0);
    expect(pose.handLift).toBeGreaterThan(0.9);
    expect(pose.handStroke).toBeLessThan(firstStroke);

    sample(0.58);
    expect(pose.handContact).toBeGreaterThan(0.9);
    expect(pose.handLift).toBeCloseTo(0);
    expect(pose.handStroke).toBeGreaterThan(0);
  });

  it('selects sick, starving, unhappy, hungry, then healthy state priority', () => {
    expect(carlitosPoseState(snapshot({
      sickness: 1,
      hunger: 0,
      unhappiness: 9,
    }))).toBe('sick');
    expect(carlitosPoseState(snapshot({
      hunger: 1,
      unhappiness: 9,
    }))).toBe('starving');
    expect(carlitosPoseState(snapshot({
      hunger: 3,
      unhappiness: 3,
    }))).toBe('unhappy');
    expect(carlitosPoseState(snapshot({ hunger: 3 }))).toBe('hungry');
    expect(carlitosPoseState(snapshot())).toBe('healthy');
  });

  it('restores the selected base pose when an action completes', () => {
    const pose = createCarlitosPose();
    const base = createCarlitosPose();
    sampleCarlitosPoseInto(base, {
      status: 'unhappy', action: null, elapsed: 0, duration: 0,
    });

    sampleCarlitosPoseInto(pose, {
      status: 'unhappy', action: 'feed', elapsed: 0.8, duration: 0.8,
    });

    expect(pose).toEqual(base);
  });
});

describe('CarlitosPresentation', () => {
  it('owns one placed model and only exposes a living companion', () => {
    const propModels = createTestPropModels();
    const create = vi.spyOn(propModels, 'createPresentation');
    const companion = new CarlitosPresentation(propModels);
    const transform = boatStorageTransform({
      instanceId: 'carlitos-1',
      type: 'carlitos',
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      instanceId: 'carlitos-1',
      type: 'carlitos',
    });
    expect(companion.root.position.toArray()).toEqual(transform.position.toArray());
    expect(companion.root.rotation.toArray()).toEqual(transform.rotation.toArray());
    expect(companion.root.scale.toArray()).toEqual([
      transform.scale, transform.scale, transform.scale,
    ]);
    expect(companion.root.visible).toBe(false);

    companion.sync(snapshot());
    expect(companion.root.visible).toBe(true);
    expect(companion.interactionRoot.visible).toBe(true);

    companion.sync(snapshot({ alive: false, deathCause: 'starvation' }));
    expect(companion.root.visible).toBe(false);
    expect(companion.interactionRoot.visible).toBe(false);

    companion.sync(null);
    expect(companion.root.visible).toBe(false);
    companion.dispose();
    propModels.dispose();
  });

  it('sits on either gunwale side', () => {
    const propModels = createTestPropModels();
    const companion = new CarlitosPresentation(propModels);
    const seatX = Math.abs(companion.root.position.x);

    companion.setSeatSide(-1);
    expect(companion.root.position.x).toBe(-seatX);
    expect(companion.root.userData.seatSide).toBe('left');

    companion.setSeatSide(1);
    expect(companion.root.position.x).toBe(seatX);
    expect(companion.root.userData.seatSide).toBe('right');

    companion.dispose();
    propModels.dispose();
  });

  it('uses the rigged hand for two smooth pet strokes and one contact cue', async () => {
    const propModels = createTestPropModels();
    const createEventModel = vi.spyOn(propModels, 'createEventModel')
      .mockReturnValue({ root: riggedHand(), animations: [] });
    const companion = new CarlitosPresentation(propModels);
    companion.sync(snapshot({ hunger: 1 }));
    const poseRoot = companion.root.getObjectByName('carlitos-pose')!;
    const hand = companion.root.getObjectByName('carlitos-petting-hand')!;
    const food = companion.root.getObjectByName('carlitos-food')!;
    const baseRotationX = poseRoot.rotation.x;
    const onContact = vi.fn();

    const pet = companion.play('pet', onContact);
    companion.update(CARLITOS_PET_DURATION * 0.24);
    expect(hand.visible).toBe(true);
    expect(food.visible).toBe(false);
    expect(poseRoot.rotation.x).not.toBe(baseRotationX);
    expect(hand.userData.modelKind).toBe('rigged');
    expect(hand.scale.toArray()).toEqual([0.32, 0.32, 0.32]);
    const palmNormal = new Vector3(0, 1, 0).applyQuaternion(hand.quaternion);
    expect(palmNormal.dot(new Vector3(0, 1, 0))).toBeGreaterThan(0.97);
    expect(onContact).toHaveBeenCalledOnce();
    expect(hand.position.x).toBeCloseTo(-0.04);
    expect(hand.position.z).toBeCloseTo(-0.36);
    const firstStrokeY = hand.position.y;
    companion.update(CARLITOS_PET_DURATION * 0.1);
    expect(hand.position.y).toBeLessThan(firstStrokeY - 0.04);
    expect(hand.position.y).toBeLessThan(0.38);
    expect(hand.position.x).toBeCloseTo(-0.04);
    expect(hand.position.z).toBeCloseTo(-0.36);
    const contactY = hand.position.y;
    companion.update(CARLITOS_PET_DURATION * 0.12);
    expect(hand.position.y).toBeGreaterThan(contactY + 0.1);
    expect(onContact).toHaveBeenCalledOnce();
    companion.update(CARLITOS_PET_DURATION * 0.54);
    await pet;
    expect(hand.visible).toBe(false);
    expect(poseRoot.rotation.x).toBeCloseTo(baseRotationX);

    expect(createEventModel).toHaveBeenCalledWith('riggedHand');

    companion.dispose();
    propModels.dispose();
  });

  it('plays Feed, then hides its prop and restores the base pose', async () => {
    const propModels = createTestPropModels();
    const companion = new CarlitosPresentation(propModels);
    companion.sync(snapshot({ hunger: 1 }));
    const poseRoot = companion.root.getObjectByName('carlitos-pose')!;
    const hand = companion.root.getObjectByName('carlitos-petting-hand')!;
    const food = companion.root.getObjectByName('carlitos-food')!;
    const baseRotationX = poseRoot.rotation.x;

    const feed = companion.play('feed');
    companion.update(0.3);
    expect(food.visible).toBe(true);
    expect(hand.visible).toBe(false);
    companion.update(0.5);
    await feed;
    expect(food.visible).toBe(false);
    expect(poseRoot.rotation.x).toBeCloseTo(baseRotationX);

    companion.dispose();
    propModels.dispose();
  });

  it('rolls back model ownership when construction fails after model creation', () => {
    const failure = new Error('companion model attachment failed');
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    const modelRoot = new Group();
    modelRoot.add(new Mesh(geometry, material));
    modelRoot.removeFromParent = (): Group => {
      throw failure;
    };
    const modelDispose = vi.fn();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    expect(() => new CarlitosPresentation({
      createPresentation: () => ({
        root: modelRoot,
        animation: null,
        update: vi.fn(),
        dispose: modelDispose,
      }),
      createEventModel: () => null,
    })).toThrow(failure);

    expect(modelDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('keeps the obsolete block hand removed when the rigged model is absent', () => {
    const propModels = createTestPropModels();
    vi.spyOn(propModels, 'createEventModel').mockReturnValue(null);

    const companion = new CarlitosPresentation(propModels);
    const hand = companion.root.getObjectByName('carlitos-petting-hand')!;
    expect(hand.userData.modelKind).toBe('unavailable');
    expect(hand.children).toHaveLength(0);

    companion.dispose();
    propModels.dispose();
  });

  it('disposes the rigged hand and partial food when food construction fails', () => {
    const propModels = createTestPropModels();
    const failure = new Error('food construction failed');
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(Material.prototype, 'dispose');

    expect(() => new CarlitosPresentation(propModels, {
      onPropPartCreated: (prop, part) => {
        if (prop === 'food' && part.name === 'carlitos-food:bowl') {
          throw failure;
        }
      },
    })).toThrow(failure);

    expect(geometryDispose).toHaveBeenCalledTimes(3);
    expect(materialDispose).toHaveBeenCalledTimes(4);
    geometryDispose.mockRestore();
    materialDispose.mockRestore();
    propModels.dispose();
  });

  it('disposes every model, hand, and food geometry and material once', () => {
    const propModels = createTestPropModels();
    const create = vi.spyOn(propModels, 'createPresentation');
    const companion = new CarlitosPresentation(propModels);
    const modelPresentation = create.mock.results[0]!.value;
    const modelDispose = vi.spyOn(modelPresentation, 'dispose');
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    companion.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of entries) materials.add(material);
    });
    const geometryDisposals = [...geometries].map((geometry) => (
      vi.spyOn(geometry, 'dispose')
    ));
    const materialDisposals = [...materials].map((material) => (
      vi.spyOn(material, 'dispose')
    ));

    expect(companion.root.getObjectByName('event-model:riggedHand')).toBeDefined();
    expect(companion.root.getObjectByName('carlitos-food:bowl')).toBeDefined();

    companion.dispose();
    companion.dispose();

    expect(modelDispose).toHaveBeenCalledOnce();
    for (const dispose of geometryDisposals) expect(dispose).toHaveBeenCalledOnce();
    for (const dispose of materialDisposals) expect(dispose).toHaveBeenCalledOnce();
    expect(companion.root.parent).toBeNull();
    propModels.dispose();
  });
});
