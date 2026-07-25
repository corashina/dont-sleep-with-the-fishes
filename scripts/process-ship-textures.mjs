import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const [
  woodColorSource,
  woodRoughnessSource,
  woodNormalSource,
  outputDirectory,
] = process.argv.slice(2);

if (
  !woodColorSource
  || !woodRoughnessSource
  || !woodNormalSource
  || !outputDirectory
) {
  throw new Error(
    'Usage: node scripts/process-ship-textures.mjs '
    + '<wood-color> <wood-roughness> <wood-normal-gl> <output-directory>',
  );
}

const outputRoot = resolve(outputDirectory);
for (const source of [
  woodColorSource,
  woodRoughnessSource,
  woodNormalSource,
]) {
  if (dirname(resolve(source)) === outputRoot) {
    throw new Error('Source and output directories must be distinct.');
  }
}
await mkdir(outputRoot, { recursive: true });

async function writeColor(source, destination, colorTreatment) {
  await sharp(resolve(source))
    .resize(512, 512, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .modulate(colorTreatment)
    .webp({ quality: 88, effort: 6 })
    .toFile(resolve(destination));
}

async function writeDataMap(source, destination) {
  await sharp(resolve(source))
    .resize(512, 512, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .webp({ lossless: true, effort: 6 })
    .toFile(resolve(destination));
}

await Promise.all([
  writeColor(
    woodColorSource,
    `${outputRoot}/deck-wood-color.webp`,
    { brightness: 0.68, saturation: 0.7 },
  ),
  writeDataMap(woodRoughnessSource, `${outputRoot}/deck-wood-roughness.webp`),
  writeDataMap(woodNormalSource, `${outputRoot}/deck-wood-normal.webp`),
]);
