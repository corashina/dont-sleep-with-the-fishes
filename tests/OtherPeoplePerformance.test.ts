import {
  Box3,
  BoxGeometry,
  Group,
  Light,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
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

function visibleLights(root: Scene): readonly string[] {
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

  it('enables wash lights and shadows only while the flare is active', async () => {
    const presentation = createPresentation();
    const lifeboatWash = presentation.root.getObjectByName(
      'other-people-flare-lifeboat-wash',
    )! as Light;
    const shipWash = presentation.root.getObjectByName(
      'other-people-flare-ship-wash',
    )! as Light;

    expect(lifeboatWash.visible).toBe(false);
    expect(lifeboatWash.castShadow).toBe(false);
    expect(shipWash.visible).toBe(false);
    expect(shipWash.castShadow).toBe(false);

    presentation.stage();
    const choice = presentation.playChoice({
      choiceId: 'flareGun',
      instanceId: null,
      condition: null,
    });
    presentation.update(0.5, 0.5);

    expect(lifeboatWash.visible).toBe(true);
    expect(lifeboatWash.castShadow).toBe(true);
    expect(shipWash.visible).toBe(true);
    expect(shipWash.castShadow).toBe(true);

    presentation.clear();
    expect(lifeboatWash.visible).toBe(false);
    expect(lifeboatWash.castShadow).toBe(false);
    expect(shipWash.visible).toBe(false);
    expect(shipWash.castShadow).toBe(false);
    presentation.update(2, 2);
    await choice;
    presentation.dispose();
  });

  it('precompiles reveal, flare, and flashlight light states', async () => {
    const presentation = createPresentation();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    scene.add(presentation.root);
    const lightStates: readonly string[][] = [];
    const compileAsync = vi.fn(() => {
      (lightStates as string[][]).push([...visibleLights(scene)]);
      return Promise.resolve(scene);
    });

    await presentation.prepareRender(
      { compileAsync } as never,
      scene,
      camera,
    );

    expect(compileAsync).toHaveBeenCalledTimes(3);
    expect(lightStates[0]).toEqual(expect.arrayContaining([
      'other-people-ship-fill',
      'other-people-ship-deck-light',
      'other-people-horizon-light-port-light',
      'other-people-horizon-light-starboard-light',
    ]));
    expect(lightStates[0]).not.toContain('other-people-flare-lifeboat-wash');
    expect(lightStates[1]).toEqual(expect.arrayContaining([
      'other-people-flare-glow',
      'other-people-flare-lifeboat-wash',
      'other-people-flare-ship-wash',
    ]));
    expect(lightStates[2]).toContain('other-people-flashlight-beam-light');
    expect(lightStates[2]).not.toContain('other-people-flare-lifeboat-wash');
    expect(presentation.root.visible).toBe(false);
    presentation.dispose();
  });
});
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
