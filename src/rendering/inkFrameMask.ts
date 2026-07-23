import { DataTexture, RGBAFormat, UnsignedByteType } from 'three';

function hash(x: number, y: number): number {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

export function createInkFrameMask(size = 128): DataTexture {
  if (!Number.isInteger(size) || size < 32) {
    throw new RangeError('Ink frame size must be an integer of at least 32.');
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y) / size;
      const wobble = ((hash(x >> 1, y >> 1) & 255) / 255 - 0.5) * 0.055;
      const alpha = Math.round(
        255 * Math.min(1, Math.max(0, (0.115 + wobble - edge) / 0.095)),
      );
      const offset = (y * size + x) * 4;
      data[offset] = alpha;
      data[offset + 1] = alpha;
      data[offset + 2] = alpha;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.name = 'survival-ink-frame-mask';
  texture.needsUpdate = true;
  return texture;
}
