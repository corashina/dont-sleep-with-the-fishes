import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, dedup, prune, unpartition } from '@gltf-transform/functions';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

const recipe = (entry, expectedTriangles) => ({ entry, expectedTriangles });

export const KENNEY_SHIP_FURNITURE_RECIPES = Object.freeze({
  bedBunk: recipe('Models/GLTF format/bedBunk.glb', 580),
  desk: recipe('Models/GLTF format/desk.glb', 198),
  chairDesk: recipe('Models/GLTF format/chairDesk.glb', 588),
  bookcaseOpen: recipe('Models/GLTF format/bookcaseOpen.glb', 320),
  bookcaseClosedDoors: recipe('Models/GLTF format/bookcaseClosedDoors.glb', 296),
  table: recipe('Models/GLTF format/table.glb', 120),
  sideTableDrawers: recipe('Models/GLTF format/sideTableDrawers.glb', 238),
});

export const KENNEY_SHIP_FURNITURE_PACK = Object.freeze({
  version: '1.0',
  pageUrl: 'https://kenney.nl/assets/furniture-kit',
  archiveUrl: 'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip',
  sha256: 'E67652D0932CEE41683F74711C03D3E192A2AF9979EF8E6B237711F5482D46B0',
  licenseUrl: CC0,
  requiredEntries: [
    'License.txt',
    ...Object.values(KENNEY_SHIP_FURNITURE_RECIPES).map(({ entry }) => entry),
  ],
});

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function countRenderedTriangles(scene) {
  let total = 0;
  for (const child of scene.listChildren()) {
    child.traverse((node) => {
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        total += (primitive.getIndices()?.getCount()
          ?? primitive.getAttribute('POSITION')?.getCount()
          ?? 0) / 3;
      }
    });
  }
  return total;
}

export async function buildKenneyShipFurniture({
  sourceRoot,
  outputRoot,
  recipes = KENNEY_SHIP_FURNITURE_RECIPES,
}) {
  await mkdir(outputRoot, { recursive: true });
  for (const [runtimeId, modelRecipe] of Object.entries(recipes)) {
    let document;
    try {
      document = cloneDocument(await io.read(join(sourceRoot, ...modelRecipe.entry.split('/'))));
    } catch (error) {
      throw new Error(
        `${runtimeId}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const scene = document.getRoot().listScenes()[0];
    if (!scene) throw new Error(`${runtimeId}: source scene is missing`);
    scene.setName(runtimeId);
    for (const node of scene.listChildren()) node.setName(runtimeId);
    await document.transform(prune(), dedup(), unpartition());
    const triangles = countRenderedTriangles(scene);
    if (triangles !== modelRecipe.expectedTriangles) {
      throw new Error(
        `${runtimeId}: expected ${modelRecipe.expectedTriangles} triangles, received ${triangles}`,
      );
    }
    await io.write(join(outputRoot, `${runtimeId}.glb`), document);
  }
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--pack') {
    console.log(JSON.stringify(KENNEY_SHIP_FURNITURE_PACK));
    return;
  }
  if (args.length !== 2) {
    throw new Error(
      'Usage: node scripts/kenney-ship-furniture.mjs --pack | <sourceRoot> <outputRoot>',
    );
  }
  await buildKenneyShipFurniture({ sourceRoot: args[0], outputRoot: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
