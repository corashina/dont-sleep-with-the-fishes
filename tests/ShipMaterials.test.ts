import { Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ShipAssets } from '../src/world/ShipAssets';
import { createShipMaterials } from '../src/world/ShipMaterials';

function createAssets(): ShipAssets {
  return ShipAssets.fromTextures(
    new Texture(),
    new Texture(),
    new Texture(),
  );
}

describe('ship image materials', () => {
  it('owns and disposes every untextured steel and timber variant once', () => {
    const materials = createShipMaterials();
    const plainMaterials = [
      materials.plainPaintedSteel,
      materials.plainTimber,
      materials.paintedSteel,
      materials.darkHull,
    ];

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

  it('uses procedural floor maps and wood maps while keeping all steel image-free', () => {
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
    expect(materials.lifeboatFloor.map?.name).toBe('industrialFloor-color');
    expect(materials.lifeboatFloor.roughnessMap?.name).toBe('industrialFloor-roughness');
    expect(materials.lifeboatFloor.bumpMap?.name).toBe('industrialFloor-bump');
    expect(materials.lifeboatFloor.color.getHex()).toBe(0xcbd1cf);
    expect(materials.emergencyStripe.map?.name).toBe('emergencyStripe-color');
    expect(materials.emergencyStripe.map?.wrapS).toBe(materials.emergencyStripe.map?.wrapT);

    for (const material of [
      materials.plainPaintedSteel,
      materials.paintedSteel,
      materials.darkHull,
    ]) {
      expect(material.map).toBeNull();
      expect(material.roughnessMap).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.bumpMap).toBeNull();
    }

    materials.dispose();
    assets.dispose();
  });

  it('leaves app-owned image maps alive when disposing ship materials', () => {
    const assets = createAssets();
    const textures = [
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
