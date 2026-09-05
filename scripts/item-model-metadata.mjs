import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { POLY_PIZZA_MODEL_SOURCES } from './poly-pizza-models.mjs';
import { inspectModelTextures } from './poly-pizza-textures.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function worldPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
}

function recordWorldPoint(itemId, rawBounds, state, matrix, point) {
  const world = worldPoint(matrix, point);
  if (!world.every(Number.isFinite)) throw new Error(`${itemId}: non-finite model bounds`);
  state.positionCount += 1;
  for (let axis = 0; axis < 3; axis += 1) {
    rawBounds.min[axis] = Math.min(rawBounds.min[axis], world[axis]);
    rawBounds.max[axis] = Math.max(rawBounds.max[axis], world[axis]);
  }
}

function inspectPrimitive(itemId, primitive, matrix, rawBounds, state) {
  if (primitive.getMode() !== 4) {
    throw new Error(`${itemId}: primitive mode ${primitive.getMode()} is not TRIANGLES`);
  }
  const position = primitive.getAttribute('POSITION');
  if (!position || position.getCount() === 0) {
    throw new Error(`${itemId}: missing or empty POSITION data`);
  }
  const elements = primitive.getIndices()?.getCount() ?? position.getCount();
  if (elements % 3 !== 0) throw new Error(`${itemId}: incomplete triangle data`);
  state.triangles += elements / 3;
  const point = [0, 0, 0];
  for (let index = 0; index < position.getCount(); index += 1) {
    position.getElement(index, point);
    recordWorldPoint(itemId, rawBounds, state, matrix, point);
  }
}

function inspectNode(itemId, node, visited, rawBounds, state) {
  if (visited.has(node)) return;
  visited.add(node);
  const mesh = node.getMesh();
  if (!mesh) return;
  const matrix = node.getWorldMatrix();
  if (!matrix.every(Number.isFinite)) throw new Error(`${itemId}: non-finite world matrix`);
  for (const primitive of mesh.listPrimitives()) {
    inspectPrimitive(itemId, primitive, matrix, rawBounds, state);
  }
}

function animationMetadata(animation) {
  let duration = 0;
  for (const sampler of animation.listSamplers()) {
    const times = sampler.getInput()?.getArray();
    if (!times) continue;
    for (const time of times) duration = Math.max(duration, time);
  }
  return {
    name: animation.getName(),
    duration,
    channels: animation.listChannels().length,
  };
}

function inspectDocument(itemId, document) {
  const rawBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const state = { triangles: 0, positionCount: 0 };
  const visited = new Set();
  const scenes = document.getRoot().getDefaultScene()
    ? [document.getRoot().getDefaultScene()]
    : document.getRoot().listScenes();

  for (const scene of scenes) {
    for (const child of scene.listChildren()) {
      child.traverse((node) => inspectNode(itemId, node, visited, rawBounds, state));
    }
  }

  if (
    state.positionCount === 0
    || state.triangles <= 0
    || ![...rawBounds.min, ...rawBounds.max].every(Number.isFinite)
    || !rawBounds.max.some((maximum, axis) => maximum > rawBounds.min[axis])
  ) {
    throw new Error(`${itemId}: empty or non-finite model bounds`);
  }
  const animations = document.getRoot().listAnimations().map(animationMetadata);
  return { triangles: state.triangles, rawBounds, animations };
}

export async function buildItemModelMetadata(modelsDir, itemIds) {
  if (new Set(itemIds).size !== itemIds.length) throw new Error('item IDs must be unique');
  const metadata = {};
  for (const itemId of itemIds) {
    const document = await io.read(join(modelsDir, `${itemId}.glb`));
    const textureProfile = POLY_PIZZA_MODEL_SOURCES[itemId]?.textureProfile;
    metadata[itemId] = {
      ...inspectDocument(itemId, document),
      ...(textureProfile ? { textures: await inspectModelTextures(document) } : {}),
    };
  }
  await writeFile(
    join(modelsDir, 'item-model-metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}

async function runCli(args) {
  if (args.length < 2) {
    throw new Error('Usage: node scripts/item-model-metadata.mjs <modelsDir> <itemId...>');
  }
  await buildItemModelMetadata(args[0], args.slice(1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
