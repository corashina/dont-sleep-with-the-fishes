import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ITEM_IDS, validateCatalog } from './catalog.mjs';

export function requireExactModelFiles(expectedFiles, actualFiles) {
  const expected = new Set(expectedFiles);
  const actual = new Set(actualFiles);
  const duplicate = expectedFiles.find((file, index) => expectedFiles.indexOf(file) !== index);
  if (duplicate) throw new Error(`duplicate catalog model file: ${duplicate}`);
  const unexpected = actualFiles.filter((file) => !expected.has(file)).sort();
  if (unexpected.length > 0) throw new Error(`unexpected model file: ${unexpected[0]}`);
  const missing = expectedFiles.filter((file) => !actual.has(file)).sort();
  if (missing.length > 0) throw new Error(`missing model file: ${missing[0]}`);
}

export function countTriangles(document, modelFile) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== Primitive.Mode.TRIANGLES) {
        throw new Error(`${modelFile}: primitive mode ${primitive.getMode()} is not TRIANGLES`);
      }
      const vertices = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
      triangles += vertices / 3;
    }
  }
  if (!Number.isInteger(triangles)) throw new Error(`${modelFile}: non-triangle primitive count`);
  return triangles;
}

export async function auditSelectionModels(root = fileURLToPath(new URL('.', import.meta.url))) {
  const catalog = JSON.parse(await readFile(resolve(root, 'selection-catalog.json'), 'utf8'));
  validateCatalog(catalog);
  const expectedFiles = ITEM_IDS.flatMap((itemId) => catalog.items[itemId].map(({ modelFile }) => modelFile));
  const modelsRoot = resolve(root, 'models');
  requireExactModelFiles(expectedFiles, await readdir(modelsRoot));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  let count = 0;

  for (const itemId of ITEM_IDS) {
    for (const choice of catalog.items[itemId]) {
      const document = await io.read(resolve(modelsRoot, choice.modelFile));
      const resources = [...document.getRoot().listBuffers(), ...document.getRoot().listTextures()];
      if (resources.some((resource) => resource.getURI())) throw new Error(`${choice.modelFile}: external resource URI`);
      const triangles = countTriangles(document, choice.modelFile);
      if (triangles !== choice.triangles) throw new Error(`${choice.modelFile}: catalog ${choice.triangles}, file ${triangles}`);
      if (triangles > 3000) throw new Error(`${choice.modelFile}: exceeds 3,000 triangles`);
      console.log(`${itemId}:${choice.id}: ${triangles} triangles`);
      count += 1;
    }
  }

  if (count !== 36) throw new Error(`expected 36 models, audited ${count}`);
  console.log('selection models valid: 36 / 36');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await auditSelectionModels();
}
