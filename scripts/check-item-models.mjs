import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

export const MODEL_LIMIT = 3_000;
export const DUCT_TAPE_LIMIT = 21_000;
export const LIBRARY_LIMIT = 28_000;
export const ITEM_IDS = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
];

const LEDGER_REQUIREMENTS = {
  flareGun: ['https://poly.pizza/m/44H9OBUqTC', '9ec52cda-c918-43f0-b7af-354e7fe96c37', 'Quaternius', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ductTape: ['https://poly.pizza/m/fu49rGO7Ukc', '06934616-1393-451d-bdf6-2101a5e32703', 'Poly by Google', 'https://creativecommons.org/licenses/by/3.0/'],
  fishingRod: ['https://poly.pizza/m/lDlWQjn9Zg', 'c15761f7-4aef-4bf4-9565-50a68a981f34', 'Quaternius', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  baitTin: ['https://poly.pizza/m/IuoYedcdXQ', 'f6b52ca9-61b1-42d5-a42f-d8748a41eb45', 'Quaternius', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  medicalKit: ['https://poly.pizza/m/Hp80p6148W', '41249676-0965-40df-8dd7-eee79dd9e6cf', 'Quaternius', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  waterJug: ['https://poly.pizza/m/KpxDpidn1Z', '3ebef9a3-c2df-49ee-abe1-df38b5777bcd', 'Quaternius', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  cannedFood: ['https://poly.pizza/m/YnowJvWqxE', 'e16e13cf-fbc4-48c8-9927-ae34920a498e', 'Quaternius', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  flashlight: ['https://poly.pizza/m/WGsvr4KOZd', '035c4897-22f3-4e9c-b29f-ebafe2b566da', 'Quaternius', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  scubaSet: ['https://poly.pizza/m/7igrHLjaQlW', 'efda7497-db5e-47e9-b317-8e8baeb1c616', 'Steren Giannini', 'https://creativecommons.org/licenses/by/3.0/'],
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

async function main() {
  const assetsOnly = process.argv.slice(2).includes('--assets-only');
  const errors = [];
  let total = 0;

  for (const itemId of ITEM_IDS) {
    const filePath = resolve('src', 'assets', 'models', 'items', `${itemId}.glb`);
    try {
      await access(filePath);
      const triangles = await countTriangles(filePath);
      console.log(`${itemId}: ${triangles} triangles`);
      if (triangles === 0) throw new Error(`${filePath}: contains zero triangles`);
      total += triangles;
      const limit = itemId === 'ductTape' ? DUCT_TAPE_LIMIT : MODEL_LIMIT;
      if (triangles > limit) {
        throw new Error(`${filePath}: ${triangles} triangles exceeds ${limit}`);
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
