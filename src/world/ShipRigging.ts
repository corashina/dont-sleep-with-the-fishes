import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Vector3,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import {
  SHIP_SAIL_CLOTH_MIN_Y,
  type ShipMastSpec,
  type ShipRiggingSpec,
  type ShipSailSpec,
  type ShipStaySpec,
} from './ShipLayout';
import type { ShipMaterials } from './ShipMaterials';

export interface ShipRiggingBuild {
  readonly root: Group;
  readonly colliders: CollisionBox[];
  update(delta: number): void;
  disposeGeometry(): void;
}

const BOOM_DIAMETER = 0.11;

function createSailGeometry(spec: ShipSailSpec): BufferGeometry {
  const zMid = spec.clewZ * 0.5;
  const yMid = spec.footY + (spec.topY - spec.footY) * 0.48;
  const leechY = spec.footY + (spec.topY - spec.footY) * 0.55;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, spec.topY, 0,
    0, spec.footY, 0,
    spec.billow, yMid, zMid,
    spec.billow * 0.42, leechY, spec.clewZ * 0.78,
    0, spec.footY, spec.clewZ,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]);
  geometry.computeVertexNormals();
  geometry.name = `sail-geometry:${spec.id}`;
  return geometry;
}

function createFurledSailGeometry(
  spec: ShipSailSpec,
  mastClearance: number,
): BufferGeometry {
  const radialSegments = 8;
  const lengthSegments = 12;
  const positions: number[] = [];
  const indices: number[] = [];
  const rollY = spec.footY + 0.32;
  const startZ = Math.sign(spec.clewZ) * mastClearance;

  for (let lengthIndex = 0; lengthIndex <= lengthSegments; lengthIndex += 1) {
    const fraction = lengthIndex / lengthSegments;
    const taper = Math.sin(Math.PI * fraction);
    const irregularity = Math.sin(lengthIndex * 2.37) * 0.025;
    const radius = 0.13 + taper * 0.13 + irregularity;
    const centerX = Math.sin(Math.PI * fraction) * spec.billow * 0.12
      + Math.sin(lengthIndex * 1.71) * 0.018;
    const centerY = rollY + Math.sin(lengthIndex * 1.19) * 0.018;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const angle = radialIndex / radialSegments * Math.PI * 2;
      positions.push(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
        startZ + (spec.clewZ - startZ) * fraction,
      );
    }
  }

  for (let lengthIndex = 0; lengthIndex < lengthSegments; lengthIndex += 1) {
    const ring = lengthIndex * radialSegments;
    const nextRing = (lengthIndex + 1) * radialSegments;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const next = (radialIndex + 1) % radialSegments;
      indices.push(
        ring + radialIndex,
        nextRing + radialIndex,
        nextRing + next,
        ring + radialIndex,
        nextRing + next,
        ring + next,
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = `furled-sail-geometry:${spec.id}`;
  return geometry;
}

function addRodBetween(
  root: Group | Mesh,
  geometry: CylinderGeometry,
  material: ShipMaterials['rope'],
  name: string,
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  radius: number,
): Mesh {
  const startPoint = new Vector3(...start);
  const endPoint = new Vector3(...end);
  const direction = endPoint.clone().sub(startPoint);
  const length = direction.length();
  const part = new Mesh(geometry, material);
  part.name = name;
  part.position.copy(startPoint).add(endPoint).multiplyScalar(0.5);
  part.scale.set(radius, length, radius);
  part.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  part.castShadow = true;
  part.receiveShadow = true;
  root.add(part);
  return part;
}

function createCornerPatchGeometry(
  spec: ShipSailSpec,
  corner: 'tack' | 'clew',
): BufferGeometry {
  const height = spec.topY - spec.footY;
  const edgeOffset = 0.016;
  const geometry = new BufferGeometry();
  const positions = corner === 'tack'
    ? [
        edgeOffset, spec.footY, 0,
        edgeOffset, spec.footY + height * 0.16, 0,
        edgeOffset, spec.footY, spec.clewZ * 0.14,
      ]
    : [
        edgeOffset, spec.footY, spec.clewZ,
        edgeOffset, spec.footY, spec.clewZ * 0.82,
        spec.billow * 0.12 + edgeOffset, spec.footY + height * 0.14, spec.clewZ * 0.88,
      ];
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  geometry.name = `sail-corner-patch-geometry:${spec.id}:${corner}`;
  return geometry;
}

function addSailEdgeDetails(
  root: Mesh,
  cylinder: CylinderGeometry,
  materials: ShipMaterials,
  sailSpec: ShipSailSpec,
  ownedGeometries: Set<BufferGeometry>,
): void {
  const height = sailSpec.topY - sailSpec.footY;
  const top: readonly [number, number, number] = [0, sailSpec.topY, 0];
  const tack: readonly [number, number, number] = [0, sailSpec.footY, 0];
  const shoulder: readonly [number, number, number] = [
    sailSpec.billow * 0.42,
    sailSpec.footY + height * 0.55,
    sailSpec.clewZ * 0.78,
  ];
  const clew: readonly [number, number, number] = [0, sailSpec.footY, sailSpec.clewZ];
  ([
    ['luff', top, tack],
    ['foot', tack, clew],
    ['leech-1', top, shoulder],
    ['leech-2', shoulder, clew],
  ] as const).forEach(([name, start, end]) => addRodBetween(
    root,
    cylinder,
    materials.canvasEdge,
    `sail-hem:${sailSpec.id}:${name}`,
    start,
    end,
    0.018,
  ));

  ([0.34, 0.66] as const).forEach((fraction, index) => {
    const seamStart: readonly [number, number, number] = [
      0.01,
      sailSpec.footY + height * fraction,
      0,
    ];
    const seamEnd: readonly [number, number, number] = [
      sailSpec.billow * (0.65 - fraction * 0.25),
      sailSpec.footY + height * fraction,
      sailSpec.clewZ * (0.78 - fraction * 0.3),
    ];
    addRodBetween(
      root,
      cylinder,
      materials.canvasEdge,
      `sail-panel-seam:${sailSpec.id}:${index + 1}`,
      seamStart,
      seamEnd,
      0.011,
    );
  });

  (['tack', 'clew'] as const).forEach((corner) => {
    const patchGeometry = createCornerPatchGeometry(sailSpec, corner);
    ownedGeometries.add(patchGeometry);
    const patch = new Mesh(patchGeometry, materials.canvasEdge);
    patch.name = `sail-corner-patch:${sailSpec.id}:${corner}`;
    patch.castShadow = true;
    patch.receiveShadow = true;
    root.add(patch);
  });
}

function addFurledSailDetails(
  root: Mesh,
  cylinder: CylinderGeometry,
  materials: ShipMaterials,
  sailSpec: ShipSailSpec,
  mastClearance: number,
): void {
  const rollY = sailSpec.footY + 0.32;
  const startZ = Math.sign(sailSpec.clewZ) * mastClearance;
  ([0.08, 0.28, 0.5, 0.72, 0.92] as const).forEach((fraction, index) => {
    const z = startZ + (sailSpec.clewZ - startZ) * fraction;
    addCylinder(
      root,
      cylinder,
      materials.rope,
      `sail-furl-tie:${sailSpec.id}:${index + 1}`,
      [0, rollY, z],
      [0.29, 0.075, 0.29],
      Math.PI / 2,
    );
    addRodBetween(
      root,
      cylinder,
      materials.rope,
      `sail-furl-tail:${sailSpec.id}:${index + 1}`,
      [0.02, rollY - 0.18, z],
      [0.08, rollY - 0.42 - index % 2 * 0.06, z + Math.sign(sailSpec.clewZ) * 0.05],
      0.012,
    );
  });
}

function addCylinder(
  root: Group | Mesh,
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
  stay: ShipStaySpec,
): void {
  addRodBetween(
    root,
    geometry,
    materials.rope,
    `stay:${spec.id}:${stay.id}`,
    [0, spec.height - 0.18, 0],
    stay.anchor,
    0.035,
  );
}

function addStayAttachment(
  root: Group,
  geometry: BoxGeometry,
  materials: ShipMaterials,
  mastId: ShipMastSpec['id'],
  stay: ShipStaySpec,
): void {
  const fitting = new Mesh(geometry, materials.exposedMetal);
  fitting.name = `stay-attachment:${mastId}:${stay.id}`;
  fitting.position.set(...stay.anchor);
  fitting.scale.set(0.34, 0.16, 0.42);
  fitting.castShadow = true;
  fitting.receiveShadow = true;
  root.add(fitting);
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
  const attachmentBox = new BoxGeometry(1, 1, 1);
  const ownedGeometries = new Set<BufferGeometry>([cylinder, attachmentBox]);
  const colliders: CollisionBox[] = [];
  const sails: Mesh[] = [];
  const neutralRotations: number[] = [];
  const phases: number[] = [];
  const furledStates: boolean[] = [];

  spec.masts.forEach((mastSpec) => {
    const mast = new Group();
    mast.name = `mast:${mastSpec.id}`;
    mast.position.set(...mastSpec.position);
    const sailMastClearance = mastSpec.baseDiameter / 2;
    const sailMountOffset = mastSpec.baseDiameter / 2 + BOOM_DIAMETER / 2;

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
    mastSpec.stays.forEach((stay) => {
      addStay(mast, cylinder, materials, mastSpec, stay);
      addStayAttachment(mast, attachmentBox, materials, mastSpec.id, stay);
    });
    const boomSail = mastSpec.sails.find(({ kind }) => kind === 'boom');
    if (boomSail) {
      const halfBoom = mastSpec.boomLength / 2;
      addRodBetween(
        mast,
        cylinder,
        materials.darkMetal,
        `boom:${mastSpec.id}`,
        [-halfBoom, boomSail.footY, sailMountOffset],
        [halfBoom, boomSail.footY, sailMountOffset],
        BOOM_DIAMETER,
      );
    }

    mastSpec.sails.forEach((sailSpec) => {
      const sailGeometry = sailSpec.furled
        ? createFurledSailGeometry(sailSpec, sailMastClearance)
        : createSailGeometry(sailSpec);
      ownedGeometries.add(sailGeometry);
      const sail = new Mesh(sailGeometry, materials.canvas);
      sail.name = `sail:${sailSpec.id}`;
      sail.rotation.y = sailSpec.rotationY;
      sail.position.z = sailMountOffset;
      sail.castShadow = true;
      sail.receiveShadow = true;
      mast.add(sail);
      if (sailSpec.furled) {
        addFurledSailDetails(
          sail,
          cylinder,
          materials,
          sailSpec,
          sailMastClearance,
        );
      } else {
        addSailEdgeDetails(sail, cylinder, materials, sailSpec, ownedGeometries);
      }

      addCylinder(
        mast,
        cylinder,
        materials.exposedMetal,
        `pulley:${mastSpec.id}:${sailSpec.id}`,
        [
          Math.sin(sailSpec.rotationY) * Math.sign(sailSpec.clewZ) * 0.16,
          SHIP_SAIL_CLOTH_MIN_Y + 0.16,
          sailMountOffset
            + Math.cos(sailSpec.rotationY) * Math.sign(sailSpec.clewZ) * 0.16,
        ],
        [0.18, 0.12, 0.18],
        0,
        Math.PI / 2,
      );

      sails.push(sail);
      neutralRotations.push(sail.rotation.z);
      phases.push(0.35 + (sails.length - 1) * 0.9);
      furledStates.push(sailSpec.furled);
    });

    colliders.push(toCollider(mastSpec));
    root.add(mast);
  });

  let elapsed = 0;
  let disposed = false;
  return {
    root,
    colliders,
    update: (delta) => {
      elapsed += Math.max(0, Math.min(delta, 0.1));
      for (let index = 0; index < sails.length; index += 1) {
        const neutral = neutralRotations[index]!;
        sails[index]!.rotation.z = furledStates[index]
          ? neutral
          : neutral + Math.sin(elapsed * 1.1 + phases[index]!) * 0.018;
      }
    },
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      ownedGeometries.forEach((geometry) => geometry.dispose());
    },
  };
}
