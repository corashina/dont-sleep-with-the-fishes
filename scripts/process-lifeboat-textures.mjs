import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const [colorSource, roughnessSource, normalSource, outputDirectory] = process.argv.slice(2);
if (!colorSource || !roughnessSource || !normalSource || !outputDirectory) {
  throw new Error(
    'Usage: node scripts/process-lifeboat-textures.mjs '
    + '<color> <roughness> <normal-gl> <output-directory>',
  );
}

const outputRoot = resolve(outputDirectory);
for (const source of [colorSource, roughnessSource, normalSource]) {
  if (dirname(resolve(source)) === outputRoot) {
    throw new Error('Source and output directories must be distinct.');
  }
}
await mkdir(outputRoot, { recursive: true });

async function writeColor(source, destination) {
  await sharp(resolve(source))
    .resize(512, 512, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .modulate({ brightness: 0.62, saturation: 0.68 })
    .linear([0.92, 0.88, 0.82], [4, 3, 2])
    .webp({ lossless: true, effort: 6 })
    .toFile(resolve(destination));
}

async function writeDataMap(source, destination) {
  await sharp(resolve(source))
    .resize(512, 512, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .webp({ lossless: true, effort: 6 })
    .toFile(resolve(destination));
}

await Promise.all([
  writeColor(colorSource, `${outputRoot}/wood-planks-color.webp`),
  writeDataMap(roughnessSource, `${outputRoot}/wood-planks-roughness.webp`),
  writeDataMap(normalSource, `${outputRoot}/wood-planks-normal.webp`),
]);
