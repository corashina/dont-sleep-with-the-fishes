import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import {
  POLY_PIZZA_EVENT_MODEL_IDS,
  POLY_PIZZA_EVENT_MODEL_SOURCES,
} from './poly-pizza-event-models.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sameNumbers(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((value, index) => Number.isFinite(value) && value === second[index]);
}

async function inspect(filePath) {
  const bytes = await readFile(filePath);
  const document = await io.readBinary(bytes);
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${filePath}: source scene is missing`);
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) throw new Error(`${filePath}: primitive is not TRIANGLES`);
      const position = primitive.getAttribute('POSITION');
      const elements = primitive.getIndices()?.getCount() ?? position?.getCount() ?? 0;
      triangles += elements / 3;
    }
  }
  return {
    hash: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    triangles,
    rawBounds: getBounds(scene),
  };
}

async function main() {
  const modelsDir = resolve('src', 'assets', 'models', 'events');
  const expectedFiles = new Set([
    ...POLY_PIZZA_EVENT_MODEL_IDS.map((id) => `${id}.glb`),
    'event-model-metadata.json',
  ]);
  const actualFiles = new Set(
    (await readdir(modelsDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );
  const metadata = JSON.parse(
    await readFile(resolve(modelsDir, 'event-model-metadata.json'), 'utf8'),
  );
  const ledger = await readFile(resolve('src', 'assets', 'ATTRIBUTION.md'), 'utf8');
  const errors = [];

  for (const file of expectedFiles) {
    if (!actualFiles.has(file)) errors.push(`missing event model entry: ${file}`);
  }
  for (const file of actualFiles) {
    if (!expectedFiles.has(file)) errors.push(`unexpected event model entry: ${file}`);
  }

  for (const id of POLY_PIZZA_EVENT_MODEL_IDS) {
    const source = POLY_PIZZA_EVENT_MODEL_SOURCES[id];
    try {
      const measurement = await inspect(resolve(modelsDir, `${id}.glb`));
      if (measurement.hash !== source.sha256) errors.push(`${id}: SHA-256 mismatch`);
      if (measurement.triangles !== source.sourceTriangles) errors.push(`${id}: triangle mismatch`);
      if (
        metadata[id]?.triangles !== measurement.triangles
        || !sameNumbers(metadata[id]?.rawBounds?.min, measurement.rawBounds.min)
        || !sameNumbers(metadata[id]?.rawBounds?.max, measurement.rawBounds.max)
      ) {
        errors.push(`${id}: metadata mismatch`);
      }
      const rows = ledger.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
      if (rows.length !== 1 || !rows[0].includes(source.sourceAssetId)
        || !rows[0].includes(source.sha256)) {
        errors.push(`${id}: attribution mismatch`);
      }
      console.log(`${id}.glb: ${measurement.triangles} triangles`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) {
    errors.forEach((error) => console.error(`ERROR: ${error}`));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
