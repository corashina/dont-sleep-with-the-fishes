import { describe, expect, it, vi } from 'vitest';
import {
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { BoatWorld, clampParallax, survivalLighting } from '../src/survival/BoatWorld';
import { applyInventoryMutation, createSurvivalInventory } from '../src/survival/inventory';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { boatStorageTransform } from '../src/world/BoatStorage';

const savedItem = (type: ItemId, index = 1): ItemInstance => ({
  instanceId: `${type}-${index}` as ItemInstanceId,
  type,
});

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
    danger: 0,
    route: null,
    weather: 'calm',
    restedToday: false,
    actedToday: false,
    inventory: createSurvivalInventory(savedItems),
    savedItems,
    pendingEventId: null,
    pendingChoices: [],
    eventHistory: {},
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

  it('keeps the shared camera at a fixed height for reduced motion', () => {
    const camera = new PerspectiveCamera();
    const reducedMotion = { matches: true } as unknown as MediaQueryList;
    const world = new BoatWorld(camera, reducedMotion);
    const before = camera.getWorldPosition(new Vector3()).y;

    world.update(1, 0.1);
    const after = camera.getWorldPosition(new Vector3()).y;
    world.dispose();

    expect(after).toBe(before);
  });

  it('uploads one exclusion from the motion-rig lifeboat world transform', () => {
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
    );

    world.update(1.5, 0.1);

    const boat = world.scene.getObjectByName('lifeboat')!;
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh;
    const uniforms = (ocean.material as ShaderMaterial).uniforms;
    const matrices = uniforms.uExclusionWorldToLocal!.value as Matrix4[];
    const bounds = uniforms.uExclusionBounds!.value as Vector4[];
    expect(uniforms.uExclusionCount!.value).toBe(1);
    expect(bounds[0]!.toArray()).toEqual([-1.18, 1.18, -2.48, 2.48]);
    expect(matrices[0]!.elements).toEqual(boat.matrixWorld.clone().invert().elements);
    expect(matrices[1]).toEqual(new Matrix4());
    expect(bounds[1]).toEqual(new Vector4());
    world.dispose();
  });

  it('builds every saved instance once at its deterministic storage transform', () => {
    const savedItems = [
      savedItem('fishingRod'),
      savedItem('ductTape'),
      savedItem('ductTape', 2),
      savedItem('scubaSet'),
    ];
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      savedItems,
    );
    const storage = world.scene.getObjectByName('lifeboat-storage')!;

    expect(storage.children).toHaveLength(savedItems.length);
    expect(storage.children.map(({ name }) => name)).toEqual([
      'prop:fishingRod-1',
      'prop:ductTape-1',
      'prop:ductTape-2',
      'prop:scubaSet-1',
    ]);
    expect(storage.getObjectByName('prop:ductTape-1')).not.toBe(
      storage.getObjectByName('prop:ductTape-2'),
    );
    storage.children.forEach((prop, index) => {
      const transform = boatStorageTransform(index);
      expect(prop.position.toArray()).toEqual(transform.position.toArray());
      expect(prop.rotation.toArray().slice(0, 3)).toEqual(transform.rotation.toArray().slice(0, 3));
      expect(prop.scale.toArray()).toEqual([transform.scale, transform.scale, transform.scale]);
    });
    world.dispose();
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
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
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
    expect([foodOne.visible, foodTwo.visible]).toEqual([true, false]);
    expect([foodOne.userData.depleted, foodTwo.userData.depleted]).toEqual([false, true]);
    expect([baitOne.visible, baitTwo.visible]).toEqual([true, true]);
    expect([baitOne.userData.depleted, baitTwo.userData.depleted]).toEqual([false, true]);
    expect([tapeOne.userData.depleted, tapeTwo.userData.depleted]).toEqual([false, true]);

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
    world.dispose();
  });

  it('projects saved props plus fixed repair and horizon anchors', () => {
    const savedItems = [savedItem('fishingRod'), savedItem('flareGun')];
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, savedItems);

    const anchors = world.projectInteractionAnchors(800, 600);

    expect(anchors).toHaveLength(savedItems.length + 2);
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish' }),
      expect.objectContaining({ id: 'flareGun-1', itemType: 'flareGun', action: null }),
      expect.objectContaining({ id: 'repair-patch', itemType: null, action: 'repair' }),
      expect.objectContaining({ id: 'horizon', itemType: null, action: 'endDay', visible: true }),
    ]));
    expect(anchors.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    world.dispose();
  });

  it('projects per-instance remaining uses for duplicate and contextual supplies', () => {
    const savedItems = [
      savedItem('ductTape'), savedItem('ductTape', 2),
      savedItem('baitTin'), savedItem('baitTin', 2),
      savedItem('flareGun'), savedItem('flashlight'),
    ];
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, savedItems);
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
  });

  it('creates a deterministic prop and accessible anchor for a runtime-fished usable item', () => {
    const rod = savedItem('fishingRod');
    const session = new SurvivalSession([rod], {
      seed: 1,
      initial: { day: 3 },
      random: sequenceRandom([0, 462 / 469]),
    });
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, [rod]);

    expect(session.useItem('fishingRod')).toMatchObject({
      accepted: true,
      message: 'You caught Energy Bar.',
    });
    world.syncInventory(session.snapshot());

    const prop = world.scene.getObjectByName('prop:energyBar-1')!;
    const transform = boatStorageTransform(1);
    expect(prop).toBeDefined();
    expect(prop.position.toArray()).toEqual(transform.position.toArray());
    expect(prop.rotation.toArray().slice(0, 3)).toEqual(transform.rotation.toArray().slice(0, 3));
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'energyBar-1', itemType: 'energyBar', condition: 'usable', depleted: false,
      }),
    ]));
    world.syncInventory(session.snapshot());
    expect(world.scene.getObjectByName('lifeboat-storage')?.children.filter(({ name }) => (
      name === 'prop:energyBar-1'
    ))).toHaveLength(1);
    world.dispose();
  });

  it('creates and owns a subdued anchored prop for a runtime-fished broken item', () => {
    const rod = savedItem('fishingRod');
    const session = new SurvivalSession([rod], {
      seed: 1,
      initial: { day: 3 },
      random: sequenceRandom([0, 454 / 469]),
    });
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, [rod]);

    expect(session.useItem('fishingRod')).toMatchObject({ message: 'You caught Broken Compass.' });
    world.syncInventory(session.snapshot());

    const prop = world.scene.getObjectByName('prop:compass-1')!;
    const mesh = prop.getObjectByProperty('isMesh', true) as Mesh;
    const propMaterial = mesh.material as MeshStandardMaterial;
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(propMaterial, 'dispose');
    expect(prop.visible).toBe(true);
    expect(propMaterial.opacity).toBeLessThan(1);
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'compass-1', itemType: 'compass', condition: 'broken', depleted: true,
      }),
    ]));

    world.dispose();
    world.dispose();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });

  it('synchronizes visible broken and detached lost conditions by instance ID', () => {
    const savedItems = [
      savedItem('fishingNet'),
      savedItem('fishingNet', 2),
      savedItem('map'),
    ];
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, savedItems);
    const inventory = createSurvivalInventory(savedItems);
    applyInventoryMutation(inventory, {
      kind: 'break', itemId: 'fishingNet', quantity: 1, instanceId: 'fishingNet-2',
    });
    applyInventoryMutation(inventory, {
      kind: 'lose', itemId: 'map', quantity: 1, instanceId: 'map-1',
    });
    const broken = world.scene.getObjectByName('prop:fishingNet-2')!;
    const lost = world.scene.getObjectByName('prop:map-1')!;

    world.syncInventory(snapshot(savedItems, { inventory }));

    const brokenMesh = broken.getObjectByProperty('isMesh', true) as Mesh;
    const brokenMaterial = brokenMesh.material as MeshStandardMaterial;
    let anchors = world.projectInteractionAnchors(800, 600);
    expect(broken.visible).toBe(true);
    expect(brokenMaterial.transparent).toBe(true);
    expect(brokenMaterial.opacity).toBeLessThan(1);
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fishingNet-1', depleted: false }),
      expect.objectContaining({ id: 'fishingNet-2', depleted: true }),
    ]));
    expect(lost.parent).toBeNull();
    expect(anchors.some(({ id }) => id === 'map-1')).toBe(false);

    applyInventoryMutation(inventory, {
      kind: 'repair', itemId: 'fishingNet', quantity: 1, instanceId: 'fishingNet-2',
    });
    world.syncInventory(snapshot(savedItems, { inventory }));
    anchors = world.projectInteractionAnchors(800, 600);
    expect(brokenMaterial.opacity).toBe(1);
    expect(brokenMaterial.transparent).toBe(false);
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fishingNet-2', depleted: false }),
    ]));
    world.dispose();
  });

  it('keeps consumed supplies as depleted markers except empty canned food', () => {
    const savedItems = [savedItem('energyBar'), savedItem('cannedFood')];
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, savedItems);
    const inventory = createSurvivalInventory(savedItems);
    applyInventoryMutation(inventory, { kind: 'consume', itemId: 'energyBar', quantity: 1 });
    applyInventoryMutation(inventory, { kind: 'consume', itemId: 'cannedFood', quantity: 1 });

    world.syncInventory(snapshot(savedItems, { inventory, recoveredFood: 0 }));

    const bar = world.scene.getObjectByName('prop:energyBar-1')!;
    const can = world.scene.getObjectByName('prop:cannedFood-1')!;
    const barMesh = bar.getObjectByProperty('isMesh', true) as Mesh;
    const barMaterial = barMesh.material as MeshStandardMaterial;
    const anchors = world.projectInteractionAnchors(800, 600);
    expect(bar.visible).toBe(true);
    expect(bar.userData.depleted).toBe(true);
    expect(barMaterial.transparent).toBe(true);
    expect(barMaterial.opacity).toBeLessThan(1);
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'energyBar-1', depleted: true }),
    ]));
    expect(can.visible).toBe(false);
    expect(anchors.some(({ id }) => id === 'cannedFood-1')).toBe(false);
    world.dispose();
  });

  it('keeps a transferred can anchored until its recovered food is eaten', () => {
    const savedItems = [savedItem('cannedFood')];
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, savedItems);
    const session = new SurvivalSession(savedItems, { seed: 8 });
    const transferred = session.snapshot();
    const can = world.scene.getObjectByName('prop:cannedFood-1')!;

    expect(transferred).toMatchObject({ food: 1, recoveredFood: 1 });
    expect(transferred.inventory.cannedFood.instances[0]).toMatchObject({
      instanceId: 'cannedFood-1',
      condition: 'consumed',
    });
    world.syncInventory(transferred);
    let anchors = world.projectInteractionAnchors(800, 600);
    expect(can.visible).toBe(true);
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cannedFood-1', remainingUses: 1, depleted: false }),
    ]));

    expect(session.perform('eat')).toMatchObject({ accepted: true, code: 'ate' });
    const spent = session.snapshot();
    expect(spent).toMatchObject({ food: 0, recoveredFood: 0 });
    world.syncInventory(spent);
    anchors = world.projectInteractionAnchors(800, 600);
    expect(can.visible).toBe(false);
    expect(anchors.some(({ id }) => id === 'cannedFood-1')).toBe(false);
    world.dispose();
  });

  it('animates fishing cues from the recovered rod and has no hand-line fallback', () => {
    const rodWorld = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
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
      [],
    );
    emptyWorld.play('fish');
    emptyWorld.update(0.7, 0.7);
    expect(emptyWorld.scene.getObjectByName('fishing-line')?.visible).toBe(false);
    expect(emptyWorld.scene.getObjectByName('fishing-catch')?.visible).toBe(false);
    emptyWorld.dispose();
  });

  it('resets transient cues after they finish', async () => {
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, []);
    const sequence = world.play('rest');
    world.update(0.8, 0.8);
    await sequence;
    expect(world.presentationCueForTest()).toBeNull();
    world.dispose();
  });

  it('disposes saved prop geometry and material exactly once', () => {
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      [savedItem('medicalKit')],
    );
    const prop = world.scene.getObjectByName('prop:medicalKit-1')!;
    const mesh = prop.getObjectByProperty('isMesh', true) as Mesh;
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(mesh.material as MeshStandardMaterial, 'dispose');

    world.dispose();
    world.dispose();

    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });
});
