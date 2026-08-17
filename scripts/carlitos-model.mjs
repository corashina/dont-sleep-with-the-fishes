import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, unpartition } from '@gltf-transform/functions';

export const CARLITOS_SOURCE = Object.freeze({
  creator: 'DreamNoms',
  downloadedOn: '2026-08-04',
  license: 'CC-BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  maxTriangles: 8_000,
  pageUrl: 'https://sketchfab.com/3d-models/somali-cat-animated-ver-12-e185c3fd92b64c32b4515a32b29252fc',
  sourceAssetId: 'sketchfab:e185c3fd92b64c32b4515a32b29252fc',
  sourceSha256: '52F3B3260D2610BA82E2B7FE0FD4A9E610A5A387F1B2D4C7C2419719AD3BD408',
  sourceTriangles: 7_632,
  title: 'Somali Cat Animated ver 1.2',
});

export const CARLITOS_SITTING_IDLE_CLIP = 'SittingIdle';
export const CARLITOS_FLOOR_NODE = 'Cube_41';

const SOURCE_CLIPS = Object.freeze([
  'Idle',
  'WalkClean',
  'SitDown',
  CARLITOS_SITTING_IDLE_CLIP,
  'StandUp',
]);
const DEFAULT_OUTPUT_PATH = resolve(
  'src',
  'assets',
  'models',
  'items',
  'carlitos.glb',
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sourceHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function verifySource(bytes) {
  const actual = sourceHash(bytes);
  if (actual !== CARLITOS_SOURCE.sourceSha256) {
    throw new Error(
      `Unexpected Somali Cat SHA-256: expected ${CARLITOS_SOURCE.sourceSha256}, received ${actual}`,
    );
  }
}

function retainSittingIdle(document) {
  const animations = document.getRoot().listAnimations();
  const names = animations.map((animation) => animation.getName());
  if (JSON.stringify(names) !== JSON.stringify(SOURCE_CLIPS)) {
    throw new Error(`Unexpected Somali Cat animation clips: ${names.join(', ')}`);
  }
  for (const animation of animations) {
    if (animation.getName() !== CARLITOS_SITTING_IDLE_CLIP) {
      animation.dispose();
    }
  }
}

function removeDisplayFloor(document) {
  const floorNodes = document.getRoot().listNodes().filter(
    (node) => node.getName() === CARLITOS_FLOOR_NODE,
  );
  if (floorNodes.length !== 1) {
    throw new Error(
      `Expected one Somali Cat floor node, received ${floorNodes.length}`,
    );
  }
  floorNodes[0].dispose();
}

export async function buildCarlitos(
  sourcePath,
  outputPath = DEFAULT_OUTPUT_PATH,
) {
  const sourceBytes = await readFile(sourcePath);
  verifySource(sourceBytes);
  const document = await io.read(sourcePath);
  retainSittingIdle(document);
  removeDisplayFloor(document);
  await document.transform(prune(), dedup(), unpartition());
  await io.write(outputPath, document);
}

async function runCli(args) {
  if (args.length < 1 || args.length > 2) {
    throw new Error(
      'Usage: node scripts/carlitos-model.mjs <source.glb> [output.glb]',
    );
  }
  const sourcePath = resolve(args[0]);
  const outputPath = args[1] ? resolve(args[1]) : DEFAULT_OUTPUT_PATH;
  await buildCarlitos(sourcePath, outputPath);
  console.log(
    `Wrote ${outputPath} with animation ${CARLITOS_SITTING_IDLE_CLIP}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
