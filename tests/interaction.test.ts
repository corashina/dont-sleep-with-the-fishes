import { describe, expect, it } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
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

  it('offers an exactly labelled drop while carrying away from the lifeboat', () => {
    const flashlight = item('flashlight-1', 'flashlight');
    expect(chooseContextAction({
      target: 'none',
      targetItem: null,
      carriedItem: flashlight,
      remainingCapacity: 2,
      nearEvacuation: false,
    })).toEqual({ type: 'drop', item: flashlight, prompt: 'LEFT CLICK — DROP FLASHLIGHT' });
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
    expect(mesh.material).not.toBe(material);
    interaction.dispose();
    expect(mesh.material).toBe(material);
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

  it('switches highlighted targets and clears one beyond ray range', () => {
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
    expect(firstMesh.material).not.toBe(firstMaterial);

    first.position.x = 2;
    second.position.x = 0;
    expect(interaction.update([first, second], lifeboat, depositTarget, instances)).toEqual({
      target: 'item', targetItem: item('ductTape-1', 'ductTape'),
    });
    expect(firstMesh.material).toBe(firstMaterial);
    expect(secondMesh.material).not.toBe(secondMaterial);

    second.position.z = -4;
    expect(interaction.update([first, second], lifeboat, depositTarget, instances)).toEqual({
      target: 'none', targetItem: null,
    });
    expect(secondMesh.material).toBe(secondMaterial);
  });

  it('isolates highlighting from shared materials and restores resources on dispose', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const sharedMaterial = new MeshStandardMaterial({
      emissive: 0x123456,
      emissiveIntensity: 0.2,
    });
    const aimedItem = new Group();
    aimedItem.userData.instanceId = 'ductTape-1';
    const aimedMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), sharedMaterial);
    aimedItem.add(aimedMesh);
    aimedItem.position.z = -2;
    const otherItem = new Group();
    otherItem.userData.instanceId = 'baitTin-1';
    const otherMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), sharedMaterial);
    otherItem.add(otherMesh);
    otherItem.position.set(2, 0, -2);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.set(10, 0, -2);
    const interaction = new InteractionSystem(camera);
    const depositTarget = new Group();

    interaction.update([aimedItem, otherItem], lifeboat, depositTarget, new Map([
      ['ductTape-1', item('ductTape-1', 'ductTape')],
      ['baitTin-1', item('baitTin-1', 'baitTin')],
    ] as const));

    const highlightMaterial = aimedMesh.material as MeshStandardMaterial;
    let highlightDisposals = 0;
    highlightMaterial.addEventListener('dispose', () => { highlightDisposals += 1; });
    expect(highlightMaterial).not.toBe(sharedMaterial);
    expect(highlightMaterial.emissive.getHex()).toBe(0x8b7650);
    expect(otherMesh.material).toBe(sharedMaterial);
    expect(sharedMaterial.emissive.getHex()).toBe(0x123456);
    expect(sharedMaterial.emissiveIntensity).toBe(0.2);

    interaction.dispose();
    interaction.dispose();

    expect(aimedMesh.material).toBe(sharedMaterial);
    expect(highlightDisposals).toBe(1);
  });
});

describe('CarryController', () => {
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
    expect(objects.every(({ parent }) => parent === camera)).toBe(true);
  });

  it('attaches three light instances as a visible bundle and releases LIFO', () => {
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
    expect(objects.every(({ parent }) => parent === camera)).toBe(true);
    expect(objects.map(({ position }) => position.toArray())).toEqual([
      [0.56, -0.48, -1.12],
      [0.18, -0.54, -1.02],
      [-0.24, -0.5, -1.08],
    ]);
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
    expect(objects.slice(0, 2).every(({ parent }) => parent === camera)).toBe(true);
    carry.reset();
    expect(objects.slice(0, 2).every(({ parent }) => parent === scene)).toBe(true);
  });

  it('preserves the held world transform at release from a transformed camera parent', () => {
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
    const beforePosition = item.getWorldPosition(new Vector3());
    const beforeQuaternion = item.getWorldQuaternion(new Quaternion());
    const beforeScale = item.getWorldScale(new Vector3());

    carry.drop();

    expect(item.getWorldPosition(new Vector3()).distanceTo(beforePosition)).toBeLessThan(1e-10);
    expect(item.getWorldQuaternion(new Quaternion()).angleTo(beforeQuaternion)).toBeLessThan(1e-10);
    expect(item.getWorldScale(new Vector3()).distanceTo(beforeScale)).toBeLessThan(1e-10);
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
    expect(prop.parent).toBe(camera);
    expect(prop.scale.toArray()).toEqual([0.72, 0.72, 0.72]);
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
