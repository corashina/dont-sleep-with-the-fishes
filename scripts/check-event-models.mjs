import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import {
  countEventModelTriangles,
  EVENT_MODEL_IDS,
  EVENT_MODEL_TOTAL_TRIANGLE_LIMIT,
  EVENT_MODEL_TRIANGLE_LIMITS,
} from './poly-pizza-event-models.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sameNumbers(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((value, index) => Number.isFinite(value) && value === second[index]);
}

async function inspectModel(filePath) {
  const bytes = await readFile(filePath);
  const document = await io.readBinary(new Uint8Array(bytes));
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${filePath}: scene is missing`);
  const rawBounds = getBounds(scene);
  if (
    ![...rawBounds.min, ...rawBounds.max].every(Number.isFinite)
    || !rawBounds.max.some((maximum, axis) => maximum > rawBounds.min[axis])
  ) {
    throw new Error(`${filePath}: bounds are empty or non-finite`);
  }
  for (const buffer of root.listBuffers()) {
    if (buffer.getURI()) throw new Error(`${filePath}: buffer resource is external`);
  }
  for (const texture of root.listTextures()) {
    if (texture.getURI()) throw new Error(`${filePath}: texture resource is external`);
  }
  return {
    triangles: countEventModelTriangles(document),
    rawBounds,
    outputSha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    hasSkins: root.listSkins().length > 0,
    animationCount: root.listAnimations().length,
  };
}

function verifyLedgerRow(ledger, id, source, metadata) {
  const rows = ledger.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
  if (rows.length !== 1) {
    throw new Error(`ATTRIBUTION.md: expected one event ${id} row, received ${rows.length}`);
  }
  const row = rows[0];
  for (const expected of [
    `\`${id}.glb\``,
    `${source.modelName} / ${source.author}`,
    source.pageUrl,
    source.sourceAssetId,
    source.license,
    source.sha256,
    String(source.sourceTriangles),
    String(metadata.triangles),
    metadata.processing,
    source.downloadedOn,
  ]) {
    if (!row.includes(expected)) {
      throw new Error(`ATTRIBUTION.md: event ${id} row is missing ${expected}`);
    }
  }
}

function parseArguments(args) {
  let assetsOnly = false;
  let modelsDir = resolve('src', 'assets', 'models', 'events');
  let ledgerPath = resolve('src', 'assets', 'ATTRIBUTION.md');
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--assets-only') {
      assetsOnly = true;
    } else if (argument === '--models-dir' || argument === '--ledger-path') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`);
      if (argument === '--models-dir') modelsDir = resolve(value);
      else ledgerPath = resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { assetsOnly, ledgerPath, modelsDir };
}

async function main() {
  const { assetsOnly, ledgerPath, modelsDir } = parseArguments(process.argv.slice(2));
  const errors = [];
  const measurements = {};
  let total = 0;
  let metadata;
  let lock;

  try {
    lock = JSON.parse(await readFile(resolve('scripts', 'event-model-lock.json'), 'utf8'));
    if (JSON.stringify(Object.keys(lock.sources ?? {})) !== JSON.stringify(EVENT_MODEL_IDS)) {
      errors.push('event-model-lock.json keys do not match approved model IDs');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const expected = new Set([
      ...EVENT_MODEL_IDS.map((id) => `${id}.glb`),
      'event-model-metadata.json',
    ]);
    const entries = await readdir(modelsDir, { withFileTypes: true });
    const actual = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    for (const entry of entries) {
      if (!entry.isFile() || !expected.has(entry.name)) {
        errors.push(`unexpected event model entry: ${entry.name}`);
      }
    }
    for (const file of expected) {
      if (!actual.has(file)) errors.push(`missing event model entry: ${file}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    metadata = JSON.parse(await readFile(resolve(modelsDir, 'event-model-metadata.json'), 'utf8'));
    if (JSON.stringify(Object.keys(metadata)) !== JSON.stringify(EVENT_MODEL_IDS)) {
      errors.push('event-model-metadata.json keys do not match approved model IDs');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const id of EVENT_MODEL_IDS) {
    const filePath = resolve(modelsDir, `${id}.glb`);
    try {
      await access(filePath);
      const measurement = await inspectModel(filePath);
      measurements[id] = measurement;
      total += measurement.triangles;
      console.log(
        `${id}.glb: ${measurement.triangles} / ${EVENT_MODEL_TRIANGLE_LIMITS[id]} triangles`,
      );
      if (measurement.triangles > EVENT_MODEL_TRIANGLE_LIMITS[id]) {
        throw new Error(`${id}: triangle limit exceeded`);
      }
      const expected = metadata?.[id];
      const source = lock?.sources?.[id];
      if (
        !expected
        || expected.triangles !== measurement.triangles
        || !sameNumbers(expected.rawBounds?.min, measurement.rawBounds.min)
        || !sameNumbers(expected.rawBounds?.max, measurement.rawBounds.max)
        || expected.outputSha256 !== measurement.outputSha256
        || expected.hasSkins !== measurement.hasSkins
        || expected.animationCount !== measurement.animationCount
        || expected.sourceSha256 !== source?.sha256
        || expected.sourceTriangles !== source?.sourceTriangles
        || expected.hasSkins !== source?.sourceHasSkins
        || expected.animationCount !== source?.sourceAnimationCount
      ) {
        throw new Error(`${id}: generated metadata does not match the model and lock`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  console.log(`total: ${total} / ${EVENT_MODEL_TOTAL_TRIANGLE_LIMIT} triangles`);
  if (total > EVENT_MODEL_TOTAL_TRIANGLE_LIMIT) {
    errors.push(`event model total ${total} exceeds ${EVENT_MODEL_TOTAL_TRIANGLE_LIMIT}`);
  }

  if (!assetsOnly) {
    try {
      const ledger = await readFile(ledgerPath, 'utf8');
      for (const id of EVENT_MODEL_IDS) {
        if (measurements[id] && metadata?.[id] && lock?.sources?.[id]) {
          verifyLedgerRow(ledger, id, lock.sources[id], metadata[id]);
        }
      }
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
