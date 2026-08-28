import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  CARLITOS_FLOOR_NODE,
  CARLITOS_SITTING_IDLE_CLIP,
  CARLITOS_SOURCE,
} from './carlitos-model.mjs';
import { POLY_PIZZA_MODEL_SOURCES } from './poly-pizza-models.mjs';
import { parseModelCheckArguments } from './model-check-arguments.mjs';
import { parseGlb, validateEmbeddedResources } from './glb-validation.mjs';

export const MODEL_LIMIT = 3_000;
export const LIBRARY_LIMIT = 40_000;
export const COLLECTIBLE_ITEM_IDS = [
  'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'medicalKit',
  'spyglass', 'fishingNet', 'knife', 'bucket', 'flareGun', 'scubaSet', 'anchor',
  'radio', 'umbrella', 'swimRing', 'flashlight', 'shotgun',
  'energyBar', 'carlitos',
];
export const EQUIPMENT_MODEL_IDS = ['fishingRod', 'hammer', 'pillow'];
export const PRACTICAL_LIGHT_MODEL_IDS = ['lantern', 'ceilingLight'];
export const MODEL_IDS = [
  ...COLLECTIBLE_ITEM_IDS,
  ...EQUIPMENT_MODEL_IDS,
  ...PRACTICAL_LIGHT_MODEL_IDS,
];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function modelTriangleLimit(itemId) {
  if (itemId === 'carlitos') return CARLITOS_SOURCE.maxTriangles;
  return POLY_PIZZA_MODEL_SOURCES[itemId]?.maxTriangles ?? MODEL_LIMIT;
}

function validatePosition(filePath, position) {
  if (!position) throw new Error(`${filePath}: missing POSITION geometry`);
  const values = position.getArray();
  if (position.getCount() === 0 || !values || values.length === 0) {
    throw new Error(`${filePath}: empty POSITION geometry`);
  }
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error(`${filePath}: non-finite POSITION data`);
  }
  const bounds = [...position.getMin([]), ...position.getMax([])];
  if (!bounds.every(Number.isFinite)) {
    throw new Error(`${filePath}: non-finite POSITION bounds`);
  }
}

function validateIndices(filePath, indices, position) {
  if (!indices) return;
  const positionCount = position.getCount();
  for (let element = 0; element < indices.getCount(); element += 1) {
    const index = indices.getScalar(element);
    if (!Number.isInteger(index) || index < 0 || index >= positionCount) {
      throw new Error(
        `${filePath}: triangle index ${index} is out of range for ${positionCount} POSITION vertices`,
      );
    }
  }
}

function nonDegenerateTriangle(first, second, third) {
  const firstEdge = [
    second[0] - first[0],
    second[1] - first[1],
    second[2] - first[2],
  ];
  const secondEdge = [
    third[0] - first[0],
    third[1] - first[1],
    third[2] - first[2],
  ];
  const firstLength = Math.hypot(...firstEdge);
  const secondLength = Math.hypot(...secondEdge);
  if (!Number.isFinite(firstLength) || !Number.isFinite(secondLength)) return false;
  if (firstLength === 0 || secondLength === 0) return false;
  const firstDirection = firstEdge.map((component) => component / firstLength);
  const secondDirection = secondEdge.map((component) => component / secondLength);
  const cross = [
    firstDirection[1] * secondDirection[2] - firstDirection[2] * secondDirection[1],
    firstDirection[2] * secondDirection[0] - firstDirection[0] * secondDirection[2],
    firstDirection[0] * secondDirection[1] - firstDirection[1] * secondDirection[0],
  ];
  return Math.hypot(...cross) > Number.EPSILON * 16;
}

function worldPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
}

function recordBounds(filePath, state, world) {
  if (!world.every(Number.isFinite)) throw new Error(`${filePath}: non-finite model bounds`);
  for (let component = 0; component < 3; component += 1) {
    state.modelMin[component] = Math.min(state.modelMin[component], world[component]);
    state.modelMax[component] = Math.max(state.modelMax[component], world[component]);
  }
}

function validatePrimitiveBounds(filePath, primitive, matrix, state) {
  const position = primitive.getAttribute('POSITION');
  if (!position) return;
  const point = [0, 0, 0];
  const worldPoints = [];
  for (let index = 0; index < position.getCount(); index += 1) {
    position.getElement(index, point);
    const world = worldPoint(matrix, point);
    recordBounds(filePath, state, world);
    worldPoints.push(world);
  }
  const indices = primitive.getIndices();
  const elementCount = indices?.getCount() ?? position.getCount();
  for (let element = 0; element < elementCount; element += 3) {
    const firstIndex = indices?.getScalar(element) ?? element;
    const secondIndex = indices?.getScalar(element + 1) ?? element + 1;
    const thirdIndex = indices?.getScalar(element + 2) ?? element + 2;
    if (nonDegenerateTriangle(
      worldPoints[firstIndex],
      worldPoints[secondIndex],
      worldPoints[thirdIndex],
    )) {
      state.hasNonDegenerateTriangle = true;
    }
  }
}

function validateNodeBounds(filePath, node, visitedNodes, state) {
  if (visitedNodes.has(node)) return;
  visitedNodes.add(node);
  const mesh = node.getMesh();
  if (!mesh) return;
  const matrix = node.getWorldMatrix();
  if (!matrix.every(Number.isFinite)) throw new Error(`${filePath}: non-finite model bounds`);
  for (const primitive of mesh.listPrimitives()) {
    validatePrimitiveBounds(filePath, primitive, matrix, state);
  }
}

function validateModelBounds(filePath, document) {
  const root = document.getRoot();
  const defaultScene = root.getDefaultScene();
  const scenes = defaultScene ? [defaultScene] : root.listScenes();
  if (scenes.length === 0) throw new Error(`${filePath}: empty model bounds`);

  const visitedNodes = new Set();
  const state = {
    modelMin: [Infinity, Infinity, Infinity],
    modelMax: [-Infinity, -Infinity, -Infinity],
    hasNonDegenerateTriangle: false,
  };
  for (const scene of scenes) {
    for (const child of scene.listChildren()) {
      child.traverse((node) => validateNodeBounds(filePath, node, visitedNodes, state));
    }
  }
  if (
    ![...state.modelMin, ...state.modelMax].every(Number.isFinite)
    || state.modelMin.some((minimum, index) => minimum > state.modelMax[index])
  ) {
    throw new Error(`${filePath}: empty model bounds`);
  }
  const extents = state.modelMax.map((maximum, index) => maximum - state.modelMin[index]);
  if (!extents.every(Number.isFinite)) {
    throw new Error(`${filePath}: non-finite model bounds`);
  }
  if (!extents.some((extent) => extent > 0)) {
    throw new Error(`${filePath}: model bounds have no positive extent`);
  }
  if (!state.hasNonDegenerateTriangle) {
    throw new Error(`${filePath}: contains no non-degenerate world-space triangles`);
  }
  return { min: state.modelMin, max: state.modelMax };
}

async function inspectModel(filePath) {
  const bytes = await readFile(filePath);
  validateEmbeddedResources(filePath, parseGlb(filePath, bytes));
  const document = await io.read(filePath);
  if (
    filePath.endsWith('carlitos.glb')
    && document.getRoot().listNodes().some(
      (node) => node.getName() === CARLITOS_FLOOR_NODE,
    )
  ) {
    throw new Error(`${filePath}: contains the Somali Cat display floor`);
  }
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        throw new Error(`${filePath}: primitive mode ${primitive.getMode()} is not TRIANGLES`);
      }
      const position = primitive.getAttribute('POSITION');
      validatePosition(filePath, position);
      const indices = primitive.getIndices();
      const count = indices?.getCount() ?? position.getCount();
      if (count % 3 !== 0) throw new Error(`${filePath}: triangle index count is not divisible by 3`);
      validateIndices(filePath, indices, position);
      triangles += count / 3;
    }
  }
  const rawBounds = validateModelBounds(filePath, document);
  return { rawBounds, triangles };
}

export async function countTriangles(filePath) {
  return (await inspectModel(filePath)).triangles;
}

function parseLedgerRow(row) {
  return row.slice(1, -1).split('|').map((cell) => cell.trim());
}

function verifyLedgerRow(ledger, itemId, measurement) {
  const rows = ledger.split(/\r?\n/).filter((line) => (
    line.startsWith(`| ${itemId} |`)
    && parseLedgerRow(line)[1] === `\`${itemId}.glb\``
  ));
  if (rows.length !== 1) {
    throw new Error(`ATTRIBUTION.md: expected one ${itemId} row, received ${rows.length}`);
  }
  const actual = parseLedgerRow(rows[0]);
  const source = POLY_PIZZA_MODEL_SOURCES[itemId];
  if (!source) {
    if (itemId !== 'carlitos') {
      throw new Error(`ATTRIBUTION.md: no source record for ${itemId}`);
    }
    const expected = [
      'carlitos',
      '`carlitos.glb`',
      `${CARLITOS_SOURCE.title} / ${CARLITOS_SOURCE.creator}`,
      CARLITOS_SOURCE.pageUrl,
      `\`${CARLITOS_SOURCE.sourceAssetId}\``,
      `[${CARLITOS_SOURCE.license}](${CARLITOS_SOURCE.licenseUrl})`,
      String(CARLITOS_SOURCE.sourceTriangles),
      String(measurement.triangles),
    ];
    const actual = parseLedgerRow(rows[0]);
    if (
      actual.length !== 10
      || JSON.stringify(actual.slice(0, 8)) !== JSON.stringify(expected)
      || !actual[8].includes(CARLITOS_SOURCE.sourceSha256)
      || !actual[8].includes(CARLITOS_SITTING_IDLE_CLIP)
      || actual[9] !== CARLITOS_SOURCE.downloadedOn
    ) {
      throw new Error('ATTRIBUTION.md: carlitos row does not match the expected record');
    }
    return;
  }
  const allSources = [source, ...(source.components ?? [])];
  const joinSources = (value) => allSources.map(value).join('<br>');
  const licenseCell = joinSources(
    (entry) => `[${entry.license}](${entry.licenseUrl})`,
  );
  const expectedCore = [
    itemId,
    `\`${itemId}.glb\``,
    joinSources((entry) => `${entry.title} / ${entry.creator}`),
    joinSources((entry) => entry.pageUrl),
    joinSources((entry) => `\`${entry.sourceAssetId}\``),
    licenseCell,
    String(allSources.reduce((total, entry) => total + entry.sourceTriangles, 0)),
    String(measurement.triangles),
  ];
  if (
    actual.length !== 10
    || JSON.stringify(actual.slice(0, 8)) !== JSON.stringify(expectedCore)
    || !allSources.every((entry) => actual[8].includes(entry.sha256))
    || !actual[8].includes('official Poly Pizza static GLB')
    || actual[9] !== source.downloadedOn
  ) {
    throw new Error(`ATTRIBUTION.md: ${itemId} row does not match the expected record`);
  }
}

async function runtimeItemIds() {
  const source = await readFile(resolve('src', 'game', 'itemCatalog.ts'), 'utf8');
  const declaration = /export const ITEM_IDS = \[([\s\S]*?)\] as const;/.exec(source)?.[1];
  if (!declaration) throw new Error('Unable to read runtime ITEM_IDS');
  return [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function sameNumbers(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((value, index) => Number.isFinite(value) && value === second[index]);
}

async function main() {
  let options;
  try {
    options = parseModelCheckArguments(
      process.argv.slice(2),
      ['src', 'assets', 'models', 'items'],
    );
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const { assetsOnly, ledgerPath, modelsDir } = options;
  const errors = [];
  let total = 0;
  let metadata = null;
  const measurements = {};

  try {
    const runtimeIds = await runtimeItemIds();
    if (JSON.stringify(runtimeIds) !== JSON.stringify(COLLECTIBLE_ITEM_IDS)) {
      errors.push(`audit collectible IDs do not match runtime ITEM_IDS: ${runtimeIds.join(', ')}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const expectedEntries = new Set([
      ...MODEL_IDS.map((itemId) => `${itemId}.glb`),
      'item-model-metadata.json',
    ]);
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

  try {
    metadata = JSON.parse(await readFile(resolve(modelsDir, 'item-model-metadata.json'), 'utf8'));
    const metadataIds = Object.keys(metadata);
    if (JSON.stringify(metadataIds) !== JSON.stringify(MODEL_IDS)) {
      errors.push(`item-model-metadata.json keys do not match audited model IDs: ${metadataIds.join(', ')}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const itemId of MODEL_IDS) {
    const filePath = resolve(modelsDir, `${itemId}.glb`);
    try {
      await access(filePath);
      const measurement = await inspectModel(filePath);
      measurements[itemId] = measurement;
      const { triangles } = measurement;
      const triangleLimit = modelTriangleLimit(itemId);
      console.log(`${itemId}.glb: ${triangles} / ${triangleLimit} triangles`);
      if (triangles === 0) throw new Error(`${filePath}: contains zero triangles`);
      total += triangles;
      if (triangles > triangleLimit) {
        throw new Error(`${filePath}: ${triangles} triangles exceeds ${triangleLimit}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (metadata) {
    for (const itemId of MODEL_IDS) {
      const expected = metadata[itemId];
      const measured = measurements[itemId];
      if (!expected || !measured) continue;
      if (expected.triangles !== measured.triangles) {
        errors.push(`${itemId}: metadata triangle count does not match measured value`);
      }
      if (
        !sameNumbers(expected.rawBounds?.min, measured.rawBounds.min)
        || !sameNumbers(expected.rawBounds?.max, measured.rawBounds.max)
      ) {
        errors.push(`${itemId}: metadata raw bounds do not match measured value`);
      }
    }
  }

  console.log(`total: ${total} / ${LIBRARY_LIMIT} triangles`);
  if (total > LIBRARY_LIMIT) errors.push(`library: ${total} triangles exceeds ${LIBRARY_LIMIT}`);

  if (!assetsOnly) {
    try {
      const ledger = await readFile(ledgerPath, 'utf8');
      for (const itemId of MODEL_IDS) {
        if (measurements[itemId]) verifyLedgerRow(ledger, itemId, measurements[itemId]);
      }
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
