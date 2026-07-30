import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { inspectEventModel } from './event-model-metadata.mjs';

const EVENT_SOURCES = Object.freeze({
  fogMan: Object.freeze({
    publicId: 'mQnGoME1ez',
    resourceId: '66b57880-bcb0-479a-8d72-5c3e88afaa39',
    sha256: '31FF1539E7A9A209D4EB1107E696D798FEDC7E35D84A58BBABFDC0F1B8B73763',
    triangles: 2058,
    maxTriangles: 2_200,
    title: 'Man in Suit',
    creator: 'Quaternius',
    license: 'CC0 1.0',
  }),
  ghost: Object.freeze({
    publicId: '112vpcommxv',
    resourceId: '02d70fdb-284b-4799-a9ee-18c7277f158c',
    sha256: '3AFB58D595ECA2D5F7953847CF51230270BB9EEE40B59F56FE04CDF4A28CD1C3',
    triangles: 1039,
    maxTriangles: 1_100,
    title: 'Ghoooooost',
    creator: 'Nikki Morin',
    license: 'CC BY 3.0',
  }),
  siren: Object.freeze({
    publicId: 'nIItLV9nxS',
    resourceId: '46d6db5a-3c9f-4238-8cdf-8eb7194498dc',
    sha256: 'A6522FE53D15DE21130A957D1BF2B8A9A58D4E4E9A12AF646645B667A9BB2D17',
    triangles: 6108,
    maxTriangles: 6_200,
    title: 'Animated Woman',
    creator: 'Quaternius',
    license: 'CC0 1.0',
  }),
  sirenRock: Object.freeze({
    publicId: 'CrSoV13mCU',
    resourceId: '3e9d82ac-0749-42b6-8dfd-082393547ed5',
    sha256: '8A0595C2F0C6914CC1794CE8CB35517F4451EB4CFB6703D3A58CA654D5900BAB',
    triangles: 214,
    maxTriangles: 250,
    title: 'Rock Flat',
    creator: 'Kenney',
    license: 'CC0 1.0',
  }),
});
const EVENT_MODEL_IDS = Object.freeze(['fogMan', 'ghost', 'siren', 'sirenRock']);
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sameNumbers(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((value, index) => Number.isFinite(value) && value === second[index]);
}

function sameAnimations(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((animation, index) => {
      const expected = second[index];
      return animation?.name === expected?.name
        && animation?.duration === expected?.duration
        && animation?.channels === expected?.channels;
    });
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
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
}

function validateEmbeddedResources(filePath, json) {
  for (const buffer of json.buffers ?? []) {
    if (typeof buffer.uri === 'string' && !buffer.uri.startsWith('data:')) {
      throw new Error(`${filePath}: external buffer URI: ${buffer.uri}`);
    }
  }
  for (const image of json.images ?? []) {
    if (typeof image.uri === 'string' && !image.uri.startsWith('data:')) {
      throw new Error(`${filePath}: external image URI: ${image.uri}`);
    }
    if (image.uri === undefined && !Number.isInteger(image.bufferView)) {
      throw new Error(`${filePath}: image has no embedded data`);
    }
  }
}

function validateIndices(modelId, document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const positionCount = primitive.getAttribute('POSITION')?.getCount() ?? 0;
      const indices = primitive.getIndices()?.getArray();
      if (!indices) continue;
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= positionCount) {
          throw new Error(`${modelId}: invalid vertex index ${index}`);
        }
      }
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
  let metadata;

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
    metadata = JSON.parse(
      await readFile(resolve(modelsDir, 'event-model-metadata.json'), 'utf8'),
    );
    if (JSON.stringify(Object.keys(metadata)) !== JSON.stringify(EVENT_MODEL_IDS)) {
      errors.push('event-model-metadata.json keys do not match pinned model IDs');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const modelId of EVENT_MODEL_IDS) {
    const source = EVENT_SOURCES[modelId];
    const filePath = resolve(modelsDir, `${modelId}.glb`);
    try {
      await access(filePath);
      const bytes = await readFile(filePath);
      const actualHash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
      if (actualHash !== source.sha256) {
        throw new Error(`${modelId}: source SHA-256 mismatch`);
      }
      const json = parseGlb(filePath, bytes);
      validateEmbeddedResources(filePath, json);
      const document = await io.read(filePath);
      validateIndices(modelId, document);
      const measurement = inspectEventModel(modelId, document);
      measurements[modelId] = measurement;
      console.log(`${modelId}.glb: ${measurement.triangles} / ${source.maxTriangles} triangles`);
      if (measurement.triangles !== source.triangles) {
        throw new Error(
          `${modelId}: expected ${source.triangles} triangles, received ${measurement.triangles}`,
        );
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
        throw new Error(`${modelId}: generated metadata does not match the source model`);
      }
      if (!source.publicId || !source.resourceId || !source.sha256) {
        throw new Error(`${modelId}: pinned source descriptor is incomplete`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!assetsOnly) {
    try {
      const ledger = (await readFile(ledgerPath, 'utf8')).replaceAll('\r\n', '\n');
      for (const modelId of EVENT_MODEL_IDS) {
        const source = EVENT_SOURCES[modelId];
        const expectedBlock = [
          `- "${source.title}" by ${source.creator}.`,
          `  Source: https://poly.pizza/m/${source.publicId}`,
          `  License: ${source.license}.`,
          `  Source asset ID: \`poly-pizza:${source.resourceId}\`.`,
          `  Source GLB SHA-256: \`${source.sha256}\`.`,
        ].join('\n');
        if (!ledger.includes(expectedBlock)) {
          errors.push(`ATTRIBUTION.md: ${modelId} entry does not match the pinned source`);
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
