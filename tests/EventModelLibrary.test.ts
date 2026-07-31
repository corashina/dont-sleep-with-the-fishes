import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  EventModelLibrary,
  EventModelLoadError,
  type EventModelLoader,
} from '../src/survival/EventModelLibrary';
import { EVENT_MODEL_IDS } from '../src/survival/eventModelManifest';

const validRoot = (): Group => {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()));
  return root;
};

describe('EventModelLibrary', () => {
  it('loads every event model and creates isolated clones', async () => {
    const load = vi.fn(async () => ({ scene: validRoot(), animations: [] }));
    const library = await EventModelLibrary.load({ load } satisfies EventModelLoader);
    expect(load).toHaveBeenCalledTimes(EVENT_MODEL_IDS.length);
    const first = library.create('ghost');
    const second = library.create('ghost');
    expect(first).not.toBe(second);
    expect((first.children[0] as Mesh).geometry)
      .not.toBe((second.children[0] as Mesh).geometry);
    expect((first.children[0] as Mesh).material)
      .not.toBe((second.children[0] as Mesh).material);
    library.dispose();
  });

  it('reports the failing event model id', async () => {
    const loader: EventModelLoader = {
      load: async (url) => {
        if (url.includes('ghost')) throw new Error('missing');
        return { scene: validRoot(), animations: [] };
      },
    };
    await expect(EventModelLibrary.load(loader))
      .rejects.toBeInstanceOf(EventModelLoadError);
  });

  it('disposes each source template exactly once', async () => {
    const roots = EVENT_MODEL_IDS.map(() => validRoot());
    const disposeSpies = roots.flatMap((root) => {
      const mesh = root.children[0] as Mesh;
      return [
        vi.spyOn(mesh.geometry, 'dispose'),
        vi.spyOn(mesh.material as MeshBasicMaterial, 'dispose'),
      ];
    });
    let nextRoot = 0;
    const library = await EventModelLibrary.load({
      load: async () => ({ scene: roots[nextRoot++]!, animations: [] }),
    });

    library.dispose();
    library.dispose();

    disposeSpies.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
