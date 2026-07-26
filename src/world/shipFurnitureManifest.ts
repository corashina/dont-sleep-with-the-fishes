/// <reference types="vite/client" />

export const SHIP_FURNITURE_MODEL_IDS = [
  'barrel',
  'bedBunk',
  'desk',
  'chairDesk',
  'bookcaseOpen',
  'bookcaseClosedDoors',
  'cargoCrate',
  'cargoBox',
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
  barrel: {
    url: new URL('../assets/models/ship/barrel.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 1.15,
    canonicalSize: [1.129507, 1.15, 1.129507],
    ...sharedLimits,
  },
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
    scaleAxis: 'z',
    targetAxisLength: 0.841,
    canonicalSize: [0.310193, 0.289421, 0.841],
    ...sharedLimits,
  },
  bookcaseClosedDoors: {
    url: new URL('../assets/models/ship/bookcaseClosedDoors.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 1.85,
    canonicalSize: [0.871, 1.85, 0.544],
    ...sharedLimits,
  },
  cargoCrate: {
    url: new URL('../assets/models/ship/cargoCrate.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 1.05,
    canonicalSize: [1.05, 1.05, 1.05],
    ...sharedLimits,
  },
  cargoBox: {
    url: new URL('../assets/models/ship/cargoBox.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.55,
    canonicalSize: [0.623579, 0.55, 0.633173],
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
