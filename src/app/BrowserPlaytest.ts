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

function readPlaytest(params: URLSearchParams): boolean {
  const values = params.getAll('playtest');
  if (values.length === 0) return false;
  if (values.length !== 1 || values[0] !== 'survival') invalid('playtest');
  return true;
}

function readSeed(params: URLSearchParams): number {
  const values = params.getAll('seed');
  if (values.length !== 1) invalid('seed');
  const raw = values[0];
  if (raw === undefined || !/^(?:0|[1-9]\d*)$/.test(raw)) invalid('seed');
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed) || seed > MAX_SEED) invalid('seed');
  return seed;
}

function readMissingItemIds(
  params: URLSearchParams,
): readonly [ItemInstanceId, ItemInstanceId] {
  const values = params.getAll('missing');
  if (values.length !== 2 || values[0] === values[1]) invalid('missing');

  const catalogIds: ReadonlySet<string> = new Set(
    createItemInstances().map(({ instanceId }) => instanceId),
  );
  if (values.some((id) => !catalogIds.has(id))) invalid('missing');
  return Object.freeze(values as [ItemInstanceId, ItemInstanceId]);
}

export function parseBrowserPlaytest(
  search: string,
  enabled: boolean,
): BrowserPlaytestStartup | null {
  if (!enabled) return null;

  const params = new URLSearchParams(search);
  if (!readPlaytest(params)) return null;
  const seed = readSeed(params);
  const missingItemIds = readMissingItemIds(params);
  const savedItems = Object.freeze(createItemInstances()
    .filter(({ instanceId }) => !missingItemIds.includes(instanceId))
    .map((item) => Object.freeze(item)));

  return Object.freeze({ seed, missingItemIds, savedItems });
}
