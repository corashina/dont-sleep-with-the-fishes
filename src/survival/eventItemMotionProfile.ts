import type { ItemId } from '../game/ItemState';

export type EventItemHoldZone = 'one-hand' | 'large' | 'reading';
export type EventItemAimMode = 'none' | 'entity' | 'horizontal-entity';
export type EventItemMass = 'light' | 'medium' | 'heavy';

export interface EventItemMotionProfile {
  readonly holdZone: EventItemHoldZone;
  readonly view: readonly [number, number, number];
  readonly grip: readonly [number, number, number];
  readonly aim: EventItemAimMode;
  readonly forward: readonly [number, number, number];
  readonly actionOrigin: readonly [number, number, number];
  readonly mass: EventItemMass;
}

const HOLD_ZONES = {
  'one-hand': [0.32, -0.38, -0.68],
  large: [0.08, -0.42, -0.85],
  reading: [0, -0.32, -0.72],
} as const;

const GRIPS = {
  'one-hand': [0.32, -0.72, -0.76],
  large: [0.08, -0.78, -0.92],
  reading: [0, -0.68, -0.74],
} as const;

const ENTITY_AIMED: ReadonlySet<ItemId> = new Set([
  'flashlight', 'fishingNet', 'shotgun',
]);

const HEAVY_ITEMS: ReadonlySet<ItemId> = new Set(['anchor', 'scubaSet']);
const MEDIUM_ITEMS: ReadonlySet<ItemId> = new Set([
  'medicalKit', 'fishingNet', 'bucket', 'umbrella', 'swimRing',
  'shotgun', 'captainWhiskers',
]);

function createProfile(
  holdZone: EventItemHoldZone,
  itemId: ItemId,
): EventItemMotionProfile {
  return Object.freeze({
    holdZone,
    view: HOLD_ZONES[holdZone],
    grip: GRIPS[holdZone],
    aim: ENTITY_AIMED.has(itemId) ? 'entity' : 'none',
    forward: [0, 0, -1] as const,
    actionOrigin: [0, 0, 0] as const,
    mass: HEAVY_ITEMS.has(itemId)
      ? 'heavy'
      : MEDIUM_ITEMS.has(itemId) ? 'medium' : 'light',
  });
}

const PROFILES: Readonly<Record<ItemId, EventItemMotionProfile>> = Object.freeze({
  cannedFood: createProfile('one-hand', 'cannedFood'),
  baitTin: createProfile('one-hand', 'baitTin'),
  ductTape: createProfile('one-hand', 'ductTape'),
  compass: Object.freeze({
    ...createProfile('one-hand', 'compass'),
    view: [0, -0.1, -0.44] as const,
  }),
  map: createProfile('reading', 'map'),
  medicalKit: createProfile('one-hand', 'medicalKit'),
  spyglass: createProfile('reading', 'spyglass'),
  fishingNet: createProfile('large', 'fishingNet'),
  bucket: createProfile('large', 'bucket'),
  flareGun: Object.freeze({
    ...createProfile('one-hand', 'flareGun'),
    view: [0.3, -0.3, -0.78] as const,
    aim: 'none' as const,
    forward: [1, 0, 0] as const,
  }),
  scubaSet: createProfile('one-hand', 'scubaSet'),
  anchor: createProfile('large', 'anchor'),
  bottledPaper: createProfile('one-hand', 'bottledPaper'),
  umbrella: createProfile('large', 'umbrella'),
  swimRing: createProfile('large', 'swimRing'),
  flashlight: Object.freeze({
    ...createProfile('one-hand', 'flashlight'),
    view: [0.3, -0.3, -0.78] as const,
    aim: 'horizontal-entity' as const,
    forward: [1, 0, 0] as const,
  }),
  shotgun: Object.freeze({
    ...createProfile('large', 'shotgun'),
    view: [0.18, -0.32, -0.78] as const,
    aim: 'horizontal-entity' as const,
  }),
  energyBar: createProfile('one-hand', 'energyBar'),
  captainWhiskers: createProfile('one-hand', 'captainWhiskers'),
});

export function eventItemMotionProfile(itemId: ItemId): EventItemMotionProfile {
  return PROFILES[itemId] ?? PROFILES.cannedFood;
}
