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
    min: [-0.36, -0.167995944, -0.086690118],
    max: [0.36, 0.307995944, 0.086690118],
  },
  ductTape: {
    min: [-0.276331326, -0.16113336, -0.31],
    max: [0.276331326, 0.16113336, 0.31],
  },
  fishingRod: {
    min: [-0.049159715, -0.058700467, -0.9],
    max: [0.049159715, 0.058700467, 0.9],
  },
  baitTin: {
    min: [-0.215327494, -0.17, -0.215327504],
    max: [0.215327494, 0.41, 0.215327504],
  },
  medicalKit: {
    min: [-0.36, -0.174063448, -0.129382124],
    max: [0.36, 0.314063448, 0.129382124],
  },
  waterJug: {
    min: [-0.135738786, -0.17, -0.135738837],
    max: [0.135738786, 0.61, 0.135738837],
  },
  cannedFood: {
    min: [-0.155926806, -0.17, -0.155926813],
    max: [0.155926806, 0.25, 0.155926813],
  },
  flashlight: {
    min: [-0.096927612, -0.17, -0.095455089],
    max: [0.096927612, 0.55, 0.095455089],
  },
  scubaSet: {
    min: [-0.535653676, -0.169785282, -0.55],
    max: [0.535653676, 0.669785282, 0.55],
  },
} as const satisfies Readonly<Record<ItemId, NormalizedPropBoundsFixture>>;

class CheckedInItemModelLoader implements ItemModelLoader {
  async load(url: string) {
    const id = ITEM_IDS.find((itemId) => ITEM_MODEL_SPECS[itemId].url === url);
    if (!id) throw new Error(`Unknown checked-in item model URL: ${url}`);
    const bytes = await readFile(resolve('src', 'assets', 'models', 'items', `${id}.glb`));
    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
    return new Promise<Awaited<ReturnType<ItemModelLoader['load']>>>((onLoad, onError) => {
      new GLTFLoader().parse(data, '', (gltf) => onLoad(gltf.scene), onError);
    });
  }
}

export function loadProductionPropModels(): Promise<PropModelLibrary> {
  return PropModelLibrary.load(new CheckedInItemModelLoader());
}
