import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

export const MODEL_LIMIT = 3_000;
export const LIBRARY_LIMIT = 28_000;
export const ITEM_IDS = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
];

const LEDGER_REQUIREMENTS = {
  flareGun: ['https://kenney.nl/assets/blaster-kit', 'blaster-kit@2.1:Models/GLB format/blaster-n.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ductTape: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  fishingRod: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/fishingRod', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  baitTin: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can-small.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  medicalKit: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/medicalKit', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  waterJug: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:Models/GLB format/bottle-large.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  cannedFood: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  flashlight: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/flashlight', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  scubaSet: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/scubaSet', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
};

export async function countTriangles(filePath) {
  const document = await new NodeIO().read(filePath);
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        throw new Error(`${filePath}: primitive mode ${primitive.getMode()} is not TRIANGLES`);
      }
      const count = primitive.getIndices()?.getCount()
        ?? primitive.getAttribute('POSITION')?.getCount()
        ?? 0;
      if (count % 3 !== 0) throw new Error(`${filePath}: triangle index count is not divisible by 3`);
      triangles += count / 3;
    }
  }
  return triangles;
}

function verifyLedgerRow(ledger, itemId) {
  const row = ledger.split(/\r?\n/).find((line) => line.startsWith(`| ${itemId} |`));
  if (!row) throw new Error(`THIRD_PARTY_ASSETS.md: missing ${itemId} row`);
  for (const value of LEDGER_REQUIREMENTS[itemId]) {
    if (!row.includes(value)) {
      throw new Error(`THIRD_PARTY_ASSETS.md: ${itemId} row is missing ${value}`);
    }
  }
}

function parseArguments(args) {
  let assetsOnly = false;
  let modelsDir = resolve('src', 'assets', 'models', 'items');
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--assets-only') {
      assetsOnly = true;
    } else if (argument === '--models-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--models-dir requires a path');
      modelsDir = resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { assetsOnly, modelsDir };
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const { assetsOnly, modelsDir } = options;
  const errors = [];
  let total = 0;

  try {
    const expectedEntries = new Set(ITEM_IDS.map((itemId) => `${itemId}.glb`));
    const entries = await readdir(modelsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !expectedEntries.has(entry.name)) {
        errors.push(`unexpected model entry: ${entry.name}`);
      }
    }
    const actualEntries = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    for (const expectedEntry of expectedEntries) {
      if (!actualEntries.has(expectedEntry)) errors.push(`missing model entry: ${expectedEntry}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const itemId of ITEM_IDS) {
    const filePath = resolve(modelsDir, `${itemId}.glb`);
    try {
      await access(filePath);
      const triangles = await countTriangles(filePath);
      console.log(`${itemId}: ${triangles} triangles`);
      if (triangles === 0) throw new Error(`${filePath}: contains zero triangles`);
      total += triangles;
      if (triangles > MODEL_LIMIT) {
        throw new Error(`${filePath}: ${triangles} triangles exceeds ${MODEL_LIMIT}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`total: ${total} / ${LIBRARY_LIMIT} triangles`);
  if (total > LIBRARY_LIMIT) errors.push(`library: ${total} triangles exceeds ${LIBRARY_LIMIT}`);

  if (!assetsOnly) {
    try {
      const ledger = await readFile(resolve('THIRD_PARTY_ASSETS.md'), 'utf8');
      for (const itemId of ITEM_IDS) verifyLedgerRow(ledger, itemId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
