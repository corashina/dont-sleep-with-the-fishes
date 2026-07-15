import { describe, expect, it } from 'vitest';
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Material,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('ship materials', () => {
  it('creates deterministic shared surface textures for a fixed seed', () => {
    const first = createShipMaterials(0x51f15e, 8);
    const second = createShipMaterials(0x51f15e, 8);

    expect(first.textureBytesForTest()).toEqual(second.textureBytesForTest());
    expect(first.crewFloor.map).toBe(first.wheelhouseFloor.map);
    expect(first.cargoFloor.map).toBe(first.lifeboatFloor.map);
    expect(first.crewFloor.map?.anisotropy).toBe(8);
    expect(first.ownedTexturesForTest()).toHaveLength(12);

    first.dispose();
    second.dispose();
  });

  it('configures each owned texture for repeated mipmapped surfaces', () => {
    const materials = createShipMaterials(0x51f15e, 99);
    const textures = materials.ownedTexturesForTest();

    textures.forEach((texture, index) => {
      expect(texture.image).toMatchObject({ width: 64, height: 64 });
      expect(texture.wrapS).toBe(RepeatWrapping);
      expect(texture.wrapT).toBe(RepeatWrapping);
      expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
      expect(texture.magFilter).toBe(LinearFilter);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.anisotropy).toBe(8);
      expect(texture.colorSpace).toBe(index % 3 === 0 ? SRGBColorSpace : NoColorSpace);
    });
    expect(textures.map(({ repeat }) => repeat.toArray())).toEqual([
      [3, 12], [3, 12], [3, 12],
      [6, 18], [6, 18], [6, 18],
      [5, 8], [5, 8], [5, 8],
      [5, 4], [5, 4], [5, 4],
    ]);

    materials.dispose();
  });

  it('disposes each owned material once', () => {
    const materials = createShipMaterials();
    const owned = materials.ownedMaterialsForTest();
    const ownedTextures = materials.ownedTexturesForTest();
    const counts = new Map<Material, number>();
    const textureCounts = new Map(ownedTextures.map((texture) => [texture, 0]));
    owned.forEach((material) => {
      counts.set(material, 0);
      material.addEventListener('dispose', () => counts.set(material, counts.get(material)! + 1));
    });
    ownedTextures.forEach((texture) => {
      texture.addEventListener('dispose', () => textureCounts.set(texture, textureCounts.get(texture)! + 1));
    });
    materials.dispose();
    materials.dispose();
    counts.forEach((count) => expect(count).toBe(1));
    textureCounts.forEach((count) => expect(count).toBe(1));
  });

});
