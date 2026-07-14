import { describe, expect, it, vi } from 'vitest';
import {
  Matrix4,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
} from 'three';
import {
  createItemInstances,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import { BoatWorld, clampParallax, survivalLighting } from '../src/survival/BoatWorld';
import { survivalBoatStorageTransform } from '../src/survival/SurvivalBoatLayout';
import { createSurvivalInventory } from '../src/survival/inventory';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import {
  createTestPropModels,
  TEST_PROP_MODEL_TRANSFORM,
  testPropModel,
} from './helpers/propModels';
import { loadProductionPropModels } from './helpers/productionPropModels';

const savedItem = (type: ItemId, index = 1): ItemInstance => ({
  instanceId: `${type}-${index}` as ItemInstanceId,
  type,
});

function firstMesh(root: Object3D): Mesh {
  let found: Mesh | undefined;
  root.traverse((object) => {
    if (!found && object instanceof Mesh) found = object;
  });
  if (!found) throw new Error('Expected saved prop mesh');
  return found;
}

function expectTestModelTransform(root: Object3D): void {
  const model = testPropModel(root);
  expect(model.position.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.position);
  model.rotation.toArray().slice(0, 3).forEach((value, index) => {
    expect(value).toBeCloseTo(TEST_PROP_MODEL_TRANSFORM.rotation[index]!);
  });
  expect(model.scale.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.scale);
}

function snapshot(
  savedItems: readonly ItemInstance[],
  overrides: Partial<SurvivalSnapshot> = {},
): SurvivalSnapshot {
  return {
    state: 'day',
    day: 1,
    health: 100,
    hunger: 20,
    energy: 80,
    hull: 80,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueProgress: 0,
    weather: 'calm',
    restedToday: false,
    actedToday: false,
    inventory: createSurvivalInventory(savedItems),
    savedItems,
    pendingEventId: null,
    lastOutcome: null,
    seed: 8,
    ...overrides,
  };
}

describe('BoatWorld helpers', () => {
  it('clamps mouse parallax and disables it for reduced motion', () => {
    expect(clampParallax(2, -2, false)).toEqual({ yaw: 0.045, pitch: -0.025 });
    expect(clampParallax(0.4, -0.4, true)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('provides distinct bounded day, night, and squall lighting', () => {
    expect(survivalLighting('calm', 'day')).toMatchObject({ ambient: 1.1, fogDensity: 0.012 });
    expect(survivalLighting('overcast', 'night').ambient).toBeLessThan(0.5);
    expect(survivalLighting('squall', 'day').fogDensity).toBeGreaterThan(0.02);
  });

  it('frames the enlarged boat from the higher stern seat without changing FOV', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 100);
    const propModels = createTestPropModels();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, propModels, []);
    expect(camera.position.toArray()).toEqual([0, 0.88, 2.35]);
    expect(camera.fov).toBe(65);
    expect(world.scene.getObjectByName('survival-hull-geometry')).toBeDefined();
    expect(world.scene.getObjectByName('paddle-port')).toBeDefined();
    expect(world.scene.getObjectByName('paddle-starboard')).toBeDefined();
    world.dispose();
    propModels.dispose();
  });

  it('keeps all maximum-inventory item anchor centers at least 40 pixels apart', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    camera.updateProjectionMatrix();
    const propModels = await loadProductionPropModels();
    let world: BoatWorld | undefined;
    try {
      world = new BoatWorld(
        camera,
        { matches: false } as MediaQueryList,
        propModels,
        createItemInstances(),
      );
      const anchors = world.projectInteractionAnchors(1280, 720)
        .filter((anchor) => anchor.itemType !== null && anchor.visible);
      expect(anchors).toHaveLength(14);
      for (let first = 0; first < anchors.length; first += 1) {
        for (let second = first + 1; second < anchors.length; second += 1) {
          const distance = Math.hypot(
            anchors[first]!.x - anchors[second]!.x,
            anchors[first]!.y - anchors[second]!.y,
          );
          expect(distance, `${anchors[first]!.id} is too close to ${anchors[second]!.id}`)
            .toBeGreaterThanOrEqual(40);
        }
      }
    } finally {
      world?.dispose();
      propModels.dispose();
    }
  });

  it('disposes each survival boat texture exactly once', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      [],
    );
    const seen = new Set<Texture>();
    world.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      assigned.forEach((material) => {
        if (!(material instanceof MeshStandardMaterial)) return;
        for (const texture of [material.map, material.roughnessMap]) {
          if (texture && !seen.has(texture)) {
            seen.add(texture);
          }
        }
      });
    });
    expect(seen.size).toBe(6);
    const textureSpies = [...seen].map((texture) => vi.spyOn(texture, 'dispose'));
    world.dispose();
    world.dispose();
    textureSpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    propModels.dispose();
  });

  it('disposes every unique survival boat geometry and material exactly once', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      [],
    );
    const boat = world.scene.getObjectByName('lifeboat')!;
    const geometries = new Set<Mesh['geometry']>();
    const materials = new Set<Material>();
    boat.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      assigned.forEach((material) => materials.add(material));
    });
    expect(geometries.size).toBeGreaterThan(0);
    expect(materials.size).toBeGreaterThan(0);
    const geometrySpies = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialSpies = [...materials].map((material) => vi.spyOn(material, 'dispose'));

    world.dispose();
    world.dispose();

    geometrySpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    materialSpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    propModels.dispose();
  });

  it('keeps every visible actionable anchor clear of fixed repair and horizon anchors', async () => {
    const propModels = await loadProductionPropModels();
    let world: BoatWorld | undefined;
    try {
      world = new BoatWorld(
        new PerspectiveCamera(65, 16 / 9, 0.08, 220),
        { matches: false } as MediaQueryList,
        propModels,
        createItemInstances(),
      );
      const actionable = world.projectInteractionAnchors(1280, 720)
        .filter((anchor) => anchor.visible && anchor.action !== null);
      expect(actionable).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'repair-patch', action: 'repair' }),
        expect.objectContaining({ id: 'horizon', action: 'endDay' }),
      ]));
      for (let first = 0; first < actionable.length; first += 1) {
        for (let second = first + 1; second < actionable.length; second += 1) {
          const distance = Math.hypot(
            actionable[first]!.x - actionable[second]!.x,
            actionable[first]!.y - actionable[second]!.y,
          );
          expect(distance, `${actionable[first]!.id} is too close to ${actionable[second]!.id}`)
            .toBeGreaterThanOrEqual(40);
        }
      }
    } finally {
      world?.dispose();
      propModels.dispose();
    }
  });

  it('keeps the shared camera at a fixed height for reduced motion', () => {
    const camera = new PerspectiveCamera();
    const reducedMotion = { matches: true } as unknown as MediaQueryList;
    const propModels = createTestPropModels();
    const world = new BoatWorld(camera, reducedMotion, propModels);
    const before = camera.getWorldPosition(new Vector3()).y;

    world.update(1, 0.1);
    const after = camera.getWorldPosition(new Vector3()).y;
    world.dispose();
    propModels.dispose();

    expect(after).toBe(before);
  });

  it('uploads one exclusion from the motion-rig lifeboat world transform', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
    );

    world.update(1.5, 0.1);

    const boat = world.scene.getObjectByName('lifeboat')!;
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh;
    const uniforms = (ocean.material as ShaderMaterial).uniforms;
    const matrices = uniforms.uExclusionWorldToLocal!.value as Matrix4[];
    const bounds = uniforms.uExclusionBounds!.value as Vector4[];
    expect(uniforms.uExclusionCount!.value).toBe(1);
    expect(bounds[0]!.toArray()).toEqual([-1.5, 1.5, -3, 3]);
    expect(matrices[0]!.elements).toEqual(boat.matrixWorld.clone().invert().elements);
    expect(matrices[1]).toEqual(new Matrix4());
    expect(bounds[1]).toEqual(new Vector4());
    world.dispose();
    propModels.dispose();
  });

  it('builds every saved instance once at its stable type-aware transform', () => {
    const savedItems = [
      savedItem('cannedFood', 3),
      savedItem('fishingRod'),
      savedItem('ductTape', 2),
      savedItem('scubaSet'),
    ];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      savedItems,
    );
    const storage = world.scene.getObjectByName('lifeboat-storage')!;

    expect(storage.children.map(({ name }) => name)).toEqual([
      'prop:cannedFood-3',
      'prop:fishingRod-1',
      'prop:ductTape-2',
      'prop:scubaSet-1',
    ]);
    storage.children.forEach((prop, index) => {
      const transform = survivalBoatStorageTransform(savedItems[index]!);
      expect(prop.position.toArray()).toEqual(transform.position.toArray());
      expect(prop.rotation.toArray().slice(0, 3)).toEqual(transform.rotation.toArray().slice(0, 3));
      expect(prop.scale.toArray()).toEqual([transform.scale, transform.scale, transform.scale]);
      expectTestModelTransform(prop);
    });
    world.dispose();
    propModels.dispose();
  });

  it('synchronizes recovered food, bait, and inventory charges without loose gains refilling props', () => {
    const savedItems = [
      savedItem('cannedFood'),
      savedItem('cannedFood', 2),
      savedItem('baitTin'),
      savedItem('baitTin', 2),
      savedItem('ductTape'),
      savedItem('ductTape', 2),
    ];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      savedItems,
    );
    const inventory = createSurvivalInventory(savedItems);
    inventory.ductTape.charges = 1;

    world.syncInventory(snapshot(savedItems, {
      food: 1,
      bait: 1,
      recoveredFood: 1,
      recoveredBait: 1,
      inventory,
    }));

    const foodOne = world.scene.getObjectByName('prop:cannedFood-1')!;
    const foodTwo = world.scene.getObjectByName('prop:cannedFood-2')!;
    const baitOne = world.scene.getObjectByName('prop:baitTin-1')!;
    const baitTwo = world.scene.getObjectByName('prop:baitTin-2')!;
    const tapeOne = world.scene.getObjectByName('prop:ductTape-1')!;
    const tapeTwo = world.scene.getObjectByName('prop:ductTape-2')!;
    const tapeOneMaterial = firstMesh(tapeOne).material as MeshStandardMaterial;
    const tapeTwoMaterial = firstMesh(tapeTwo).material as MeshStandardMaterial;
    const tapeOriginalColor = tapeOneMaterial.color.getHex();
    expect([foodOne.visible, foodTwo.visible]).toEqual([true, false]);
    expect([foodOne.userData.depleted, foodTwo.userData.depleted]).toEqual([false, true]);
    expect([baitOne.visible, baitTwo.visible]).toEqual([true, true]);
    expect([baitOne.userData.depleted, baitTwo.userData.depleted]).toEqual([false, true]);
    expect([tapeOne.userData.depleted, tapeTwo.userData.depleted]).toEqual([false, true]);
    expect(tapeOneMaterial).not.toBe(tapeTwoMaterial);
    expect(tapeOneMaterial.color.getHex()).toBe(tapeOriginalColor);
    expect(tapeTwoMaterial.color.getHex()).not.toBe(tapeOriginalColor);

    inventory.ductTape.charges = 4;
    world.syncInventory(snapshot(savedItems, {
      food: 2,
      bait: 6,
      recoveredFood: 1,
      recoveredBait: 1,
      inventory,
    }));
    expect(foodTwo.visible).toBe(false);
    expect(foodTwo.userData.depleted).toBe(true);
    expect(baitTwo.userData.depleted).toBe(true);
    expect(tapeTwo.userData.depleted).toBe(false);
    expect(tapeOneMaterial.color.getHex()).toBe(tapeOriginalColor);
    expect(tapeTwoMaterial.color.getHex()).toBe(tapeOriginalColor);
    world.dispose();
    propModels.dispose();
  });

  it('highlights only the selected instance and restores depleted presentation', () => {
    const savedItems = [savedItem('ductTape'), savedItem('ductTape', 2)];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      savedItems,
    );
    const inventory = createSurvivalInventory(savedItems);
    inventory.ductTape.charges = 1;
    world.syncInventory(snapshot(savedItems, { inventory }));

    const first = world.scene.getObjectByName('prop:ductTape-1')!;
    const second = world.scene.getObjectByName('prop:ductTape-2')!;
    const firstMaterial = firstMesh(first).material as MeshStandardMaterial;
    const secondMaterial = firstMesh(second).material as MeshStandardMaterial;
    const firstEmissive = firstMaterial.emissive.getHex();
    const secondEmissive = secondMaterial.emissive.getHex();
    const depletedColor = secondMaterial.color.getHex();

    world.setHighlightedItem('ductTape-2');
    expect(secondMaterial.emissive.getHex()).not.toBe(secondEmissive);
    expect(firstMaterial.emissive.getHex()).toBe(firstEmissive);

    world.setHighlightedItem(null);
    expect(secondMaterial.emissive.getHex()).toBe(secondEmissive);
    expect(secondMaterial.color.getHex()).toBe(depletedColor);

    world.setHighlightedItem('missing-instance');
    expect(firstMaterial.emissive.getHex()).toBe(firstEmissive);
    expect(secondMaterial.emissive.getHex()).toBe(secondEmissive);
    world.dispose();
    propModels.dispose();
  });

  it('projects saved props plus fixed repair and horizon anchors', () => {
    const savedItems = [savedItem('fishingRod'), savedItem('flareGun')];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, propModels, savedItems);

    const anchors = world.projectInteractionAnchors(800, 600);

    expect(anchors).toHaveLength(savedItems.length + 2);
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish' }),
      expect.objectContaining({ id: 'flareGun-1', itemType: 'flareGun', action: null }),
      expect.objectContaining({ id: 'repair-patch', itemType: null, action: 'repair' }),
      expect.objectContaining({ id: 'horizon', itemType: null, action: 'endDay', visible: true }),
    ]));
    expect(anchors.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    const itemAnchor = anchors.find(({ id }) => id === 'fishingRod-1')!;
    const fixedAnchor = anchors.find(({ id }) => id === 'horizon')!;
    expect(itemAnchor.hitArea).toEqual({
      width: expect.any(Number),
      height: expect.any(Number),
      depth: expect.any(Number),
    });
    expect(itemAnchor.hitArea!.width).toBeGreaterThanOrEqual(44);
    expect(itemAnchor.hitArea!.height).toBeGreaterThanOrEqual(44);
    expect(fixedAnchor.hitArea).toBeUndefined();
    world.dispose();
    propModels.dispose();
  });

  it('projects per-instance remaining uses for duplicate and contextual supplies', () => {
    const savedItems = [
      savedItem('ductTape'), savedItem('ductTape', 2),
      savedItem('baitTin'), savedItem('baitTin', 2),
      savedItem('flareGun'), savedItem('flashlight'),
    ];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, propModels, savedItems);
    const inventory = createSurvivalInventory(savedItems);
    inventory.ductTape.charges = 1;
    inventory.flareGun.charges = 1;

    world.syncInventory(snapshot(savedItems, { bait: 3, recoveredBait: 3, inventory }));
    const anchors = world.projectInteractionAnchors(800, 600);

    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ductTape-1', remainingUses: 1, depleted: false }),
      expect.objectContaining({ id: 'ductTape-2', remainingUses: 0, depleted: true }),
      expect.objectContaining({ id: 'baitTin-1', remainingUses: 3, depleted: false }),
      expect.objectContaining({ id: 'baitTin-2', remainingUses: 0, depleted: true }),
      expect.objectContaining({ id: 'flareGun-1', remainingUses: 1, depleted: false }),
      expect.objectContaining({ id: 'flashlight-1', remainingUses: null, depleted: false }),
    ]));
    world.dispose();
    propModels.dispose();
  });

  it('animates fishing cues from the recovered rod and has no hand-line fallback', () => {
    const propModels = createTestPropModels();
    const rodWorld = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      [savedItem('fishingRod'), savedItem('scubaSet')],
    );
    const rod = rodWorld.scene.getObjectByName('prop:fishingRod-1')!;
    const before = rod.rotation.z;
    rodWorld.play('fish');
    rodWorld.update(0.7, 0.7);
    expect(rod.rotation.z).toBeLessThan(before);
    expect(rodWorld.scene.getObjectByName('fishing-line')?.visible).toBe(true);
    expect(rodWorld.scene.getObjectByName('fishing-catch')?.visible).toBe(true);
    rodWorld.dispose();

    const emptyWorld = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      [],
    );
    emptyWorld.play('fish');
    emptyWorld.update(0.7, 0.7);
    expect(emptyWorld.scene.getObjectByName('fishing-line')?.visible).toBe(false);
    expect(emptyWorld.scene.getObjectByName('fishing-catch')?.visible).toBe(false);
    emptyWorld.dispose();
    propModels.dispose();
  });

  it('resets transient cues after they finish', async () => {
    const camera = new PerspectiveCamera();
    const propModels = createTestPropModels();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, propModels, []);
    const sequence = world.play('rest');
    world.update(0.8, 0.8);
    await sequence;
    expect(world.presentationCueForTest()).toBeNull();
    world.dispose();
    propModels.dispose();
  });

  it('disposes saved prop geometry and material exactly once', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      [savedItem('medicalKit')],
    );
    const prop = world.scene.getObjectByName('prop:medicalKit-1')!;
    const mesh = firstMesh(prop);
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(mesh.material as MeshStandardMaterial, 'dispose');

    world.dispose();
    world.dispose();

    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    propModels.dispose();
  });
});
