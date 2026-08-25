export const ITEM_IDS = [
  'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'medicalKit',
  'spyglass', 'fishingNet', 'rope', 'bucket', 'flareGun', 'scubaSet', 'anchor',
  'radio', 'umbrella', 'swimRing', 'flashlight', 'shotgun',
  'energyBar', 'carlitos',
] as const;

export type ItemId = typeof ITEM_IDS[number];
export type ItemInstanceId = `${ItemId}-${number}`;
export const EVENT_CHOICE_EXCLUDED_ITEM_IDS: readonly ItemId[] = Object.freeze([
  'radio',
]);
export type ItemDayAction =
  | 'dive' | 'eat' | 'treat' | 'repairItem'
  | 'answerRadio' | 'useEnergyBar' | null;
export interface ItemDefinition {
  readonly label: string;
  readonly weight: 1 | 2 | 3;
  readonly spawnCount: number;
  readonly charges: number | null;
  readonly durable: boolean;
  readonly breakable: boolean;
  readonly dayAction: ItemDayAction;
  readonly modelId: ItemId;
  readonly artworkId: ItemId;
}

const define = (
  label: string,
  weight: 1 | 2 | 3,
  spawnCount: number,
  charges: number | null,
  durable: boolean,
  breakable: boolean,
  dayAction: ItemDayAction,
): ItemDefinition => ({
  label, weight, spawnCount, charges, durable, breakable, dayAction,
  modelId: '' as ItemId, artworkId: '' as ItemId,
});

const rawDefinitions = {
  cannedFood: define('FOOD', 1, 3, 1, false, false, 'eat'),
  baitTin: define('BAIT', 1, 2, 1, false, false, null),
  ductTape: define('DUCT TAPE', 1, 1, 1, false, false, 'repairItem'),
  compass: define('COMPASS', 1, 1, null, true, true, null),
  map: define('MAP', 1, 1, null, true, true, null),
  medicalKit: define('MEDKIT', 2, 1, 1, false, false, 'treat'),
  spyglass: define('BINOCULARS', 1, 1, null, true, true, null),
  fishingNet: define('FISHING NET', 2, 1, null, true, true, null),
  rope: define('ROPE', 2, 1, null, true, true, null),
  bucket: define('BUCKET', 2, 1, null, true, true, null),
  flareGun: define('FLARE GUN', 1, 1, 1, false, false, null),
  scubaSet: define('SCUBA GEAR', 3, 1, null, true, true, 'dive'),
  anchor: define('ANCHOR', 3, 1, null, true, true, null),
  radio: define('RADIO', 1, 1, null, true, false, 'answerRadio'),
  umbrella: define('UMBRELLA', 2, 1, null, true, true, null),
  swimRing: define('SWIM RING', 2, 1, null, true, true, null),
  flashlight: define('FLASHLIGHT', 1, 1, null, true, false, null),
  shotgun: define('SHOTGUN', 2, 1, 1, false, false, null),
  energyBar: define('ENERGY BAR', 1, 1, 1, false, false, 'useEnergyBar'),
  carlitos: define(
    'CARLITOS', 2, 1, null, true, false, null,
  ),
} satisfies Record<ItemId, ItemDefinition>;

export const ITEM_DEFINITIONS = Object.freeze(Object.fromEntries(
  ITEM_IDS.map((id) => [
    id,
    Object.freeze({ ...rawDefinitions[id], modelId: id, artworkId: id }),
  ]),
) as Record<ItemId, ItemDefinition>);

const APPROVED_SPAWN_COUNTS = {
  cannedFood: 3,
  baitTin: 2,
  ductTape: 1,
  compass: 1,
  map: 1,
  medicalKit: 1,
  spyglass: 1,
  fishingNet: 1,
  rope: 1,
  bucket: 1,
  flareGun: 1,
  scubaSet: 1,
  anchor: 1,
  radio: 1,
  umbrella: 1,
  swimRing: 1,
  flashlight: 1,
  shotgun: 1,
  energyBar: 1,
  carlitos: 1,
} as const satisfies Record<ItemId, number>;

export const ITEM_LABELS = Object.freeze(Object.fromEntries(
  ITEM_IDS.map((id) => [id, ITEM_DEFINITIONS[id].label]),
) as Record<ItemId, string>);

export const itemDefinition = (id: ItemId): ItemDefinition => ITEM_DEFINITIONS[id];

export function createItemInstances(): Array<{
  readonly instanceId: ItemInstanceId;
  readonly type: ItemId;
}> {
  return ITEM_IDS.flatMap((type) => Array.from(
    { length: ITEM_DEFINITIONS[type].spawnCount },
    (_, index) => ({ instanceId: `${type}-${index + 1}` as ItemInstanceId, type }),
  ));
}

export function validateItemCatalog(
  ids: readonly string[] = ITEM_IDS,
  definitions: Readonly<Record<string, ItemDefinition>> = ITEM_DEFINITIONS,
): void {
  const errors: string[] = [];
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) errors.push('item IDs must be unique');

  const definitionKeys = Object.keys(definitions);
  const missingKeys = [...uniqueIds].filter((id) => !(id in definitions));
  const excessKeys = definitionKeys.filter((id) => !uniqueIds.has(id));
  if (missingKeys.length > 0) errors.push(`missing definitions: ${missingKeys.join(', ')}`);
  if (excessKeys.length > 0) errors.push(`excess definitions: ${excessKeys.join(', ')}`);

  for (const id of uniqueIds) {
    const definition = definitions[id];
    if (definition === undefined) continue;
    if (!Number.isInteger(definition.spawnCount) || definition.spawnCount < 1) {
      errors.push(`${id} spawn count must be at least one`);
    }
    if (![1, 2, 3].includes(definition.weight)) {
      errors.push(`${id} weight must be between one and three`);
    }
    if (definition.charges !== null
      && (!Number.isFinite(definition.charges) || definition.charges < 1)) {
      errors.push(`${id} non-null charges must be at least one`);
    }
    if (definition.durable && definition.charges !== null) {
      errors.push(`${id} cannot be durable and charged`);
    }
    if (definition.breakable && !definition.durable) {
      errors.push(`${id} cannot be breakable without durability`);
    }
    if (definition.modelId !== id) errors.push(`${id} model ID must match its item ID`);
    if (definition.artworkId !== id) errors.push(`${id} artwork ID must match its item ID`);
    if (APPROVED_SPAWN_COUNTS[id as ItemId] !== definition.spawnCount) {
      errors.push(`${id} spawn count differs from the approved contract`);
    }
  }

  const total = definitionKeys.reduce(
    (sum, id) => sum + (definitions[id]?.spawnCount ?? 0),
    0,
  );
  if (total !== 23) errors.push(`catalog must create exactly 23 instances, received ${total}`);
  if (errors.length > 0) throw new Error(`Invalid item catalog: ${errors.join('; ')}`);
}

validateItemCatalog();
