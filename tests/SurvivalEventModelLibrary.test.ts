// Importance: 5/5. Protects shared event model ownership and fallbacks.
import {
  BoxGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  SurvivalEventModelLibrary,
  type SurvivalEventModelLoader,
} from '../src/survival/SurvivalEventModelLibrary';
import {
  SURVIVAL_EVENT_MODEL_IDS,
} from '../src/survival/eventModelManifest';

function model(name: string): Group {
  const root = new Group();
  root.name = name;
  root.add(new Mesh(new BoxGeometry(2, 1, 1), new MeshStandardMaterial()));
  return root;
}

describe('SurvivalEventModelLibrary', () => {
  it('loads all templates and returns clones with shared resources', async () => {
    const loader: SurvivalEventModelLoader = {
      load: vi.fn(async (url: string): Promise<Object3D> => model(url)),
    };
    const library = await SurvivalEventModelLibrary.load(loader);

    expect(loader.load).toHaveBeenCalledTimes(SURVIVAL_EVENT_MODEL_IDS.length);
    const first = library.clone('driftingBottle');
    const second = library.clone('driftingBottle');
    expect(first).not.toBe(second);
    expect((first.getObjectByProperty('type', 'Mesh') as Mesh).geometry)
      .toBe((second.getObjectByProperty('type', 'Mesh') as Mesh).geometry);
    library.dispose();
  });

  it('uses a local fallback when one source fails', async () => {
    const loader: SurvivalEventModelLoader = {
      load: async (url) => {
        if (url.includes('mysteryChest')) throw new Error('offline');
        return model(url);
      },
    };
    const library = await SurvivalEventModelLibrary.load(loader);

    expect(library.clone('mysteryChest').userData.eventModelSource).toBe('fallback');
    expect(library.clone('driftingBottle').userData.eventModelSource).toBe('poly-pizza');
    library.dispose();
  });

  it('disposes each shared geometry and material once', async () => {
    const roots: Group[] = [];
    const loader: SurvivalEventModelLoader = {
      load: async (url) => {
        const root = model(url);
        roots.push(root);
        return root;
      },
    };
    const library = await SurvivalEventModelLibrary.load(loader);
    const geometries = roots.map((root) => (root.children[0] as Mesh).geometry);
    const materials = roots.map((root) => (root.children[0] as Mesh).material as Material);
    const geometrySpies = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialSpies = materials.map((material) => vi.spyOn(material, 'dispose'));

    library.dispose();
    library.dispose();

    geometrySpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    materialSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });
});
