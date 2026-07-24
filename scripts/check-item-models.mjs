import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

export const MODEL_LIMIT = 3_000;
export const LIBRARY_LIMIT = 40_000;
export const COLLECTIBLE_ITEM_IDS = [
  'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'medicalKit',
  'spyglass', 'fishingNet', 'bucket', 'flareGun', 'scubaSet', 'anchor',
  'bottledPaper', 'umbrella', 'swimRing', 'flashlight', 'harpoonGun',
  'energyBar',
];
export const EQUIPMENT_MODEL_IDS = ['fishingRod'];
export const MODEL_IDS = [...COLLECTIBLE_ITEM_IDS, ...EQUIPMENT_MODEL_IDS];
const PROJECT_ITEM_IDS = [
  'map', 'spyglass', 'fishingNet', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
];

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const CC0_LEDGER_CELL = '[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)';
const CC_BY_3_LEDGER_CELL = '[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)';
const FOOD_SHA256 = 'CDAD90853682499B94C9FDA2F87678B24BFD8F3264E0ED323F6B6A27FD7C6F6F';
const SURVIVAL_SHA256 = 'C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E';
const PROTOTYPE_SHA256 = '213B522FB12BCC9B9AC66C4F7581F7C74623293272212E40A70C39936AD3DA95';
const DOWNLOADED = '2026-07-15';
const QUATERNIUS_SURVIVAL_SHA256 = 'DB7E41CE2B2F872480E3C24236FDB5CE64AD05071C436B6C47BC455CD3540EB5';
const QUATERNIUS_PIRATE_KIT_SHA256 = 'ED201326D2F80CFAC4E3CDC7DB34152078AE35F98D77AA14ED7416A931276D36';
const QUATERNIUS_DOWNLOADED = '2026-07-17';
const POLY_PIZZA_FISHING_ROD_SHA256 = 'B51A2E1A642E0DF431B2C8992EB251F88F83B294282F7591319433A76EA396A7';
const POLY_PIZZA_DOWNLOADED = '2026-07-24';

const LEDGER_REQUIREMENTS = {
  cannedFood: [
    'cannedFood', '`cannedFood.glb`', 'Can / Kenney', 'https://kenney.nl/assets/food-kit',
    '`food-kit@2.0:Models/GLB format/can.glb`', CC0_LEDGER_CELL, '156', '156',
    `Food Kit 2.0 archive SHA-256 \`${FOOD_SHA256}\`; direct build from \`Models/GLB format/can.glb\`; source node scale multiplied by \`[1, 1, 1]\`; prune, deduplicate, unpartition, and embed resources in the committed GLB.`,
    DOWNLOADED,
  ],
  baitTin: [
    'baitTin', '`baitTin.glb`', 'Small can / Kenney', 'https://kenney.nl/assets/food-kit',
    '`food-kit@2.0:Models/GLB format/can-small.glb`', CC0_LEDGER_CELL, '154', '154',
    `Food Kit 2.0 archive SHA-256 \`${FOOD_SHA256}\`; direct build from \`Models/GLB format/can-small.glb\`; source node scale multiplied by \`[1, 1, 1]\`; prune, deduplicate, unpartition, and embed resources in the committed GLB.`,
    DOWNLOADED,
  ],
  ductTape: [
    'ductTape', '`ductTape.glb`', 'Hollow cylinder detailed / Kenney', 'https://kenney.nl/assets/prototype-kit',
    '`prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb`', CC0_LEDGER_CELL, '192', '192',
    `Prototype Kit 1.0 archive SHA-256 \`${PROTOTYPE_SHA256}\`; direct build from \`Models/GLB format/shape-hollow-cylinder-detailed.glb\`; source node scale multiplied by \`[1, 0.35, 1]\`; prune, deduplicate, unpartition, and embed resources in the committed GLB.`,
    DOWNLOADED,
  ],
  compass: [
    'compass', '`compass.glb`', 'Open compass / Quaternius', 'https://quaternius.com/packs/survival.html',
    '`quaternius-survival-pack@2020-09:OBJ/Compass_Open.obj`', CC0_LEDGER_CELL, '656', '656',
    `Survival Pack September 2020 archive SHA-256 \`${QUATERNIUS_SURVIVAL_SHA256}\`; restricted OBJ parsing; MTL base-color transfer; fan triangulation; prune, dedup, unpartition, and embedded resources.`,
    QUATERNIUS_DOWNLOADED,
  ],
  flareGun: [
    'flareGun', '`flareGun.glb`', 'Flare gun / Quaternius', 'https://quaternius.com/packs/survival.html',
    '`quaternius-survival-pack@2020-09:OBJ/FlareGun.obj`', CC0_LEDGER_CELL, '540', '540',
    `Survival Pack September 2020 archive SHA-256 \`${QUATERNIUS_SURVIVAL_SHA256}\`; restricted OBJ parsing; MTL base-color transfer; fan triangulation; prune, dedup, unpartition, and embedded resources.`,
    QUATERNIUS_DOWNLOADED,
  ],
  anchor: [
    'anchor', '`anchor.glb`', 'Anchor / Quaternius', 'https://quaternius.com/packs/piratekit.html',
    '`quaternius-pirate-kit@2023-11:OBJ/Prop_Anchor.obj`', CC0_LEDGER_CELL, '544', '544',
    `Pirate Kit November 2023 archive SHA-256 \`${QUATERNIUS_PIRATE_KIT_SHA256}\`; restricted OBJ parsing; MTL transfer with project steel PBR override (base color #66737d, metallic 0.85, roughness 0.42); fan triangulation; prune, dedup, unpartition, and embedded resources.`,
    QUATERNIUS_DOWNLOADED,
  ],
  medicalKit: [
    'medicalKit', '`medicalKit.glb`', 'Medical kit composite / Kenney', 'https://kenney.nl/assets/prototype-kit',
    '`prototype-kit@1.0:composite/medicalKit`', CC0_LEDGER_CELL, '228', '228',
    `Prototype Kit 1.0 archive SHA-256 \`${PROTOTYPE_SHA256}\`; source triangle sum 228. Parts: \`Models/GLB format/shape-cube-rounded.glb\` case T \`[0, 0, 0]\`, R \`[0, 0, 0, 1]\`, S \`[1, 0.7, 0.3]\`, RGBA \`[0.85, 0.08, 0.06, 1]\`; \`Models/GLB format/shape-cube-half.glb\` cross-vertical T \`[0, 0.15, 0.17]\`, R \`[0, 0, 0, 1]\`, S \`[0.12, 0.8, 0.04]\`, RGBA \`[1, 1, 1, 1]\`; \`Models/GLB format/shape-cube-half.glb\` cross-horizontal T \`[0, 0.29, 0.17]\`, R \`[0, 0, 0, 1]\`, S \`[0.4, 0.24, 0.04]\`, RGBA \`[1, 1, 1, 1]\`; prune, unpartition, and embed resources in the committed GLB.`,
    DOWNLOADED,
  ],
  bucket: [
    'bucket', '`bucket.glb`', 'Bucket / Kenney', 'https://kenney.nl/assets/survival-kit',
    '`survival-kit@2.0:Models/GLB format/bucket.glb`', CC0_LEDGER_CELL, '68', '68',
    `Survival Kit 2.0 archive SHA-256 \`${SURVIVAL_SHA256}\`; direct build from \`Models/GLB format/bucket.glb\`; source node scale multiplied by \`[1, 1, 1]\`; prune, deduplicate, unpartition, and embed resources in the committed GLB.`,
    DOWNLOADED,
  ],
  bottledPaper: [
    'bottledPaper', '`bottledPaper.glb`', 'Bottled paper composite / Kenney + project', 'https://kenney.nl/assets/survival-kit',
    '`survival-kit@2.0:composite/bottledPaper`', CC0_LEDGER_CELL, '188', '188',
    `Survival Kit 2.0 archive SHA-256 \`${SURVIVAL_SHA256}\` input \`Models/GLB format/bottle.glb\` (96 triangles), part \`bottle\` T \`[0, 0, 0]\`, R \`[0, 0, 0, 1]\`, S \`[1, 1, 1]\`, RGBA \`[1, 1, 1, 1]\`; Prototype Kit 1.0 archive SHA-256 \`${PROTOTYPE_SHA256}\` input \`Models/GLB format/shape-cylinder-detailed.glb\` (92 triangles), part \`rolled-note\` T \`[0, 0.02, 0]\`, R \`[0, 0, 0, 1]\`, S \`[0.12, 0.52, 0.12]\`, RGBA \`[0.80, 0.73, 0.55, 1]\`; project-authored composition, replacement base colors, prune, unpartition, and embedded resources.`,
    DOWNLOADED,
  ],
  flashlight: [
    'flashlight', '`flashlight.glb`', 'Flashlight composite / Kenney', 'https://kenney.nl/assets/prototype-kit',
    '`prototype-kit@1.0:composite/flashlight`', CC0_LEDGER_CELL, '340', '340',
    `Prototype Kit 1.0 archive SHA-256 \`${PROTOTYPE_SHA256}\`; source triangle sum 340. Parts: \`Models/GLB format/shape-cylinder-detailed.glb\` body T \`[0, 0, 0]\`, R \`[0, 0, 0, 1]\`, S \`[0.18, 0.9, 0.18]\`, RGBA \`[0.12, 0.16, 0.18, 1]\`; \`Models/GLB format/shape-cylinder.glb\` head T \`[0, 0.9, 0]\`, R \`[0, 0, 0, 1]\`, S \`[0.28, 0.25, 0.28]\`, RGBA \`[0.95, 0.32, 0.08, 1]\`; \`Models/GLB format/shape-hollow-cylinder-detailed.glb\` lens-ring T \`[0, 1.15, 0]\`, R \`[0, 0, 0, 1]\`, S \`[0.3, 0.1, 0.3]\`, RGBA \`[0.9, 0.95, 1, 1]\`; \`Models/GLB format/shape-cube-half.glb\` switch T \`[0, 0.65, 0.17]\`, R \`[0, 0, 0, 1]\`, S \`[0.08, 0.12, 0.06]\`, RGBA \`[0.95, 0.32, 0.08, 1]\`; prune, unpartition, and embed resources in the committed GLB.`,
    DOWNLOADED,
  ],
  fishingRod: [
    'fishingRod', '`fishingRod.glb`', 'Fishing rod / Justin Randall', 'https://poly.pizza/m/9gXWYDqB6vt',
    '`poly-pizza:b50b26a5-173d-4833-af8f-1f30f97d3e59`', CC_BY_3_LEDGER_CELL, '14860', '2964',
    `Source GLB SHA-256 \`${POLY_PIZZA_FISHING_ROD_SHA256}\`; downloaded from the model's official Poly Pizza static asset. Removed split source normals, welded coincident positions, simplified each material primitive with meshoptimizer ratio 0.16 and error limit 0.012, regenerated flat normals, pruned unused data, unpartitioned buffers, renamed the scene and root node, and embedded all resources in the committed GLB. Kenney Survival Kit 2.0 was checked first but contains no standalone fishing rod.`,
    POLY_PIZZA_DOWNLOADED,
  ],
  scubaSet: [
    'scubaSet', '`scubaSet.glb`', 'Scuba set composite / Kenney', 'https://kenney.nl/assets/prototype-kit',
    '`prototype-kit@1.0:composite/scubaSet`', CC0_LEDGER_CELL, '688', '688',
    `Prototype Kit 1.0 archive SHA-256 \`${PROTOTYPE_SHA256}\`; source triangle sum 688. Parts: \`Models/GLB format/shape-cylinder-detailed.glb\` tank-left T \`[-0.18, 0, 0]\`, R \`[0, 0, 0, 1]\`, S \`[0.24, 1, 0.24]\`, RGBA \`[0.95, 0.35, 0.08, 1]\`; \`Models/GLB format/shape-cylinder-detailed.glb\` tank-right T \`[0.18, 0, 0]\`, R \`[0, 0, 0, 1]\`, S \`[0.24, 1, 0.24]\`, RGBA \`[0.95, 0.35, 0.08, 1]\`; \`Models/GLB format/shape-cube-rounded.glb\` harness T \`[0, 0.12, 0.15]\`, R \`[0, 0, 0, 1]\`, S \`[0.5, 0.72, 0.16]\`, RGBA \`[0.08, 0.12, 0.16, 1]\`; \`Models/GLB format/shape-hollow-cylinder-half-detailed.glb\` loop-left T \`[-0.22, 0.58, 0.13]\`, R \`[0, 0, 0, 1]\`, S \`[0.18, 0.52, 0.16]\`, RGBA \`[0.08, 0.12, 0.16, 1]\`; \`Models/GLB format/shape-hollow-cylinder-half-detailed.glb\` loop-right T \`[0.22, 0.58, 0.13]\`, R \`[0, 0, 0, 1]\`, S \`[0.18, 0.52, 0.16]\`, RGBA \`[0.08, 0.12, 0.16, 1]\`; \`Models/GLB format/shape-hollow-cylinder-half-detailed.glb\` regulator T \`[0, 1.05, 0.18]\`, R \`[0, 0, 0, 1]\`, S \`[0.14, 0.12, 0.14]\`, RGBA \`[0.12, 0.18, 0.22, 1]\`; prune, unpartition, and embed resources in the committed GLB.`,
    DOWNLOADED,
  ],
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

function parseLedgerRow(row) {
  return row.slice(1, -1).split('|').map((cell) => cell.trim());
}

function verifyLedgerRow(ledger, itemId) {
  const rows = ledger.split(/\r?\n/).filter((line) => line.startsWith(`| ${itemId} |`));
  if (rows.length !== 1) {
    throw new Error(`THIRD_PARTY_ASSETS.md: expected one ${itemId} row, received ${rows.length}`);
  }
  const actual = parseLedgerRow(rows[0]);
  const expected = LEDGER_REQUIREMENTS[itemId];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`THIRD_PARTY_ASSETS.md: ${itemId} row does not match the expected record`);
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
