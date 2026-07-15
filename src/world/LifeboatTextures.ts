import {
  DataTexture,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';

const SIZE = 64;

interface PatternOptions {
  readonly seed: number;
  readonly base: readonly [number, number, number];
  readonly variation: number;
  readonly streakAxis: 'x' | 'y' | 'none';
  readonly color: boolean;
  readonly repeat: readonly [number, number];
}

export interface LifeboatTextures {
  readonly paintColor: DataTexture;
  readonly paintRoughness: DataTexture;
  readonly woodColor: DataTexture;
  readonly woodRoughness: DataTexture;
  readonly ropeColor: DataTexture;
  readonly metalRoughness: DataTexture;
  readonly all: readonly DataTexture[];
}

function hash(seed: number, x: number, y: number): number {
  let value = Math.imul(x + 17, 0x45d9f3b) ^ Math.imul(y + 31, 0x119de1f3) ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function createPattern(options: PatternOptions): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const noise = hash(options.seed, x, y) - 0.5;
      const streakCoordinate = options.streakAxis === 'x' ? x : y;
      const streak = options.streakAxis === 'none'
        ? 0
        : Math.sin((streakCoordinate + options.seed) * 0.42) * options.variation * 0.32;
      const offset = noise * options.variation + streak;
      const index = (y * SIZE + x) * 4;
      data[index] = clampByte(options.base[0] + offset);
      data[index + 1] = clampByte(options.base[1] + offset);
      data[index + 2] = clampByte(options.base[2] + offset);
      data[index + 3] = 255;
    }
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...options.repeat);
  texture.colorSpace = options.color ? SRGBColorSpace : NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createLifeboatTextures(): LifeboatTextures {
  const paintColor = createPattern({
    seed: 0x19a3, base: [177, 83, 47], variation: 34,
    streakAxis: 'y', color: true, repeat: [3, 5],
  });
  const paintRoughness = createPattern({
    seed: 0x77c1, base: [205, 205, 205], variation: 38,
    streakAxis: 'none', color: false, repeat: [3, 5],
  });
  const woodColor = createPattern({
    seed: 0x4b31, base: [112, 77, 48], variation: 42,
    streakAxis: 'x', color: true, repeat: [2, 7],
  });
  const woodRoughness = createPattern({
    seed: 0x24d7, base: [220, 220, 220], variation: 28,
    streakAxis: 'x', color: false, repeat: [2, 7],
  });
  const ropeColor = createPattern({
    seed: 0x98e5, base: [54, 42, 28], variation: 24,
    streakAxis: 'y', color: true, repeat: [8, 2],
  });
  const metalRoughness = createPattern({
    seed: 0x6f13, base: [174, 174, 174], variation: 54,
    streakAxis: 'none', color: false, repeat: [4, 4],
  });
  return {
    paintColor,
    paintRoughness,
    woodColor,
    woodRoughness,
    ropeColor,
    metalRoughness,
    all: [
      paintColor,
      paintRoughness,
      woodColor,
      woodRoughness,
      ropeColor,
      metalRoughness,
    ],
  };
}
