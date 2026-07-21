import { describe, expect, it } from 'vitest';
import {
  FISHING_CATCHES,
  eligibleFishingCatches,
  isFishCatch,
  selectFishingCatch,
} from '../src/survival/fishingCatalog';

const expectedCatalog = [
  ['cod', 'Cod', 'fish', 20, 0, 1, 'small', 'ordinaryFish', 0x8ca6ad, 0xe6dfc9, 1.05, 0.34, 0.28],
  ['flounder', 'Flounder', 'fish', 15, 0, 1, 'small', 'flatfish', 0x8c7c5c, 0xc7b586, 0.9, 0.16, 0.56],
  ['salmon', 'Salmon', 'fish', 24, 0, 1, 'small', 'ordinaryFish', 0xd4775b, 0x3f6d83, 1.1, 0.36, 0.3],
  ['tuna', 'Tuna', 'fish', 5, 3, 2, 'large', 'ordinaryFish', 0x3e6f87, 0xcbd6d5, 1.65, 0.55, 0.48],
  ['crab', 'Crab', 'fish', 14, 2, 1, 'small', 'crab', 0xa74e38, 0xe7a45d, 0.78, 0.42, 0.7],
  ['squid', 'Squid', 'fish', 7, 3, 2, 'large', 'squid', 0xb7a6c8, 0x604977, 1.45, 0.62, 0.38],
  ['sardine', 'Sardine', 'fish', 45, 0, 1, 'small', 'ordinaryFish', 0x7593ae, 0xd0d8d4, 0.68, 0.22, 0.18],
  ['bass', 'Bass', 'fish', 30, 0, 1, 'small', 'ordinaryFish', 0x5c7a42, 0xd6bb68, 1.05, 0.36, 0.3],
  ['herring', 'Herring', 'fish', 20, 0, 1, 'small', 'ordinaryFish', 0x8ca4b4, 0xdfe4de, 0.83, 0.26, 0.2],
  ['redSnapper', 'Red Snapper', 'fish', 20, 0, 1, 'small', 'ordinaryFish', 0xc95045, 0xf0b08a, 0.95, 0.32, 0.27],
  ['mackerel', 'Mackerel', 'fish', 15, 0, 1, 'small', 'ordinaryFish', 0x4c798b, 0xcad0b3, 0.86, 0.28, 0.23],
  ['clownfish', 'Clownfish', 'fish', 1, 0, 1, 'small', 'ordinaryFish', 0xe8803d, 0xf4f0d3, 0.58, 0.24, 0.18],
  ['swordfish', 'Swordfish', 'fish', 1, 0, 2, 'large', 'swordfish', 0x466d83, 0x9bc2cf, 2, 0.62, 0.4],
  ['seaweed', 'Seaweed', 'junk', 82, 0, 0, 'junk', 'seaweed', 0x456e4b, 0x8daa5d, 0.62, 0.95, 0.22],
  ['boot', 'Boot', 'junk', 72, 0, 0, 'junk', 'boot', 0x5b4637, 0x2f2926, 0.72, 0.76, 0.36],
  ['plasticBottle', 'Plastic Bottle', 'junk', 60, 0, 0, 'junk', 'bottle', 0x507b82, 0xc7d7c7, 0.3, 0.86, 0.3],
] as const;

describe('fishing catch catalog', () => {
  it('exposes every approved catch in its authored order', () => {
    expect(FISHING_CATCHES.map(({ id }) => id)).toEqual(expectedCatalog.map(([id]) => id));
    expect(FISHING_CATCHES.map((catchDefinition) => [
      catchDefinition.id,
      catchDefinition.label,
      catchDefinition.kind,
      catchDefinition.baseWeight,
      catchDefinition.minimumDay,
      catchDefinition.food,
      catchDefinition.size,
      catchDefinition.family,
      catchDefinition.appearance.color,
      catchDefinition.appearance.accentColor,
      catchDefinition.appearance.length,
      catchDefinition.appearance.height,
      catchDefinition.appearance.width,
    ])).toEqual(expectedCatalog);
  });

  it('contains exactly the approved fish and junk pools', () => {
    expect(FISHING_CATCHES.filter(isFishCatch)).toHaveLength(13);
    expect(FISHING_CATCHES.filter((entry) => entry.kind === 'junk')).toHaveLength(3);
    expect(FISHING_CATCHES.map(({ id }) => id)).not.toContain('fishlet');
    expect(FISHING_CATCHES.map(({ id }) => id)).not.toContain('worms');
  });

  it('freezes catalog rows and authored appearance objects', () => {
    expect(Object.isFrozen(FISHING_CATCHES)).toBe(true);
    expect(FISHING_CATCHES.every(Object.isFrozen)).toBe(true);
    expect(FISHING_CATCHES.every(({ appearance }) => Object.isFrozen(appearance))).toBe(true);
  });

  it('excludes catches until their minimum day', () => {
    expect(eligibleFishingCatches(1, false).map(({ catch: entry }) => entry.id)).not.toContain('crab');
    expect(eligibleFishingCatches(2, false).map(({ catch: entry }) => entry.id)).toContain('crab');
    expect(eligibleFishingCatches(2, false).map(({ catch: entry }) => entry.id)).not.toEqual(expect.arrayContaining(['tuna', 'squid']));
    expect(eligibleFishingCatches(3, false).map(({ catch: entry }) => entry.id)).toEqual(expectedCatalog.map(([id]) => id));
  });

  it('applies the captured bait multipliers to eligible catches', () => {
    const withoutBait = eligibleFishingCatches(3, false);
    const withBait = eligibleFishingCatches(3, true);
    expect(withoutBait.filter(({ catch: entry }) => entry.kind === 'fish').reduce((sum, { weight }) => sum + weight, 0)).toBe(217);
    expect(withoutBait.filter(({ catch: entry }) => entry.kind === 'junk').reduce((sum, { weight }) => sum + weight, 0)).toBe(214);
    expect(withBait.filter(({ catch: entry }) => entry.kind === 'fish').reduce((sum, { weight }) => sum + weight, 0)).toBe(447);
    expect(withBait.filter(({ catch: entry }) => entry.kind === 'junk').reduce((sum, { weight }) => sum + weight, 0)).toBe(214);
    expect(withBait.map(({ catch: entry, weight }) => [entry.id, weight])).toEqual([
      ['cod', 40], ['flounder', 30], ['salmon', 48], ['tuna', 15], ['crab', 28], ['squid', 21],
      ['sardine', 90], ['bass', 60], ['herring', 40], ['redSnapper', 40], ['mackerel', 30],
      ['clownfish', 2], ['swordfish', 3], ['seaweed', 82], ['boot', 72], ['plasticBottle', 60],
    ]);
  });

  it('selects deterministic weighted boundaries and rejects invalid rolls', () => {
    expect(selectFishingCatch(0, false, 0).id).toBe('cod');
    expect(selectFishingCatch(0, false, 20 / 405 - Number.EPSILON).id).toBe('cod');
    expect(selectFishingCatch(0, false, 20 / 405).id).toBe('flounder');
    expect(selectFishingCatch(0, false, 191 / 405 - Number.EPSILON).id).toBe('swordfish');
    expect(selectFishingCatch(0, false, 191 / 405).id).toBe('seaweed');
    expect(selectFishingCatch(0, false, 1 - Number.EPSILON).id).toBe('plasticBottle');
    expect(selectFishingCatch(3, true, 0.72)).toBe(selectFishingCatch(3, true, 0.72));
    for (const roll of [-0.01, 1, Infinity, NaN]) {
      expect(() => selectFishingCatch(0, false, roll)).toThrow();
    }
  });
});
