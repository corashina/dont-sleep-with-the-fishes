import { Group, Mesh, MeshStandardMaterial } from 'three';
import { applySeaFogMaterial } from '../world/SeaFogMaterial';

export const SIREN_SCENE_OFFSET_Z = -20;

// Material names belong to the bundled siren asset. Keep its color regions,
// but use pearl, kelp, and weathered sea tones under the event lighting.
const SIREN_COLORS: Readonly<Record<string, number>> = {
  mat6: 0xc2cbbd,
  mat9: 0x596f62,
  mat4: 0x507f80,
  mat11: 0x284c50,
  mat5: 0x496b7b,
  mat16: 0x25383f,
  mat21: 0xe0dfc6,
  mat7: 0x84595d,
};

export function styleSiren(root: Group): void {
  const styled = new Set<MeshStandardMaterial>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || styled.has(material)) continue;
      styled.add(material);
      const color = SIREN_COLORS[material.name];
      if (color !== undefined) material.color.setHex(color);
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0.09;
      material.roughness = material.name === 'mat6' ? 0.72 : 0.48;
      material.metalness = 0;
      applySeaFogMaterial(material);
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}
