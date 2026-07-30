import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  POLY_PIZZA_EVENT_MODEL_IDS,
  POLY_PIZZA_EVENT_MODEL_SOURCES,
} from './poly-pizza-event-models.mjs';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
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
  return (bufferView.byteOffset ?? 0) + bufferView.byteLength <= availableBytes;
}

function validateEmbeddedResources(filePath, descriptor) {
  const { binaryLength, json } = descriptor;
  if ((json.scenes?.length ?? 0) !== 1) {
    throw new Error(`${filePath}: expected one model scene`);
  }
  if ((json.cameras?.length ?? 0) > 0) throw new Error(`${filePath}: contains a camera`);
  if ((json.extensions?.KHR_lights_punctual?.lights?.length ?? 0) > 0) {
    throw new Error(`${filePath}: contains a light`);
  }
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
    if (!Number.isInteger(source) || !imageHasEmbeddedBytes(
      json,
      binaryLength,
      json.images?.[source],
    )) {
      throw new Error(`${filePath}: referenced texture has no embedded image bytes`);
    }
  }
}

function transformPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
}

function inspectDocument(filePath, document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${filePath}: source scene is missing`);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visited = new Set();
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        throw new Error(`${filePath}: primitive is not TRIANGLES`);
      }
      const position = primitive.getAttribute('POSITION');
      if (!position || position.getCount() === 0) {
        throw new Error(`${filePath}: missing or empty POSITION data`);
      }
      const indices = primitive.getIndices();
      const count = indices?.getCount() ?? position.getCount();
      if (count % 3 !== 0) throw new Error(`${filePath}: incomplete triangle data`);
      for (let element = 0; element < (indices?.getCount() ?? 0); element += 1) {
        const index = indices.getScalar(element);
        if (!Number.isInteger(index) || index < 0 || index >= position.getCount()) {
          throw new Error(`${filePath}: triangle index is out of range`);
        }
      }
      triangles += count / 3;
    }
  }
  for (const child of scene.listChildren()) {
    child.traverse((node) => {
      if (visited.has(node)) return;
      visited.add(node);
      const mesh = node.getMesh();
      if (!mesh) return;
      const matrix = node.getWorldMatrix();
      if (!matrix.every(Number.isFinite)) {
        throw new Error(`${filePath}: non-finite node transform`);
      }
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute('POSITION');
        if (!position) continue;
        const point = [0, 0, 0];
        for (let index = 0; index < position.getCount(); index += 1) {
          position.getElement(index, point);
          const worldPoint = transformPoint(matrix, point);
          if (!worldPoint.every(Number.isFinite)) {
            throw new Error(`${filePath}: non-finite model position`);
          }
          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis], worldPoint[axis]);
            max[axis] = Math.max(max[axis], worldPoint[axis]);
          }
        }
      }
    });
  }
  if (
    triangles <= 0
    || ![...min, ...max].every(Number.isFinite)
    || !max.some((value, axis) => value > min[axis])
  ) {
    throw new Error(`${filePath}: model geometry is invalid`);
  }
  return { rawBounds: { min, max }, triangles };
}

function sameNumbers(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((value, index) => Number.isFinite(value) && value === second[index]);
}

function hasDescendantMesh(node) {
  if (node.getMesh()) return true;
  let found = false;
  node.traverse((candidate) => {
    if (candidate.getMesh()) found = true;
  });
  return found;
}

function validateAuthoredControls(id, document) {
  const root = document.getRoot();
  if (id === 'chestClosed') {
    const lid = root.listNodes().find((node) => node.getName() === 'chestClosed:lid');
    const base = root.listMeshes().find((mesh) => mesh.getName() === 'chestClosed:base');
    if (!lid || !base || !hasDescendantMesh(lid)) {
      throw new Error(`${id}: usable lid node is missing`);
    }
  }
  if (id === 'riggedHand') {
    const skins = root.listSkins();
    const rigJoints = skins.flatMap((skin) => skin.listJoints());
    const namedFingerJoints = root.listNodes().filter((node) => (
      /(thumb|index|middle|ring|pinky)/i.test(node.getName())
    ));
    if (
      !skins.some((skin) => skin.listJoints().length >= 5)
      && namedFingerJoints.length < 5
    ) {
      throw new Error(`${id}: usable rig or named movable joints are missing`);
    }
    if (rigJoints.length > 0 && !root.listAnimations().some(
      (animation) => animation.listChannels().length > 0,
    )) {
      throw new Error(`${id}: rig has no usable animation channels`);
    }
  }
}

function parseLedgerRow(row) {
  return row.slice(1, -1).split('|').map((cell) => cell.trim());
}

function verifyLedgerRow(ledger, id, metadata) {
  const rows = ledger.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
  if (rows.length !== 1) {
    throw new Error(`ATTRIBUTION.md: expected one ${id} row, received ${rows.length}`);
  }
  const descriptor = POLY_PIZZA_EVENT_MODEL_SOURCES[id];
  const expected = [
    id,
    `\`${id}.glb\``,
    `${descriptor.title} / ${descriptor.creator}`,
    descriptor.pageUrl,
    `\`${descriptor.sourceAssetId}\``,
    `[${descriptor.license}](${descriptor.licenseUrl})`,
    String(descriptor.sourceTriangles),
    String(metadata.triangles),
  ];
  const actual = parseLedgerRow(rows[0]);
  if (
    actual.length !== 10
    || JSON.stringify(actual.slice(0, 8)) !== JSON.stringify(expected)
    || !actual[8].includes(metadata.sourceSha256)
    || !actual[8].includes(metadata.outputSha256)
    || actual[9] !== descriptor.downloadedOn
  ) {
    throw new Error(`ATTRIBUTION.md: ${id} row does not match the pinned record`);
  }
}

async function manifestIds() {
  const source = await readFile(resolve('src', 'world', 'eventModelManifest.ts'), 'utf8');
  const declaration = /export const EVENT_MODEL_IDS = \[([\s\S]*?)\] as const;/.exec(source)?.[1];
  if (!declaration) throw new Error('Unable to read runtime EVENT_MODEL_IDS');
  return [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

async function main() {
  const modelsDir = resolve('src', 'assets', 'models', 'events');
  const ledgerPath = resolve('src', 'assets', 'ATTRIBUTION.md');
  const errors = [];
  let metadata = null;
  let ledger = '';

  try {
    const runtimeIds = await manifestIds();
    if (JSON.stringify(runtimeIds) !== JSON.stringify(POLY_PIZZA_EVENT_MODEL_IDS)) {
      errors.push(`manifest IDs do not match importer IDs: ${runtimeIds.join(', ')}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const expectedEntries = new Set([
      ...POLY_PIZZA_EVENT_MODEL_IDS.map((id) => `${id}.glb`),
      'event-model-metadata.json',
    ]);
    const entries = await readdir(modelsDir, { withFileTypes: true });
    const actualEntries = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    for (const entry of entries) {
      if (!entry.isFile() || !expectedEntries.has(entry.name)) {
        errors.push(`unexpected event model entry: ${entry.name}`);
      }
    }
    for (const expected of expectedEntries) {
      if (!actualEntries.has(expected)) errors.push(`missing event model entry: ${expected}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    metadata = JSON.parse(await readFile(
      resolve(modelsDir, 'event-model-metadata.json'),
      'utf8',
    ));
    const metadataIds = Object.keys(metadata);
    if (JSON.stringify(metadataIds) !== JSON.stringify(POLY_PIZZA_EVENT_MODEL_IDS)) {
      errors.push(`metadata IDs do not match importer IDs: ${metadataIds.join(', ')}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    ledger = await readFile(ledgerPath, 'utf8');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const id of POLY_PIZZA_EVENT_MODEL_IDS) {
    const descriptor = POLY_PIZZA_EVENT_MODEL_SOURCES[id];
    const expected = metadata?.[id];
    if (!expected) continue;
    const filePath = resolve(modelsDir, `${id}.glb`);
    try {
      if (
        !descriptor.pageUrl
        || !descriptor.sourceAssetId
        || !descriptor.license
        || !descriptor.licenseUrl
      ) {
        throw new Error(`${id}: source or license data is missing`);
      }
      if (
        expected.sourceUrl !== descriptor.pageUrl
        || expected.sourceModelId !== descriptor.sourceAssetId
        || expected.license !== descriptor.license
        || expected.licenseUrl !== descriptor.licenseUrl
        || expected.sourceSha256 !== descriptor.sourceSha256
        || expected.sourceTriangles !== descriptor.sourceTriangles
      ) {
        throw new Error(`${id}: metadata source record does not match its pin`);
      }
      const bytes = await readFile(filePath);
      if (sha256(bytes) !== expected.outputSha256) {
        throw new Error(`${id}: output SHA-256 does not match metadata`);
      }
      validateEmbeddedResources(filePath, parseGlb(filePath, bytes));
      const document = await io.read(filePath);
      const measurement = inspectDocument(filePath, document);
      if (
        measurement.triangles !== expected.triangles
        || measurement.triangles > descriptor.maxTriangles
      ) {
        throw new Error(`${id}: triangle count does not match its limit or metadata`);
      }
      if (
        !sameNumbers(measurement.rawBounds.min, expected.rawBounds?.min)
        || !sameNumbers(measurement.rawBounds.max, expected.rawBounds?.max)
      ) {
        throw new Error(`${id}: model bounds do not match metadata`);
      }
      validateAuthoredControls(id, document);
      if (ledger) verifyLedgerRow(ledger, id, expected);
      console.log(
        `${id}.glb: ${measurement.triangles} / ${descriptor.maxTriangles} triangles; `
        + `SHA-256 ${expected.outputSha256}`,
      );
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
