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

describe('chooseContextAction', () => {
  it('offers pickup for an item when hands are empty', () => {
    expect(chooseContextAction({
      target: 'item',
      itemId: 'flareGun',
      carriedItem: null,
      savedCount: 0,
      nearEvacuation: false,
    })).toEqual({ type: 'pickUp', itemId: 'flareGun', prompt: 'E — PICK UP FLARE GUN' });
  });

  it('offers a lifeboat throw while carrying', () => {
    expect(chooseContextAction({
      target: 'lifeboat',
      itemId: null,
      carriedItem: 'ductTape',
      savedCount: 2,
      nearEvacuation: false,
    }).type).toBe('throwToBoat');
  });

  it('explains when the lifeboat is full', () => {
    expect(chooseContextAction({
      target: 'lifeboat',
      itemId: null,
      carriedItem: 'ductTape',
      savedCount: 5,
      nearEvacuation: false,
    }).type).toBe('boatFull');
  });

  it('offers evacuation near the marker with empty hands', () => {
    expect(chooseContextAction({
      target: 'none',
      itemId: null,
      carriedItem: null,
      savedCount: 4,
      nearEvacuation: true,
    }).type).toBe('evacuate');
  });
});

describe('InteractionSystem', () => {
  it('raycasts current parent transforms and resolves a tagged item ancestor', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const ship = new Group();
    ship.position.z = -2;
    const item = new Group();
    item.userData.itemId = 'flareGun';
    item.add(new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial()));
    ship.add(item);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.z = -6;
    lifeboat.add(new Mesh(new BoxGeometry(2, 1, 4), new MeshStandardMaterial()));

    const result = new InteractionSystem(camera).update([item], lifeboat);

    expect(result).toEqual({ target: 'item', itemId: 'flareGun' });
  });

  it('isolates highlighting from shared materials and restores resources on dispose', () => {
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const sharedMaterial = new MeshStandardMaterial({
      emissive: 0x123456,
      emissiveIntensity: 0.2,
    });
    const aimedItem = new Group();
    aimedItem.userData.itemId = 'ductTape';
    const aimedMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), sharedMaterial);
    aimedItem.add(aimedMesh);
    aimedItem.position.z = -2;
    const otherItem = new Group();
    otherItem.userData.itemId = 'baitTin';
    const otherMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), sharedMaterial);
    otherItem.add(otherMesh);
    otherItem.position.set(2, 0, -2);
    const lifeboat = new Group();
    lifeboat.name = 'lifeboat';
    lifeboat.position.set(10, 0, -2);
    const interaction = new InteractionSystem(camera);

    interaction.update([aimedItem, otherItem], lifeboat);

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
  it('keeps carried and flight states exclusive', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    scene.add(camera);
    const ship = new Group();
    scene.add(ship);
    const first = new Group();
    const second = new Group();
    ship.add(first, second);
    const carry = new CarryController(scene, camera);

    expect(carry.pickUp('flareGun', first)).toBe(true);
    expect(carry.pickUp('ductTape', second)).toBe(false);
    expect(carry.busy).toBe(true);
    expect(first.parent).toBe(camera);
    expect(first.position.toArray()).toEqual([0.62, -0.48, -1.15]);

    expect(carry.throw()).toBe('flareGun');
    expect(carry.pickUp('ductTape', second)).toBe(false);
    expect(first.parent).toBe(scene);
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
      onSaved: (id: string) => outcomes.push(`saved:${id}`),
      onLost: (id: string) => outcomes.push(`lost:${id}`),
      onLanded: (id: string) => outcomes.push(`landed:${id}`),
    };
    const lifeboatBox = new Box3(
      new Vector3(6.4, 1.8, -3.2),
      new Vector3(6.8, 2.4, -2.75),
    );

    carry.pickUp('medicalKit', item);
    carry.throw();
    carry.update(1, lifeboatBox, () => -100, handlers);
    carry.update(1, lifeboatBox, () => -100, handlers);

    expect(outcomes).toEqual(['saved:medicalKit']);
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

    carry.pickUp('waterJug', item);
    expect(carry.drop()).toBe('waterJug');
    carry.update(
      1,
      new Box3(new Vector3(20, 20, 20), new Vector3(21, 21, 21)),
      () => 0,
      {
        onSaved: (id) => outcomes.push(`saved:${id}`),
        onLost: (id) => outcomes.push(`lost:${id}`),
        onLanded: (id) => outcomes.push(`landed:${id}`),
      },
    );

    expect(outcomes).toEqual(['lost:waterJug']);
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
    camera.position.copy(carriedStart).sub(new Vector3(0.62, -0.48, -1.15));
    scene.add(camera);
    const item = new Group();
    item.position.set(2, 2.35, 3);
    ship.add(item);
    const carry = new CarryController(scene, camera);
    const outcomes: string[] = [];

    carry.pickUp('cannedFood', item);
    carry.drop();
    carry.update(
      1,
      new Box3(new Vector3(20, 20, 20), new Vector3(21, 21, 21)),
      () => -100,
      {
        onSaved: (id) => outcomes.push(`saved:${id}`),
        onLost: (id) => outcomes.push(`lost:${id}`),
        onLanded: (id) => outcomes.push(`landed:${id}`),
      },
    );

    expect(outcomes).toEqual(['landed:cannedFood']);
    expect(item.parent).toBe(ship);
    expect(item.position.y).toBeCloseTo(2.35);
    expect(item.scale.toArray()).toEqual([1, 1, 1]);
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

    carry.pickUp('flashlight', item);
    carry.reset();
    expect(carry.busy).toBe(false);
    expect(item.parent).toBe(ship);
    expect(item.position.equals(originalPosition)).toBe(true);
    expect(item.quaternion.equals(originalQuaternion)).toBe(true);
    expect(item.scale.equals(originalScale)).toBe(true);

    carry.pickUp('flashlight', item);
    carry.throw();
    carry.reset();
    expect(carry.busy).toBe(false);
    expect(item.parent).toBe(ship);
    expect(item.position.equals(originalPosition)).toBe(true);
    expect(item.quaternion.equals(originalQuaternion)).toBe(true);
    expect(item.scale.equals(originalScale)).toBe(true);
  });
});
