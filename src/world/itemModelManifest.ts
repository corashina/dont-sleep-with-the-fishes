/// <reference types="vite/client" />

import { Box3, Euler, Matrix4, Vector3 } from 'three';
import assetLedger from '../../THIRD_PARTY_ASSETS.md?raw';
import generatedMetadataJson from '../assets/models/items/item-model-metadata.json';
import { ITEM_IDS, type ItemId } from '../game/ItemState';

export interface GeneratedRuntimeModelMetadata {
  readonly triangles: number;
  readonly rawBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export type RuntimeModelProvenance<ModelId extends string = string> =
  | {
      readonly kind: 'thirdParty';
      readonly sourceUrl: string;
      readonly sourceAssetId: string;
      readonly creator: 'Kenney' | 'Kenney + project' | 'Quaternius';
      readonly licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/';
    }
  | {
      readonly kind: 'project';
      readonly recipeId: `project-item-models@1:${ModelId}`;
      readonly creator: 'Project team';
    };

export interface RuntimeModelSpec<ModelId extends string = string> {
  readonly url: string;
  readonly targetLongestDimension: number;
  readonly normalizedSize: readonly [number, number, number];
  readonly normalizedBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly rotation: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly maxTriangles: number;
  readonly generatedMetadata: GeneratedRuntimeModelMetadata;
  readonly provenance: RuntimeModelProvenance<ModelId>;
}

export type GeneratedItemModelMetadata = GeneratedRuntimeModelMetadata;
export type ItemModelProvenance = RuntimeModelProvenance<ItemId>;
export type ItemModelSpec = RuntimeModelSpec<ItemId>;

export const ITEM_MODEL_ASSET_LEDGER = assetLedger;
export const ITEM_MODEL_MAX_TOTAL_TRIANGLES = 40_000;

export type RuntimeModelPresentation = Pick<
  RuntimeModelSpec,
  'targetLongestDimension' | 'rotation' | 'offset'
>;
type Presentation = RuntimeModelPresentation;
const presentation = {
  cannedFood: { targetLongestDimension: 0.42, rotation: [0, 0, 0], offset: [0, 0.04, 0] },
  baitTin: { targetLongestDimension: 0.48, rotation: [0, 0, 0], offset: [0, 0.12, 0] },
  ductTape: { targetLongestDimension: 0.55, rotation: [0, 0, 0], offset: [0, 0, 0] },
  compass: { targetLongestDimension: 0.48, rotation: [0, 0, 0], offset: [0, 0, 0] },
  map: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  medicalKit: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0.07, 0] },
  spyglass: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  fishingNet: { targetLongestDimension: 0.82, rotation: [0, 0, Math.PI / 2], offset: [0, 0, 0] },
  bucket: { targetLongestDimension: 0.68, rotation: [0, 0, 0], offset: [0, 0, 0] },
  flareGun: { targetLongestDimension: 0.68, rotation: [0, Math.PI / 2, 0], offset: [0, 0.07, 0] },
  scubaSet: { targetLongestDimension: 0.88, rotation: [0, 0, Math.PI / 2], offset: [0, 0.25, 0] },
  anchor: { targetLongestDimension: 0.88, rotation: [0, 0, 0], offset: [0, 0, 0] },
  bottledPaper: { targetLongestDimension: 0.62, rotation: [0, 0, Math.PI / 2], offset: [0, 0, 0] },
  umbrella: { targetLongestDimension: 0.90, rotation: [0, 0, Math.PI / 2], offset: [0, 0, 0] },
  swimRing: { targetLongestDimension: 0.70, rotation: [0, 0, 0], offset: [0, 0, 0] },
  flashlight: { targetLongestDimension: 0.72, rotation: [0, 0, Math.PI / 2], offset: [0, 0.19, 0] },
  harpoonGun: { targetLongestDimension: 1.00, rotation: [0, 0, 0], offset: [0, 0, 0] },
  energyBar: { targetLongestDimension: 0.48, rotation: [0, 0, 0], offset: [0, 0, 0] },
} as const satisfies Readonly<Record<ItemId, Presentation>>;

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/' as const;
const provenance = {
  cannedFood: { kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/food-kit', sourceAssetId: 'food-kit@2.0:Models/GLB format/can.glb', creator: 'Kenney', licenseUrl: CC0 },
  baitTin: { kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/food-kit', sourceAssetId: 'food-kit@2.0:Models/GLB format/can-small.glb', creator: 'Kenney', licenseUrl: CC0 },
  ductTape: { kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/prototype-kit', sourceAssetId: 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb', creator: 'Kenney', licenseUrl: CC0 },
  compass: { kind: 'thirdParty', sourceUrl: 'https://quaternius.com/packs/survival.html', sourceAssetId: 'quaternius-survival-pack@2020-09:OBJ/Compass_Open.obj', creator: 'Quaternius', licenseUrl: CC0 },
  map: { kind: 'project', recipeId: 'project-item-models@1:map', creator: 'Project team' },
  medicalKit: { kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/prototype-kit', sourceAssetId: 'prototype-kit@1.0:composite/medicalKit', creator: 'Kenney', licenseUrl: CC0 },
  spyglass: { kind: 'project', recipeId: 'project-item-models@1:spyglass', creator: 'Project team' },
  fishingNet: { kind: 'project', recipeId: 'project-item-models@1:fishingNet', creator: 'Project team' },
  bucket: { kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/survival-kit', sourceAssetId: 'survival-kit@2.0:Models/GLB format/bucket.glb', creator: 'Kenney', licenseUrl: CC0 },
  flareGun: { kind: 'thirdParty', sourceUrl: 'https://quaternius.com/packs/survival.html', sourceAssetId: 'quaternius-survival-pack@2020-09:OBJ/FlareGun.obj', creator: 'Quaternius', licenseUrl: CC0 },
  scubaSet: { kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/prototype-kit', sourceAssetId: 'prototype-kit@1.0:composite/scubaSet', creator: 'Kenney', licenseUrl: CC0 },
  anchor: { kind: 'thirdParty', sourceUrl: 'https://quaternius.com/packs/piratekit.html', sourceAssetId: 'quaternius-pirate-kit@2023-11:OBJ/Prop_Anchor.obj', creator: 'Quaternius', licenseUrl: CC0 },
  bottledPaper: { kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/survival-kit', sourceAssetId: 'survival-kit@2.0:composite/bottledPaper', creator: 'Kenney + project', licenseUrl: CC0 },
  umbrella: { kind: 'project', recipeId: 'project-item-models@1:umbrella', creator: 'Project team' },
  swimRing: { kind: 'project', recipeId: 'project-item-models@1:swimRing', creator: 'Project team' },
  flashlight: { kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/prototype-kit', sourceAssetId: 'prototype-kit@1.0:composite/flashlight', creator: 'Kenney', licenseUrl: CC0 },
  harpoonGun: { kind: 'project', recipeId: 'project-item-models@1:harpoonGun', creator: 'Project team' },
  energyBar: { kind: 'project', recipeId: 'project-item-models@1:energyBar', creator: 'Project team' },
} as const satisfies Readonly<Record<ItemId, ItemModelProvenance>>;

const generatedMetadata = generatedMetadataJson as unknown as Readonly<
  Record<string, GeneratedRuntimeModelMetadata>
>;
const BOUNDS_EPSILON = 1e-9;

function generatedNormalization(id: string, authored: RuntimeModelPresentation) {
  const metadata = generatedMetadata[id];
  if (metadata === undefined) throw new Error(`Missing generated model metadata: ${id}`);
  const raw = new Box3(
    new Vector3(...metadata.rawBounds.min),
    new Vector3(...metadata.rawBounds.max),
  );
  const corners = [
    new Vector3(raw.min.x, raw.min.y, raw.min.z), new Vector3(raw.min.x, raw.min.y, raw.max.z),
    new Vector3(raw.min.x, raw.max.y, raw.min.z), new Vector3(raw.min.x, raw.max.y, raw.max.z),
    new Vector3(raw.max.x, raw.min.y, raw.min.z), new Vector3(raw.max.x, raw.min.y, raw.max.z),
    new Vector3(raw.max.x, raw.max.y, raw.min.z), new Vector3(raw.max.x, raw.max.y, raw.max.z),
  ];
  const rotation = new Matrix4().makeRotationFromEuler(new Euler(...authored.rotation));
  const rotated = new Box3().setFromPoints(corners.map((point) => point.applyMatrix4(rotation)));
  const size = rotated.getSize(new Vector3());
  const scale = authored.targetLongestDimension / Math.max(size.x, size.y, size.z);
  const normalizedSize = size.multiplyScalar(scale);
  const halfSize = normalizedSize.multiplyScalar(0.5);
  return {
    normalizedSize: halfSize.clone().multiplyScalar(2).toArray() as [number, number, number],
    normalizedBounds: {
      min: halfSize.clone().multiplyScalar(-1).add(new Vector3(...authored.offset))
        .addScalar(-BOUNDS_EPSILON).toArray() as [number, number, number],
      max: halfSize.clone().add(new Vector3(...authored.offset))
        .addScalar(BOUNDS_EPSILON).toArray() as [number, number, number],
    },
  } as const;
}

export function createRuntimeModelSpec<ModelId extends string>(
  id: ModelId,
  authored: RuntimeModelPresentation,
  modelProvenance: RuntimeModelProvenance<ModelId>,
): RuntimeModelSpec<ModelId> {
  return Object.freeze({
    url: new URL(`../assets/models/items/${id}.glb`, import.meta.url).href,
    ...authored,
    ...generatedNormalization(id, authored),
    maxTriangles: 3_000,
    generatedMetadata: generatedMetadata[id]!,
    provenance: modelProvenance,
  });
}

export const ITEM_MODEL_SPECS = Object.freeze(Object.fromEntries(ITEM_IDS.map((id) => {
  return [id, createRuntimeModelSpec(id, presentation[id], provenance[id])];
})) as unknown as Readonly<Record<ItemId, ItemModelSpec>>);
