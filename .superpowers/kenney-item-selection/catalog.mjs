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

function requireTriangleCount(value, path) {
  if (!Number.isInteger(value) || value < 1 || value > 3000) throw new Error(`${path} must be an integer within the 3,000 triangle budget`);
}

function requireNumberArray(value, length, path) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
    throw new Error(`${path} must contain ${length} finite numbers`);
  }
}

function requirePackEntry(packs, packId, entry, path) {
  requireString(packId, `${path}.pack`);
  if (!Object.hasOwn(packs, packId)) throw new Error(`${path}.pack references unknown pack ${packId}`);
  requireString(entry, `${path}.entry`);
  if (!packs[packId].requiredEntries.includes(entry)) throw new Error(`${path}.entry must reference an approved archive entry`);
}

function validateRecipe(recipe, choiceKind, packs, path) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error(`${path} requires a reproducible recipe`);
  requireString(recipe.kind, `${path}.recipe.kind`);
  if (recipe.kind !== choiceKind) throw new Error(`${path} recipe kind must match choice kind`);
  requireTriangleCount(recipe.expectedTriangles, `${path}.recipe.expectedTriangles`);

  if (choiceKind === 'direct') {
    requirePackEntry(packs, recipe.pack, recipe.entry, `${path}.recipe`);
    return;
  }

  if (!Array.isArray(recipe.parts) || recipe.parts.length === 0) throw new Error(`${path}.recipe.parts must contain at least one part`);
  for (const [partIndex, part] of recipe.parts.entries()) {
    const partPath = `${path}.recipe.parts.${partIndex}`;
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw new Error(`${partPath} must be an object`);
    requireString(part.name, `${partPath}.name`);
    requirePackEntry(packs, part.pack, part.entry, partPath);
    requireNumberArray(part.translation, 3, `${partPath}.translation`);
    requireNumberArray(part.rotation, 4, `${partPath}.rotation`);
    requireNumberArray(part.scale, 3, `${partPath}.scale`);
    requireNumberArray(part.color, 4, `${partPath}.color`);
  }
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
    }
    if (choices.filter((choice) => choice.kind === 'current').length !== 1) throw new Error(`${itemId} must contain exactly one current choice and three non-current alternatives`);
    if (new Set(choices.map((choice) => choice.id)).size !== choices.length) throw new Error(`${itemId} must use unique choice IDs`);
    for (const choice of choices) {
      if (choice.kind !== 'current') validateRecipe(choice.recipe, choice.kind, catalog.packs, `${itemId}.${choice.id}`);
    }
  }
}
