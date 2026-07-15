import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKenneyItemModels } from '../../scripts/kenney-item-models.mjs';
import { candidateKey, ITEM_IDS, validateCatalog } from './catalog.mjs';

export function recipesFromCatalog(catalog) {
  return Object.fromEntries(ITEM_IDS.flatMap((itemId) =>
    catalog.items[itemId]
      .filter(({ kind }) => kind !== 'current')
      .map(({ id, recipe }) => [candidateKey(itemId, id), recipe]),
  ));
}

export async function copyCurrentModels({ sourceRoot, outputRoot }) {
  for (const itemId of ITEM_IDS) {
    await copyFile(
      resolve(sourceRoot, `${itemId}.glb`),
      resolve(outputRoot, `${candidateKey(itemId, 'current')}.glb`),
    );
  }
}

export async function buildSelectionModels(root = fileURLToPath(new URL('.', import.meta.url))) {
  const catalog = JSON.parse(await readFile(resolve(root, 'selection-catalog.json'), 'utf8'));
  validateCatalog(catalog);
  const outputRoot = resolve(root, 'models');
  await mkdir(outputRoot, { recursive: true });
  await copyCurrentModels({
    sourceRoot: resolve(root, '../../src/assets/models/items'),
    outputRoot,
  });
  await buildKenneyItemModels({
    sourceRoot: resolve(root, 'sources'),
    outputRoot,
    recipes: recipesFromCatalog(catalog),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSelectionModels();
}
