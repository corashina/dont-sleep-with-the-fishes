const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function dataUriByteLength(uri) {
  const separator = uri.indexOf(',');
  if (separator < 0) return 0;
  const metadata = uri.slice(0, separator);
  const payload = uri.slice(separator + 1);
  try {
    return metadata.endsWith(';base64')
      ? Buffer.from(payload, 'base64').byteLength
      : Buffer.from(decodeURIComponent(payload)).byteLength;
  } catch {
    return 0;
  }
}

export function parseGlb(filePath, bytes) {
  if (bytes.byteLength < 20) throw new Error(`${filePath}: invalid GLB header`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error(`${filePath}: invalid glTF 2.0 binary`);
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > bytes.byteLength) {
    throw new Error(`${filePath}: invalid GLB JSON chunk`);
  }
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binaryOffset = 20 + jsonLength;
  const binaryLength = binaryOffset + 8 <= bytes.byteLength
    && view.getUint32(binaryOffset + 4, true) === BIN_CHUNK
    ? Math.min(view.getUint32(binaryOffset, true), bytes.byteLength - binaryOffset - 8)
    : 0;
  return { binaryLength, json };
}

function collectReferencedTextures(value, key, indices) {
  if (!value || typeof value !== 'object') return;
  if (key.endsWith('Texture') && Number.isInteger(value.index)) indices.add(value.index);
  for (const [childKey, childValue] of Object.entries(value)) {
    collectReferencedTextures(childValue, childKey, indices);
  }
}

function textureSource(texture) {
  return texture?.source
    ?? texture?.extensions?.KHR_texture_basisu?.source
    ?? texture?.extensions?.EXT_texture_webp?.source
    ?? texture?.extensions?.EXT_texture_avif?.source;
}

function imageHasEmbeddedBytes(json, binaryLength, image) {
  if (!image) return false;
  if (typeof image.uri === 'string') {
    return image.uri.startsWith('data:') && dataUriByteLength(image.uri) > 0;
  }
  if (!Number.isInteger(image.bufferView)) return false;
  const bufferView = json.bufferViews?.[image.bufferView];
  if (!bufferView || !Number.isInteger(bufferView.byteLength) || bufferView.byteLength <= 0) {
    return false;
  }
  const buffer = json.buffers?.[bufferView.buffer];
  const availableBytes = typeof buffer?.uri === 'string'
    ? (buffer.uri.startsWith('data:') ? dataUriByteLength(buffer.uri) : 0)
    : binaryLength;
  const byteOffset = bufferView.byteOffset ?? 0;
  return Number.isInteger(byteOffset)
    && byteOffset >= 0
    && byteOffset + bufferView.byteLength <= availableBytes;
}

export function validateEmbeddedResources(filePath, descriptor) {
  const { binaryLength, json } = descriptor;
  for (const buffer of json.buffers ?? []) {
    if (typeof buffer.uri === 'string' && !buffer.uri.startsWith('data:')) {
      throw new Error(`${filePath}: external buffer URI: ${buffer.uri}`);
    }
  }
  for (const image of json.images ?? []) {
    if (typeof image.uri === 'string' && !image.uri.startsWith('data:')) {
      throw new Error(`${filePath}: external texture URI: ${image.uri}`);
    }
  }
  const referencedTextures = new Set();
  for (const material of json.materials ?? []) {
    collectReferencedTextures(material, '', referencedTextures);
  }
  for (const textureIndex of referencedTextures) {
    const source = textureSource(json.textures?.[textureIndex]);
    if (!Number.isInteger(source) || !imageHasEmbeddedBytes(json, binaryLength, json.images?.[source])) {
      throw new Error(`${filePath}: referenced texture has no embedded image bytes`);
    }
  }
}
