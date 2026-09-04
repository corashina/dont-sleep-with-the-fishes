// Importance: 10/10 (scaled from 5/5). Protects event model validation and resource ownership.

import { describe, expect, it, vi } from 'vitest';
import {
  AnimationClip,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import {
  EventModelLibrary,
  EventModelLoadError,
  type EventModelLoader,
} from '../src/survival/EventModelLibrary';
import {
  EVENT_MODEL_IDS,
  EVENT_MODEL_SPECS,
  type EventModelId,
} from '../src/survival/eventModelManifest';

function modelRoot(
  geometry: BufferGeometry = new BoxGeometry(2, 1, 1),
  material = new MeshStandardMaterial(),
): Group {
  const root = new Group();
  root.add(new Mesh(geometry, material));
  return root;
}

function loaderFrom(
  roots: Readonly<Record<EventModelId, Group>>,
): EventModelLoader {
  let index = 0;
  return {
    load: vi.fn(async () => roots[EVENT_MODEL_IDS[index++]!]),
  };
}

function completeRoots(): Record<EventModelId, Group> {
  return Object.fromEntries(EVENT_MODEL_IDS.map((id) => [id, modelRoot()])) as
    Record<EventModelId, Group>;
}

describe('EventModelLibrary', () => {

  it('loads only requested templates', async () => {
    const roots = completeRoots();
    const loader: EventModelLoader = {
      load: vi.fn(async () => roots.ghost),
    };

    const library = await EventModelLibrary.load(['ghost'], loader);

    expect(loader.load).toHaveBeenCalledOnce();
    expect(library.create('ghost')).toBeInstanceOf(Group);
    expect(() => library.create('leakPlanks')).toThrow('Missing event model template');
    library.dispose();
  });

  it('normalizes templates and makes owned deep clones', async () => {
    const roots = completeRoots();
    const library = await EventModelLibrary.load(EVENT_MODEL_IDS, loaderFrom(roots));

    for (const id of [
      'leakPlanks',
      'schoolFish',
      'cod',
      'bass',
      'redSnapper',
      'snatcher',
      'shark',
      'deathStareBlob',
      'tornadoCore',
    ] as const) {
      const instance = library.create(id);
      const bounds = new Box3().setFromObject(instance.root);
      const size = bounds.getSize(new Vector3());
      expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(
        EVENT_MODEL_SPECS[id].targetLongestDimension,
      );
      bounds.getCenter(new Vector3()).toArray().forEach((value, axis) => {
        expect(value).toBeCloseTo(EVENT_MODEL_SPECS[id].offset[axis]!);
      });
      instance.dispose();
    }

    const first = library.create('shark');
    const second = library.create('shark');
    const firstMesh = first.root.children[0]!.children[0] as Mesh;
    const secondMesh = second.root.children[0]!.children[0] as Mesh;
    expect(first.root).not.toBe(second.root);
    expect(first.root.children[0]).not.toBe(second.root.children[0]);
    expect(firstMesh.geometry).not.toBe(secondMesh.geometry);
    expect(firstMesh.material).not.toBe(secondMesh.material);
    first.dispose();
    second.dispose();
    library.dispose();
  });

  it('preserves model animation clips on owned clones', async () => {
    const roots = completeRoots();
    const idle = new AnimationClip('Tentacle_Idle', 1, [
      new VectorKeyframeTrack('joint.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    roots.snatcher.animations = [idle];
    const library = await EventModelLibrary.load(EVENT_MODEL_IDS, loaderFrom(roots));
    const instance = library.create('snatcher');

    expect(instance.root.animations).toEqual([idle]);

    instance.dispose();
    library.dispose();
  });

  it('rejects invalid geometry with its event ID', async () => {
    const roots = completeRoots();
    roots.snatcher = modelRoot(new BufferGeometry());

    await expect(EventModelLibrary.load(EVENT_MODEL_IDS, loaderFrom(roots))).rejects.toMatchObject({
      name: 'EventModelLoadError',
      eventModelId: 'snatcher',
    });
  });

  it('wraps loader failures and rolls back all loaded templates once', async () => {
    const roots = completeRoots();
    const disposeSpies = EVENT_MODEL_IDS.filter((id) => id !== 'shark').flatMap((id) => {
      const mesh = roots[id].children[0] as Mesh;
      return [
        vi.spyOn(mesh.geometry, 'dispose'),
        vi.spyOn(mesh.material as MeshStandardMaterial, 'dispose'),
      ];
    });
    let index = 0;
    const loader: EventModelLoader = {
      load: vi.fn(async () => {
        const id = EVENT_MODEL_IDS[index++]!;
        if (id === 'shark') throw new Error('network failed');
        return roots[id];
      }),
    };

    await expect(EventModelLibrary.load(EVENT_MODEL_IDS, loader)).rejects.toEqual(
      expect.objectContaining<EventModelLoadError>({
        name: 'EventModelLoadError',
        eventModelId: 'shark',
        message: expect.stringContaining('network failed'),
      }),
    );
    expect(disposeSpies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });

  it('disposes each instance and source resource once', async () => {
    const roots = completeRoots();
    const sourceSpies = EVENT_MODEL_IDS.flatMap((id) => {
      const mesh = roots[id].children[0] as Mesh;
      return [
        vi.spyOn(mesh.geometry, 'dispose'),
        vi.spyOn(mesh.material as MeshStandardMaterial, 'dispose'),
      ];
    });
    const library = await EventModelLibrary.load(EVENT_MODEL_IDS, loaderFrom(roots));
    const first = library.create('shark');
    const second = library.create('shark');
    const ownedMeshes = [first, second].map(
      (instance) => instance.root.children[0]!.children[0] as Mesh,
    );
    const ownedSpies = ownedMeshes.flatMap((mesh) => [
      vi.spyOn(mesh.geometry, 'dispose'),
      vi.spyOn(mesh.material as MeshStandardMaterial, 'dispose'),
    ]);

    first.dispose();
    first.dispose();
    second.dispose();
    library.dispose();
    library.dispose();

    expect([...sourceSpies, ...ownedSpies].every(
      (spy) => spy.mock.calls.length === 1,
    )).toBe(true);
  });

  it('deep-clones and disposes instance textures once', async () => {
    const sourceTexture = new Texture();
    const roots = completeRoots();
    roots.shark = modelRoot(
      new BoxGeometry(2, 1, 1),
      new MeshStandardMaterial({ map: sourceTexture }),
    );
    const sourceDispose = vi.spyOn(sourceTexture, 'dispose');
    const library = await EventModelLibrary.load(EVENT_MODEL_IDS, loaderFrom(roots));
    const first = library.create('shark');
    const second = library.create('shark');
    const firstTexture = (
      (first.root.children[0]!.children[0] as Mesh).material as MeshStandardMaterial
    ).map!;
    const secondTexture = (
      (second.root.children[0]!.children[0] as Mesh).material as MeshStandardMaterial
    ).map!;
    const firstDispose = vi.spyOn(firstTexture, 'dispose');
    const secondDispose = vi.spyOn(secondTexture, 'dispose');

    expect(firstTexture).not.toBe(sourceTexture);
    expect(secondTexture).not.toBe(sourceTexture);
    expect(firstTexture).not.toBe(secondTexture);

    first.dispose();
    first.dispose();
    library.dispose();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).not.toHaveBeenCalled();
    expect(sourceDispose).toHaveBeenCalledOnce();

    second.dispose();
    second.dispose();
    library.dispose();
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).toHaveBeenCalledOnce();
  });
});
