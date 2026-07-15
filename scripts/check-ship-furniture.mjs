import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { countTriangles } from './check-item-models.mjs';
import {
  KENNEY_SHIP_FURNITURE_PACK,
  KENNEY_SHIP_FURNITURE_RECIPES,
} from './kenney-ship-furniture.mjs';

export const MODEL_LIMIT = 1_000;
export const LIBRARY_LIMIT = 8_000;
export const SHIP_FURNITURE_IDS = Object.keys(KENNEY_SHIP_FURNITURE_RECIPES);

async function countRenderedTriangles(filePath) {
  await countTriangles(filePath);
  const document = await new NodeIO().read(filePath);
  const root = document.getRoot();
  const defaultScene = root.getDefaultScene();
  const scenes = defaultScene ? [defaultScene] : root.listScenes();
  let total = 0;
  for (const scene of scenes) {
    for (const child of scene.listChildren()) {
      child.traverse((node) => {
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
          total += (primitive.getIndices()?.getCount()
            ?? primitive.getAttribute('POSITION')?.getCount()
            ?? 0) / 3;
        }
      });
    }
  }
  return total;
}

function verifyLedgerRow(ledger, modelId) {
  const recipe = KENNEY_SHIP_FURNITURE_RECIPES[modelId];
  const row = ledger.split(/\r?\n/).find((line) => line.startsWith(`| ${modelId} |`));
  if (!row) throw new Error(`THIRD_PARTY_ASSETS.md: missing ${modelId} row`);
  const requirements = [
    KENNEY_SHIP_FURNITURE_PACK.pageUrl,
    `furniture-kit@1.0:${recipe.entry}`,
    'Kenney',
    KENNEY_SHIP_FURNITURE_PACK.licenseUrl,
    KENNEY_SHIP_FURNITURE_PACK.sha256,
    `| ${recipe.expectedTriangles} | ${recipe.expectedTriangles} |`,
    'direct build',
    'prune',
    'deduplicate',
    'unpartition',
    'embed resources',
    '2026-07-15',
  ];
  for (const value of requirements) {
    if (!row.includes(value)) {
      throw new Error(`THIRD_PARTY_ASSETS.md: ${modelId} row is missing ${value}`);
    }
  }
}

function parseArguments(args) {
  let assetsOnly = false;
  let modelsDir = resolve('src', 'assets', 'models', 'ship');
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

  const errors = [];
  let total = 0;
  const expectedEntries = new Set(SHIP_FURNITURE_IDS.map((id) => `${id}.glb`));

  try {
    const entries = await readdir(options.modelsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !expectedEntries.has(entry.name)) {
        errors.push(`unexpected model entry: ${entry.name}`);
      }
    }
    const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    for (const expectedEntry of expectedEntries) {
      if (!files.has(expectedEntry)) errors.push(`missing model entry: ${expectedEntry}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const modelId of SHIP_FURNITURE_IDS) {
    const filePath = resolve(options.modelsDir, `${modelId}.glb`);
    try {
      await access(filePath);
      const triangles = await countRenderedTriangles(filePath);
      console.log(`${modelId}: ${triangles} triangles`);
      total += triangles;
      if (triangles > MODEL_LIMIT) {
        throw new Error(`${filePath}: ${triangles} triangles exceeds ${MODEL_LIMIT}`);
      }
      const expectedTriangles = KENNEY_SHIP_FURNITURE_RECIPES[modelId].expectedTriangles;
      if (triangles !== expectedTriangles) {
        throw new Error(
          `${filePath}: expected ${expectedTriangles} triangles, received ${triangles}`,
        );
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`total: ${total} / ${LIBRARY_LIMIT} triangles`);
  if (total > LIBRARY_LIMIT) errors.push(`library: ${total} triangles exceeds ${LIBRARY_LIMIT}`);

  if (!options.assetsOnly) {
    try {
      const ledger = await readFile(resolve('THIRD_PARTY_ASSETS.md'), 'utf8');
      for (const modelId of SHIP_FURNITURE_IDS) verifyLedgerRow(ledger, modelId);
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
