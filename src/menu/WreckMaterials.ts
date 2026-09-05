import { DoubleSide, MeshStandardMaterial } from 'three';

function material(name: string, color: number, roughness: number, metalness: number): MeshStandardMaterial {
  const result = new MeshStandardMaterial({
    color, roughness, metalness, vertexColors: true, side: DoubleSide,
  });
  result.name = name;
  return result;
}

export function createWreckMaterials() {
  return {
    hull: material('hull-plating', 0x708a83, 0.94, 0.12),
    paint: material('cabin-paint', 0xb2ac8f, 0.96, 0.04),
    timber: material('deck-timber', 0x7c7052, 1, 0),
    iron: material('ironwork', 0x525b53, 0.86, 0.3),
    rust: material('corrosion', 0x90583b, 1, 0.03),
    dark: material('interior', 0x222f2c, 1, 0),
    silt: material('sediment', 0x96957a, 1, 0),
    growth: material('marine-growth', 0x586f52, 1, 0),
    rope: material('rigging', 0x646350, 1, 0),
  };
}

export type WreckMaterials = ReturnType<typeof createWreckMaterials>;
