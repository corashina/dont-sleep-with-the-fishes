import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  MenuModelLibrary,
  type MenuModelLoader,
} from '../src/menu/MenuModelLibrary';
import { MENU_MODEL_IDS } from '../src/menu/menuModelManifest';

function root(id: string): Group {
  const value = new Group();
  value.name = id;
  value.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map: new Texture() })));
  value.animations = id === 'shark'
    ? [new AnimationClip('Armature|Swim', 1.25, [
      new NumberKeyframeTrack('.rotation[y]', [0, 1.25], [0, 0.1]),
    ])]
    : [];
  return value;
}

describe('MenuModelLibrary', () => {
  it('loads every required model and clones independent roots', async () => {
    const loader: MenuModelLoader = {
      load: vi.fn(async (url) => root(url.includes('shark') ? 'shark' : url)),
    };
    const library = await MenuModelLibrary.load(loader);
    const first = library.create('boat');
    const second = library.create('boat');

    expect(loader.load).toHaveBeenCalledTimes(MENU_MODEL_IDS.length);
    expect(first.root).not.toBe(second.root);
    const firstMesh = first.root.children[0] as Mesh;
    const secondMesh = second.root.children[0] as Mesh;
    const firstMaterial = firstMesh.material as MeshBasicMaterial;
    const secondMaterial = secondMesh.material as MeshBasicMaterial;
    expect(firstMesh.geometry).toBe(secondMesh.geometry);
    expect(firstMaterial).toBe(secondMaterial);
    expect(firstMaterial.map).toBe(secondMaterial.map);
    first.dispose();
    second.dispose();
    library.dispose();
  });

  it('rejects a shark without Armature|Swim', async () => {
    const loader: MenuModelLoader = {
      load: async (url) => {
        const value = root(url);
        value.animations = [];
        return value;
      },
    };
    await expect(MenuModelLibrary.load(loader)).rejects.toEqual(
      expect.objectContaining({ menuModelId: 'shark' }),
    );
  });

  it('disposes loaded siblings after a load failure', async () => {
    const disposals: ReturnType<typeof vi.fn>[] = [];
    const loader: MenuModelLoader = {
      load: async (url) => {
        if (url.includes('shark')) throw new Error('network failed');
        const value = root(url);
        const mesh = value.children[0] as Mesh;
        const dispose = vi.fn();
        mesh.geometry.addEventListener('dispose', dispose);
        disposals.push(dispose);
        return value;
      },
    };

    await expect(MenuModelLibrary.load(loader)).rejects.toEqual(
      expect.objectContaining({ menuModelId: 'shark' }),
    );
    expect(disposals).toHaveLength(MENU_MODEL_IDS.length - 1);
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('disposes template resources once and prevents repeated instance disposal', async () => {
    let geometryDispose: ReturnType<typeof vi.fn> | undefined;
    let materialDispose: ReturnType<typeof vi.fn> | undefined;
    let textureDispose: ReturnType<typeof vi.fn> | undefined;
    const loader: MenuModelLoader = {
      load: async (url) => {
        const value = root(url.includes('shark') ? 'shark' : url);
        if (!url.includes('boat')) return value;
        const mesh = value.children[0] as Mesh;
        const material = mesh.material as MeshBasicMaterial;
        geometryDispose = vi.fn();
        materialDispose = vi.fn();
        textureDispose = vi.fn();
        mesh.geometry.addEventListener('dispose', geometryDispose);
        material.addEventListener('dispose', materialDispose);
        material.map!.addEventListener('dispose', textureDispose);
        return value;
      },
    };
    const library = await MenuModelLibrary.load(loader);
    const instance = library.create('boat');
    const parent = new Group();
    parent.add(instance.root);
    const removeFromParent = vi.spyOn(instance.root, 'removeFromParent');

    instance.dispose();
    instance.dispose();
    expect(removeFromParent).toHaveBeenCalledOnce();
    expect(instance.root.parent).toBeNull();
    library.dispose();
    library.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(() => library.create('boat')).toThrow('Menu model library is disposed');
  });
});
