import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import {
  POLY_PIZZA_FISHING_MODEL_IDS,
  POLY_PIZZA_FISHING_MODEL_SOURCES,
} from './poly-pizza-fishing-models.mjs';
import { parseModelCheckArguments } from './model-check-arguments.mjs';

const MODEL_LIMIT = 2_000;
const LIBRARY_LIMIT = 10_000;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function validatePrimitive(filePath, primitive) {
  if (primitive.getMode() !== 4) {
    throw new Error(`${filePath}: primitive mode ${primitive.getMode()} is not TRIANGLES`);
  }
  const position = primitive.getAttribute('POSITION');
  if (!position || position.getCount() === 0) {
    throw new Error(`${filePath}: missing or empty POSITION data`);
  }
  const elements = primitive.getIndices()?.getCount() ?? position.getCount();
  if (elements % 3 !== 0) throw new Error(`${filePath}: incomplete triangle data`);
  return elements / 3;
}

function countModelTriangles(filePath, root) {
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) triangles += validatePrimitive(filePath, primitive);
  }
  return triangles;
}

function validateModelMeasurement(filePath, triangles, rawBounds) {
  if (
    triangles <= 0
    || ![...rawBounds.min, ...rawBounds.max].every(Number.isFinite)
    || !rawBounds.max.some((maximum, axis) => maximum > rawBounds.min[axis])
  ) {
    throw new Error(`${filePath}: empty or non-finite model`);
  }
}

async function inspectModel(filePath) {
  const document = await io.read(filePath);
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${filePath}: source scene is missing`);
  const triangles = countModelTriangles(filePath, root);
  const rawBounds = getBounds(scene);
  validateModelMeasurement(filePath, triangles, rawBounds);
  return { triangles, rawBounds };
}

function sameNumbers(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((value, index) => Number.isFinite(value) && value === second[index]);
}

function verifyLedgerRow(ledger, modelId, measurement) {
  const rows = ledger.split(/\r?\n/).filter((line) => line.startsWith(`| ${modelId} |`));
  if (rows.length !== 1) {
    throw new Error(`ATTRIBUTION.md: expected one fishing ${modelId} row, received ${rows.length}`);
  }
  const source = POLY_PIZZA_FISHING_MODEL_SOURCES[modelId];
  const row = rows[0];
  for (const expected of [
    `\`${modelId}.glb\``,
    source.pageUrl,
    source.sourceAssetId,
    source.license,
    source.sha256,
    String(source.sourceTriangles),
    String(measurement.triangles),
    source.downloadedOn,
  ]) {
    if (!row.includes(expected)) {
      throw new Error(`ATTRIBUTION.md: fishing ${modelId} row is missing ${expected}`);
    }
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function validateDirectory(modelsDir, errors) {
  try {
    const expected = new Set([
      ...POLY_PIZZA_FISHING_MODEL_IDS.map((id) => `${id}.glb`),
      'fishing-model-metadata.json',
    ]);
    const entries = await readdir(modelsDir, { withFileTypes: true });
    const actual = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    for (const entry of entries) {
      if (!entry.isFile() || !expected.has(entry.name)) {
        errors.push(`unexpected fishing model entry: ${entry.name}`);
      }
    }
    for (const file of expected) {
      if (!actual.has(file)) errors.push(`missing fishing model entry: ${file}`);
    }
  } catch (error) {
    errors.push(errorMessage(error));
  }
}

async function readMetadata(modelsDir, errors) {
  try {
    const metadata = JSON.parse(
      await readFile(resolve(modelsDir, 'fishing-model-metadata.json'), 'utf8'),
    );
    if (JSON.stringify(Object.keys(metadata)) !== JSON.stringify(POLY_PIZZA_FISHING_MODEL_IDS)) {
      errors.push('fishing-model-metadata.json keys do not match pinned model IDs');
    }
    return metadata;
  } catch (error) {
    errors.push(errorMessage(error));
    return undefined;
  }
}

async function measureModels(modelsDir, metadata, errors) {
  const measurements = {};
  let total = 0;
  for (const modelId of POLY_PIZZA_FISHING_MODEL_IDS) {
    const filePath = resolve(modelsDir, `${modelId}.glb`);
    try {
      await access(filePath);
      const measurement = await inspectModel(filePath);
      measurements[modelId] = measurement;
      total += measurement.triangles;
      console.log(`${modelId}.glb: ${measurement.triangles} / ${MODEL_LIMIT} triangles`);
      if (measurement.triangles > MODEL_LIMIT) {
        throw new Error(`${modelId}: ${measurement.triangles} triangles exceeds ${MODEL_LIMIT}`);
      }
      const expected = metadata?.[modelId];
      if (
        !expected
        || expected.triangles !== measurement.triangles
        || !sameNumbers(expected.rawBounds?.min, measurement.rawBounds.min)
        || !sameNumbers(expected.rawBounds?.max, measurement.rawBounds.max)
      ) {
        throw new Error(`${modelId}: generated metadata does not match the model`);
      }
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  console.log(`total: ${total} / ${LIBRARY_LIMIT} triangles`);
  if (total > LIBRARY_LIMIT) errors.push(`library: ${total} triangles exceeds ${LIBRARY_LIMIT}`);
  return measurements;
}

async function validateLedger(assetsOnly, ledgerPath, measurements, errors) {
  if (assetsOnly) return;
  try {
    const ledger = await readFile(ledgerPath, 'utf8');
    for (const modelId of POLY_PIZZA_FISHING_MODEL_IDS) {
      if (measurements[modelId]) verifyLedgerRow(ledger, modelId, measurements[modelId]);
    }
  } catch (error) {
    errors.push(errorMessage(error));
  }
}

function reportErrors(errors) {
  if (errors.length > 0) {
    errors.forEach((error) => console.error(`ERROR: ${error}`));
    process.exitCode = 1;
  }
}

async function main() {
  const { assetsOnly, ledgerPath, modelsDir } = parseModelCheckArguments(
    process.argv.slice(2),
    ['src', 'assets', 'models', 'fishing'],
  );
  const errors = [];
  await validateDirectory(modelsDir, errors);
  const metadata = await readMetadata(modelsDir, errors);
  const measurements = await measureModels(modelsDir, metadata, errors);
  await validateLedger(assetsOnly, ledgerPath, measurements, errors);
  reportErrors(errors);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
