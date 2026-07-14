import { Color, Material, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

export type WoodMaterialFamily = readonly [
  MeshStandardMaterial,
  MeshStandardMaterial,
  MeshStandardMaterial,
  MeshStandardMaterial,
];

export interface ShipMaterials {
  floorPlanks: WoodMaterialFamily;
  wallPanels: WoodMaterialFamily;
  furnitureWood: WoodMaterialFamily;
  deckTimber: WoodMaterialFamily;
  crateWood: WoodMaterialFamily;
  paintedSteel: MeshStandardMaterial;
  darkHull: MeshStandardMaterial;
  darkMetal: MeshStandardMaterial;
  exposedMetal: MeshStandardMaterial;
  rust: MeshStandardMaterial;
  rope: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  emergency: MeshStandardMaterial;
  ownedMaterialsForTest(): readonly Material[];
  dispose(): void;
}

const WOOD_BASES = {
  floorPlanks: { color: 0x3d291f, roughness: 0.92 },
  wallPanels: { color: 0xa69b82, roughness: 0.88 },
  furnitureWood: { color: 0x684531, roughness: 0.86 },
  deckTimber: { color: 0x574f43, roughness: 0.96 },
  crateWood: { color: 0x806342, roughness: 0.94 },
} as const;

function hashInteger(value: number): number {
  let hash = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function createLightnessOffsets(seed: number): readonly [number, number, number, number] {
  const offset = (index: number) => -0.07 + (hashInteger((seed | 0) + index) / 0xffffffff) * 0.13;
  return [offset(0), offset(1), offset(2), offset(3)];
}

function createWoodFamily(
  base: (typeof WOOD_BASES)[keyof typeof WOOD_BASES],
  lightnessOffsets: readonly [number, number, number, number],
): WoodMaterialFamily {
  const createVariant = (lightnessOffset: number) => {
    const color = new Color(base.color);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + lightnessOffset)));
    return new MeshStandardMaterial({ color, roughness: base.roughness, flatShading: true });
  };

  return [
    createVariant(lightnessOffsets[0]),
    createVariant(lightnessOffsets[1]),
    createVariant(lightnessOffsets[2]),
    createVariant(lightnessOffsets[3]),
  ];
}

export function createShipMaterials(seed = 0x51f15e): ShipMaterials {
  const lightnessOffsets = createLightnessOffsets(seed);
  const floorPlanks = createWoodFamily(WOOD_BASES.floorPlanks, lightnessOffsets);
  const wallPanels = createWoodFamily(WOOD_BASES.wallPanels, lightnessOffsets);
  const furnitureWood = createWoodFamily(WOOD_BASES.furnitureWood, lightnessOffsets);
  const deckTimber = createWoodFamily(WOOD_BASES.deckTimber, lightnessOffsets);
  const crateWood = createWoodFamily(WOOD_BASES.crateWood, lightnessOffsets);

  const paintedSteel = new MeshStandardMaterial({ color: 0x57636a, roughness: 0.82, metalness: 0.22, flatShading: true });
  const darkHull = new MeshStandardMaterial({ color: 0x242e32, roughness: 0.9, metalness: 0.28, flatShading: true });
  const darkMetal = new MeshStandardMaterial({ color: 0x2f3435, roughness: 0.84, metalness: 0.55, flatShading: true });
  const exposedMetal = new MeshStandardMaterial({ color: 0x81796c, roughness: 0.68, metalness: 0.62, flatShading: true });
  const rust = new MeshStandardMaterial({ color: 0x7a3d28, roughness: 0.95, metalness: 0.08, flatShading: true });
  const rope = new MeshStandardMaterial({ color: 0x3d3022, roughness: 1, metalness: 0, flatShading: true });
  const glass = new MeshPhysicalMaterial({ color: 0x6d8790, roughness: 0.18, transmission: 0.15, transparent: true, opacity: 0.55, depthWrite: false });
  const emergency = new MeshStandardMaterial({ color: 0x9c4f3f, emissive: 0x3d120d, emissiveIntensity: 0.35, roughness: 0.7 });

  const ownedMaterials = new Set<Material>([
    ...floorPlanks,
    ...wallPanels,
    ...furnitureWood,
    ...deckTimber,
    ...crateWood,
    paintedSteel,
    darkHull,
    darkMetal,
    exposedMetal,
    rust,
    rope,
    glass,
    emergency,
  ]);
  let disposed = false;

  return {
    floorPlanks,
    wallPanels,
    furnitureWood,
    deckTimber,
    crateWood,
    paintedSteel,
    darkHull,
    darkMetal,
    exposedMetal,
    rust,
    rope,
    glass,
    emergency,
    ownedMaterialsForTest: () => [...ownedMaterials],
    dispose: () => {
      if (disposed) return;
      disposed = true;
      ownedMaterials.forEach((material) => material.dispose());
    },
  };
}
