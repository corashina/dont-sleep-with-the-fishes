import sharp from 'sharp';
import { compressTexture, listTextureSlots } from '@gltf-transform/functions';

function sorted(values) {
  return [...values].sort();
}

function sameValues(first, second) {
  return JSON.stringify(sorted(first)) === JSON.stringify(sorted(second));
}

async function imageMetadata(texture) {
  const image = texture.getImage();
  if (!image) throw new Error(`${texture.getName() || 'unnamed texture'}: missing image data`);
  const metadata = await sharp(image).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`${texture.getName() || 'unnamed texture'}: missing image dimensions`);
  }
  return {
    mimeType: texture.getMimeType(),
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    slots: sorted(listTextureSlots(texture)),
    hasAlpha: metadata.hasAlpha,
  };
}

function textureQuality(texture, profile, modelId) {
  const slots = listTextureSlots(texture);
  const normal = slots.includes('normalTexture');
  if (normal && slots.some((slot) => slot !== 'normalTexture')) {
    throw new Error(`${modelId}: one texture cannot serve normal and color or packed slots`);
  }
  return normal ? profile.normalQuality : profile.colorQuality;
}

export async function processModelTextures(modelId, document, profile) {
  if (!profile) return;
  for (const texture of document.getRoot().listTextures()) {
    const before = await imageMetadata(texture);
    await compressTexture(texture, {
      encoder: sharp,
      targetFormat: 'webp',
      resize: [profile.maxDimension, profile.maxDimension],
      quality: textureQuality(texture, profile, modelId),
    });
    const after = await imageMetadata(texture);
    if (before.hasAlpha !== after.hasAlpha) {
      throw new Error(`${modelId}: texture ${texture.getName()} changed alpha use`);
    }
  }
}

export async function inspectModelTextures(document) {
  const textures = [];
  for (const texture of document.getRoot().listTextures()) {
    textures.push({
      name: texture.getName(),
      ...await imageMetadata(texture),
    });
  }
  return textures;
}

function validateProfileSettings(modelId, bytes, profile) {
  if (profile.maxDimension !== 512 || profile.colorQuality !== 85) {
    throw new Error(`${modelId}: texture profile must use 512 pixels and color quality 85`);
  }
  if (profile.normalQuality < 90) {
    throw new Error(`${modelId}: normal texture quality must stay high`);
  }
  if (bytes.byteLength >= profile.maxFileBytes) {
    throw new Error(
      `${modelId}: ${bytes.byteLength} bytes must stay below ${profile.maxFileBytes}`,
    );
  }
}

function validateTexture(modelId, texture, expected, profile) {
  if (texture.mimeType !== 'image/webp') {
    throw new Error(`${modelId}: texture ${expected.name} must use WebP`);
  }
  if (texture.width !== expected.width || texture.height !== expected.height) {
    throw new Error(
      `${modelId}: texture ${expected.name} must be ${expected.width}x${expected.height}`,
    );
  }
  if (texture.width > profile.maxDimension || texture.height > profile.maxDimension) {
    throw new Error(`${modelId}: texture ${expected.name} exceeds the profile limit`);
  }
  if (texture.channels !== expected.channels) {
    throw new Error(`${modelId}: texture ${expected.name} has unexpected channels`);
  }
  if (!sameValues(texture.slots, expected.slots)) {
    throw new Error(`${modelId}: texture ${expected.name} has unexpected material slots`);
  }
  if (texture.hasAlpha !== expected.hasAlpha) {
    throw new Error(`${modelId}: texture ${expected.name} has unexpected alpha use`);
  }
}

export async function validateModelTextureProfile(modelId, bytes, document, profile) {
  if (!profile) return [];
  validateProfileSettings(modelId, bytes, profile);
  const textures = await inspectModelTextures(document);
  if (textures.length !== profile.textures.length) {
    throw new Error(
      `${modelId}: expected ${profile.textures.length} textures, received ${textures.length}`,
    );
  }
  for (const expected of profile.textures) {
    const texture = textures.find((candidate) => candidate.name === expected.name);
    if (!texture) throw new Error(`${modelId}: missing texture ${expected.name}`);
    validateTexture(modelId, texture, expected, profile);
  }
  return textures;
}
