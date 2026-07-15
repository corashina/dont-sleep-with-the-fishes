import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

export const MODEL_LIMIT = 3_000;
export const LIBRARY_LIMIT = 40_000;
export const ITEM_IDS = [
  'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'medicalKit',
  'spyglass', 'fishingNet', 'bucket', 'flareGun', 'scubaSet', 'anchor',
  'bottledPaper', 'umbrella', 'swimRing', 'flashlight', 'harpoonGun',
  'energyBar', 'fishingRod',
];
const PROJECT_ITEM_IDS = [
  'compass', 'map', 'spyglass', 'fishingNet', 'flareGun',
  'anchor', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
];

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const LEDGER_REQUIREMENTS = {
  cannedFood: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  baitTin: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can-small.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ductTape: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  medicalKit: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/medicalKit', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  bucket: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:Models/GLB format/bucket.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  bottledPaper: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:composite/bottledPaper', 'Kenney + project', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  flashlight: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/flashlight', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  fishingRod: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/fishingRod', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  scubaSet: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/scubaSet', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function dataUriByteLength(uri) {
  const separator = uri.indexOf(',');
  if (separator < 0) return 0;
  const metadata = uri.slice(0, separator);
  const payload = uri.slice(separator + 1);
  try {
    return metadata.endsWith(';base64')
      ? Buffer.from(payload, 'base64').byteLength
      : Buffer.from(decodeURIComponent(payload)).byteLength;
  } catch {
    return 0;
  }
}

function parseGlb(filePath, bytes) {
  if (bytes.byteLength < 20) throw new Error(`${filePath}: invalid GLB header`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error(`${filePath}: invalid glTF 2.0 binary`);
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > bytes.byteLength) {
    throw new Error(`${filePath}: invalid GLB JSON chunk`);
  }
  const jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  const json = JSON.parse(jsonText);
  const binaryOffset = 20 + jsonLength;
  const binaryLength = binaryOffset + 8 <= bytes.byteLength
    && view.getUint32(binaryOffset + 4, true) === BIN_CHUNK
    ? Math.min(view.getUint32(binaryOffset, true), bytes.byteLength - binaryOffset - 8)
    : 0;
  return { binaryLength, json };
}

function collectReferencedTextures(value, key, indices) {
  if (!value || typeof value !== 'object') return;
  if (key.endsWith('Texture') && Number.isInteger(value.index)) indices.add(value.index);
  for (const [childKey, childValue] of Object.entries(value)) {
    collectReferencedTextures(childValue, childKey, indices);
  }
}

function textureSource(texture) {
  return texture?.source
    ?? texture?.extensions?.KHR_texture_basisu?.source
    ?? texture?.extensions?.EXT_texture_webp?.source
    ?? texture?.extensions?.EXT_texture_avif?.source;
}

function imageHasEmbeddedBytes(json, binaryLength, image) {
  if (!image) return false;
  if (typeof image.uri === 'string') {
    return image.uri.startsWith('data:') && dataUriByteLength(image.uri) > 0;
  }
  if (!Number.isInteger(image.bufferView)) return false;
  const bufferView = json.bufferViews?.[image.bufferView];
  if (!bufferView || !Number.isInteger(bufferView.byteLength) || bufferView.byteLength <= 0) {
    return false;
  }
  const buffer = json.buffers?.[bufferView.buffer];
  const availableBytes = typeof buffer?.uri === 'string'
    ? (buffer.uri.startsWith('data:') ? dataUriByteLength(buffer.uri) : 0)
    : binaryLength;
  const byteOffset = bufferView.byteOffset ?? 0;
  return Number.isInteger(byteOffset)
    && byteOffset >= 0
    && byteOffset + bufferView.byteLength <= availableBytes;
}

function validateEmbeddedResources(filePath, descriptor) {
  const { binaryLength, json } = descriptor;
  for (const buffer of json.buffers ?? []) {
    if (typeof buffer.uri === 'string' && !buffer.uri.startsWith('data:')) {
      throw new Error(`${filePath}: external buffer URI: ${buffer.uri}`);
    }
  }
  for (const image of json.images ?? []) {
    if (typeof image.uri === 'string' && !image.uri.startsWith('data:')) {
      throw new Error(`${filePath}: external texture URI: ${image.uri}`);
    }
  }

  const referencedTextures = new Set();
  for (const material of json.materials ?? []) {
    collectReferencedTextures(material, '', referencedTextures);
  }
  for (const textureIndex of referencedTextures) {
    const source = textureSource(json.textures?.[textureIndex]);
    if (!Number.isInteger(source) || !imageHasEmbeddedBytes(json, binaryLength, json.images?.[source])) {
      throw new Error(`${filePath}: referenced texture has no embedded image bytes`);
    }
  }
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

function validateModelBounds(filePath, document) {
  const root = document.getRoot();
  const defaultScene = root.getDefaultScene();
  const scenes = defaultScene ? [defaultScene] : root.listScenes();
  if (scenes.length === 0) throw new Error(`${filePath}: empty model bounds`);

  const visitedNodes = new Set();
  const modelMin = [Infinity, Infinity, Infinity];
  const modelMax = [-Infinity, -Infinity, -Infinity];
  let hasNonDegenerateTriangle = false;
  for (const scene of scenes) {
    for (const child of scene.listChildren()) {
      child.traverse((node) => {
        if (visitedNodes.has(node)) return;
        visitedNodes.add(node);
        const mesh = node.getMesh();
        if (!mesh) return;
        const matrix = node.getWorldMatrix();
        if (!matrix.every(Number.isFinite)) {
          throw new Error(`${filePath}: non-finite model bounds`);
        }
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (!position) continue;
          const point = [0, 0, 0];
          const worldPoints = [];
          for (let index = 0; index < position.getCount(); index += 1) {
            position.getElement(index, point);
            const worldPoint = [
              matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
              matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
              matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
            ];
            if (!worldPoint.every(Number.isFinite)) {
              throw new Error(`${filePath}: non-finite model bounds`);
            }
            worldPoints.push(worldPoint);
            for (let component = 0; component < 3; component += 1) {
              modelMin[component] = Math.min(modelMin[component], worldPoint[component]);
              modelMax[component] = Math.max(modelMax[component], worldPoint[component]);
            }
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
              hasNonDegenerateTriangle = true;
            }
          }
        }
      });
    }
  }
  if (
    ![...modelMin, ...modelMax].every(Number.isFinite)
    || modelMin.some((minimum, index) => minimum > modelMax[index])
  ) {
    throw new Error(`${filePath}: empty model bounds`);
  }
  const extents = modelMax.map((maximum, index) => maximum - modelMin[index]);
  if (!extents.every(Number.isFinite)) {
    throw new Error(`${filePath}: non-finite model bounds`);
  }
  if (!extents.some((extent) => extent > 0)) {
    throw new Error(`${filePath}: model bounds have no positive extent`);
  }
  if (!hasNonDegenerateTriangle) {
    throw new Error(`${filePath}: contains no non-degenerate world-space triangles`);
  }
  return { min: modelMin, max: modelMax };
}

async function inspectModel(filePath) {
  const bytes = await readFile(filePath);
  validateEmbeddedResources(filePath, parseGlb(filePath, bytes));
  const document = await io.read(filePath);
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

function verifyLedgerRow(ledger, itemId) {
  const rows = ledger.split(/\r?\n/).filter((line) => line.startsWith(`| ${itemId} |`));
  if (rows.length !== 1) {
    throw new Error(`THIRD_PARTY_ASSETS.md: expected one ${itemId} row, received ${rows.length}`);
  }
  const row = rows[0];
  for (const value of LEDGER_REQUIREMENTS[itemId]) {
    if (!row.includes(value)) {
      throw new Error(`THIRD_PARTY_ASSETS.md: ${itemId} row is missing ${value}`);
    }
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

function parseArguments(args) {
  let assetsOnly = false;
  let modelsDir = resolve('src', 'assets', 'models', 'items');
  let ledgerPath = resolve('THIRD_PARTY_ASSETS.md');
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--assets-only') {
      assetsOnly = true;
    } else if (argument === '--models-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--models-dir requires a path');
      modelsDir = resolve(value);
      index += 1;
    } else if (argument === '--ledger-path') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--ledger-path requires a path');
      ledgerPath = resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { assetsOnly, ledgerPath, modelsDir };
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

  const { assetsOnly, ledgerPath, modelsDir } = options;
  const errors = [];
  let total = 0;
  let metadata = null;
  const measurements = {};

  try {
    const runtimeIds = await runtimeItemIds();
    if (JSON.stringify(runtimeIds) !== JSON.stringify(ITEM_IDS)) {
      errors.push(`audit ITEM_IDS do not match runtime ITEM_IDS: ${runtimeIds.join(', ')}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const expectedEntries = new Set([
      ...ITEM_IDS.map((itemId) => `${itemId}.glb`),
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
    if (JSON.stringify(metadataIds) !== JSON.stringify(ITEM_IDS)) {
      errors.push(`item-model-metadata.json keys do not match runtime ITEM_IDS: ${metadataIds.join(', ')}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const itemId of ITEM_IDS) {
    const filePath = resolve(modelsDir, `${itemId}.glb`);
    try {
      await access(filePath);
      const measurement = await inspectModel(filePath);
      measurements[itemId] = measurement;
      const { triangles } = measurement;
      console.log(`${itemId}.glb: ${triangles} / ${MODEL_LIMIT} triangles`);
      if (triangles === 0) throw new Error(`${filePath}: contains zero triangles`);
      total += triangles;
      if (triangles > MODEL_LIMIT) {
        throw new Error(`${filePath}: ${triangles} triangles exceeds ${MODEL_LIMIT}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (metadata) {
    for (const itemId of ITEM_IDS) {
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
      for (const itemId of Object.keys(LEDGER_REQUIREMENTS)) verifyLedgerRow(ledger, itemId);
      for (const itemId of PROJECT_ITEM_IDS) {
        if (ledger.split(/\r?\n/).some((line) => line.startsWith(`| ${itemId} |`))) {
          throw new Error(`THIRD_PARTY_ASSETS.md: project-authored ${itemId} must not have a ledger row`);
        }
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
