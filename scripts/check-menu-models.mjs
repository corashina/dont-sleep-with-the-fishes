import { createHash } from 'node:crypto';
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

const TOTAL_TRIANGLE_LIMIT = 10_000;
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

function rowCells(row) {
  return row.split('|').slice(1, -1).map((cell) => cell.trim());
}

export function validateMenuAttribution(ledger, measurements) {
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
    const cells = rowCells(row);
    const exactCells = [
      [1, `\`${modelId}.glb\``],
      [2, `${source.title} / ${source.creator}`],
      [3, source.pageUrl],
      [4, `\`${source.sourceAssetId}\``],
      [5, `[${source.license}](${source.licenseUrl})`],
      [6, String(source.sourceTriangles)],
      [7, String(measurements[modelId].triangles)],
      [9, source.downloadedOn],
    ];
    for (const [index, expected] of exactCells) {
      if (cells[index] !== expected) {
        throw new Error(`ATTRIBUTION.md: menu ${modelId} row is missing ${expected}`);
      }
    }
    for (const expected of [source.sha256, source.committedSha256]) {
      if (!cells[8]?.includes(expected)) {
        throw new Error(`ATTRIBUTION.md: menu ${modelId} row is missing ${expected}`);
      }
    }
  }
}

export function validateCommittedMenuModel(modelId, bytes) {
  const source = POLY_PIZZA_MENU_MODEL_SOURCES[modelId];
  if (!source) throw new Error(`unknown menu model: ${modelId}`);
  const actualHash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (actualHash !== source.committedSha256) {
    throw new Error(
      `${modelId}: committed GLB SHA-256 does not match ${source.committedSha256}; received ${actualHash}`,
    );
  }
  return actualHash;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function validateDirectory(modelsDir, errors) {
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
    errors.push(errorMessage(error));
  }
}

async function readMetadata(modelsDir, errors) {
  try {
    const metadata = JSON.parse(await readFile(resolve(modelsDir, 'menu-model-metadata.json'), 'utf8'));
    if (JSON.stringify(Object.keys(metadata)) !== JSON.stringify(POLY_PIZZA_MENU_MODEL_IDS)) {
      errors.push('menu-model-metadata.json keys do not match pinned model IDs');
    }
    return metadata;
  } catch (error) {
    errors.push(errorMessage(error));
    return undefined;
  }
}

function menuMetadataMatches(expected, measurement) {
  return expected?.triangles === measurement.triangles
    && sameNumbers(expected?.rawBounds?.min, measurement.rawBounds.min)
    && sameNumbers(expected?.rawBounds?.max, measurement.rawBounds.max)
    && sameAnimations(expected?.animations, measurement.animations);
}

function validateMenuSource(modelId, source) {
  if (!/^[A-F0-9]{64}$/.test(source.sha256)) {
    throw new Error(`${modelId}: pinned source SHA-256 is invalid`);
  }
  if (!/^[A-F0-9]{64}$/.test(source.committedSha256)) {
    throw new Error(`${modelId}: pinned committed SHA-256 is invalid`);
  }
}

async function measureModel(modelId, modelsDir, metadata) {
  const source = POLY_PIZZA_MENU_MODEL_SOURCES[modelId];
  const filePath = resolve(modelsDir, `${modelId}.glb`);
  await access(filePath);
  const bytes = await readFile(filePath);
  validateCommittedMenuModel(modelId, bytes);
  validateEmbeddedResources(filePath, parseGlb(filePath, bytes));
  const measurement = inspectEventModel(modelId, await io.read(filePath));
  console.log(`${modelId}.glb: ${measurement.triangles} / ${source.maxTriangles} triangles`);
  if (measurement.triangles !== source.sourceTriangles) {
    throw new Error(`${modelId}: expected ${source.sourceTriangles} triangles, received ${measurement.triangles}`);
  }
  if (measurement.triangles > source.maxTriangles) {
    throw new Error(`${modelId}: triangle count exceeds ${source.maxTriangles}`);
  }
  if (!menuMetadataMatches(metadata?.[modelId], measurement)) {
    throw new Error(`${modelId}: generated metadata does not match the model`);
  }
  validateMenuSource(modelId, source);
  return measurement;
}

async function measureModels(modelsDir, metadata, errors) {
  const measurements = {};
  let total = 0;
  for (const modelId of POLY_PIZZA_MENU_MODEL_IDS) {
    try {
      const measurement = await measureModel(modelId, modelsDir, metadata);
      measurements[modelId] = measurement;
      total += measurement.triangles;
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  return { measurements, total };
}

function validateSharkAnimation(metadata, errors) {
  const sharkAnimations = metadata?.shark?.animations;
  if (
    !Array.isArray(sharkAnimations)
    || sharkAnimations.length !== 1
    || JSON.stringify(sharkAnimations[0]) !== JSON.stringify(REQUIRED_SHARK_CLIP)
  ) {
    errors.push('shark: required Armature|Swim animation metadata is missing');
  }
}

function reportTotal(total, errors) {
  console.log(`total: ${total} / ${TOTAL_TRIANGLE_LIMIT} triangles`);
  if (total > TOTAL_TRIANGLE_LIMIT) {
    errors.push(`menu models: ${total} triangles exceeds ${TOTAL_TRIANGLE_LIMIT}`);
  }
}

async function validateLedger(assetsOnly, ledgerPath, measurements, errors) {
  if (assetsOnly) return;
  try {
    validateMenuAttribution(await readFile(ledgerPath, 'utf8'), measurements);
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
    ['src', 'assets', 'models', 'menu'],
  );
  const errors = [];
  await validateDirectory(modelsDir, errors);
  const metadata = await readMetadata(modelsDir, errors);
  const { measurements, total } = await measureModels(modelsDir, metadata, errors);
  validateSharkAnimation(metadata, errors);
  reportTotal(total, errors);
  await validateLedger(assetsOnly, ledgerPath, measurements, errors);
  reportErrors(errors);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
