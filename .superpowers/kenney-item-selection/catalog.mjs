export const ITEM_IDS = Object.freeze([
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
]);

export function candidateKey(itemId, candidateId) {
  return `${itemId}--${candidateId}`;
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${path} must be a non-empty string`);
}

export function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object') throw new Error('catalog must be an object');
  if (!catalog.packs || typeof catalog.packs !== 'object') throw new Error('packs must be an object');
  if (!catalog.items || typeof catalog.items !== 'object') throw new Error('items must be an object');

  const itemKeys = Object.keys(catalog.items).sort();
  const expectedKeys = [...ITEM_IDS].sort();
  if (JSON.stringify(itemKeys) !== JSON.stringify(expectedKeys)) throw new Error('catalog must contain the nine runtime item IDs');

  for (const [packId, pack] of Object.entries(catalog.packs)) {
    requireString(pack.pageUrl, `packs.${packId}.pageUrl`);
    if (!/^https:\/\/(www\.)?kenney\.nl\/assets\//.test(pack.pageUrl)) throw new Error(`${packId} must use an official Kenney asset page`);
    requireString(pack.version, `packs.${packId}.version`);
    requireString(pack.archiveUrl, `packs.${packId}.archiveUrl`);
    if (!/^https:\/\/(www\.)?kenney\.nl\//.test(pack.archiveUrl)) throw new Error(`${packId} archive must use kenney.nl`);
    if (!/^[A-Fa-f0-9]{64}$/.test(pack.sha256)) throw new Error(`${packId} must pin a SHA-256`);
    if (!Array.isArray(pack.requiredEntries) || pack.requiredEntries.length < 2) throw new Error(`${packId} must list approved archive entries`);
  }

  for (const itemId of ITEM_IDS) {
    const choices = catalog.items[itemId];
    if (!Array.isArray(choices) || choices.length !== 4) throw new Error(`${itemId} must contain current plus three candidates`);
    if (choices[0].id !== 'current' || choices[0].kind !== 'current') throw new Error(`${itemId} must start with the current model`);
    for (const choice of choices) {
      for (const field of ['id', 'label', 'kind', 'sourceUrl', 'sourceAssetId', 'modelFile', 'fit']) requireString(choice[field], `${itemId}.${choice.id}.${field}`);
      if (!/^https:\/\/(www\.)?kenney\.nl\/assets\//.test(choice.sourceUrl)) throw new Error(`${itemId}.${choice.id} must use an official Kenney asset page`);
      if (!Number.isInteger(choice.triangles) || choice.triangles < 1 || choice.triangles > 3000) throw new Error(`${itemId}.${choice.id} exceeds the 3,000 triangle budget`);
      if (choice.kind !== 'current' && choice.kind !== 'direct' && choice.kind !== 'composite') throw new Error(`${itemId}.${choice.id} has an invalid kind`);
      if (choice.kind !== 'current' && !choice.recipe) throw new Error(`${itemId}.${choice.id} requires a reproducible recipe`);
    }
  }
}
