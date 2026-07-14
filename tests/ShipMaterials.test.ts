import { describe, expect, it } from 'vitest';
import { Material, MeshStandardMaterial } from 'three';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('ship materials', () => {
  it('creates stable wood variants for a fixed seed', () => {
    const first = createShipMaterials(0x51f15e);
    const second = createShipMaterials(0x51f15e);
    const colors = (family: typeof first.floorPlanks) => family.map((material) => material.color.getHex());
    expect(colors(first.floorPlanks)).toEqual(colors(second.floorPlanks));
    expect(new Set(colors(first.floorPlanks)).size).toBeGreaterThan(2);
    expect(new Set(colors(first.wallPanels)).size).toBeGreaterThan(2);
    first.dispose();
    second.dispose();
  });

  it('disposes each owned material once', () => {
    const materials = createShipMaterials();
    const owned = materials.ownedMaterialsForTest();
    const counts = new Map<Material, number>();
    owned.forEach((material) => {
      counts.set(material, 0);
      material.addEventListener('dispose', () => counts.set(material, counts.get(material)! + 1));
    });
    materials.dispose();
    materials.dispose();
    counts.forEach((count) => expect(count).toBe(1));
  });

  it('owns a beacon material independently from emergency surfaces', () => {
    const materials = createShipMaterials();
    const owned = materials.ownedMaterialsForTest();
    expect(materials.beacon).toBeInstanceOf(MeshStandardMaterial);
    expect(materials.beacon).not.toBe(materials.emergency);
    expect(owned).toContain(materials.beacon);
    materials.dispose();
  });
});
