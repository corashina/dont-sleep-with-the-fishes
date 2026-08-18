import { MeshStandardMaterial } from 'three';
import type { MenuSandAssets } from './MenuSandAssets';

export function createMenuSeabedMaterial(
  sand: MenuSandAssets,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    map: sand.smooth,
  });
  material.name = 'menu:seabed-material';
  return material;
}
