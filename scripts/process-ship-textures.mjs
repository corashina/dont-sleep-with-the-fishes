import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const [
  darkWoodColorSource,
  darkWoodRoughnessSource,
  darkWoodNormalSource,
  roomWallColorSource,
  roomWallRoughnessSource,
  roomWallNormalSource,
  outputDirectory,
] = process.argv.slice(2);

if (
  !darkWoodColorSource
  || !darkWoodRoughnessSource
  || !darkWoodNormalSource
  || !roomWallColorSource
  || !roomWallRoughnessSource
  || !roomWallNormalSource
  || !outputDirectory
) {
  throw new Error(
    'Usage: node scripts/process-ship-textures.mjs '
    + '<dark-wood-color> <dark-wood-roughness> <dark-wood-normal-gl> '
    + '<room-wall-color> <room-wall-roughness> <room-wall-normal-gl> '
    + '<output-directory>',
  );
}

const outputRoot = resolve(outputDirectory);
for (const source of [
  darkWoodColorSource,
  darkWoodRoughnessSource,
  darkWoodNormalSource,
  roomWallColorSource,
  roomWallRoughnessSource,
  roomWallNormalSource,
]) {
  if (dirname(resolve(source)) === outputRoot) {
    throw new Error('Source and output directories must be distinct.');
  }
}
await mkdir(outputRoot, { recursive: true });

async function writeColor(source, destination) {
  await sharp(resolve(source))
    .resize(512, 512, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
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
  writeColor(darkWoodColorSource, `${outputRoot}/dark-wood-color.webp`),
  writeDataMap(darkWoodRoughnessSource, `${outputRoot}/dark-wood-roughness.webp`),
  writeDataMap(darkWoodNormalSource, `${outputRoot}/dark-wood-normal.webp`),
  writeColor(roomWallColorSource, `${outputRoot}/room-painted-wood-color.webp`),
  writeDataMap(
    roomWallRoughnessSource,
    `${outputRoot}/room-painted-wood-roughness.webp`,
  ),
  writeDataMap(
    roomWallNormalSource,
    `${outputRoot}/room-painted-wood-normal.webp`,
  ),
]);
