import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import eventModelLock from './event-model-lock.json' with { type: 'json' };
import { inspectEventModel } from './event-model-metadata.mjs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  getBounds,
  normals,
  prune,
  simplify,
  unpartition,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

export const POLY_PIZZA_EVENT_MODEL_PAGES = Object.freeze({
  leakPlanks: 'https://poly.pizza/m/hwQ1Fx5P8U',
  schoolFish: 'https://poly.pizza/m/HkUAXudvBt',
  snatcher: 'https://poly.pizza/m/BR1vpIvvvv',
  anglerFish: 'https://poly.pizza/m/85n5_RiSeSf',
  deathStareBlob: 'https://poly.pizza/m/IoWG5F9WUc',
  tornadoCore: 'https://poly.pizza/m/2TBzV_5N0ci',
  midnightShovel: 'https://poly.pizza/m/oNBQSf87ZJ',
  midnightMonster: 'https://poly.pizza/m/22K0aSZkHV',
});

export const EVENT_MODEL_TRIANGLE_LIMITS = Object.freeze({
  leakPlanks: 2_000,
  schoolFish: 2_000,
  snatcher: 4_000,
  anglerFish: 4_000,
  deathStareBlob: 5_000,
  tornadoCore: 3_000,
  midnightShovel: 1_000,
  midnightMonster: 6_000,
});

export const EVENT_MODEL_TOTAL_TRIANGLE_LIMIT = 20_000;
export const EVENT_MODEL_IDS = Object.freeze(Object.keys(POLY_PIZZA_EVENT_MODEL_PAGES));
export const POLY_PIZZA_EVENT_MODEL_IDS = EVENT_MODEL_IDS;
export const POLY_PIZZA_EVENT_MODEL_SOURCES = Object.freeze(Object.fromEntries(
  EVENT_MODEL_IDS.map((id) => [id, Object.freeze({
    ...eventModelLock.sources[id],
    committedSha256: id === 'leakPlanks'
      ? '8EFEDCE21FEF2A542E047BD82F2C9E04D59CF81810ECFB6D62D5DA9239677DD6'
      : id === 'schoolFish'
        ? '94C8D591FA64FC5E9EE77669D1DEC18376F7EDD3EA5A659504D87E80FAA9308F'
        : id === 'snatcher'
          ? 'F775807D6EB98B8D8DDF95FF8AB158779537A563C8C537A9F6CD9AA26EDD2C3E'
          : id === 'anglerFish'
            ? '6BC94129AE46B671535537A74CE7369A824C3617D9C9FCA32CB7B417BFA72DDF'
            : id === 'deathStareBlob'
              ? 'CF870628D467F00FE6FBFE428C948C41FD7180F11D954075DFF998D320593D1F'
              : id === 'tornadoCore'
                ? 'A3060A591DE5B796C495FD7B329CE83766D2DFE39F9387B2DE44CF620FB3A24F'
                : id === 'midnightShovel'
                  ? '1D482586A319E0C176BACE1EBFEB618F903187F36C91755E6CE061874B19F6D5'
                  : '76599ABFADB3629F435165418BFCF02FB8FAC2C34A71B913106663655E6C41D0',
  })]),
));

const LICENSE_URLS = Object.freeze({
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
});
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultLockPath = join(repositoryRoot, 'scripts', 'event-model-lock.json');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

export function countEventModelTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (primitive.getMode() !== 4) {
        throw new Error(`primitive mode ${primitive.getMode()} is not TRIANGLES`);
      }
      if (!position || position.getCount() === 0) {
        throw new Error('mesh has missing or empty POSITION data');
      }
      const count = primitive.getIndices()?.getCount() ?? position.getCount();
      if (count % 3 !== 0) throw new Error('mesh has incomplete triangle data');
      total += count / 3;
    }
  }
  return total;
}

function pagePublicId(pageUrl) {
  const publicId = new URL(pageUrl).pathname.split('/').filter(Boolean).at(-1);
  if (!publicId) throw new Error(`Invalid Poly Pizza page URL: ${pageUrl}`);
  return publicId;
}

function parsePageState(id, pageUrl, html) {
  const match = html.match(
    /window\.__SERVER_APP_STATE__\s*=\s*(\{.*?\})<\/script>/s,
  );
  if (!match) throw new Error(`${id}: Poly Pizza page state is missing`);
  const model = JSON.parse(match[1]).initialData?.model;
  if (!model) throw new Error(`${id}: Poly Pizza model metadata is missing`);
  const publicId = pagePublicId(pageUrl);
  if (model.PublicID !== publicId) {
    throw new Error(`${id}: page returned public ID ${model.PublicID}`);
  }
  const licenseUrl = LICENSE_URLS[model.Licence];
  if (!licenseUrl) throw new Error(`${id}: unsupported license ${model.Licence}`);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(model.ResourceID)) {
    throw new Error(`${id}: invalid static asset ID ${model.ResourceID}`);
  }
  return Object.freeze({
    id,
    pageUrl,
    publicId,
    resourceId: model.ResourceID,
    downloadUrl: `https://static.poly.pizza/${model.ResourceID}.glb`,
    sourceAssetId: `poly-pizza:${model.ResourceID}`,
    modelName: model.Title,
    author: model.Creator?.Username || 'Anonymous',
    license: model.Licence,
    licenseUrl,
    pageAnimated: model.Animated === true,
  });
}

export async function discoverEventModelSources(fetcher = fetch) {
  const entries = await Promise.all(EVENT_MODEL_IDS.map(async (id) => {
    const pageUrl = POLY_PIZZA_EVENT_MODEL_PAGES[id];
    const response = await fetcher(pageUrl);
    if (!response.ok) {
      throw new Error(`${id}: Poly Pizza page returned HTTP ${response.status}`);
    }
    return [id, parsePageState(id, pageUrl, await response.text())];
  }));
  return Object.freeze(Object.fromEntries(entries));
}

async function readLock(lockPath = defaultLockPath) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  if (lock.schemaVersion !== 1) throw new Error('event model lock schema is invalid');
  if (JSON.stringify(Object.keys(lock.sources ?? {})) !== JSON.stringify(EVENT_MODEL_IDS)) {
    throw new Error('event model lock IDs do not match approved page IDs');
  }
  for (const id of EVENT_MODEL_IDS) {
    const source = lock.sources[id];
    if (source.id !== id || source.pageUrl !== POLY_PIZZA_EVENT_MODEL_PAGES[id]) {
      throw new Error(`${id}: event model lock page is invalid`);
    }
    const publicId = pagePublicId(source.pageUrl);
    const expectedDownloadUrl = `https://static.poly.pizza/${source.resourceId}.glb`;
    if (
      source.publicId !== publicId
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(source.resourceId)
      || source.downloadUrl !== expectedDownloadUrl
      || source.sourceAssetId !== `poly-pizza:${source.resourceId}`
      || !source.modelName
      || !source.author
      || !LICENSE_URLS[source.license]
      || source.licenseUrl !== LICENSE_URLS[source.license]
      || !/^[A-F0-9]{64}$/.test(source.sha256)
      || !Number.isInteger(source.sourceTriangles)
      || source.sourceTriangles <= 0
      || typeof source.pageAnimated !== 'boolean'
      || typeof source.sourceHasSkins !== 'boolean'
      || !Number.isInteger(source.sourceAnimationCount)
      || source.sourceAnimationCount < 0
      || !/^\d{4}-\d{2}-\d{2}$/.test(source.downloadedOn)
    ) {
      throw new Error(`${id}: event model lock metadata is invalid`);
    }
  }
  return lock;
}

async function inspectBinary(id, bytes) {
  const document = await io.readBinary(new Uint8Array(bytes));
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${id}: source scene is missing`);
  const triangles = countEventModelTriangles(document);
  const rawBounds = getBounds(scene);
  if (
    ![...rawBounds.min, ...rawBounds.max].every(Number.isFinite)
    || !rawBounds.max.some((maximum, axis) => maximum > rawBounds.min[axis])
  ) {
    throw new Error(`${id}: source bounds are empty or non-finite`);
  }
  return {
    document,
    triangles,
    rawBounds,
    hasSkins: root.listSkins().length > 0,
    animationCount: root.listAnimations().length,
  };
}

export async function writeEventModelLock({
  lockPath = defaultLockPath,
  fetcher = fetch,
} = {}) {
  const discovered = await discoverEventModelSources(fetcher);
  const downloadedOn = new Date().toISOString().slice(0, 10);
  const sources = {};
  for (const id of EVENT_MODEL_IDS) {
    const source = discovered[id];
    const response = await fetcher(source.downloadUrl);
    if (!response.ok) {
      throw new Error(`${id}: static GLB returned HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const inspected = await inspectBinary(id, bytes);
    sources[id] = {
      ...source,
      sha256: sha256(bytes),
      sourceTriangles: inspected.triangles,
      sourceHasSkins: inspected.hasSkins,
      sourceAnimationCount: inspected.animationCount,
      downloadedOn,
    };
  }
  const lock = { schemaVersion: 1, generatedOn: downloadedOn, sources };
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

function validateDiscoveredAgainstLock(discovered, lock) {
  for (const id of EVENT_MODEL_IDS) {
    const current = discovered[id];
    const pinned = lock.sources[id];
    if (current.license !== pinned.license) {
      throw new Error(
        `${id}: license changed from ${pinned.license} to ${current.license}`,
      );
    }
    if (current.sourceAssetId !== pinned.sourceAssetId) {
      throw new Error(
        `${id}: source asset changed from ${pinned.sourceAssetId} to ${current.sourceAssetId}`,
      );
    }
    for (const field of ['modelName', 'author']) {
      if (current[field] !== pinned[field]) {
        throw new Error(`${id}: ${field} changed from ${pinned[field]} to ${current[field]}`);
      }
    }
  }
}

function sceneBounds(id, document) {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (!scene) throw new Error(`${id}: processed scene is missing`);
  const rawBounds = getBounds(scene);
  if (
    ![...rawBounds.min, ...rawBounds.max].every(Number.isFinite)
    || !rawBounds.max.some((maximum, axis) => maximum > rawBounds.min[axis])
  ) {
    throw new Error(`${id}: processed bounds are empty or non-finite`);
  }
  return rawBounds;
}

async function processEventModel(id, sourcePath, outputPath, descriptor) {
  const bytes = await readFile(sourcePath);
  const actualHash = sha256(bytes);
  if (actualHash !== descriptor.sha256) {
    throw new Error(
      `${id}: expected source SHA-256 ${descriptor.sha256}, received ${actualHash}`,
    );
  }
  const source = await inspectBinary(id, bytes);
  if (source.triangles !== descriptor.sourceTriangles) {
    throw new Error(
      `${id}: expected ${descriptor.sourceTriangles} source triangles, received ${source.triangles}`,
    );
  }
  if (
    source.hasSkins !== descriptor.sourceHasSkins
    || source.animationCount !== descriptor.sourceAnimationCount
  ) {
    throw new Error(`${id}: source skin or animation metadata changed`);
  }

  const staticSource = !source.hasSkins && source.animationCount === 0;
  if (staticSource) {
    await source.document.transform(prune(), dedup(), weld(), prune(), dedup(), unpartition());
  } else {
    if (id === 'midnightMonster') {
      await source.document.transform(
        weld(),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: 0.97,
          error: 0.01,
          lockBorder: false,
        }),
        normals({ overwrite: true }),
      );
    }
    await source.document.transform(prune(), dedup(), unpartition());
  }

  const root = source.document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${id}: processed scene is missing`);
  scene.setName(id);
  scene.listChildren().forEach((node, index) => {
    node.setName(`${id}:${node.getName() || `source-${index + 1}`}`);
  });

  const triangles = countEventModelTriangles(source.document);
  const limit = EVENT_MODEL_TRIANGLE_LIMITS[id];
  if (triangles <= 0 || triangles > limit) {
    throw new Error(`${id}: processed triangle count ${triangles} exceeds ${limit}`);
  }
  sceneBounds(id, source.document);
  await mkdir(dirname(outputPath), { recursive: true });
  await io.write(outputPath, source.document);
  const outputBytes = await readFile(outputPath);
  const output = await inspectBinary(id, outputBytes);
  return {
    triangles: output.triangles,
    rawBounds: output.rawBounds,
    sourceSha256: descriptor.sha256,
    sourceTriangles: descriptor.sourceTriangles,
    outputSha256: sha256(outputBytes),
    hasSkins: output.hasSkins,
    animationCount: output.animationCount,
    animations: inspectEventModel(id, output.document).animations,
    processing: staticSource
      ? 'pruned, deduplicated, welded, unpartitioned, renamed, and embedded'
      : id === 'midnightMonster'
        ? 'welded, simplified, normals regenerated, pruned, deduplicated, unpartitioned, renamed, and embedded; retained source skin and animation data'
        : 'pruned, deduplicated, unpartitioned, renamed, and embedded; retained source skin and animation data',
  };
}

export async function buildPolyPizzaEventModels({
  sourceRoot,
  outputRoot,
  lockPath = defaultLockPath,
}) {
  const lock = await readLock(lockPath);
  const metadata = {};
  let total = 0;
  for (const id of EVENT_MODEL_IDS) {
    const result = await processEventModel(
      id,
      join(sourceRoot, `${id}.glb`),
      join(outputRoot, `${id}.glb`),
      lock.sources[id],
    );
    metadata[id] = result;
    total += result.triangles;
  }
  if (total > EVENT_MODEL_TOTAL_TRIANGLE_LIMIT) {
    throw new Error(
      `event model total ${total} exceeds ${EVENT_MODEL_TOTAL_TRIANGLE_LIMIT}`,
    );
  }
  await writeFile(
    join(outputRoot, 'event-model-metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--discover') {
    console.log(JSON.stringify(await discoverEventModelSources(), null, 2));
    return;
  }
  if (args.length === 1 && args[0] === '--write-lock') {
    console.log(JSON.stringify(await writeEventModelLock(), null, 2));
    return;
  }
  if (args.length === 1 && args[0] === '--sources') {
    console.log(JSON.stringify((await readLock()).sources));
    return;
  }
  if (args.length === 1 && args[0] === '--verify-pages') {
    const lock = await readLock();
    validateDiscoveredAgainstLock(await discoverEventModelSources(), lock);
    console.log('Event model pages match the lock.');
    return;
  }
  if (args.length !== 2) {
    throw new Error(
      'Usage: node scripts/poly-pizza-event-models.mjs --discover | --write-lock | --sources | --verify-pages | <sourceRoot> <outputRoot>',
    );
  }
  await buildPolyPizzaEventModels({ sourceRoot: args[0], outputRoot: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
