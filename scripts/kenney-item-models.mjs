import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, copyToDocument, dedup, prune, unpartition } from '@gltf-transform/functions';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const QX90 = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

export const KENNEY_PACKS = Object.freeze({
  'food-kit': {
    version: '2.0',
    pageUrl: 'https://kenney.nl/assets/food-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip',
    sha256: 'CDAD90853682499B94C9FDA2F87678B24BFD8F3264E0ED323F6B6A27FD7C6F6F',
    licenseUrl: CC0,
    requiredEntries: ['License.txt', 'Models/GLB format/Textures/colormap.png', 'Models/GLB format/can-small.glb', 'Models/GLB format/can.glb'],
  },
  'survival-kit': {
    version: '2.0',
    pageUrl: 'https://kenney.nl/assets/survival-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/survival-kit/4065a8185b-1712149243/kenney_survival-kit.zip',
    sha256: 'C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E',
    licenseUrl: CC0,
    requiredEntries: [
      'License.txt',
      'Models/GLB format/Textures/colormap.png',
      'Models/GLB format/bottle.glb',
      'Models/GLB format/bucket.glb',
    ],
  },
  'prototype-kit': {
    version: '1.0',
    pageUrl: 'https://kenney.nl/assets/prototype-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/prototype-kit/4d3b7073ed-1724832076/kenney_prototype-kit.zip',
    sha256: '213B522FB12BCC9B9AC66C4F7581F7C74623293272212E40A70C39936AD3DA95',
    licenseUrl: CC0,
    requiredEntries: [
      'License.txt',
      'Models/GLB format/Textures/colormap.png',
      'Models/GLB format/shape-cylinder-detailed.glb',
      'Models/GLB format/shape-cylinder.glb',
      'Models/GLB format/shape-hollow-cylinder-detailed.glb',
      'Models/GLB format/shape-hollow-cylinder-half-detailed.glb',
      'Models/GLB format/shape-cube-rounded.glb',
      'Models/GLB format/shape-cube-half.glb',
    ],
  },
});

const direct = (pack, entry, expectedTriangles, scale = [1, 1, 1]) => ({
  kind: 'direct', pack, entry, expectedTriangles, scale,
});
const sourcePart = (name, pack, entry, translation, scale, color, rotation = [0, 0, 0, 1]) => ({
  name, pack, entry, translation, scale, color, rotation,
});

export const KENNEY_ITEM_RECIPES = Object.freeze({
  ductTape: direct('prototype-kit', 'Models/GLB format/shape-hollow-cylinder-detailed.glb', 192, [1, 0.35, 1]),
  fishingRod: {
    kind: 'composite', expectedTriangles: 376, parts: [
      sourcePart('rod', 'prototype-kit', 'Models/GLB format/shape-cylinder-detailed.glb', [0, 0, 0], [0.018, 1.6, 0.018], [0.95, 0.25, 0.08, 1]),
      sourcePart('grip', 'prototype-kit', 'Models/GLB format/shape-cylinder-detailed.glb', [0, -0.35, 0], [0.04, 0.35, 0.04], [0.12, 0.12, 0.14, 1]),
      sourcePart('reel', 'prototype-kit', 'Models/GLB format/shape-hollow-cylinder-detailed.glb', [0.05, -0.14, 0], [0.08, 0.05, 0.08], [0.2, 0.24, 0.3, 1], QX90),
    ],
  },
  baitTin: direct('food-kit', 'Models/GLB format/can-small.glb', 154),
  medicalKit: {
    kind: 'composite', expectedTriangles: 228, parts: [
      sourcePart('case', 'prototype-kit', 'Models/GLB format/shape-cube-rounded.glb', [0, 0, 0], [1, 0.7, 0.3], [0.85, 0.08, 0.06, 1]),
      sourcePart('cross-vertical', 'prototype-kit', 'Models/GLB format/shape-cube-half.glb', [0, 0.15, 0.17], [0.12, 0.8, 0.04], [1, 1, 1, 1]),
      sourcePart('cross-horizontal', 'prototype-kit', 'Models/GLB format/shape-cube-half.glb', [0, 0.29, 0.17], [0.4, 0.24, 0.04], [1, 1, 1, 1]),
    ],
  },
  cannedFood: direct('food-kit', 'Models/GLB format/can.glb', 156),
  flashlight: {
    kind: 'composite', expectedTriangles: 340, parts: [
      sourcePart('body', 'prototype-kit', 'Models/GLB format/shape-cylinder-detailed.glb', [0, 0, 0], [0.18, 0.9, 0.18], [0.12, 0.16, 0.18, 1]),
      sourcePart('head', 'prototype-kit', 'Models/GLB format/shape-cylinder.glb', [0, 0.9, 0], [0.28, 0.25, 0.28], [0.95, 0.32, 0.08, 1]),
      sourcePart('lens-ring', 'prototype-kit', 'Models/GLB format/shape-hollow-cylinder-detailed.glb', [0, 1.15, 0], [0.3, 0.1, 0.3], [0.9, 0.95, 1, 1]),
      sourcePart('switch', 'prototype-kit', 'Models/GLB format/shape-cube-half.glb', [0, 0.65, 0.17], [0.08, 0.12, 0.06], [0.95, 0.32, 0.08, 1]),
    ],
  },
  scubaSet: {
    kind: 'composite', expectedTriangles: 688, parts: [
      sourcePart('tank-left', 'prototype-kit', 'Models/GLB format/shape-cylinder-detailed.glb', [-0.18, 0, 0], [0.24, 1, 0.24], [0.95, 0.35, 0.08, 1]),
      sourcePart('tank-right', 'prototype-kit', 'Models/GLB format/shape-cylinder-detailed.glb', [0.18, 0, 0], [0.24, 1, 0.24], [0.95, 0.35, 0.08, 1]),
      sourcePart('harness', 'prototype-kit', 'Models/GLB format/shape-cube-rounded.glb', [0, 0.12, 0.15], [0.5, 0.72, 0.16], [0.08, 0.12, 0.16, 1]),
      sourcePart('loop-left', 'prototype-kit', 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', [-0.22, 0.58, 0.13], [0.18, 0.52, 0.16], [0.08, 0.12, 0.16, 1]),
      sourcePart('loop-right', 'prototype-kit', 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', [0.22, 0.58, 0.13], [0.18, 0.52, 0.16], [0.08, 0.12, 0.16, 1]),
      sourcePart('regulator', 'prototype-kit', 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', [0, 1.05, 0.18], [0.14, 0.12, 0.14], [0.12, 0.18, 0.22, 1]),
    ],
  },
  bucket: direct('survival-kit', 'Models/GLB format/bucket.glb', 68),
  bottledPaper: {
    kind: 'composite', expectedTriangles: 188, parts: [
      sourcePart('bottle', 'survival-kit', 'Models/GLB format/bottle.glb', [0, 0, 0], [1, 1, 1], [1, 1, 1, 1]),
      sourcePart('rolled-note', 'prototype-kit', 'Models/GLB format/shape-cylinder-detailed.glb', [0, 0.02, 0], [0.12, 0.52, 0.12], [0.80, 0.73, 0.55, 1]),
    ],
  },
});

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sourcePath(sourceRoot, pack, entry) {
  return join(sourceRoot, pack, ...entry.split('/'));
}

function tintMesh(mesh, color, name) {
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial();
    if (!material) continue;
    primitive.setMaterial(
      material.clone().setName(`${name}-material`).setBaseColorFactor(color),
    );
  }
}

async function buildDirect(sourceRoot, itemId, recipe) {
  const document = cloneDocument(await io.read(sourcePath(sourceRoot, recipe.pack, recipe.entry)));
  const scene = document.getRoot().listScenes()[0];
  if (!scene) throw new Error(`${itemId}: source scene is missing`);
  scene.setName(itemId);
  for (const node of scene.listChildren()) {
    node.setName(`${itemId}:${node.getName() || 'source'}`);
    node.setScale(node.getScale().map((value, axis) => value * recipe.scale[axis]));
  }
  await document.transform(prune(), dedup(), unpartition());
  return document;
}

async function buildComposite(sourceRoot, itemId, recipe) {
  const document = new Document();
  document.createBuffer('buffer');
  const scene = document.createScene(itemId);
  const sources = new Map();
  for (const spec of recipe.parts) {
    const key = `${spec.pack}:${spec.entry}`;
    if (!sources.has(key)) {
      sources.set(key, await io.read(sourcePath(sourceRoot, spec.pack, spec.entry)));
    }
    const source = sources.get(key);
    for (const sourceExtension of source.getRoot().listExtensionsUsed()) {
      const targetExtension = document.createExtension(sourceExtension.constructor);
      if (sourceExtension.isRequired()) targetExtension.setRequired(true);
    }
    const sourceMesh = source.getRoot().listMeshes()[0];
    if (!sourceMesh) throw new Error(`${itemId}: ${spec.entry} contains no mesh`);
    const map = copyToDocument(document, source, [sourceMesh]);
    const mesh = map.get(sourceMesh);
    if (!mesh) throw new Error(`${itemId}: failed to copy ${spec.entry}`);
    tintMesh(mesh, spec.color, spec.name);
    scene.addChild(document.createNode(`${itemId}:${spec.name}`)
      .setMesh(mesh)
      .setTranslation(spec.translation)
      .setRotation(spec.rotation)
      .setScale(spec.scale));
  }
  await document.transform(prune(), unpartition());
  return document;
}

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getIndices()?.getCount()
        ?? primitive.getAttribute('POSITION')?.getCount()
        ?? 0;
      total += count / 3;
    }
  }
  return total;
}

export async function buildKenneyItemModels({ sourceRoot, outputRoot, recipes = KENNEY_ITEM_RECIPES }) {
  await mkdir(outputRoot, { recursive: true });
  for (const [itemId, recipe] of Object.entries(recipes)) {
    let document;
    try {
      document = recipe.kind === 'direct'
        ? await buildDirect(sourceRoot, itemId, recipe)
        : await buildComposite(sourceRoot, itemId, recipe);
    } catch (error) {
      throw new Error(`${itemId}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const triangles = countTriangles(document);
    if (triangles !== recipe.expectedTriangles) {
      throw new Error(`${itemId}: expected ${recipe.expectedTriangles} triangles, received ${triangles}`);
    }
    await io.write(join(outputRoot, `${itemId}.glb`), document);
  }
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--packs') {
    console.log(JSON.stringify(KENNEY_PACKS));
    return;
  }
  if (args.length !== 2) {
    throw new Error('Usage: node scripts/kenney-item-models.mjs --packs | <sourceRoot> <outputRoot>');
  }
  await buildKenneyItemModels({ sourceRoot: args[0], outputRoot: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
