import {
  DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace,
} from 'three';

function cell(x: number, y: number, period: number): number {
  const hash = Math.sin((x % period) * 127.1 + (y % period) * 311.7) * 43758.5453;
  return hash - Math.floor(hash);
}

function noise(u: number, v: number, period: number): number {
  const x = u * period, y = v * period;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = cell(ix, iy, period) * (1 - sx) + cell(ix + 1, iy, period) * sx;
  const bottom = cell(ix, iy + 1, period) * (1 - sx) + cell(ix + 1, iy + 1, period) * sx;
  return top * (1 - sy) + bottom * sy;
}

function texture(data: Uint8Array, size: number): DataTexture {
  const result = new DataTexture(data, size, size, RGBAFormat);
  result.wrapS = result.wrapT = RepeatWrapping;
  result.magFilter = LinearFilter;
  result.minFilter = LinearMipmapLinearFilter;
  result.generateMipmaps = true;
  result.needsUpdate = true;
  return result;
}

/** Baked once: pigment patches, dark veins, fine skin relief, and independent wet roughness. */
export function createKrakenSkinTextures(): { color: DataTexture; surface: DataTexture } {
  const size = 256;
  const color = new Uint8Array(size * size * 4);
  const surface = new Uint8Array(color.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const broad = noise(u, v, 8), patches = noise(u, v, 23);
      const grain = noise(u, v, 73), pores = noise(u, v, 119);
      const pigment = (broad - 0.5) * 30 + (patches - 0.5) * 24;
      const freckles = Math.max(0, (grain - 0.60) * 3) * 24;
      // Thin dark veins run along the zero lines of two noise fields.
      const vein = Math.max(0, 1 - Math.abs(noise(u, v, 11) - 0.5) * 22)
        * Math.max(0, 1 - Math.abs(noise(v, u, 17) - 0.5) * 3);
      const bruise = Math.max(0, patches - 0.62) * 60;
      const folds = Math.sin(u * Math.PI * 40 + broad * 9 + Math.sin(v * Math.PI * 12));
      const offset = (y * size + x) * 4;
      color[offset] = 84 + pigment - freckles - vein * 30 + bruise * 0.5;
      color[offset + 1] = 96 + pigment * 0.82 - freckles - vein * 38 - bruise * 0.3;
      color[offset + 2] = 88 + pigment * 0.58 - freckles - vein * 32;
      color[offset + 3] = 255;
      surface[offset] = 128 + folds * 14 + (grain - 0.5) * 70 + (pores - 0.5) * 30 - vein * 30;
      surface[offset + 1] = 120 + patches * 70 + grain * 22;
      surface[offset + 2] = 255;
      surface[offset + 3] = 255;
    }
  }
  const colorMap = texture(color, size);
  colorMap.colorSpace = SRGBColorSpace;
  return { color: colorMap, surface: texture(surface, size) };
}

/** Broken foam that fades at the inner and outer edges of a ring. */
export function createKrakenFoamTexture(): DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const lace = noise(u, v, 16) * 0.6 + noise(u, v, 41) * 0.4;
      const offset = (y * size + x) * 4;
      const value = Math.max(0, Math.min(1, (lace - 0.42) * 3.2)) * 255;
      data[offset] = data[offset + 1] = data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return texture(data, size);
}
