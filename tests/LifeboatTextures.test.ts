import { DataTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createLifeboatTextures } from '../src/world/LifeboatTextures';

const bytes = (texture: DataTexture): number[] =>
  Array.from(texture.image.data as Uint8Array);

describe('survival boat procedural textures', () => {
  it('generates deterministic but distinct surface maps', () => {
    const first = createLifeboatTextures();
    const second = createLifeboatTextures();
    expect(first.all).toHaveLength(6);
    first.all.forEach((texture, index) => {
      expect(bytes(texture)).toEqual(bytes(second.all[index]!));
      expect(texture.wrapS).toBe(RepeatWrapping);
      expect(texture.wrapT).toBe(RepeatWrapping);
      expect(texture.image.width).toBe(64);
      expect(texture.image.height).toBe(64);
    });
    expect(bytes(first.paintColor)).not.toEqual(bytes(first.woodColor));
    expect(bytes(first.paintRoughness)).not.toEqual(bytes(first.metalRoughness));
    first.all.forEach((texture) => texture.dispose());
    second.all.forEach((texture) => texture.dispose());
  });

  it('uses sRGB only for color textures and disposes each owned map once', () => {
    const textures = createLifeboatTextures();
    expect(textures.paintColor.colorSpace).toBe(SRGBColorSpace);
    expect(textures.woodColor.colorSpace).toBe(SRGBColorSpace);
    expect(textures.ropeColor.colorSpace).toBe(SRGBColorSpace);
    expect(textures.paintRoughness.colorSpace).toBe(NoColorSpace);
    expect(textures.woodRoughness.colorSpace).toBe(NoColorSpace);
    expect(textures.metalRoughness.colorSpace).toBe(NoColorSpace);
    const spies = textures.all.map((texture) => vi.spyOn(texture, 'dispose'));
    textures.all.forEach((texture) => texture.dispose());
    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
