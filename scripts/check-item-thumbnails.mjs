import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const thumbnailsDir = resolve('src', 'assets', 'models', 'item-thumbnails');

async function itemIds() {
  const source = await readFile(resolve('src', 'game', 'itemCatalog.ts'), 'utf8');
  const declaration = /export const ITEM_IDS = \[([\s\S]*?)\] as const;/.exec(source)?.[1];
  if (!declaration) throw new Error('Unable to read runtime ITEM_IDS');
  return [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function validatePng(filePath, bytes) {
  if (bytes.byteLength < 33) throw new Error(`${filePath}: file is too short`);
  if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    throw new Error(`${filePath}: invalid PNG signature`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || new TextDecoder().decode(bytes.subarray(12, 16)) !== 'IHDR') {
    throw new Error(`${filePath}: missing IHDR chunk`);
  }
  if (view.getUint32(16) !== 256 || view.getUint32(20) !== 256) {
    throw new Error(`${filePath}: expected 256x256 image`);
  }
  if (bytes[25] !== 6) throw new Error(`${filePath}: expected RGBA color type 6`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function loadItemIds(errors) {
  try {
    return await itemIds();
  } catch (error) {
    errors.push(errorMessage(error));
    return [];
  }
}

async function loadEntries(errors) {
  try {
    return await readdir(thumbnailsDir, { withFileTypes: true });
  } catch (error) {
    errors.push(errorMessage(error));
    return [];
  }
}

function validateEntries(ids, entries, errors) {
  const expected = new Set(ids.map((id) => `${id}.png`));
  const actual = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  for (const entry of entries) {
    if (!entry.isFile() || !expected.has(entry.name)) errors.push(`unexpected thumbnail entry: ${entry.name}`);
  }
  for (const fileName of expected) {
    if (!actual.has(fileName)) errors.push(`missing thumbnail: ${fileName}`);
  }
}

async function validateThumbnails(ids, errors) {
  for (const id of ids) {
    const filePath = resolve(thumbnailsDir, `${id}.png`);
    try {
      validatePng(filePath, await readFile(filePath));
      console.log(`${id}.png`);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
}

function reportErrors(errors) {
  if (errors.length > 0) {
    errors.forEach((error) => console.error(`ERROR: ${error}`));
    process.exitCode = 1;
  }
}

async function main() {
  const errors = [];
  const ids = await loadItemIds(errors);
  const entries = await loadEntries(errors);
  validateEntries(ids, entries, errors);
  await validateThumbnails(ids, errors);
  reportErrors(errors);
}

await main();
