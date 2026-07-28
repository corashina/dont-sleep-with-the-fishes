import {
  Color,
  Material,
  MeshStandardMaterial,
} from 'three';

export function applyBrokenMaterialTreatment(material: Material): void {
  if (!(material instanceof MeshStandardMaterial)) return;
  material.color.lerp(new Color(0x384243), 0.68);
  material.roughness = Math.max(0.82, material.roughness);
  material.metalness *= 0.45;
  material.needsUpdate = true;
}
