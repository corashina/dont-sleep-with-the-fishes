// Importance: 4/5. Protects companion pose, ownership, and action restoration.
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createCarlitosPose,
  carlitosPoseState,
  sampleCarlitosPoseInto,
} from '../src/survival/carlitosMotion';
import { CarlitosPresentation } from '../src/survival/CarlitosPresentation';
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

describe('Carlitos motion', () => {
  it('uses the same mutable pose for a tactile pet beat', () => {
    const pose = createCarlitosPose();

    const result = sampleCarlitosPoseInto(pose, {
      status: 'hungry',
      action: 'pet',
      elapsed: 0.25,
      duration: 0.8,
    });

    expect(result).toBe(pose);
    expect(pose.headPitch).toBeLessThan(0);
    expect(pose.actionLean).toBeGreaterThan(0);
    expect(pose.handReach).toBeGreaterThan(0);
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

  it('plays Pet and Feed, then hides props and restores the base pose', async () => {
    const propModels = createTestPropModels();
    const companion = new CarlitosPresentation(propModels);
    companion.sync(snapshot({ hunger: 1 }));
    const poseRoot = companion.root.getObjectByName('carlitos-pose')!;
    const hand = companion.root.getObjectByName('carlitos-petting-hand')!;
    const food = companion.root.getObjectByName('carlitos-food')!;
    const baseRotationX = poseRoot.rotation.x;

    const pet = companion.play('pet');
    companion.update(0.3);
    expect(hand.visible).toBe(true);
    expect(food.visible).toBe(false);
    expect(poseRoot.rotation.x).not.toBe(baseRotationX);
    companion.update(0.5);
    await pet;
    expect(hand.visible).toBe(false);
    expect(poseRoot.rotation.x).toBeCloseTo(baseRotationX);

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
    })).toThrow(failure);

    expect(modelDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('disposes partial hand resources when hand construction fails', () => {
    const propModels = createTestPropModels();
    const failure = new Error('petting hand construction failed');
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(Material.prototype, 'dispose');

    expect(() => new CarlitosPresentation(propModels, {
      onPropPartCreated: (prop, part) => {
        if (prop === 'hand' && part.name === 'carlitos-hand:thumb') {
          throw failure;
        }
      },
    })).toThrow(failure);

    expect(geometryDispose).toHaveBeenCalledTimes(3);
    expect(materialDispose).toHaveBeenCalledTimes(3);
    geometryDispose.mockRestore();
    materialDispose.mockRestore();
    propModels.dispose();
  });

  it('disposes the completed hand and partial food when food construction fails', () => {
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

    expect(geometryDispose).toHaveBeenCalledTimes(8);
    expect(materialDispose).toHaveBeenCalledTimes(5);
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

    expect(companion.root.getObjectByName('carlitos-hand:palm')).toBeDefined();
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
