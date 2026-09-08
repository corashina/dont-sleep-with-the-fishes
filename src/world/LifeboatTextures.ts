import { MeshStandardMaterial, Vector2 } from 'three';
import type { LifeboatAssets } from './LifeboatAssets';

export interface LifeboatMaterials {
  readonly timber: MeshStandardMaterial;
  readonly darkTimber: MeshStandardMaterial;
  readonly trimTimber: MeshStandardMaterial;
  readonly cutWood: MeshStandardMaterial;
  readonly rescueTrim: MeshStandardMaterial;
  readonly rope: MeshStandardMaterial;
  readonly iron: MeshStandardMaterial;
}

export function createLifeboatMaterials(assets: LifeboatAssets): LifeboatMaterials {
  const textured = {
    map: assets.color,
    roughnessMap: assets.roughness,
    normalMap: assets.normal,
    normalScale: new Vector2(0.42, 0.42),
    metalness: 0,
    vertexColors: true,
  } as const;
  return {
    timber: new MeshStandardMaterial({
      ...textured,
      color: 0xd0b79a,
      roughness: 0.84,
    }),
    darkTimber: new MeshStandardMaterial({
      ...textured,
      color: 0x827361,
      roughness: 0.9,
    }),
    trimTimber: new MeshStandardMaterial({
      ...textured,
      color: 0x554333,
      roughness: 0.9,
    }),
    cutWood: new MeshStandardMaterial({
      ...textured,
      color: 0xe0c9a4,
      roughness: 0.88,
    }),
    rescueTrim: new MeshStandardMaterial({
      ...textured,
      color: 0xc88a64,
      roughness: 0.9,
      metalness: 0.02,
    }),
    rope: new MeshStandardMaterial({
      color: 0x8c7958,
      roughness: 1,
      metalness: 0,
    }),
    iron: new MeshStandardMaterial({
      color: 0x514e46,
      roughness: 0.74,
      metalness: 0.65,
    }),
  };
}
