import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ITEM_IDS, type ItemId } from '../../src/game/ItemState';
import {
  PropModelLibrary,
  type ItemModelLoader,
} from '../../src/world/PropModelLibrary';
import { ITEM_MODEL_SPECS } from '../../src/world/itemModelManifest';

export interface NormalizedPropBoundsFixture {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export const PRODUCTION_NORMALIZED_PROP_BOUNDS = Object.freeze(Object.fromEntries(
  ITEM_IDS.map((id) => [id, ITEM_MODEL_SPECS[id].normalizedBounds]),
) as Readonly<Record<ItemId, NormalizedPropBoundsFixture>>);

class CheckedInItemModelLoader implements ItemModelLoader {
  async load(url: string) {
    const id = ITEM_IDS.find((itemId) => ITEM_MODEL_SPECS[itemId].url === url);
    if (!id) throw new Error(`Unknown checked-in item model URL: ${url}`);
    const bytes = await readFile(resolve('src', 'assets', 'models', 'items', `${id}.glb`));
    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
    // Three's embedded-image path expects the browser worker alias even when tests only need geometry.
    if (typeof globalThis.self === 'undefined') {
      Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });
    }
    return new Promise<Awaited<ReturnType<ItemModelLoader['load']>>>((onLoad, onError) => {
      new GLTFLoader().parse(data, '', (gltf) => onLoad(gltf.scene), onError);
    });
  }
}

export function loadProductionPropModels(): Promise<PropModelLibrary> {
  return PropModelLibrary.load(new CheckedInItemModelLoader());
}
