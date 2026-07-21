export type FishingCatchId =
  | 'cod' | 'flounder' | 'salmon' | 'tuna' | 'crab' | 'squid'
  | 'sardine' | 'bass' | 'herring' | 'redSnapper' | 'mackerel'
  | 'clownfish' | 'swordfish' | 'seaweed' | 'boot' | 'plasticBottle';

export type FishingCatchKind = 'fish' | 'junk';
export type FishingCatchSize = 'small' | 'large' | 'junk';
export type FishingModelFamily =
  | 'ordinaryFish' | 'flatfish' | 'crab' | 'squid' | 'swordfish'
  | 'seaweed' | 'boot' | 'bottle';

export interface FishingAppearance {
  readonly color: number;
  readonly accentColor: number;
  readonly length: number;
  readonly height: number;
  readonly width: number;
}

export interface FishingCatchDefinition {
  readonly id: FishingCatchId;
  readonly label: string;
  readonly kind: FishingCatchKind;
  readonly baseWeight: number;
  readonly minimumDay: number;
  readonly food: 0 | 1 | 2;
  readonly size: FishingCatchSize;
  readonly family: FishingModelFamily;
  readonly appearance: FishingAppearance;
}

export interface WeightedFishingCatch {
  readonly catch: FishingCatchDefinition;
  readonly weight: number;
}

const catalogRows: readonly FishingCatchDefinition[] = [
  { id: 'cod', label: 'Cod', kind: 'fish', baseWeight: 20, minimumDay: 0, food: 1, size: 'small', family: 'ordinaryFish', appearance: { color: 0x8ca6ad, accentColor: 0xe6dfc9, length: 1.05, height: 0.34, width: 0.28 } },
  { id: 'flounder', label: 'Flounder', kind: 'fish', baseWeight: 15, minimumDay: 0, food: 1, size: 'small', family: 'flatfish', appearance: { color: 0x8c7c5c, accentColor: 0xc7b586, length: 0.9, height: 0.16, width: 0.56 } },
  { id: 'salmon', label: 'Salmon', kind: 'fish', baseWeight: 24, minimumDay: 0, food: 1, size: 'small', family: 'ordinaryFish', appearance: { color: 0xd4775b, accentColor: 0x3f6d83, length: 1.1, height: 0.36, width: 0.3 } },
  { id: 'tuna', label: 'Tuna', kind: 'fish', baseWeight: 5, minimumDay: 3, food: 2, size: 'large', family: 'ordinaryFish', appearance: { color: 0x3e6f87, accentColor: 0xcbd6d5, length: 1.65, height: 0.55, width: 0.48 } },
  { id: 'crab', label: 'Crab', kind: 'fish', baseWeight: 14, minimumDay: 2, food: 1, size: 'small', family: 'crab', appearance: { color: 0xa74e38, accentColor: 0xe7a45d, length: 0.78, height: 0.42, width: 0.7 } },
  { id: 'squid', label: 'Squid', kind: 'fish', baseWeight: 7, minimumDay: 3, food: 2, size: 'large', family: 'squid', appearance: { color: 0xb7a6c8, accentColor: 0x604977, length: 1.45, height: 0.62, width: 0.38 } },
  { id: 'sardine', label: 'Sardine', kind: 'fish', baseWeight: 45, minimumDay: 0, food: 1, size: 'small', family: 'ordinaryFish', appearance: { color: 0x7593ae, accentColor: 0xd0d8d4, length: 0.68, height: 0.22, width: 0.18 } },
  { id: 'bass', label: 'Bass', kind: 'fish', baseWeight: 30, minimumDay: 0, food: 1, size: 'small', family: 'ordinaryFish', appearance: { color: 0x5c7a42, accentColor: 0xd6bb68, length: 1.05, height: 0.36, width: 0.3 } },
  { id: 'herring', label: 'Herring', kind: 'fish', baseWeight: 20, minimumDay: 0, food: 1, size: 'small', family: 'ordinaryFish', appearance: { color: 0x8ca4b4, accentColor: 0xdfe4de, length: 0.83, height: 0.26, width: 0.2 } },
  { id: 'redSnapper', label: 'Red Snapper', kind: 'fish', baseWeight: 20, minimumDay: 0, food: 1, size: 'small', family: 'ordinaryFish', appearance: { color: 0xc95045, accentColor: 0xf0b08a, length: 0.95, height: 0.32, width: 0.27 } },
  { id: 'mackerel', label: 'Mackerel', kind: 'fish', baseWeight: 15, minimumDay: 0, food: 1, size: 'small', family: 'ordinaryFish', appearance: { color: 0x4c798b, accentColor: 0xcad0b3, length: 0.86, height: 0.28, width: 0.23 } },
  { id: 'clownfish', label: 'Clownfish', kind: 'fish', baseWeight: 1, minimumDay: 0, food: 1, size: 'small', family: 'ordinaryFish', appearance: { color: 0xe8803d, accentColor: 0xf4f0d3, length: 0.58, height: 0.24, width: 0.18 } },
  { id: 'swordfish', label: 'Swordfish', kind: 'fish', baseWeight: 1, minimumDay: 0, food: 2, size: 'large', family: 'swordfish', appearance: { color: 0x466d83, accentColor: 0x9bc2cf, length: 2, height: 0.62, width: 0.4 } },
  { id: 'seaweed', label: 'Seaweed', kind: 'junk', baseWeight: 82, minimumDay: 0, food: 0, size: 'junk', family: 'seaweed', appearance: { color: 0x456e4b, accentColor: 0x8daa5d, length: 0.62, height: 0.95, width: 0.22 } },
  { id: 'boot', label: 'Boot', kind: 'junk', baseWeight: 72, minimumDay: 0, food: 0, size: 'junk', family: 'boot', appearance: { color: 0x5b4637, accentColor: 0x2f2926, length: 0.72, height: 0.76, width: 0.36 } },
  { id: 'plasticBottle', label: 'Plastic Bottle', kind: 'junk', baseWeight: 60, minimumDay: 0, food: 0, size: 'junk', family: 'bottle', appearance: { color: 0x507b82, accentColor: 0xc7d7c7, length: 0.3, height: 0.86, width: 0.3 } },
];

function validateCatalog(catches: readonly FishingCatchDefinition[]): void {
  const ids = new Set<FishingCatchId>();
  for (const catchDefinition of catches) {
    if (ids.has(catchDefinition.id)) throw new Error(`Duplicate fishing catch id: ${catchDefinition.id}`);
    ids.add(catchDefinition.id);
    if (!Number.isFinite(catchDefinition.baseWeight) || catchDefinition.baseWeight <= 0) throw new Error(`Invalid fishing catch weight: ${catchDefinition.id}`);
    if (!Number.isInteger(catchDefinition.minimumDay) || catchDefinition.minimumDay < 0) throw new Error(`Invalid fishing minimum day: ${catchDefinition.id}`);
    if (![0, 1, 2].includes(catchDefinition.food)) throw new Error(`Invalid fishing food value: ${catchDefinition.id}`);
    if (catchDefinition.kind === 'junk' && catchDefinition.food !== 0) throw new Error(`Junk must award no food: ${catchDefinition.id}`);
    const { length, height, width } = catchDefinition.appearance;
    if (![length, height, width].every((dimension) => Number.isFinite(dimension) && dimension > 0)) throw new Error(`Invalid fishing catch dimensions: ${catchDefinition.id}`);
  }
}

validateCatalog(catalogRows);

export const FISHING_CATCHES: readonly FishingCatchDefinition[] = Object.freeze(catalogRows.map((catchDefinition) => Object.freeze({
  ...catchDefinition,
  appearance: Object.freeze({ ...catchDefinition.appearance }),
})));

function baitWeight(catchDefinition: FishingCatchDefinition, capturedBait: boolean): number {
  if (!capturedBait || catchDefinition.kind === 'junk') return catchDefinition.baseWeight;
  return catchDefinition.size === 'small' ? catchDefinition.baseWeight * 2 : catchDefinition.baseWeight * 3;
}

export function eligibleFishingCatches(day: number, capturedBait: boolean): readonly WeightedFishingCatch[] {
  return FISHING_CATCHES
    .filter((catchDefinition) => catchDefinition.minimumDay <= day)
    .map((catchDefinition) => Object.freeze({ catch: catchDefinition, weight: baitWeight(catchDefinition, capturedBait) }));
}

export function selectFishingCatch(day: number, capturedBait: boolean, roll: number): FishingCatchDefinition {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('Fishing roll must be finite and in [0, 1).');
  const eligible = eligibleFishingCatches(day, capturedBait);
  const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = roll * totalWeight;
  for (const entry of eligible) {
    threshold -= entry.weight;
    if (threshold < 0) return entry.catch;
  }
  throw new Error('No eligible fishing catches.');
}

export function isFishCatch(value: FishingCatchDefinition): boolean {
  return value.kind === 'fish';
}
