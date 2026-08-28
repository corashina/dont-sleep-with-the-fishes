import { createItemInstances } from '../game/itemCatalog';
import type { ItemInstance, ItemInstanceId } from '../game/ItemState';

export interface BrowserPlaytestStartup {
  readonly seed: number;
  readonly missingItemIds: readonly [
    ItemInstanceId,
    ItemInstanceId,
  ];
  readonly savedItems: readonly ItemInstance[];
}

export class BrowserPlaytestInputError extends Error {
  constructor(readonly parameter: string) {
    super(`Invalid browser playtest parameter: ${parameter}.`);
    this.name = 'BrowserPlaytestInputError';
  }
}

const MAX_SEED = 2 ** 32 - 1;

function invalid(parameter: string): never {
  throw new BrowserPlaytestInputError(parameter);
}

export function parseBrowserPlaytest(
  search: string,
  development: boolean,
): BrowserPlaytestStartup | null {
  if (!development) return null;

  const params = new URLSearchParams(search);
  const playtest = params.get('playtest');
  if (playtest === null) return null;
  if (params.getAll('playtest').length !== 1) invalid('playtest');
  if (playtest !== 'survival') invalid('playtest');

  const seedValues = params.getAll('seed');
  if (seedValues.length !== 1) invalid('seed');
  const rawSeed = seedValues[0];
  if (rawSeed === undefined || !/^(?:0|[1-9]\d*)$/.test(rawSeed)) invalid('seed');
  const seed = Number(rawSeed);
  if (!Number.isSafeInteger(seed) || seed > MAX_SEED) invalid('seed');

  const missingValues = params.getAll('missing');
  if (missingValues.length !== 2) invalid('missing');
  if (missingValues[0] === missingValues[1]) invalid('missing');

  const catalogIds: ReadonlySet<string> = new Set(
    createItemInstances().map(({ instanceId }) => instanceId),
  );
  if (missingValues.some((id) => !catalogIds.has(id))) invalid('missing');

  const missingItemIds = Object.freeze(missingValues as [ItemInstanceId, ItemInstanceId]);
  const savedItems = Object.freeze(createItemInstances()
    .filter(({ instanceId }) => !missingItemIds.includes(instanceId))
    .map((item) => Object.freeze(item)));

  return Object.freeze({ seed, missingItemIds, savedItems });
}
