import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { normals, prune, simplify, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

export const POLY_PIZZA_FISHING_ROD = Object.freeze({
  pageUrl: 'https://poly.pizza/m/9gXWYDqB6vt',
  downloadUrl: 'https://static.poly.pizza/b50b26a5-173d-4833-af8f-1f30f97d3e59.glb',
  sourceAssetId: 'poly-pizza:b50b26a5-173d-4833-af8f-1f30f97d3e59',
  creator: 'Justin Randall',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  sha256: 'B51A2E1A642E0DF431B2C8992EB251F88F83B294282F7591319433A76EA396A7',
  sourceTriangles: 14_860,
  simplifyRatio: 0.16,
  simplifyError: 0.012,
});

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

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

function removeSplitNormals(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const normal = primitive.getAttribute('NORMAL');
      primitive.setAttribute('NORMAL', null);
      normal?.dispose();
    }
  }
}

export async function buildPolyPizzaFishingRod({
  sourcePath,
  outputPath,
  descriptor = POLY_PIZZA_FISHING_ROD,
  verifySource = true,
}) {
  const bytes = await readFile(sourcePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (verifySource && sha256 !== descriptor.sha256) {
    throw new Error(`fishingRod: expected source SHA-256 ${descriptor.sha256}, received ${sha256}`);
  }

  const document = await io.read(sourcePath);
  const sourceTriangles = countTriangles(document);
  if (verifySource && sourceTriangles !== descriptor.sourceTriangles) {
    throw new Error(
      `fishingRod: expected ${descriptor.sourceTriangles} source triangles, received ${sourceTriangles}`,
    );
  }

  removeSplitNormals(document);
  await document.transform(
    weld(),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: descriptor.simplifyRatio,
      error: descriptor.simplifyError,
      lockBorder: false,
    }),
    normals({ overwrite: true }),
    prune(),
    unpartition(),
  );

  const scene = document.getRoot().listScenes()[0];
  if (!scene) throw new Error('fishingRod: source scene is missing');
  scene.setName('fishingRod');
  for (const node of scene.listChildren()) {
    node.setName(`fishingRod:${node.getName() || 'source'}`);
  }

  const triangles = countTriangles(document);
  if (triangles <= 0 || triangles > 3_000) {
    throw new Error(`fishingRod: processed triangle count ${triangles} exceeds the 3,000 limit`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await io.write(outputPath, document);
  return { sha256, sourceTriangles, triangles };
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--source') {
    console.log(JSON.stringify(POLY_PIZZA_FISHING_ROD));
    return;
  }
  if (args.length !== 2) {
    throw new Error(
      'Usage: node scripts/poly-pizza-fishing-rod.mjs --source | <sourceGlb> <outputGlb>',
    );
  }
  await buildPolyPizzaFishingRod({ sourcePath: args[0], outputPath: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
