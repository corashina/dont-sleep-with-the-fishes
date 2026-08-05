import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { inspectEventModel } from './event-model-metadata.mjs';
import { parseGlb, validateEmbeddedResources } from './glb-validation.mjs';
import { parseModelCheckArguments } from './model-check-arguments.mjs';
import {
  POLY_PIZZA_MENU_MODEL_IDS,
  POLY_PIZZA_MENU_MODEL_SOURCES,
} from './poly-pizza-menu-models.mjs';

const TOTAL_TRIANGLE_LIMIT = 8_000;
const ATTRIBUTION_HEADING = '## Runtime underwater-menu model ledger';
const REQUIRED_SHARK_CLIP = Object.freeze({
  name: 'Armature|Swim',
  duration: 1.25,
  channels: 8,
});
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sameNumbers(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((value, index) => Number.isFinite(value) && value === second[index]);
}

function sameAnimations(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function sectionRows(ledger) {
  const headingCount = ledger.split(ATTRIBUTION_HEADING).length - 1;
  if (headingCount !== 1) {
    throw new Error(`ATTRIBUTION.md: expected one menu model heading, received ${headingCount}`);
  }
  const start = ledger.indexOf(ATTRIBUTION_HEADING) + ATTRIBUTION_HEADING.length;
  const end = ledger.indexOf('\n## ', start);
  return ledger.slice(start, end < 0 ? ledger.length : end)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('| '));
}

function validateAttribution(ledger, measurements) {
  const rows = sectionRows(ledger);
  if (rows.length !== POLY_PIZZA_MENU_MODEL_IDS.length + 1) {
    throw new Error(`ATTRIBUTION.md: expected ${POLY_PIZZA_MENU_MODEL_IDS.length} menu rows`);
  }
  for (const modelId of POLY_PIZZA_MENU_MODEL_IDS) {
    const matches = rows.filter((row) => row.startsWith(`| ${modelId} |`));
    if (matches.length !== 1) {
      throw new Error(`ATTRIBUTION.md: expected one menu ${modelId} row`);
    }
    const source = POLY_PIZZA_MENU_MODEL_SOURCES[modelId];
    const row = matches[0];
    for (const expected of [
      `\`${modelId}.glb\``, source.title, source.creator, source.pageUrl,
      source.resourceId, source.sha256, String(source.sourceTriangles),
      String(measurements[modelId].triangles), source.downloadedOn,
    ]) {
      if (!row.includes(expected)) {
        throw new Error(`ATTRIBUTION.md: menu ${modelId} row is missing ${expected}`);
      }
    }
  }
}

async function main() {
  const { assetsOnly, ledgerPath, modelsDir } = parseModelCheckArguments(
    process.argv.slice(2),
    ['src', 'assets', 'models', 'menu'],
  );
  const errors = [];
  const measurements = {};
  let metadata;
  let total = 0;

  try {
    const expected = new Set([
      ...POLY_PIZZA_MENU_MODEL_IDS.map((id) => `${id}.glb`),
      'menu-model-metadata.json',
    ]);
    const entries = await readdir(modelsDir, { withFileTypes: true });
    const actual = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    for (const entry of entries) {
      if (!entry.isFile() || !expected.has(entry.name)) {
        errors.push(`unexpected menu model entry: ${entry.name}`);
      }
    }
    for (const file of expected) {
      if (!actual.has(file)) errors.push(`missing menu model entry: ${file}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    metadata = JSON.parse(await readFile(resolve(modelsDir, 'menu-model-metadata.json'), 'utf8'));
    if (JSON.stringify(Object.keys(metadata)) !== JSON.stringify(POLY_PIZZA_MENU_MODEL_IDS)) {
      errors.push('menu-model-metadata.json keys do not match pinned model IDs');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const modelId of POLY_PIZZA_MENU_MODEL_IDS) {
    const source = POLY_PIZZA_MENU_MODEL_SOURCES[modelId];
    const filePath = resolve(modelsDir, `${modelId}.glb`);
    try {
      await access(filePath);
      const bytes = await readFile(filePath);
      validateEmbeddedResources(filePath, parseGlb(filePath, bytes));
      const measurement = inspectEventModel(modelId, await io.read(filePath));
      measurements[modelId] = measurement;
      total += measurement.triangles;
      console.log(`${modelId}.glb: ${measurement.triangles} / ${source.maxTriangles} triangles`);
      if (measurement.triangles !== source.sourceTriangles) {
        throw new Error(`${modelId}: expected ${source.sourceTriangles} triangles, received ${measurement.triangles}`);
      }
      if (measurement.triangles > source.maxTriangles) {
        throw new Error(`${modelId}: triangle count exceeds ${source.maxTriangles}`);
      }
      const expected = metadata?.[modelId];
      if (
        expected?.triangles !== measurement.triangles
        || !sameNumbers(expected?.rawBounds?.min, measurement.rawBounds.min)
        || !sameNumbers(expected?.rawBounds?.max, measurement.rawBounds.max)
        || !sameAnimations(expected?.animations, measurement.animations)
      ) {
        throw new Error(`${modelId}: generated metadata does not match the model`);
      }
      if (!/^[A-F0-9]{64}$/.test(source.sha256)) {
        throw new Error(`${modelId}: pinned source SHA-256 is invalid`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const sharkAnimations = metadata?.shark?.animations;
  if (
    !Array.isArray(sharkAnimations)
    || sharkAnimations.length !== 1
    || JSON.stringify(sharkAnimations[0]) !== JSON.stringify(REQUIRED_SHARK_CLIP)
  ) {
    errors.push('shark: required Armature|Swim animation metadata is missing');
  }

  console.log(`total: ${total} / ${TOTAL_TRIANGLE_LIMIT} triangles`);
  if (total > TOTAL_TRIANGLE_LIMIT) {
    errors.push(`menu models: ${total} triangles exceeds ${TOTAL_TRIANGLE_LIMIT}`);
  }

  if (!assetsOnly) {
    try {
      validateAttribution(await readFile(ledgerPath, 'utf8'), measurements);
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
