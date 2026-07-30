/// <reference types="vite/client" />

import sharkMenMetadataJson from '../assets/models/events/event-model-metadata.json';
import type {
  GeneratedRuntimeModelMetadata,
  RuntimeModelSpec,
} from './itemModelManifest';

export const EVENT_MODEL_IDS = Object.freeze(['sharkMenShark'] as const);
export type EventModelId = typeof EVENT_MODEL_IDS[number];

export type EventRuntimeModelSpec = Pick<
  RuntimeModelSpec,
  | 'url'
  | 'maxTriangles'
  | 'targetLongestDimension'
  | 'offset'
  | 'rotation'
  | 'generatedMetadata'
>;

const sharkMenMetadata = sharkMenMetadataJson.sharkMenShark as unknown as GeneratedRuntimeModelMetadata;

export const EVENT_MODEL_SPECS: Readonly<Record<EventModelId, EventRuntimeModelSpec>> =
  Object.freeze({
    sharkMenShark: Object.freeze({
      url: new URL(
        '../assets/models/events/sharkMenShark.glb',
        import.meta.url,
      ).href,
      maxTriangles: 12_000,
      targetLongestDimension: 2.8,
      offset: [0, 0, 0] as const,
      rotation: [0, 0, 0] as const,
      generatedMetadata: sharkMenMetadata,
    }),
  });
