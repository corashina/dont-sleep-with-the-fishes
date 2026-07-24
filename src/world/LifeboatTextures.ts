import { MeshStandardMaterial, Vector2 } from 'three';
import type { LifeboatAssets } from './LifeboatAssets';

export interface LifeboatMaterials {
  readonly timber: MeshStandardMaterial;
  readonly darkTimber: MeshStandardMaterial;
  readonly cutWood: MeshStandardMaterial;
  readonly rescueTrim: MeshStandardMaterial;
  readonly rope: MeshStandardMaterial;
  readonly waterline: MeshStandardMaterial;
}

export function createLifeboatMaterials(assets: LifeboatAssets): LifeboatMaterials {
  const textured = {
    map: assets.color,
    roughnessMap: assets.roughness,
    normalMap: assets.normal,
    normalScale: new Vector2(0.28, 0.28),
    metalness: 0,
    flatShading: true,
  } as const;
  return {
    timber: new MeshStandardMaterial({
      ...textured,
      color: 0x745c47,
      roughness: 0.92,
    }),
    darkTimber: new MeshStandardMaterial({
      ...textured,
      color: 0x4b382c,
      roughness: 0.96,
    }),
    cutWood: new MeshStandardMaterial({
      ...textured,
      color: 0x8a6b4f,
      roughness: 0.88,
    }),
    rescueTrim: new MeshStandardMaterial({
      color: 0x8f4f32,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
    }),
    rope: new MeshStandardMaterial({
      color: 0x4a3826,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    }),
    waterline: new MeshStandardMaterial({
      color: 0x263c3e,
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    }),
  };
}
