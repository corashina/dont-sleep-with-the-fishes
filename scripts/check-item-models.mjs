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

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const LEDGER_REQUIREMENTS = {
  flareGun: ['https://kenney.nl/assets/blaster-kit', 'blaster-kit@2.1:Models/GLB format/blaster-n.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ductTape: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  fishingRod: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/fishingRod', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  baitTin: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can-small.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  medicalKit: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/medicalKit', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  waterJug: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:Models/GLB format/bottle.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  cannedFood: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can.glb', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  flashlight: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/flashlight', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  scubaSet: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/scubaSet', 'Kenney', 'https://creativecommons.org/publicdomain/zero/1.0/'],
};

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
}

export async function countTriangles(filePath) {
  const bytes = await readFile(filePath);
  validateEmbeddedResources(filePath, parseGlb(filePath, bytes));
  const document = await new NodeIO().read(filePath);
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
  validateModelBounds(filePath, document);
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
