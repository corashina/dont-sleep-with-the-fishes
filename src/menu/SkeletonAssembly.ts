import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';

const BONE_SEGMENTS = [
  { name: 'spine', position: [0, 0.78, 0], scale: [0.08, 0.55, 0.08], rotation: [0, 0, -0.08] },
  { name: 'upper-arm-left', position: [-0.32, 0.76, 0], scale: [0.06, 0.32, 0.06], rotation: [0, 0, -0.72] },
  { name: 'upper-arm-right', position: [0.31, 0.73, 0.02], scale: [0.06, 0.3, 0.06], rotation: [0, 0, 0.88] },
  { name: 'forearm-left', position: [-0.48, 0.48, 0.14], scale: [0.05, 0.3, 0.05], rotation: [0.35, 0, -0.2] },
  { name: 'forearm-right', position: [0.44, 0.45, 0.12], scale: [0.05, 0.28, 0.05], rotation: [0.28, 0, 0.16] },
  { name: 'thigh-left', position: [-0.2, 0.18, 0.18], scale: [0.07, 0.38, 0.07], rotation: [1.1, 0, -0.12] },
  { name: 'thigh-right', position: [0.2, 0.16, 0.16], scale: [0.07, 0.38, 0.07], rotation: [1.05, 0, 0.15] },
  { name: 'shin-left', position: [-0.22, -0.05, 0.44], scale: [0.06, 0.36, 0.06], rotation: [0.35, 0, -0.05] },
  { name: 'shin-right', position: [0.24, -0.07, 0.42], scale: [0.06, 0.36, 0.06], rotation: [0.3, 0, 0.08] },
] as const;

const JOINT_POSITIONS = [
  [-0.18, 0.98, 0], [0.18, 0.98, 0],
  [-0.47, 0.58, 0.08], [0.45, 0.56, 0.08],
  [-0.2, 0.35, 0.1], [0.2, 0.34, 0.1],
  [-0.22, 0.02, 0.35], [0.23, 0, 0.34],
] as const;

interface SkeletonResources {
  readonly longBoneGeometry: CylinderGeometry;
  readonly ribGeometry: CylinderGeometry;
  readonly jointGeometry: SphereGeometry;
  readonly material: MeshStandardMaterial;
  disposed: boolean;
}

const ASSEMBLY_RESOURCES = new WeakMap<Group, SkeletonResources>();

export function createSeatedSkeleton(skull: Group): Group {
  const root = new Group();
  root.name = 'menu:seated-skeleton';

  const longBoneGeometry = new CylinderGeometry(1, 1, 1, 6, 1, false);
  const ribGeometry = new CylinderGeometry(1, 1, 0.24, 6, 1, false);
  const jointGeometry = new SphereGeometry(1, 6, 4);
  const material = new MeshStandardMaterial({
    color: 0xc5b997,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });

  skull.name = 'menu:skeleton-skull';
  skull.position.set(0, 1.3, 0.02);
  skull.rotation.set(0.2, 0.24, -0.1);
  root.add(skull);

  for (const segment of BONE_SEGMENTS) {
    const bone = new Mesh(longBoneGeometry, material);
    bone.name = `menu:skeleton-${segment.name}`;
    bone.position.set(segment.position[0], segment.position[1], segment.position[2]);
    bone.scale.set(segment.scale[0], segment.scale[1], segment.scale[2]);
    bone.rotation.set(segment.rotation[0], segment.rotation[1], segment.rotation[2]);
    root.add(bone);
  }

  for (let index = 0; index < JOINT_POSITIONS.length; index += 1) {
    const joint = new Mesh(jointGeometry, material);
    joint.name = `menu:skeleton-joint-${index + 1}`;
    const position = JOINT_POSITIONS[index]!;
    joint.position.set(position[0], position[1], position[2]);
    joint.scale.setScalar(index < 2 ? 0.075 : 0.065);
    root.add(joint);
  }

  for (let level = 0; level < 6; level += 1) {
    const y = 1.05 - level * 0.095;
    const width = 0.25 + level * 0.022;
    for (const side of [-1, 1] as const) {
      const inner = new Mesh(ribGeometry, material);
      inner.name = `menu:skeleton-rib-${level + 1}-${side < 0 ? 'left' : 'right'}-inner`;
      inner.position.set(side * width * 0.42, y, 0.015 + level * 0.006);
      inner.scale.set(0.038, 0.7, 0.038);
      inner.rotation.set(0.16, 0, side * -0.78);

      const outer = new Mesh(ribGeometry, material);
      outer.name = `menu:skeleton-rib-${level + 1}-${side < 0 ? 'left' : 'right'}-outer`;
      outer.position.set(side * width * 0.82, y - 0.055, 0.04 + level * 0.008);
      outer.scale.set(0.034, 0.62, 0.034);
      outer.rotation.set(0.28, 0, side * -1.08);

      const ribEnd = new Mesh(jointGeometry, material);
      ribEnd.name = `menu:skeleton-rib-${level + 1}-${side < 0 ? 'left' : 'right'}-end`;
      ribEnd.position.set(side * width, y - 0.105, 0.07 + level * 0.01);
      ribEnd.scale.setScalar(0.038);
      root.add(inner, outer, ribEnd);
    }
  }

  ASSEMBLY_RESOURCES.set(root, {
    longBoneGeometry,
    ribGeometry,
    jointGeometry,
    material,
    disposed: false,
  });
  return root;
}

export function disposeSeatedSkeleton(root: Group): void {
  const resources = ASSEMBLY_RESOURCES.get(root);
  if (!resources || resources.disposed) return;
  resources.disposed = true;
  root.removeFromParent();
  resources.longBoneGeometry.dispose();
  resources.ribGeometry.dispose();
  resources.jointGeometry.dispose();
  resources.material.dispose();
  ASSEMBLY_RESOURCES.delete(root);
}
