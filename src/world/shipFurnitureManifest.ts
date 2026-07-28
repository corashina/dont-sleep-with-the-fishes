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
  'crewNightStand',
  'crewDesk',
  'crewCabinet',
  'crewCeilingLight',
  'crewWallPainting',
  'crewWallArt',
  'crewTable',
  'wheelhouseCorkboard',
  'workroomCardboardBox',
  'workroomStorageShelf',
  'workroomPallet',
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
  crewNightStand: {
    url: new URL('../assets/models/ship/crewNightStand.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.62,
    canonicalSize: [0.624577, 0.62, 0.624577],
    ...sharedLimits,
  },
  crewDesk: {
    url: new URL('../assets/models/ship/crewDesk.glb', import.meta.url).href,
    scaleAxis: 'x',
    targetAxisLength: 1.6,
    canonicalSize: [1.6, 0.554137, 0.796331],
    ...sharedLimits,
  },
  crewCabinet: {
    url: new URL('../assets/models/ship/crewCabinet.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 1.35,
    canonicalSize: [1.36025, 1.35, 0.81829],
    ...sharedLimits,
  },
  crewCeilingLight: {
    url: new URL('../assets/models/ship/crewCeilingLight.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.48,
    canonicalSize: [0.171113, 0.48, 0.169371],
    ...sharedLimits,
  },
  crewWallPainting: {
    url: new URL('../assets/models/ship/crewWallPainting.glb', import.meta.url).href,
    scaleAxis: 'x',
    targetAxisLength: 1.2,
    canonicalSize: [1.2, 0.099984, 1.386343],
    ...sharedLimits,
  },
  crewWallArt: {
    url: new URL('../assets/models/ship/crewWallArt.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.95,
    canonicalSize: [0.576404, 0.95, 0.032023],
    ...sharedLimits,
  },
  crewTable: {
    url: new URL('../assets/models/ship/crewTable.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.72,
    canonicalSize: [1.836937, 0.72, 1.836937],
    ...sharedLimits,
  },
  wheelhouseCorkboard: {
    url: new URL('../assets/models/ship/wheelhouseCorkboard.glb', import.meta.url).href,
    scaleAxis: 'x',
    targetAxisLength: 1.25,
    canonicalSize: [1.25, 0.863261, 0.050239],
    ...sharedLimits,
  },
  workroomCardboardBox: {
    url: new URL('../assets/models/ship/workroomCardboardBox.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.45,
    canonicalSize: [0.407462, 0.45, 0.407397],
    ...sharedLimits,
  },
  workroomStorageShelf: {
    url: new URL('../assets/models/ship/workroomStorageShelf.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 1.8,
    canonicalSize: [1.317857, 1.8, 0.514286],
    ...sharedLimits,
  },
  workroomPallet: {
    url: new URL('../assets/models/ship/workroomPallet.glb', import.meta.url).href,
    scaleAxis: 'y',
    targetAxisLength: 0.18,
    canonicalSize: [0.568017, 0.18, 0.568017],
    ...sharedLimits,
  },
} as const satisfies Readonly<Record<ShipFurnitureAssetId, ShipFurnitureModelSpec>>;
