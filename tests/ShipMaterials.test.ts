import { Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ShipAssets } from '../src/world/ShipAssets';
import { createShipMaterials } from '../src/world/ShipMaterials';

function createAssets(): ShipAssets {
  return ShipAssets.fromTextures(
    new Texture(),
    new Texture(),
    new Texture(),
    new Texture(),
    new Texture(),
    new Texture(),
  );
}

describe('ship image materials', () => {
  it('owns and disposes the unmapped painted-steel and timber variants once', () => {
    const materials = createShipMaterials();
    const plainMaterials = [materials.plainPaintedSteel, materials.plainTimber];

    plainMaterials.forEach((material) => {
      expect(material.map).toBeNull();
      expect(material.roughnessMap).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.bumpMap).toBeNull();
      expect(materials.ownedMaterialsForTest()).toContain(material);
    });
    const disposals = plainMaterials.map((material) => vi.spyOn(material, 'dispose'));

    materials.dispose();
    materials.dispose();

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('uses subtle non-slip metal maps on floors and keeps timber props wooden', () => {
    const assets = createAssets();
    const materials = createShipMaterials(0x51f15e, 4, assets);

    expect(materials.timber.map).toBe(assets.woodColor);
    expect(materials.timber.roughnessMap).toBe(assets.woodRoughness);
    expect(materials.timber.normalMap).toBe(assets.woodNormal);
    expect(materials.timber.metalness).toBe(0);

    for (const material of [
      materials.crewFloor,
      materials.wheelhouseFloor,
      materials.cargoFloor,
      materials.lifeboatFloor,
    ]) {
      expect(material.map?.name).toBe('maritimeDeck-color');
      expect(material.roughnessMap?.name).toBe('maritimeDeck-roughness');
      expect(material.bumpMap?.name).toBe('maritimeDeck-bump');
      expect(material.normalMap).toBeNull();
      expect(material.metalness).toBeCloseTo(0.36);
    }
    expect(materials.storageFloor.map?.name).toBe('industrialFloor-color');
    expect(materials.storageFloor.roughnessMap?.name).toBe('industrialFloor-roughness');
    expect(materials.storageFloor.bumpMap?.name).toBe('industrialFloor-bump');
    expect(materials.storageFloor.normalMap).toBeNull();
    expect(materials.storageFloor.metalness).toBeCloseTo(0.36);

    for (const material of [materials.paintedSteel, materials.darkHull]) {
      expect(material.map).toBe(assets.steelColor);
      expect(material.roughnessMap).toBe(assets.steelRoughness);
      expect(material.normalMap).toBe(assets.steelNormal);
      expect(material.metalness).toBeGreaterThanOrEqual(0.4);
    }

    materials.dispose();
    assets.dispose();
  });

  it('leaves app-owned image maps alive when disposing ship materials', () => {
    const assets = createAssets();
    const textures = [
      assets.steelColor,
      assets.steelRoughness,
      assets.steelNormal,
      assets.woodColor,
      assets.woodRoughness,
      assets.woodNormal,
    ];
    const disposals = textures.map((texture) => vi.spyOn(texture, 'dispose'));
    const materials = createShipMaterials(0x51f15e, 4, assets);

    materials.dispose();
    disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());

    assets.dispose();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
