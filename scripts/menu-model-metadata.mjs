import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { inspectEventModel } from './event-model-metadata.mjs';
import {
  POLY_PIZZA_MENU_MODEL_IDS,
  POLY_PIZZA_MENU_MODEL_SOURCES,
} from './poly-pizza-menu-models.mjs';
import { inspectModelTextures } from './poly-pizza-textures.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

export async function buildMenuModelMetadata(modelsDir) {
  const metadata = {};
  for (const modelId of POLY_PIZZA_MENU_MODEL_IDS) {
    const document = await io.read(join(modelsDir, `${modelId}.glb`));
    const textureProfile = POLY_PIZZA_MENU_MODEL_SOURCES[modelId].textureProfile;
    metadata[modelId] = {
      ...inspectEventModel(modelId, document),
      ...(textureProfile ? { textures: await inspectModelTextures(document) } : {}),
    };
  }
  await writeFile(
    join(modelsDir, 'menu-model-metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    throw new Error('Usage: node scripts/menu-model-metadata.mjs <modelsDir>');
  }
  await buildMenuModelMetadata(process.argv[2]);
}
