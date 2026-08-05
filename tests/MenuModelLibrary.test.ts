import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  MenuModelLibrary,
  MenuModelLoadError,
  type MenuModelLoader,
} from '../src/menu/MenuModelLibrary';
import { MENU_MODEL_IDS } from '../src/menu/menuModelManifest';

function root(id: string): Group {
  const value = new Group();
  value.name = id;
  value.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
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

  it('removes disposed instances and rejects use after disposal', async () => {
    const loader: MenuModelLoader = {
      load: async (url) => root(url.includes('shark') ? 'shark' : url),
    };
    const library = await MenuModelLibrary.load(loader);
    const instance = library.create('boat');
    const parent = new Group();
    parent.add(instance.root);

    instance.dispose();
    instance.dispose();
    expect(instance.root.parent).toBeNull();
    library.dispose();
    library.dispose();
    expect(() => library.create('boat')).toThrow('Menu model library is disposed');
  });
});
