import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ITEM_IDS, validateCatalog } from './catalog.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const catalog = JSON.parse(await readFile(resolve(root, 'selection-catalog.json'), 'utf8'));
validateCatalog(catalog);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let count = 0;

for (const itemId of ITEM_IDS) {
  for (const choice of catalog.items[itemId]) {
    const document = await io.read(resolve(root, 'models', choice.modelFile));
    const resources = [...document.getRoot().listBuffers(), ...document.getRoot().listTextures()];
    if (resources.some((resource) => resource.getURI())) throw new Error(`${choice.modelFile}: external resource URI`);
    let triangles = 0;
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const vertices = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
        triangles += vertices / 3;
      }
    }
    if (!Number.isInteger(triangles)) throw new Error(`${choice.modelFile}: non-triangle primitive count`);
    if (triangles !== choice.triangles) throw new Error(`${choice.modelFile}: catalog ${choice.triangles}, file ${triangles}`);
    if (triangles > 3000) throw new Error(`${choice.modelFile}: exceeds 3,000 triangles`);
    console.log(`${itemId}:${choice.id}: ${triangles} triangles`);
    count += 1;
  }
}

if (count !== 36) throw new Error(`expected 36 models, audited ${count}`);
console.log('selection models valid: 36 / 36');
