import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

export async function prepareTextureOutput(sources, outputDirectory) {
  const outputRoot = resolve(outputDirectory);
  if (sources.some((source) => dirname(resolve(source)) === outputRoot)) {
    throw new Error('Source and output directories must be distinct.');
  }
  await mkdir(outputRoot, { recursive: true });
  return outputRoot;
}

export function resizedTexture(source) {
  return sharp(resolve(source)).resize(512, 512, {
    fit: 'fill',
    kernel: sharp.kernel.lanczos3,
  });
}

export async function writeDataMap(source, destination) {
  await resizedTexture(source)
    .webp({ lossless: true, effort: 6 })
    .toFile(resolve(destination));
}
