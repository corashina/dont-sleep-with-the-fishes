/// <reference types="vite/client" />

export const SHIP_FURNITURE_MODEL_IDS = [
  'bedBunk',
  'desk',
  'chairDesk',
  'bookcaseOpen',
  'bookcaseClosedDoors',
  'table',
  'sideTableDrawers',
] as const;

export type ShipFurnitureAssetId = typeof SHIP_FURNITURE_MODEL_IDS[number];
export type ShipFurnitureScaleAxis = 'x' | 'y' | 'z';

export interface ShipFurnitureModelSpec {
  readonly url: string;
  readonly scaleAxis: ShipFurnitureScaleAxis;
  readonly targetAxisLength: number;
  readonly canonicalSize: readonly [number, number, number];
  readonly boundsTolerance: number;
  readonly maxTriangles: number;
}

export const SHIP_FURNITURE_MAX_TOTAL_TRIANGLES = 8_000;

const sharedLimits = {
  boundsTolerance: 0.002,
  maxTriangles: 1_000,
} as const;

export const SHIP_FURNITURE_MODEL_SPECS = {
  bedBunk: {
    url: new URL('../assets/models/ship/bedBunk.glb', import.meta.url).href,
    scaleAxis: 'z',
    targetAxisLength: 2.2,
    canonicalSize: [1.147, 1.708, 2.2],
    ...sharedLimits,
  },
  desk: {
    url: new URL('../assets/models/ship/desk.glb', import.meta.url).href,
    scaleAxis: 'x',
    targetAxisLength: 1.7,
    canonicalSize: [1.7, 0.89, 0.908],
    ...sharedLimits,
  },
  chairDesk: {
    url: new URL('../assets/models/ship/chairDesk.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 1,
    canonicalSize: [0.551, 1, 0.517],
    ...sharedLimits,
  },
  bookcaseOpen: {
    url: new URL('../assets/models/ship/bookcaseOpen.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 1.85,
    canonicalSize: [0.841, 1.85, 0.526],
    ...sharedLimits,
  },
  bookcaseClosedDoors: {
    url: new URL('../assets/models/ship/bookcaseClosedDoors.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 1.85,
    canonicalSize: [0.871, 1.85, 0.544],
    ...sharedLimits,
  },
  table: {
    url: new URL('../assets/models/ship/table.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.82,
    canonicalSize: [2.112, 0.82, 1.123],
    ...sharedLimits,
  },
  sideTableDrawers: {
    url: new URL('../assets/models/ship/sideTableDrawers.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.75,
    canonicalSize: [1.043, 0.75, 0.434],
    ...sharedLimits,
  },
} as const satisfies Readonly<Record<ShipFurnitureAssetId, ShipFurnitureModelSpec>>;
