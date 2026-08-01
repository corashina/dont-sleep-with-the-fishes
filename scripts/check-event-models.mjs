import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { inspectEventModel } from './event-model-metadata.mjs';
import { parseModelCheckArguments } from './model-check-arguments.mjs';
import { parseGlb, validateEmbeddedResources } from './glb-validation.mjs';

const EVENT_SOURCES = Object.freeze({
  driftingLootBarrel: Object.freeze({
    publicId: 'cu9GJ0j13fj',
    resourceId: '2244f3ae-5583-4ea0-b980-6fdd0084cee7',
    sha256: '89031BAAA180FD8040C8C2A27F56AC479BD6FE8A7C4EC5495D1433D185840EF5',
    triangles: 282,
    maxTriangles: 2_000,
    title: 'Barrel',
    creator: 'Don Carson',
    license: 'CC BY 3.0',
  }),
  driftingLootCrate: Object.freeze({
    publicId: '3VGWnZPXmG',
    resourceId: '720097e2-63ed-4e5f-9b66-eb416942eea0',
    sha256: '4FB00BA01EEFEA3F1A335A6D3ACC67E8F4E093B9FC227673B82F67E12E098D6E',
    triangles: 784,
    maxTriangles: 2_000,
    title: 'Crate',
    creator: 'Quaternius',
    license: 'CC0 1.0',
  }),
  driftingBottle: Object.freeze({
    publicId: '13g9ucgxbHV',
    resourceId: 'b1a8f402-de55-4e49-b63e-1439e5851c13',
    sha256: '5C1169A709CF2B897E9037771BC8B33EDE3C546A2CA872F33BF8A9348F112D54',
    triangles: 304,
    maxTriangles: 2_000,
    title: 'Bottle of Wine',
    creator: 'Jeremy',
    license: 'CC BY 3.0',
  }),
  mysteryChest: Object.freeze({
    publicId: 'O72u4Drp8k',
    resourceId: '803af4ae-433f-4b05-b1f1-c6a2da02d768',
    sha256: '07193221A749D5DCF2B0A3D82D4EE9831DA2E2C4CA71B395050A88BB2BABE75B',
    triangles: 1_676,
    maxTriangles: 2_000,
    title: 'Chest',
    creator: 'Quaternius',
    license: 'CC0 1.0',
  }),
  flowers: Object.freeze({
    publicId: '0-_GjMekeob',
    resourceId: '856b7c36-4bd0-48f1-a308-529366b6a7fd',
    sha256: 'CC4BA073B2CC94B4CADA9BB25C15C3832052E2F3A018B3E2EB7F9429E6D2384B',
    triangles: 728,
    maxTriangles: 2_000,
    title: 'Lily Pad',
    creator: 'Poly by Google',
    license: 'CC BY 3.0',
  }),
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
const EVENT_MODEL_IDS = Object.freeze(Object.keys(EVENT_SOURCES));
const FOCUSED_EVENT_MODEL_IDS = Object.freeze([
  'chestClosed',
  'midnightIsland',
  'deadTree',
  'traderRowboat',
  'riggedHand',
  'containerShip',
]);
const ATTRIBUTION_MODEL_IDS = Object.freeze(['ghost', 'fogMan', 'siren', 'sirenRock']);
const ATTRIBUTION_HEADING = '## Runtime survival-event model ledger';
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

function exactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `${label} keys must be exactly ${sortedExpected.join(', ')}; received ${actualKeys.join(', ')}`,
    );
  }
}

export function validateEventModelMetadata(metadata) {
  for (const modelId of EVENT_MODEL_IDS) {
    if (!(modelId in metadata)) {
      throw new Error(`event model metadata is missing ${modelId}`);
    }
  }
  for (const modelId of EVENT_MODEL_IDS) {
    const model = metadata[modelId];
    exactKeys(model, ['triangles', 'rawBounds', 'animations'], `${modelId} metadata`);
    exactKeys(model.rawBounds, ['min', 'max'], `${modelId} rawBounds`);
    if (!Array.isArray(model.animations)) {
      throw new Error(`${modelId} animations is not an array`);
    }
    model.animations.forEach((animation, index) => {
      exactKeys(
        animation,
        ['name', 'duration', 'channels'],
        `${modelId} animation ${index}`,
      );
    });
  }
}

function expectedAttributionBlock(modelId) {
  const source = EVENT_SOURCES[modelId];
  return [
    `- "${source.title}" by ${source.creator}.`,
    `  Source: https://poly.pizza/m/${source.publicId}`,
    `  License: ${source.license}.`,
    `  Source asset ID: \`poly-pizza:${source.resourceId}\`.`,
    `  Source GLB SHA-256: \`${source.sha256}\`.`,
  ].join('\n');
}

function attributionBlocks(section) {
  const blocks = [];
  let current = null;
  for (const line of section.split('\n')) {
    if (line.startsWith('- ')) {
      if (current) blocks.push(current.join('\n'));
      current = [line];
    } else if (current && line.startsWith('  ')) {
      current.push(line);
    } else if (current) {
      blocks.push(current.join('\n'));
      current = null;
    }
  }
  if (current) blocks.push(current.join('\n'));
  return blocks;
}

export function validateEventModelAttribution(ledgerText) {
  const ledger = ledgerText.replaceAll('\r\n', '\n');
  const headingMatches = ledger.split(ATTRIBUTION_HEADING).length - 1;
  if (headingMatches !== 1) {
    throw new Error(
      `ATTRIBUTION.md: expected one event model heading, received ${headingMatches}`,
    );
  }
  const sectionStart = ledger.indexOf(ATTRIBUTION_HEADING) + ATTRIBUTION_HEADING.length;
  const nextHeading = ledger.indexOf('\n## ', sectionStart);
  const section = ledger.slice(sectionStart, nextHeading < 0 ? ledger.length : nextHeading);
  const blocks = attributionBlocks(section);
  if (blocks.length !== ATTRIBUTION_MODEL_IDS.length) {
    throw new Error(
      `ATTRIBUTION.md: expected ${ATTRIBUTION_MODEL_IDS.length} attribution blocks, received ${blocks.length}`,
    );
  }
  ATTRIBUTION_MODEL_IDS.forEach((modelId, index) => {
    if (blocks[index] !== expectedAttributionBlock(modelId)) {
      throw new Error(`ATTRIBUTION.md: ${modelId} attribution block does not match`);
    }
  });
  const eventMarkers = ATTRIBUTION_MODEL_IDS.flatMap((modelId) => {
    const source = EVENT_SOURCES[modelId];
    return [
      `"${source.title}" by`,
      `https://poly.pizza/m/${source.publicId}`,
      `poly-pizza:${source.resourceId}`,
      source.sha256,
    ];
  });
  const ledgerEventBlocks = attributionBlocks(ledger).filter((block) => (
    eventMarkers.some((marker) => block.includes(marker))
  ));
  if (ledgerEventBlocks.length !== ATTRIBUTION_MODEL_IDS.length) {
    throw new Error(
      `ATTRIBUTION.md: expected ${ATTRIBUTION_MODEL_IDS.length} event attribution blocks in the ledger, received ${ledgerEventBlocks.length}`,
    );
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

async function main() {
  const { assetsOnly, ledgerPath, modelsDir } = parseModelCheckArguments(
    process.argv.slice(2),
    ['src', 'assets', 'models', 'events'],
  );
  const errors = [];
  const measurements = {};
  let metadata;

  try {
    const expected = new Set([
      ...EVENT_MODEL_IDS.map((id) => `${id}.glb`),
      ...FOCUSED_EVENT_MODEL_IDS.map((id) => `${id}.glb`),
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
    validateEventModelMetadata(metadata);
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
      validateEmbeddedResources(filePath, parseGlb(filePath, bytes));
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
      validateEventModelAttribution(await readFile(ledgerPath, 'utf8'));
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
