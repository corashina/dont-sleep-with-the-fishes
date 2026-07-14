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

export const PRODUCTION_NORMALIZED_PROP_BOUNDS = {
  flareGun: {
    min: [-0.36, -0.115595999, -0.095610057],
    max: [0.36, 0.255595999, 0.095610057],
  },
  ductTape: {
    min: [-0.275, -0.275, -0.09625],
    max: [0.275, 0.275, 0.09625],
  },
  fishingRod: {
    min: [-0.050769230769, -0.032307692308, -0.9],
    max: [0.050769230769, 0.032307692308, 0.9],
  },
  baitTin: {
    min: [-0.24, -0.008897803, -0.24],
    max: [0.24, 0.248897803, 0.24],
  },
  medicalKit: {
    min: [-0.36, -0.182, -0.1224],
    max: [0.36, 0.322, 0.1224],
  },
  waterJug: {
    min: [-0.196390751, -0.17, -0.226772491],
    max: [0.196390751, 0.61, 0.226772491],
  },
  cannedFood: {
    min: [-0.196875012, -0.17, -0.196875012],
    max: [0.196875012, 0.25, 0.196875012],
  },
  flashlight: {
    min: [-0.0864, -0.17, -0.1008],
    max: [0.0864, 0.55, 0.1008],
  },
  scubaSet: {
    min: [-0.225641026, -0.19, -0.139145299],
    max: [0.225641026, 0.69, 0.139145299],
  },
} as const satisfies Readonly<Record<ItemId, NormalizedPropBoundsFixture>>;

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
