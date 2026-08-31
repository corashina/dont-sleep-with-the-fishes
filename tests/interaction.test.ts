// Importance: 10/10 (scaled from 5/5). Protects pickup, carry, drop, and deposit rules.
import { describe, expect, it } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { CarryController } from '../src/interaction/CarryController';
import { InteractionSystem, chooseContextAction } from '../src/interaction/InteractionSystem';
import type { ItemInstance } from '../src/game/ItemState';
import {
  createTestPropModels,
  TEST_PROP_MODEL_TRANSFORM,
  testPropModel,
} from './helpers/propModels';

const item = (instanceId: ItemInstance['instanceId'], type: ItemInstance['type']): ItemInstance => ({
  instanceId,
  type,
});

describe('chooseContextAction', () => {
  it('offers pickup for an item when hands are empty', () => {
    const flareGun = item('flareGun-1', 'flareGun');
    expect(chooseContextAction({
      target: 'item',
      targetItem: flareGun,
      carriedItem: null,
      remainingCapacity: 3,
      nearEvacuation: false,
    })).toEqual({ type: 'pickUp', item: flareGun, prompt: 'LEFT CLICK — PICK UP FLARE GUN' });
  });

  it('offers a bundle deposit while carrying at a deposit target', () => {
    expect(chooseContextAction({
      target: 'deposit',
      targetItem: null,
      carriedItem: item('ductTape-1', 'ductTape'),
      remainingCapacity: 2,
      nearEvacuation: false,
    })).toEqual({
      type: 'depositBundle',
      prompt: 'LEFT CLICK — STORE CARRIED SUPPLIES',
    });
  });

  it('explains when a targeted pickup exceeds remaining capacity', () => {
    expect(chooseContextAction({
      target: 'item',
      targetItem: item('scubaSet-1', 'scubaSet'),
      carriedItem: item('cannedFood-1', 'cannedFood'),
      remainingCapacity: 2,
      nearEvacuation: false,
    })).toEqual({ type: 'capacityFull', prompt: 'SCUBA GEAR WEIGHS 3 — 2 CAPACITY FREE' });
  });

  it('offers another pickup when the target fits the remaining capacity', () => {
    const ductTape = item('ductTape-1', 'ductTape');
    expect(chooseContextAction({
      target: 'item',
      targetItem: ductTape,
      carriedItem: item('cannedFood-1', 'cannedFood'),
      remainingCapacity: 2,
      nearEvacuation: false,
    })).toEqual({ type: 'pickUp', item: ductTape, prompt: 'LEFT CLICK — PICK UP DUCT TAPE' });
  });

  it('offers evacuation near the marker with empty hands', () => {
    expect(chooseContextAction({
      target: 'none',
      targetItem: null,
      carriedItem: null,
      remainingCapacity: 3,
      nearEvacuation: true,
    })).toEqual({ type: 'evacuate', prompt: 'LEFT CLICK — EVACUATE NOW' });
  });

  it('does not drop unless the crosshair reaches the floor', () => {
    expect(chooseContextAction({
      target: 'none',
      targetItem: null,
      carriedItem: item('flashlight-1', 'flashlight'),
      remainingCapacity: 2,
      nearEvacuation: false,
    })).toEqual({ type: 'none', prompt: '' });
  });

  it('returns the exact no-action result when no context applies', () => {
    expect(chooseContextAction({
      target: 'none',
      targetItem: null,
      carriedItem: null,
      remainingCapacity: 3,
      nearEvacuation: false,
    })).toEqual({ type: 'none', prompt: '' });
  });

  it('prioritizes a deposit target over mixed evacuation and drop inputs', () => {
    const umbrella = item('umbrella-1', 'umbrella');
    expect(chooseContextAction({
      target: 'deposit',
      targetItem: item('flareGun-1', 'flareGun'),
      carriedItem: umbrella,
      remainingCapacity: 1,
      nearEvacuation: true,
    })).toEqual({
      type: 'depositBundle', prompt: 'LEFT CLICK — STORE CARRIED SUPPLIES',
    });
  });
});

describe('InteractionSystem', () => {
  it('returns the aimed deck point when it is inside interaction range', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const ship = new Group();
    ship.position.set(3, -1, -4);
    ship.rotation.set(0.1, 0.4, 0.05);
    ship.updateWorldMatrix(true, true);
    const expectedPoint = ship.localToWorld(new Vector3(1, 2.22, -1));
    camera.position.copy(ship.localToWorld(new Vector3(0, 3.72, 0)));
    camera.lookAt(expectedPoint);
    const interaction = new InteractionSystem(camera, {
      root: ship,
      colliders: [],
      dropFloor: {
        y: 2.22,
        bounds: { minX: -7, maxX: 7, minZ: -20, maxZ: 20 },
        colliders: [],
      },
    });
    const lifeboat = new Group();
    lifeboat.position.set(20, 20, 20);
    const depositTarget = new Group();
    depositTarget.position.set(20, 20, 20);

    const result = interaction.update([], lifeboat, depositTarget, new Map());

    expect(result.target).toBe('none');
    expect(result.targetItem).toBeNull();
    expect(result.dropPoint?.distanceTo(expectedPoint)).toBeLessThan(1e-10);
  });

  it('does not return a deck point beyond interaction range', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const ship = new Group();
    const expectedPoint = new Vector3(0, 2.22, -4);
    camera.position.set(0, 3.72, 0);
    camera.lookAt(expectedPoint);
    const interaction = new InteractionSystem(camera, {
      root: ship,
      colliders: [],
      dropFloor: {
        y: 2.22,
        bounds: { minX: -7, maxX: 7, minZ: -20, maxZ: 20 },
        colliders: [],
      },
    });

    expect(interaction.update([], new Group(), new Group(), new Map()))
      .toEqual({ target: 'none', targetItem: null });
  });

  it('raycasts current parent transforms and resolves a tagged item ancestor', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const ship = new Group();
    ship.position.z = -2;
    const item = new Group();
    item.userData.instanceId = 'flareGun-1';
    item.add(new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial()));
    ship.add(item);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.z = -6;
    lifeboat.add(new Mesh(new BoxGeometry(2, 1, 4), new MeshStandardMaterial()));

    const flareGun = { instanceId: 'flareGun-1', type: 'flareGun' } as const;
    const result = new InteractionSystem(camera).update(
      [item], lifeboat, new Group(), new Map([[flareGun.instanceId, flareGun]]),
    );

    expect(result).toEqual({ target: 'item', targetItem: flareGun });
  });

  it('treats a tagged saved item nested under the lifeboat as a deposit target', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.z = -2;
    const savedItem = new Group();
    savedItem.userData.instanceId = 'medicalKit-1';
    savedItem.add(new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial()));
    lifeboat.add(savedItem);

    const medicalKit = item('medicalKit-1', 'medicalKit');
    const result = new InteractionSystem(camera).update(
      [savedItem], lifeboat, new Group(), new Map([[medicalKit.instanceId, medicalKit]]),
    );

    expect(result).toEqual({ target: 'deposit', targetItem: null });
  });

  it('resolves a direct lifeboat mesh', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.z = -2;
    const material = new MeshStandardMaterial();
    const mesh = new Mesh(new BoxGeometry(2, 1, 1), material);
    lifeboat.add(mesh);
    const interaction = new InteractionSystem(camera);

    const result = interaction.update([], lifeboat, new Group(), new Map());

    expect(result).toEqual({ target: 'deposit', targetItem: null });
    expect(mesh.material).toBe(material);
    expect(mesh.material).toBe(material);
  });

  it('reaches the lifeboat beyond normal item range from the drop-off area', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.z = -5;
    lifeboat.add(new Mesh(new BoxGeometry(2, 1, 1), new MeshStandardMaterial()));

    const result = new InteractionSystem(camera).update(
      [], lifeboat, new Group(), new Map(), true,
    );

    expect(result).toEqual({ target: 'deposit', targetItem: null });
  });

  it('does not reach the lifeboat outside the drop-off area', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.z = -2;
    lifeboat.add(new Mesh(new BoxGeometry(2, 1, 1), new MeshStandardMaterial()));

    const result = new InteractionSystem(camera).update(
      [], lifeboat, new Group(), new Map(), false,
    );

    expect(result).toEqual({ target: 'none', targetItem: null });
  });

  it('resolves the tagged station deck as a deposit target', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.x = 10;
    const depositTarget = new Mesh(
      new BoxGeometry(2, 0.1, 2),
      new MeshStandardMaterial(),
    );
    depositTarget.position.z = -2;
    depositTarget.userData.boatDepositTarget = true;
    const interaction = new InteractionSystem(camera);

    const result = interaction.update(
      [],
      lifeboat,
      depositTarget,
      new Map(),
    );

    expect(result).toEqual({ target: 'deposit', targetItem: null });
  });

  it('keeps an available item selectable through the station target surface', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.x = 10;
    const depositTarget = new Mesh(
      new BoxGeometry(2, 0.1, 2),
      new MeshStandardMaterial(),
    );
    depositTarget.position.z = -1.8;
    depositTarget.userData.boatDepositTarget = true;
    const availableItem = new Group();
    availableItem.position.z = -2;
    availableItem.userData.instanceId = 'flareGun-1';
    availableItem.add(new Mesh(
      new BoxGeometry(0.5, 0.5, 0.5),
      new MeshStandardMaterial(),
    ));
    const flareGun = item('flareGun-1', 'flareGun');

    const result = new InteractionSystem(camera).update(
      [availableItem],
      lifeboat,
      depositTarget,
      new Map([[flareGun.instanceId, flareGun]]),
    );

    expect(result).toEqual({ target: 'item', targetItem: flareGun });
  });

  it('does not target an item through a ship wall', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const ship = new Group();
    ship.position.set(3, 2, -4);
    ship.rotation.set(0.1, 0.4, 0.05);
    const hiddenItem = new Group();
    hiddenItem.position.z = -2;
    hiddenItem.userData.instanceId = 'flareGun-1';
    hiddenItem.add(new Mesh(
      new BoxGeometry(0.5, 0.5, 0.5),
      new MeshStandardMaterial(),
    ));
    ship.add(hiddenItem);
    ship.updateWorldMatrix(true, true);
    camera.position.copy(ship.localToWorld(new Vector3()));
    camera.lookAt(ship.localToWorld(new Vector3(0, 0, -2)));
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.x = 10;
    const flareGun = item('flareGun-1', 'flareGun');
    const interaction = new InteractionSystem(camera, {
      root: ship,
      colliders: [{
        minX: -1,
        maxX: 1,
        minY: -1,
        maxY: 1,
        minZ: -1.1,
        maxZ: -0.9,
      }],
    });

    expect(interaction.update(
      [hiddenItem],
      lifeboat,
      new Group(),
      new Map([[flareGun.instanceId, flareGun]]),
    )).toEqual({ target: 'none', targetItem: null });
  });

  it('switches aimed targets and clears one beyond ray range', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const first = new Group();
    first.userData.instanceId = 'flareGun-1';
    const firstMaterial = new MeshStandardMaterial();
    const firstMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), firstMaterial);
    first.add(firstMesh);
    first.position.z = -2;
    const second = new Group();
    second.userData.instanceId = 'ductTape-1';
    const secondMaterial = new MeshStandardMaterial();
    const secondMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), secondMaterial);
    second.add(secondMesh);
    second.position.set(2, 0, -2);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.set(10, 0, -2);
    const interaction = new InteractionSystem(camera);
    const depositTarget = new Group();
    const instances = new Map([
      ['flareGun-1', item('flareGun-1', 'flareGun')],
      ['ductTape-1', item('ductTape-1', 'ductTape')],
    ] as const);

    expect(interaction.update([first, second], lifeboat, depositTarget, instances)).toEqual({
      target: 'item', targetItem: item('flareGun-1', 'flareGun'),
    });
    first.position.x = 2;
    second.position.x = 0;
    expect(interaction.update([first, second], lifeboat, depositTarget, instances)).toEqual({
      target: 'item', targetItem: item('ductTape-1', 'ductTape'),
    });
    second.position.z = -4;
    expect(interaction.update([first, second], lifeboat, depositTarget, instances)).toEqual({
      target: 'none', targetItem: null,
    });
  });
});

describe('CarryController', () => {
  it('releases the active item immediately without starting a flight', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(3, 4, -2);
    scene.add(camera);
    const carriedObject = new Group();
    scene.add(carriedObject);
    const carry = new CarryController(scene, camera);
    const instance = item('flashlight-1', 'flashlight');

    carry.pickUp(instance, carriedObject);
    expect(carriedObject.parent).toBeNull();

    expect(carry.releaseActive()).toEqual(instance);
    expect(carriedObject.parent).toBeNull();
    expect(carry.flightActive).toBe(false);
    expect(carry.busy).toBe(false);
  });

  it('releases the full carried bundle without starting a flight', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    scene.add(camera);
    const objects = [new Group(), new Group(), new Group()];
    objects.forEach((object) => scene.add(object));
    const carry = new CarryController(scene, camera);
    const instances = [
      item('cannedFood-1', 'cannedFood'),
      item('ductTape-1', 'ductTape'),
      item('flashlight-1', 'flashlight'),
    ];
    instances.forEach((instance, index) => {
      carry.pickUp(instance, objects[index]!);
    });

    expect(carry.releaseAll()).toEqual(instances);
    expect(carry.activeInstance).toBeNull();
    expect(carry.busy).toBe(false);
    expect(carry.flightActive).toBe(false);
    expect(objects.every(({ parent }) => parent === null)).toBe(true);
  });

  it('stores three light instances outside the scene and releases LIFO', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    scene.add(camera);
    const objects = [new Group(), new Group(), new Group()];
    objects.forEach((object) => scene.add(object));
    const carry = new CarryController(scene, camera);
    const instances = [
      item('cannedFood-1', 'cannedFood'),
      item('ductTape-1', 'ductTape'),
      item('flashlight-1', 'flashlight'),
    ];

    instances.forEach((instance, index) => {
      expect(carry.pickUp(instance, objects[index]!)).toBe(true);
    });
    expect(carry.busy).toBe(true);
    expect(objects.every(({ parent }) => parent === null)).toBe(true);
    expect(carry.drop()).toBe('flashlight-1');
    expect(carry.activeInstance?.instanceId).toBe('ductTape-1');
    expect(carry.flightActive).toBe(true);
    expect(carry.pickUp(item('baitTin-1', 'baitTin'), new Group())).toBe(false);
    expect(objects[2]!.parent).toBe(scene);
    const outcomes: string[] = [];
    carry.update(
      0.1,
      new Box3(new Vector3(20, 20, 20), new Vector3(21, 21, 21)),
      () => 100,
      {
        onSaved: (instance) => outcomes.push(`saved:${instance.instanceId}`),
        onLost: (instance) => outcomes.push(`lost:${instance.instanceId}`),
        onLanded: (instance) => outcomes.push(`landed:${instance.instanceId}`),
      },
    );
    expect(outcomes).toEqual(['lost:flashlight-1']);
    expect(carry.flightActive).toBe(false);
    expect(carry.activeInstance?.instanceId).toBe('ductTape-1');
    expect(objects.slice(0, 2).every(({ parent }) => parent === null)).toBe(true);
    carry.reset();
    expect(objects.slice(0, 2).every(({ parent }) => parent === scene)).toBe(true);
  });

  it('keeps inventory items detached before launching from the camera', () => {
    const scene = new Scene();
    const cameraRig = new Group();
    cameraRig.position.set(3, 4, -2);
    cameraRig.rotation.set(0.1, 0.7, -0.05);
    cameraRig.scale.setScalar(1.2);
    scene.add(cameraRig);
    const camera = new PerspectiveCamera();
    camera.position.set(0.2, -0.1, 0.3);
    cameraRig.add(camera);
    const item = new Group();
    scene.add(item);
    const carry = new CarryController(scene, camera);
    carry.pickUp({ instanceId: 'baitTin-1', type: 'baitTin' }, item);
    expect(item.parent).toBeNull();

    carry.drop();

    expect(item.parent).toBe(scene);
    expect(item.getWorldPosition(new Vector3()).distanceTo(
      camera.getWorldPosition(new Vector3()),
    )).toBeLessThan(2);
  });

  it('detects a lifeboat hit across a large delta and reports it once', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(6, 2.5, 0);
    scene.add(camera);
    const ship = new Group();
    const item = new Group();
    ship.add(item);
    scene.add(ship);
    const carry = new CarryController(scene, camera);
    const outcomes: string[] = [];
    const handlers = {
      onSaved: (instance: ItemInstance) => outcomes.push(`saved:${instance.instanceId}`),
      onLost: (instance: ItemInstance) => outcomes.push(`lost:${instance.instanceId}`),
      onLanded: (instance: ItemInstance) => outcomes.push(`landed:${instance.instanceId}`),
    };
    const lifeboatBox = new Box3(
      new Vector3(6.4, 1.8, -1.65),
      new Vector3(6.8, 2.4, -1.2),
    );

    carry.pickUp({ instanceId: 'medicalKit-1', type: 'medicalKit' }, item);
    carry.drop();
    carry.update(1, lifeboatBox, () => -100, handlers);
    carry.update(1, lifeboatBox, () => -100, handlers);

    expect(outcomes).toEqual(['saved:medicalKit-1']);
    expect(carry.busy).toBe(false);
  });

  it('reports a dropped item as lost when it enters the water', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(6, 1, 0);
    scene.add(camera);
    const item = new Group();
    scene.add(item);
    const carry = new CarryController(scene, camera);
    const outcomes: string[] = [];

    carry.pickUp({ instanceId: 'umbrella-1', type: 'umbrella' }, item);
    expect(carry.drop()).toBe('umbrella-1');
    carry.update(
      1,
      new Box3(new Vector3(20, 20, 20), new Vector3(21, 21, 21)),
      () => 0,
      {
        onSaved: (instance) => outcomes.push(`saved:${instance.instanceId}`),
        onLost: (instance) => outcomes.push(`lost:${instance.instanceId}`),
        onLanded: (instance) => outcomes.push(`landed:${instance.instanceId}`),
      },
    );

    expect(outcomes).toEqual(['lost:umbrella-1']);
    expect(carry.busy).toBe(false);
  });

  it('lands back on the currently transformed ship deck', () => {
    const scene = new Scene();
    const ship = new Group();
    ship.name = 'sinking-ship';
    ship.position.y = -1;
    ship.rotation.z = 0.15;
    scene.add(ship);
    ship.updateWorldMatrix(true, false);
    const carriedStart = ship.localToWorld(new Vector3(0, 4, 0));
    const camera = new PerspectiveCamera();
    camera.position.copy(carriedStart).sub(new Vector3(0.56, -0.48, -1.12));
    scene.add(camera);
    const propModels = createTestPropModels();
    const instance = item('cannedFood-1', 'cannedFood');
    const prop = propModels.create(instance);
    prop.position.set(2, 2.35, 3);
    ship.add(prop);
    const carry = new CarryController(scene, camera);
    const outcomes: string[] = [];
    const normalizedModel = testPropModel(prop);
    const expectNormalizationPreserved = (): void => {
      expect(normalizedModel.position.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.position);
      normalizedModel.rotation.toArray().slice(0, 3).forEach((value, index) => {
        expect(value).toBeCloseTo(TEST_PROP_MODEL_TRANSFORM.rotation[index]!);
      });
      expect(normalizedModel.scale.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.scale);
    };

    carry.pickUp(instance, prop);
    expect(prop.parent).toBeNull();
    expect(prop.scale.toArray()).toEqual([1, 1, 1]);
    expectNormalizationPreserved();
    carry.drop();
    expect(prop.parent).toBe(scene);
    expectNormalizationPreserved();
    carry.update(
      1,
      new Box3(new Vector3(20, 20, 20), new Vector3(21, 21, 21)),
      () => -100,
      {
        onSaved: (instance) => outcomes.push(`saved:${instance.instanceId}`),
        onLost: (instance) => outcomes.push(`lost:${instance.instanceId}`),
        onLanded: (instance) => outcomes.push(`landed:${instance.instanceId}`),
      },
    );

    expect(outcomes).toEqual(['landed:cannedFood-1']);
    expect(prop.parent).toBe(ship);
    expect(prop.position.y).toBeCloseTo(2.35);
    expect(prop.scale.toArray()).toEqual([1, 1, 1]);
    expectNormalizationPreserved();
    prop.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    propModels.dispose();
  });

  it('reset restores carried and flying items to their original placement', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    scene.add(camera);
    const ship = new Group();
    ship.name = 'sinking-ship';
    scene.add(ship);
    const item = new Group();
    item.position.set(1, 2.35, -3);
    item.rotation.set(0.1, 0.2, 0.3);
    item.scale.setScalar(1.1);
    const originalPosition = item.position.clone();
    const originalQuaternion = item.quaternion.clone();
    const originalScale = item.scale.clone();
    ship.add(item);
    const carry = new CarryController(scene, camera);

    carry.pickUp({ instanceId: 'flashlight-1', type: 'flashlight' }, item);
    carry.reset();
    expect(carry.busy).toBe(false);
    expect(item.parent).toBe(ship);
    expect(item.position.equals(originalPosition)).toBe(true);
    expect(item.quaternion.equals(originalQuaternion)).toBe(true);
    expect(item.scale.equals(originalScale)).toBe(true);

    carry.pickUp({ instanceId: 'flashlight-1', type: 'flashlight' }, item);
    carry.drop();
    carry.reset();
    expect(carry.busy).toBe(false);
    expect(item.parent).toBe(ship);
    expect(item.position.equals(originalPosition)).toBe(true);
    expect(item.quaternion.equals(originalQuaternion)).toBe(true);
    expect(item.scale.equals(originalScale)).toBe(true);
  });
});
