// Importance: 8/10. Protects event render cost, shared effects, and missed-signal behavior.
import {
  Box3,
  BoxGeometry,
  Group,
  Light,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import { OtherPeoplePresentation } from '../src/survival/OtherPeoplePresentation';

function containerShip(): Group {
  const root = new Group();
  const hull = new MeshStandardMaterial({ color: 0x24343a });
  const cargo = new MeshStandardMaterial({ color: 0x6b4435 });
  for (let index = 0; index < 6; index += 1) {
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      index < 2 ? hull : cargo,
    );
    mesh.position.set(index * 1.2, index % 2, 0);
    root.add(mesh);
  }
  return root;
}

function createPresentation(ship = containerShip()): OtherPeoplePresentation {
  const dependencies = {
    propModels: {
      createEventModel: () => ({ root: ship, animations: [] }),
    },
    waves: [],
    cameraRig: new Group(),
    camera: new PerspectiveCamera(),
    supplyDisplay: {
      releaseEventActor: vi.fn(),
      releaseEventActorOnNextSync: vi.fn(),
      clearEventPose: vi.fn(),
    },
    chestDisplay: {},
  } as unknown as FocusedEventPresentationDependencies;
  return new OtherPeoplePresentation(dependencies);
}

async function productionContainerShip(): Promise<Group> {
  const bytes = await readFile(resolve(
    'src',
    'assets',
    'models',
    'events',
    'containerShip.glb',
  ));
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return new Promise<Group>((onLoad, onError) => {
    new GLTFLoader().parse(data, '', ({ scene }) => onLoad(scene), onError);
  });
}

function visibleLights(root: Group): readonly string[] {
  const names: string[] = [];
  root.traverseVisible((object) => {
    if (object instanceof Light) names.push(object.name);
  });
  return names;
}

describe('OtherPeoplePresentation performance', () => {
  it('merges the static ship to one mesh per material', () => {
    const presentation = createPresentation();
    const ship = presentation.root.getObjectByName('event-model:containerShip')!;
    const meshes: Mesh[] = [];
    ship.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });

    expect(meshes).toHaveLength(2);
    expect(new Box3().setFromObject(ship).isEmpty()).toBe(false);
    presentation.dispose();
  });

  it('reduces the production ship from 94 primitives to nine meshes', async () => {
    const presentation = createPresentation(await productionContainerShip());
    const ship = presentation.root.getObjectByName('event-model:containerShip')!;
    const meshes: Mesh[] = [];
    ship.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });

    expect(meshes).toHaveLength(9);
    presentation.dispose();
  });

  it('uses the shared flare animation without a second flare visual', async () => {
    const presentation = createPresentation();
    expect(visibleLights(presentation.root)).toEqual([]);

    presentation.stage();
    const ship = presentation.root.getObjectByName('other-people-ship')!;
    const start = ship.position.clone();
    const choice = presentation.playChoice({
      choiceId: 'flareGun',
      instanceId: null,
      condition: null,
    });
    presentation.update(1.25, 1.25);
    await choice;
    await presentation.react({
      eventId: 'other-people',
      choiceId: 'flareGun',
      resultId: 'people-signaled',
    }, {} as never);
    presentation.update(4, 4);

    expect(presentation.root.getObjectByName('other-people-flare')).toBeUndefined();
    expect(ship.visible).toBe(true);
    expect(ship.position.distanceTo(start)).toBeGreaterThan(0);
    expect(ship.position.distanceTo(start)).toBeLessThan(4);
    expect(visibleLights(presentation.root)).toEqual([]);

    presentation.clear();
    expect(visibleLights(presentation.root)).toEqual([]);
    presentation.dispose();
  });

  it('keeps cruising after a missed flashlight signal', async () => {
    const presentation = createPresentation();
    presentation.stage();
    const ship = presentation.root.getObjectByName('other-people-ship')!;
    const choice = presentation.playChoice({
      choiceId: 'flashlight',
      instanceId: null,
      condition: null,
    });
    presentation.update(2, 2);
    await choice;
    const resultStart = ship.position.clone();

    const result = presentation.react({
      eventId: 'other-people',
      choiceId: 'flashlight',
      resultId: 'people-missed',
    }, {} as never);
    presentation.update(4.2, 4.2);
    await result;

    expect(ship.visible).toBe(true);
    expect(ship.position.distanceTo(resultStart)).toBeGreaterThan(0);
    expect(ship.position.distanceTo(resultStart)).toBeLessThan(4);
    presentation.dispose();
  });
});
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
