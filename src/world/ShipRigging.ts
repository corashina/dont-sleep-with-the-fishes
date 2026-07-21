import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import type { ShipMastSpec, ShipRiggingSpec } from './ShipLayout';
import type { ShipMaterials } from './ShipMaterials';

export interface ShipRiggingBuild {
  readonly root: Group;
  readonly colliders: CollisionBox[];
  update(delta: number, reducedMotion: boolean): void;
  disposeGeometry(): void;
}

const CLOTH_MIN_Y = 5.21;
const CLOTH_MAX_LENGTH = 4.6;

function createSailGeometry(spec: ShipMastSpec): BufferGeometry {
  const geometry = new BufferGeometry();
  const top = spec.height - 0.25;
  const length = Math.min(
    CLOTH_MAX_LENGTH,
    (spec.sailArea * 2) / (top - CLOTH_MIN_Y),
  );
  const tipZ = spec.sailDirectionZ * length;
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, top, 0,
    0, CLOTH_MIN_Y, 0,
    0, CLOTH_MIN_Y, tipZ,
  ], 3));
  geometry.computeVertexNormals();
  geometry.name = `sail-geometry:${spec.id}`;
  return geometry;
}

function addCylinder(
  root: Group,
  geometry: CylinderGeometry,
  material: ShipMaterials['darkMetal'],
  name: string,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotationX = 0,
  rotationZ = 0,
): Mesh {
  const part = new Mesh(geometry, material);
  part.name = name;
  part.position.set(...position);
  part.scale.set(...scale);
  part.rotation.set(rotationX, 0, rotationZ);
  part.castShadow = true;
  part.receiveShadow = true;
  root.add(part);
  return part;
}

function addStay(
  root: Group,
  geometry: CylinderGeometry,
  materials: ShipMaterials,
  spec: ShipMastSpec,
): void {
  const highY = spec.height - 0.18;
  const anchorZ = -spec.sailDirectionZ * 2.4;
  const length = Math.hypot(highY, anchorZ);
  addCylinder(
    root,
    geometry,
    materials.rope,
    `stay:${spec.id}`,
    [0, highY / 2, anchorZ / 2],
    [0.035, length, 0.035],
    Math.atan2(anchorZ, highY),
  );
}

function toCollider(spec: ShipMastSpec): CollisionBox {
  const halfBase = spec.baseDiameter / 2;
  return {
    minX: spec.position[0] - halfBase,
    maxX: spec.position[0] + halfBase,
    minY: spec.position[1],
    maxY: spec.position[1] + spec.height,
    minZ: spec.position[2] - halfBase,
    maxZ: spec.position[2] + halfBase,
  };
}

export function createShipRigging(
  materials: ShipMaterials,
  spec: ShipRiggingSpec,
): ShipRiggingBuild {
  const root = new Group();
  root.name = 'ship-rigging';
  const cylinder = new CylinderGeometry(0.5, 0.5, 1, 12);
  const ownedGeometries = new Set<BufferGeometry>([cylinder]);
  const colliders: CollisionBox[] = [];
  const sails: Mesh[] = [];
  const neutralRotations: number[] = [];
  const phases: number[] = [];

  spec.masts.forEach((mastSpec, index) => {
    const mast = new Group();
    mast.name = `mast:${mastSpec.id}`;
    mast.position.set(...mastSpec.position);

    addCylinder(
      mast,
      cylinder,
      materials.darkMetal,
      `mast-post:${mastSpec.id}`,
      [0, mastSpec.height / 2, 0],
      [mastSpec.baseDiameter, mastSpec.height, mastSpec.baseDiameter],
    );
    addCylinder(
      mast,
      cylinder,
      materials.exposedMetal,
      `mast-base:${mastSpec.id}`,
      [0, 0.09, 0],
      [mastSpec.baseDiameter * 1.25, 0.18, mastSpec.baseDiameter * 1.25],
    );
    addStay(mast, cylinder, materials, mastSpec);

    const sailGeometry = createSailGeometry(mastSpec);
    ownedGeometries.add(sailGeometry);
    const sail = new Mesh(sailGeometry, materials.canvas);
    sail.name = `sail:${mastSpec.id}`;
    sail.castShadow = true;
    sail.receiveShadow = true;
    mast.add(sail);

    const clothLength = Math.abs(
      sailGeometry.getAttribute('position').getZ(2),
    );
    if (mastSpec.sailKind === 'boom') {
      addCylinder(
        mast,
        cylinder,
        materials.darkMetal,
        `boom:${mastSpec.id}`,
        [0, CLOTH_MIN_Y, mastSpec.sailDirectionZ * clothLength / 2],
        [0.11, clothLength, 0.11],
        Math.PI / 2,
      );
    }
    addCylinder(
      mast,
      cylinder,
      materials.exposedMetal,
      `pulley:${mastSpec.id}`,
      [0, CLOTH_MIN_Y + 0.16, mastSpec.sailDirectionZ * 0.16],
      [0.18, 0.12, 0.18],
      0,
      Math.PI / 2,
    );

    sails.push(sail);
    neutralRotations.push(sail.rotation.z);
    phases.push(0.35 + index * 0.9);
    colliders.push(toCollider(mastSpec));
    root.add(mast);
  });

  let elapsed = 0;
  let disposed = false;
  return {
    root,
    colliders,
    update: (delta, reducedMotion) => {
      elapsed += Math.max(0, Math.min(delta, 0.1));
      for (let index = 0; index < sails.length; index += 1) {
        const sail = sails[index]!;
        sail.rotation.z = reducedMotion
          ? neutralRotations[index]!
          : neutralRotations[index]!
            + Math.sin(elapsed * 1.4 + phases[index]!) * 0.025;
      }
    },
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      ownedGeometries.forEach((geometry) => geometry.dispose());
    },
  };
}
