/// <reference types="vite/client" />

import { Box3, Euler, Matrix4, Vector3 } from 'three';
import generatedMetadataJson from '../assets/models/events/event-model-metadata.json';
import type {
  GeneratedRuntimeModelMetadata,
  RuntimeModelSpec,
} from './itemModelManifest';

export const EVENT_MODEL_IDS = [
  'chestClosed',
  'midnightIsland',
  'deadTree',
  'traderRowboat',
  'riggedHand',
  'containerShip',
] as const;

export type EventModelId = typeof EVENT_MODEL_IDS[number];

export interface EventModelSpec extends RuntimeModelSpec {
  readonly sourceUrl: string;
  readonly sourceModelId: string;
  readonly license: 'CC0 1.0' | 'CC-BY 3.0';
  readonly translation: readonly [number, number, number];
}

type EventModelPresentation = Pick<
  EventModelSpec,
  'targetLongestDimension' | 'maxTriangles' | 'translation' | 'rotation'
> & Pick<EventModelSpec, 'sourceUrl' | 'sourceModelId' | 'license'>;

const presentations = {
  chestClosed: {
    sourceUrl: 'https://poly.pizza/m/AngpV0HxD8',
    sourceModelId: 'poly-pizza:0ae3f497-8628-4864-b5d4-e81ab14704f8',
    license: 'CC0 1.0',
    targetLongestDimension: 1.1,
    maxTriangles: 2_000,
    translation: [0, 0.55, 0],
    rotation: [0, 0, 0],
  },
  midnightIsland: {
    sourceUrl: 'https://poly.pizza/m/C03O8OQq6O',
    sourceModelId: 'poly-pizza:1fda6a0b-6228-4c16-9a3f-8ca36d9af6b6',
    license: 'CC-BY 3.0',
    targetLongestDimension: 18,
    maxTriangles: 200,
    translation: [0, -0.35, 0],
    rotation: [0, 0, 0],
  },
  deadTree: {
    sourceUrl: 'https://poly.pizza/m/CD4edbPSGm',
    sourceModelId: 'poly-pizza:4db29f97-8e10-413d-be54-39ecda1a7c8d',
    license: 'CC0 1.0',
    targetLongestDimension: 5.5,
    maxTriangles: 6_000,
    translation: [0, 2.75, 0],
    rotation: [0, 0, 0],
  },
  traderRowboat: {
    sourceUrl: 'https://poly.pizza/m/dt1yhb5AYXD',
    sourceModelId: 'poly-pizza:0c76d378-c3fb-4a1c-aa5f-a25f09bd3ea4',
    license: 'CC-BY 3.0',
    targetLongestDimension: 4.2,
    maxTriangles: 2_500,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  },
  riggedHand: {
    sourceUrl: 'https://poly.pizza/m/BEy8jbxm6A',
    sourceModelId: 'poly-pizza:a36ea2d8-8437-4215-98d3-2fa53be67d85',
    license: 'CC-BY 3.0',
    targetLongestDimension: 1.2,
    maxTriangles: 2_000,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  },
  containerShip: {
    sourceUrl: 'https://poly.pizza/m/3AmDGcCu6Ll',
    sourceModelId: 'poly-pizza:df197d9f-5d8c-4744-bc03-75ee514e8df3',
    license: 'CC-BY 3.0',
    targetLongestDimension: 36,
    maxTriangles: 2_500,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  },
} as const satisfies Readonly<Record<EventModelId, EventModelPresentation>>;

const generatedMetadata = generatedMetadataJson as unknown as Readonly<
  Partial<Record<EventModelId, GeneratedRuntimeModelMetadata>>
>;
const INVALID_METADATA: GeneratedRuntimeModelMetadata = Object.freeze({
  triangles: 0,
  rawBounds: Object.freeze({
    min: Object.freeze([0, 0, 0] as const),
    max: Object.freeze([0, 0, 0] as const),
  }),
});
const BOUNDS_EPSILON = 1e-9;

function generatedNormalization(
  metadata: GeneratedRuntimeModelMetadata,
  authored: EventModelPresentation,
) {
  const min = metadata.rawBounds?.min;
  const max = metadata.rawBounds?.max;
  if (
    !Array.isArray(min)
    || !Array.isArray(max)
    || min.length !== 3
    || max.length !== 3
    || ![...min, ...max].every(Number.isFinite)
    || !max.some((value, axis) => value > min[axis]!)
  ) {
    return {
      normalizedSize: [0, 0, 0] as const,
      normalizedBounds: {
        min: authored.translation,
        max: authored.translation,
      },
    };
  }

  const raw = new Box3(new Vector3(...min), new Vector3(...max));
  const corners = [
    new Vector3(raw.min.x, raw.min.y, raw.min.z),
    new Vector3(raw.min.x, raw.min.y, raw.max.z),
    new Vector3(raw.min.x, raw.max.y, raw.min.z),
    new Vector3(raw.min.x, raw.max.y, raw.max.z),
    new Vector3(raw.max.x, raw.min.y, raw.min.z),
    new Vector3(raw.max.x, raw.min.y, raw.max.z),
    new Vector3(raw.max.x, raw.max.y, raw.min.z),
    new Vector3(raw.max.x, raw.max.y, raw.max.z),
  ];
  const rotation = new Matrix4().makeRotationFromEuler(new Euler(...authored.rotation));
  const rotated = new Box3().setFromPoints(
    corners.map((point) => point.applyMatrix4(rotation)),
  );
  const size = rotated.getSize(new Vector3());
  const scale = authored.targetLongestDimension / Math.max(size.x, size.y, size.z);
  const normalizedSize = size.multiplyScalar(scale);
  const halfSize = normalizedSize.clone().multiplyScalar(0.5);
  const translation = new Vector3(...authored.translation);
  return {
    normalizedSize: normalizedSize.toArray() as [number, number, number],
    normalizedBounds: {
      min: halfSize.clone().multiplyScalar(-1).add(translation)
        .addScalar(-BOUNDS_EPSILON).toArray() as [number, number, number],
      max: halfSize.add(translation)
        .addScalar(BOUNDS_EPSILON).toArray() as [number, number, number],
    },
  };
}

function createEventModelSpec(id: EventModelId): EventModelSpec {
  const authored = presentations[id];
  const metadata = generatedMetadata[id] ?? INVALID_METADATA;
  return Object.freeze({
    url: new URL(`../assets/models/events/${id}.glb`, import.meta.url).href,
    ...authored,
    offset: authored.translation,
    ...generatedNormalization(metadata, authored),
    generatedMetadata: metadata,
  });
}

export const EVENT_MODEL_SPECS = Object.freeze(Object.fromEntries(
  EVENT_MODEL_IDS.map((id) => [id, createEventModelSpec(id)]),
)) as Readonly<Record<EventModelId, EventModelSpec>>;
