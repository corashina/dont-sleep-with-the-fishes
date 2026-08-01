import { resolve } from 'node:path';
import {
  prepareTextureOutput,
  resizedTexture,
  writeDataMap,
} from './texture-processing.mjs';

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

const outputRoot = await prepareTextureOutput([
  darkWoodColorSource,
  darkWoodRoughnessSource,
  darkWoodNormalSource,
  roomWallColorSource,
  roomWallRoughnessSource,
  roomWallNormalSource,
], outputDirectory);

async function writeColor(source, destination) {
  await resizedTexture(source)
    .webp({ quality: 88, effort: 6 })
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
