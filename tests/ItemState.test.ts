import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  createItemInstances,
  validateItemCatalog,
  type ItemDefinition,
} from '../src/game/ItemState';

type MutableItemDefinition = {
  -readonly [Key in keyof ItemDefinition]: ItemDefinition[Key];
};

const EXPECTED = {
  cannedFood: [3, 1], baitTin: [2, 1], ductTape: [1, 1], compass: [1, 1],
  map: [1, 1], medicalKit: [1, 2], spyglass: [1, 1], fishingNet: [1, 2],
  bucket: [1, 2], flareGun: [1, 1], scubaSet: [1, 3], anchor: [1, 3],
  bottledPaper: [1, 1], umbrella: [1, 2], swimRing: [1, 2], flashlight: [1, 1],
  harpoonGun: [1, 2], energyBar: [1, 1],
} as const;

describe('physical item catalog', () => {
  it('defines exactly the approved Dorothy types, counts, and weights', () => {
    expect(ITEM_IDS).toEqual(Object.keys(EXPECTED));
    expect(Object.fromEntries(ITEM_IDS.map((id) => [
      id,
      [ITEM_DEFINITIONS[id].spawnCount, ITEM_DEFINITIONS[id].weight],
    ]))).toEqual(EXPECTED);
    expect(ITEM_IDS).not.toContain('waterJug');
    expect(ITEM_IDS).not.toContain('repairKit');
    expect(ITEM_IDS).not.toContain('chest');
    expect(ITEM_IDS).not.toContain('fishingRod');
    expect(ITEM_IDS).toHaveLength(18);
  });

  it('creates twenty-one stable unique physical instances', () => {
    const instances = createItemInstances();
    expect(instances).toHaveLength(21);
    expect(new Set(instances.map(({ instanceId }) => instanceId))).toHaveLength(21);
    expect(instances.filter(({ type }) => type === 'cannedFood')).toHaveLength(3);
    expect(instances.filter(({ type }) => type === 'baitTin')).toHaveLength(2);
    expect(instances.filter(({ type }) => type === 'ductTape')).toEqual([
      { instanceId: 'ductTape-1', type: 'ductTape' },
    ]);
  });

  it('validates every canonical catalog invariant', () => {
    const definitions = () => structuredClone(ITEM_DEFINITIONS) as Record<
      string,
      MutableItemDefinition
    >;
    const expectRejected = (
      mutateIds: (ids: string[]) => void,
      mutateDefinitions: (catalog: Record<string, MutableItemDefinition>) => void,
    ) => {
      const ids = [...ITEM_IDS] as string[];
      const catalog = definitions();
      mutateIds(ids);
      mutateDefinitions(catalog);
      expect(() => validateItemCatalog(ids, catalog)).toThrow();
    };

    expect(() => validateItemCatalog()).not.toThrow();
    expectRejected((ids) => ids.push(ids[0]!), () => undefined);
    expectRejected(() => undefined, (catalog) => { delete catalog.anchor; });
    expectRejected(() => undefined, (catalog) => { catalog.extra = catalog.anchor!; });
    expectRejected(() => undefined, (catalog) => { catalog.anchor!.spawnCount = 0; });
    expectRejected(() => undefined, (catalog) => { catalog.anchor!.weight = 4 as 3; });
    expectRejected(() => undefined, (catalog) => { catalog.cannedFood!.charges = 0; });
    expectRejected(() => undefined, (catalog) => { catalog.cannedFood!.durable = true; });
    expectRejected(() => undefined, (catalog) => {
      catalog.compass!.durable = false;
      catalog.compass!.breakable = true;
    });
    expectRejected(() => undefined, (catalog) => { catalog.anchor!.modelId = 'map'; });
    expectRejected(() => undefined, (catalog) => { catalog.anchor!.artworkId = 'map'; });
    expectRejected(() => undefined, (catalog) => { catalog.anchor!.spawnCount = 2; });
    expectRejected(() => undefined, (catalog) => {
      catalog.cannedFood!.spawnCount = 2;
      catalog.baitTin!.spawnCount = 3;
    });
  });
});
