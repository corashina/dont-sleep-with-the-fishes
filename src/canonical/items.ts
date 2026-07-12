import { WIKI_SOURCES } from './sources';
import { source, type Provenance, type Sourced } from './types';

export const RUNTIME_ITEM_IDS = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit', 'waterJug',
  'cannedFood', 'flashlight', 'scubaSet', 'compass', 'map', 'telescope',
  'fishingNet', 'bucket', 'anchor', 'umbrella', 'swimRing', 'harpoonGun',
  'energyBar', 'repairKit', 'chest',
] as const;

export type RuntimeItemId = (typeof RUNTIME_ITEM_IDS)[number];
export type CanonicalDayAction =
  | 'fish' | 'dive' | 'eat' | 'repair' | 'treat' | 'rest' | null;

export interface CanonicalItemDefinition {
  label: Sourced<string>;
  weight: Sourced<1 | 2 | 3>;
  spawnCount: Sourced<number>;
  charges: Sourced<number | null>;
  durable: Sourced<boolean>;
  builtIn: boolean;
  dayAction: CanonicalDayAction;
  description: string;
}

export interface RuntimeItemDefinition {
  label: string;
  weight: 1 | 2 | 3;
  spawnCount: number;
  charges: number | null;
  durable: boolean;
  builtIn: boolean;
  dayAction: CanonicalDayAction;
  description: string;
}

const WIKI_ITEMS = WIKI_SOURCES.items.url;
const PRESERVED_ITEMS = 'preserved:pre-parity-item-catalog';
const APPROVED_DEFAULTS = 'approved-default:new-ship-item-weight-and-spawn-count';

const preserved = <T>(value: T): Sourced<T> =>
  source(value, 'preserved', PRESERVED_ITEMS);
const wiki = <T>(value: T): Sourced<T> => source(value, 'wiki', WIKI_ITEMS);
const approvedDefault = <T>(value: T): Sourced<T> =>
  source(value, 'default', APPROVED_DEFAULTS);

function preservedItem(
  label: string,
  weight: 1 | 2 | 3,
  spawnCount: number,
  charges: number | null,
  durable: boolean,
  dayAction: CanonicalDayAction,
  description: string,
  labelProvenance: Provenance = 'wiki',
): CanonicalItemDefinition {
  return {
    label: source(label, labelProvenance, labelProvenance === 'wiki' ? WIKI_ITEMS : PRESERVED_ITEMS),
    weight: preserved(weight),
    spawnCount: preserved(spawnCount),
    charges: preserved(charges),
    durable: preserved(durable),
    builtIn: false,
    dayAction,
    description,
  };
}

function newShipItem(
  label: string,
  charges: number | null,
  durable: boolean,
  description: string,
): CanonicalItemDefinition {
  return {
    label: wiki(label),
    weight: approvedDefault(1),
    spawnCount: approvedDefault(1),
    charges: wiki(charges),
    durable: wiki(durable),
    builtIn: false,
    dayAction: null,
    description,
  };
}

export const CANONICAL_ITEMS: Readonly<Record<RuntimeItemId, CanonicalItemDefinition>> = {
  flareGun: preservedItem(
    'FLARE GUN', 1, 1, 1, false, null,
    'Signals distant sightings and may frighten a threat.',
  ),
  ductTape: preservedItem(
    'DUCT TAPE', 1, 2, 2, false, 'repair',
    'Patches leaks and reinforces emergency repairs.',
  ),
  fishingRod: preservedItem(
    'FISHING ROD', 2, 1, null, true, 'fish',
    'Improves attempts to catch fish for food.',
  ),
  baitTin: preservedItem(
    'BAIT TIN', 1, 2, 3, false, null,
    'Improves the odds of catching fish.',
  ),
  medicalKit: preservedItem(
    'MEDICAL KIT', 2, 1, 2, false, 'treat',
    'Treats injuries and restores health.',
  ),
  waterJug: preservedItem(
    'WATER JUG', 2, 2, 3, false, 'rest',
    'Helps in heat and supplies water for rest.',
    'preserved',
  ),
  cannedFood: preservedItem(
    'CANNED FOOD', 1, 3, 1, false, 'eat',
    'Relieves hunger when eaten.',
  ),
  flashlight: preservedItem(
    'FLASHLIGHT', 1, 1, null, true, null,
    'Illuminates dark inspections and safer diving.',
  ),
  scubaSet: preservedItem(
    'SCUBA SET', 3, 1, null, true, 'dive',
    'Enables safe dives beneath the lifeboat.',
  ),
  compass: newShipItem(
    'COMPASS', null, true,
    'Provides a reliable heading when landmarks disappear.',
  ),
  map: newShipItem(
    'MAP', null, true,
    'Charts nearby waters and routes through drifting hazards.',
  ),
  telescope: newShipItem(
    'SPYGLASS', null, true,
    'Extends sight across the horizon for distant landmarks.',
  ),
  fishingNet: newShipItem(
    'FISHING NET', null, true,
    'Collects fish and floating supplies near the lifeboat.',
  ),
  bucket: newShipItem(
    'BUCKET', null, true,
    'Bails water and carries loose supplies.',
  ),
  anchor: newShipItem(
    'ANCHOR', null, true,
    'Keeps the lifeboat from drifting in rough water.',
  ),
  umbrella: newShipItem(
    'UMBRELLA', null, true,
    'Offers cover from sun and rain.',
  ),
  swimRing: newShipItem(
    'SWIM RING', null, true,
    'Provides flotation during dangerous water crossings.',
  ),
  harpoonGun: newShipItem(
    'HARPOON GUN', 1, false,
    'Provides a one-use defense against threats in the water.',
  ),
  energyBar: newShipItem(
    'ENERGY BAR', 1, false,
    'Provides a one-use ration for quick energy.',
  ),
  repairKit: {
    label: wiki('REPAIR KIT'),
    weight: approvedDefault(1),
    spawnCount: source(0, 'wiki', WIKI_ITEMS, 'Built into the lifeboat.'),
    charges: preserved(null),
    durable: preserved(true),
    builtIn: true,
    dayAction: 'repair',
    description: 'Built into the lifeboat for hull repairs.',
  },
  chest: newShipItem(
    'CHEST', 1, false,
    'Stores a one-time cache of supplies recovered from the ship.',
  ),
};

const PROVENANCE_VALUES: readonly Provenance[] = ['wiki', 'preserved', 'default'];

export function validateCanonicalItems(
  runtimeIds: readonly string[] = RUNTIME_ITEM_IDS,
  catalog: Readonly<Record<string, CanonicalItemDefinition>> = CANONICAL_ITEMS,
): void {
  if (new Set(runtimeIds).size !== runtimeIds.length) {
    throw new Error('canonical item runtime IDs contain duplicates');
  }

  for (const id of runtimeIds) {
    const item = catalog[id];
    if (!item) throw new Error(`canonical item ${id} has no catalog record`);
    if (item.label.value.trim().length === 0) {
      throw new Error(`canonical item ${id}.label is blank`);
    }

    const fields = {
      label: item.label,
      weight: item.weight,
      spawnCount: item.spawnCount,
      charges: item.charges,
      durable: item.durable,
    } as const;
    for (const [fieldName, field] of Object.entries(fields)) {
      if (!PROVENANCE_VALUES.includes(field.provenance)) {
        throw new Error(`canonical item ${id}.${fieldName} has invalid provenance`);
      }
      if (field.source.trim().length === 0) {
        throw new Error(`canonical item ${id}.${fieldName} has no source`);
      }
    }

    if (!Number.isInteger(item.weight.value) || item.weight.value < 1 || item.weight.value > 3) {
      throw new Error(`canonical item ${id}.weight is invalid`);
    }
    if (!Number.isInteger(item.spawnCount.value) || item.spawnCount.value < 0) {
      throw new Error(`canonical item ${id}.spawnCount is invalid`);
    }
    if (item.charges.value !== null
      && (!Number.isInteger(item.charges.value) || item.charges.value < 1)) {
      throw new Error(`canonical item ${id}.charges is invalid`);
    }
    if (typeof item.durable.value !== 'boolean') {
      throw new Error(`canonical item ${id}.durable is invalid`);
    }
    if (item.builtIn && item.spawnCount.value !== 0) {
      throw new Error(`canonical item ${id} is built in but has ship spawns`);
    }
  }
}

export function runtimeItemDefinition(id: RuntimeItemId): RuntimeItemDefinition {
  const item = CANONICAL_ITEMS[id];
  return {
    label: item.label.value,
    weight: item.weight.value,
    spawnCount: item.spawnCount.value,
    charges: item.charges.value,
    durable: item.durable.value,
    builtIn: item.builtIn,
    dayAction: item.dayAction,
    description: item.description,
  };
}

const moduleEnvironment = (import.meta as ImportMeta & {
  env?: { DEV?: boolean; MODE?: string };
}).env;
if (moduleEnvironment?.DEV || moduleEnvironment?.MODE === 'test') validateCanonicalItems();
