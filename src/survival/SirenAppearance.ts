import { Box3, Group, Mesh, MeshStandardMaterial } from 'three';

export const SIREN_SCENE_OFFSET_Z = -45;

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
      // The layered sea mist supplies the foreground occlusion for this subject.
      material.fog = false;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}

// Uneven groups frame the singer and leave open water toward the boat.
const REEF_ROCKS = [
  { x: -4.5, z: -0.6, scale: [0.68, 1.9, 0.8], yaw: -0.6 },
  { x: -6.2, z: 1.8, scale: [0.42, 0.65, 0.6], yaw: 0.4 },
  { x: -8.8, z: -4.6, scale: [0.8, 3.3, 0.72], yaw: -1.1 },
  { x: 4.3, z: -1.5, scale: [0.7, 2.4, 0.82], yaw: 0.8 },
  { x: 6.4, z: 0.9, scale: [0.38, 0.75, 0.55], yaw: -0.4 },
  { x: 8.2, z: -5.8, scale: [0.76, 3.8, 0.9], yaw: 1.3 },
  { x: 2.8, z: -7.2, scale: [0.48, 1.1, 0.64], yaw: -0.8 },
] as const;

export function createSirenReef(rock: Group, waterlineY: number): Group {
  const reef = new Group();
  reef.name = 'siren-reef';
  const bounds = new Box3();
  for (let index = 0; index < REEF_ROCKS.length; index += 1) {
    const placement = REEF_ROCKS[index]!;
    // Share the rock geometry and materials. The animator owns their resources.
    const outcrop = rock.clone(true);
    outcrop.name = `siren-reef-rock-${index + 1}`;
    outcrop.scale.set(placement.scale[0], placement.scale[1], placement.scale[2]);
    outcrop.rotation.y = placement.yaw;
    bounds.setFromObject(outcrop);
    outcrop.position.set(placement.x, waterlineY - bounds.min.y - 0.22, placement.z);
    reef.add(outcrop);
  }
  return reef;
}
