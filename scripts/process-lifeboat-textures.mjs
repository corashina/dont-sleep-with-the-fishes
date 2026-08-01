import { resolve } from 'node:path';
import {
  prepareTextureOutput,
  resizedTexture,
  writeDataMap,
} from './texture-processing.mjs';

const [colorSource, roughnessSource, normalSource, outputDirectory] = process.argv.slice(2);
if (!colorSource || !roughnessSource || !normalSource || !outputDirectory) {
  throw new Error(
    'Usage: node scripts/process-lifeboat-textures.mjs '
    + '<color> <roughness> <normal-gl> <output-directory>',
  );
}

const outputRoot = await prepareTextureOutput(
  [colorSource, roughnessSource, normalSource],
  outputDirectory,
);

async function writeColor(source, destination) {
  await resizedTexture(source)
    .modulate({ brightness: 0.62, saturation: 0.68 })
    .linear([0.92, 0.88, 0.82], [4, 3, 2])
    .webp({ lossless: true, effort: 6 })
    .toFile(resolve(destination));
}

await Promise.all([
  writeColor(colorSource, `${outputRoot}/wood-planks-color.webp`),
  writeDataMap(roughnessSource, `${outputRoot}/wood-planks-roughness.webp`),
  writeDataMap(normalSource, `${outputRoot}/wood-planks-normal.webp`),
]);
