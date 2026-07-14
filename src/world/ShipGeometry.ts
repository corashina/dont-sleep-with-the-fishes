import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  Vector3,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import type { ShipMaterials, WoodMaterialFamily } from './ShipMaterials';

export const FREIGHTER_DIMENSIONS = { width: 12.5, length: 36, deckY: 2 } as const;

export type ShipZoneId =
  | 'crewCabin'
  | 'wheelhouse'
  | 'cargoDeck'
  | 'storageRoom'
  | 'lifeboatStation';

export interface ShipGeometryBuild {
  root: Group;
  shellColliders: CollisionBox[];
  zoneCenters: ReadonlyMap<ShipZoneId, Vector3>;
  waterExclusion: { halfWidth: number; halfLength: number };
  stackOutlets: readonly [Vector3, Vector3];
  disposeGeometry(): void;
}

const HALF_WIDTH = 6.25;
const HALF_LENGTH = 18;
const DECK_Y = 2;
const WALL_HEIGHT = 3.2;
const CABIN_Z = 8.3;
const WHEELHOUSE_Z = 13.6;
const STORAGE_Z = -9.2;
const LIFEBOAT_Z = -6.5;

const HULL_HEIGHT = 0.4;
const HULL_LENGTH = 31;
const HULL_Z = -1.5;
const HULL_TOP_Y = 1.86;
const BOW_BASE_Z = 13;
const BOW_TIP_HALF_WIDTH = 0.45;
const DECK_WIDTH = 12;
const DECK_THICKNESS = 0.28;
const DECK_LENGTH = 34;
const DECK_PLANK_THICKNESS = 0.04;
const DECK_PLANK_GAP = 0.025;
const GRAIN_HEIGHT = 0.015;
const WALL_THICKNESS = 0.22;
const WALL_CENTER_Y = DECK_Y + DECK_THICKNESS / 2 + WALL_HEIGHT / 2;
const WALL_BOTTOM_Y = DECK_Y + DECK_THICKNESS / 2;
const DOORWAY_WIDTH = 2.2;

const CABIN_WIDTH = 8;
const CABIN_MIN_Z = 3.5;
const CABIN_MAX_Z = 10.5;
const CABIN_DOOR_Z = 5.2;
const STORAGE_WIDTH = 9.8;
const STORAGE_MIN_Z = -11.5;
const STORAGE_MAX_Z = -7;
const STORAGE_DOOR_Z = -8.2;

const WHEELHOUSE_WIDTH = 7.8;
const WHEELHOUSE_LENGTH = 4.3;
const WHEELHOUSE_WALL_HEIGHT = 3.4;
const WHEELHOUSE_RAISE = 0.24;
const WINDOW_SILL_HEIGHT = 0.82;
const WINDOW_HEADER_HEIGHT = 0.52;
const WINDOW_PILLAR_WIDTH = 0.28;
const WINDOW_GLASS_THICKNESS = 0.035;
const WHEELHOUSE_DOOR_WIDTH = 1.25;

const MACHINERY_WIDTH = 5.2;
const MACHINERY_HEIGHT = 2.3;
const MACHINERY_LENGTH = 5.5;
const MACHINERY_Z = -13;
const STACK_X = 1.35;
const STACK_OUTLET_Y = 7.1;
const STACK_HEIGHT = 2.6;
const STACK_RADIUS = 0.58;
const STACK_COLLAR_RADIUS = 0.72;
const STACK_COLLAR_HEIGHT = 0.22;

const RAIL_X = 6;
const RAIL_THICKNESS = 0.2;
const RAIL_COLLIDER_THICKNESS = 0.25;
const RAIL_COLLIDER_OUTWARD_OFFSET = 0.075;
const RAIL_HEIGHT = 1.8;
const RAIL_TOP_THICKNESS = 0.14;
const RAIL_POST_WIDTH = 0.12;
const RAIL_POST_SPACING = 2.4;
const RAIL_MIN_Z = -16.7;
const RAIL_MAX_Z = 15.8;
const LIFEBOAT_RAIL_GAP = 2.8;

interface BlockOptions {
  name: string;
  size: readonly [number, number, number];
  position: readonly [number, number, number];
  material: Material;
  collider?: boolean;
}

const boxGeometries = new WeakMap<Group, BoxGeometry>();

function sharedBoxGeometry(root: Group, geometries: Set<BufferGeometry>): BoxGeometry {
  const existing = boxGeometries.get(root);
  if (existing) return existing;
  const geometry = new BoxGeometry(1, 1, 1);
  boxGeometries.set(root, geometry);
  geometries.add(geometry);
  return geometry;
}

function woodVariant(family: WoodMaterialFamily, index: number): Material {
  return family[index % family.length]!;
}

function toCollisionBox(
  position: readonly [number, number, number],
  size: readonly [number, number, number],
): CollisionBox {
  return {
    minX: position[0] - size[0] / 2,
    maxX: position[0] + size[0] / 2,
    minY: position[1] - size[1] / 2,
    maxY: position[1] + size[1] / 2,
    minZ: position[2] - size[2] / 2,
    maxZ: position[2] + size[2] / 2,
  };
}

function addBlock(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  options: BlockOptions,
): Mesh {
  const geometry = sharedBoxGeometry(root, geometries);
  const mesh = new Mesh(geometry, options.material);
  mesh.name = options.name;
  mesh.position.set(...options.position);
  mesh.scale.set(...options.size);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  if (options.collider) shellColliders.push(toCollisionBox(options.position, options.size));
  return mesh;
}

function addBowWedge(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  material: Material,
): void {
  const bottomY = HULL_TOP_Y - HULL_HEIGHT;
  const vertices = [
    -HALF_WIDTH, bottomY, BOW_BASE_Z,
    HALF_WIDTH, bottomY, BOW_BASE_Z,
    -BOW_TIP_HALF_WIDTH, bottomY, HALF_LENGTH,
    BOW_TIP_HALF_WIDTH, bottomY, HALF_LENGTH,
    -HALF_WIDTH, HULL_TOP_Y, BOW_BASE_Z,
    HALF_WIDTH, HULL_TOP_Y, BOW_BASE_Z,
    -BOW_TIP_HALF_WIDTH, HULL_TOP_Y, HALF_LENGTH,
    BOW_TIP_HALF_WIDTH, HULL_TOP_Y, HALF_LENGTH,
  ];
  const indices = [
    0, 2, 1, 1, 2, 3,
    4, 5, 6, 5, 7, 6,
    0, 4, 2, 2, 4, 6,
    1, 3, 5, 3, 7, 5,
    2, 6, 3, 3, 6, 7,
    0, 1, 4, 1, 5, 4,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'hull-bow-wedge';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  geometries.add(geometry);
  shellColliders.push(toCollisionBox(
    [0, HULL_TOP_Y - HULL_HEIGHT / 2, BOW_BASE_Z + (HALF_LENGTH - BOW_BASE_Z) / 2],
    [HALF_WIDTH * 2, HULL_HEIGHT, HALF_LENGTH - BOW_BASE_Z],
  ));
}

function addSegmentedSideWall(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materialFamily: WoodMaterialFamily,
  name: string,
  x: number,
  minZ: number,
  maxZ: number,
  doorwayZ: number,
): void {
  const gapMinZ = doorwayZ - DOORWAY_WIDTH / 2;
  const gapMaxZ = doorwayZ + DOORWAY_WIDTH / 2;
  const segments = [
    { min: minZ, max: gapMinZ },
    { min: gapMaxZ, max: maxZ },
  ].filter((segment) => segment.max > segment.min);
  segments.forEach((segment, index) => addBlock(root, geometries, shellColliders, {
    name: `${name}-${index}`,
    size: [WALL_THICKNESS, WALL_HEIGHT, segment.max - segment.min],
    position: [x, WALL_CENTER_Y, (segment.min + segment.max) / 2],
    material: woodVariant(materialFamily, index),
    collider: true,
  }));
}

function addRoom(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materialFamily: WoodMaterialFamily,
  name: string,
  width: number,
  minZ: number,
  maxZ: number,
  doorwayZ: number,
): void {
  const sideX = width / 2;
  addSegmentedSideWall(root, geometries, shellColliders, materialFamily, `${name}-port-wall`, -sideX, minZ, maxZ, doorwayZ);
  addSegmentedSideWall(root, geometries, shellColliders, materialFamily, `${name}-starboard-wall`, sideX, minZ, maxZ, doorwayZ);
  [minZ, maxZ].forEach((z, index) => addBlock(root, geometries, shellColliders, {
    name: `${name}-${index === 0 ? 'aft' : 'forward'}-wall`,
    size: [width, WALL_HEIGHT, WALL_THICKNESS],
    position: [0, WALL_CENTER_Y, z],
    material: woodVariant(materialFamily, index + 2),
    collider: true,
  }));
}

function addPlankedFloor(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  name: string,
  width: number,
  length: number,
  centerZ: number,
  family: WoodMaterialFamily,
  grainMaterial: Material,
): void {
  const plankPitch = 0.48;
  const plankWidth = plankPitch - DECK_PLANK_GAP;
  const plankCount = Math.floor(width / plankPitch);
  const firstX = -((plankCount - 1) * plankPitch) / 2;
  for (let index = 0; index < plankCount; index += 1) {
    const x = firstX + index * plankPitch;
    addBlock(root, geometries, shellColliders, {
      name: `${name}-plank-${index}`,
      size: [plankWidth, DECK_PLANK_THICKNESS, length],
      position: [x, DECK_Y + DECK_THICKNESS / 2 + DECK_PLANK_THICKNESS / 2, centerZ],
      material: woodVariant(family, index),
    });
    if (index % 3 === 0) {
      addBlock(root, geometries, shellColliders, {
        name: `${name}-grain-${index}`,
        size: [GRAIN_HEIGHT, GRAIN_HEIGHT, length * 0.84],
        position: [x + plankWidth * 0.18, DECK_Y + DECK_THICKNESS / 2 + DECK_PLANK_THICKNESS + GRAIN_HEIGHT / 2, centerZ],
        material: grainMaterial,
      });
    }
  }
}

function addDeckPlanks(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
): void {
  const plankPitch = 0.48;
  const plankWidth = plankPitch - DECK_PLANK_GAP;
  const plankCount = Math.floor(DECK_WIDTH / plankPitch);
  const firstX = -((plankCount - 1) * plankPitch) / 2;
  for (let index = 0; index < plankCount; index += 1) {
    const x = firstX + index * plankPitch;
    addBlock(root, geometries, shellColliders, {
      name: `deck-plank-${index}`,
      size: [plankWidth, DECK_PLANK_THICKNESS, DECK_LENGTH - 0.2],
      position: [x, DECK_Y + DECK_THICKNESS / 2 + DECK_PLANK_THICKNESS / 2, 0],
      material: woodVariant(materials.deckTimber, index),
    });
    if (index % 4 === 0) {
      addBlock(root, geometries, shellColliders, {
        name: `deck-grain-${index}`,
        size: [GRAIN_HEIGHT, GRAIN_HEIGHT, DECK_LENGTH - 1],
        position: [x + plankWidth * 0.2, DECK_Y + DECK_THICKNESS / 2 + DECK_PLANK_THICKNESS + GRAIN_HEIGHT / 2, 0],
        material: materials.darkMetal,
      });
    }
  }
}

function addWheelhouse(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
): void {
  const minZ = WHEELHOUSE_Z - WHEELHOUSE_LENGTH / 2;
  const maxZ = WHEELHOUSE_Z + WHEELHOUSE_LENGTH / 2;
  const sideX = WHEELHOUSE_WIDTH / 2;
  const baseY = WALL_BOTTOM_Y + WHEELHOUSE_RAISE;
  const sillY = baseY + WINDOW_SILL_HEIGHT / 2;
  const headerY = baseY + WHEELHOUSE_WALL_HEIGHT - WINDOW_HEADER_HEIGHT / 2;
  const windowHeight = WHEELHOUSE_WALL_HEIGHT - WINDOW_SILL_HEIGHT - WINDOW_HEADER_HEIGHT;
  const windowY = baseY + WINDOW_SILL_HEIGHT + windowHeight / 2;
  const frontWindowWidth = (WHEELHOUSE_WIDTH - WINDOW_PILLAR_WIDTH * 4) / 3;
  const sideWindowLength = (WHEELHOUSE_LENGTH - WINDOW_PILLAR_WIDTH * 3) / 2;

  addBlock(root, geometries, shellColliders, {
    name: 'wheelhouse-raised-base',
    size: [WHEELHOUSE_WIDTH, WHEELHOUSE_RAISE * 2, WHEELHOUSE_LENGTH],
    position: [0, WALL_BOTTOM_Y + WHEELHOUSE_RAISE / 2, WHEELHOUSE_Z],
    material: materials.paintedSteel,
    collider: true,
  });

  addBlock(root, geometries, shellColliders, {
    name: 'wheelhouse-front-sill',
    size: [WHEELHOUSE_WIDTH, WINDOW_SILL_HEIGHT, WALL_THICKNESS],
    position: [0, sillY, maxZ],
    material: woodVariant(materials.wallPanels, 0),
    collider: true,
  });
  addBlock(root, geometries, shellColliders, {
    name: 'wheelhouse-front-header',
    size: [WHEELHOUSE_WIDTH, WINDOW_HEADER_HEIGHT, WALL_THICKNESS],
    position: [0, headerY, maxZ],
    material: woodVariant(materials.wallPanels, 1),
    collider: true,
  });
  for (let pillar = 0; pillar < 4; pillar += 1) {
    const x = -WHEELHOUSE_WIDTH / 2 + WINDOW_PILLAR_WIDTH / 2 + pillar * (frontWindowWidth + WINDOW_PILLAR_WIDTH);
    addBlock(root, geometries, shellColliders, {
      name: `wheelhouse-front-pillar-${pillar}`,
      size: [WINDOW_PILLAR_WIDTH, windowHeight, WALL_THICKNESS],
      position: [x, windowY, maxZ],
      material: materials.paintedSteel,
      collider: true,
    });
  }
  for (let windowIndex = 0; windowIndex < 3; windowIndex += 1) {
    const x = -WHEELHOUSE_WIDTH / 2 + WINDOW_PILLAR_WIDTH + frontWindowWidth / 2
      + windowIndex * (frontWindowWidth + WINDOW_PILLAR_WIDTH);
    addBlock(root, geometries, shellColliders, {
      name: `wheelhouse-front-window-${windowIndex}`,
      size: [frontWindowWidth, windowHeight, WINDOW_GLASS_THICKNESS],
      position: [x, windowY, maxZ],
      material: materials.glass,
      collider: true,
    });
  }

  [-sideX, sideX].forEach((x, sideIndex) => {
    const sideName = sideIndex === 0 ? 'port' : 'starboard';
    if (sideName === 'port') {
      const doorCenterZ = 12.8;
      const doorMinZ = doorCenterZ - WHEELHOUSE_DOOR_WIDTH / 2;
      const doorMaxZ = doorCenterZ + WHEELHOUSE_DOOR_WIDTH / 2;
      const aftLength = doorMinZ - minZ;
      const forwardLength = maxZ - doorMaxZ;
      const forwardCenterZ = (doorMaxZ + maxZ) / 2;
      addBlock(root, geometries, shellColliders, {
        name: 'wheelhouse-port-aft-door-side',
        size: [WALL_THICKNESS, WHEELHOUSE_WALL_HEIGHT, aftLength],
        position: [x, baseY + WHEELHOUSE_WALL_HEIGHT / 2, minZ + aftLength / 2],
        material: woodVariant(materials.wallPanels, 2),
        collider: true,
      });
      addBlock(root, geometries, shellColliders, {
        name: 'wheelhouse-port-forward-sill',
        size: [WALL_THICKNESS, WINDOW_SILL_HEIGHT, forwardLength],
        position: [x, sillY, forwardCenterZ],
        material: woodVariant(materials.wallPanels, 3),
        collider: true,
      });
      addBlock(root, geometries, shellColliders, {
        name: 'wheelhouse-port-forward-header',
        size: [WALL_THICKNESS, WINDOW_HEADER_HEIGHT, forwardLength],
        position: [x, headerY, forwardCenterZ],
        material: woodVariant(materials.wallPanels, 2),
        collider: true,
      });
      [doorMaxZ + WINDOW_PILLAR_WIDTH / 2, maxZ - WINDOW_PILLAR_WIDTH / 2]
        .forEach((z, pillar) => addBlock(root, geometries, shellColliders, {
          name: `wheelhouse-port-forward-pillar-${pillar}`,
          size: [WALL_THICKNESS, windowHeight, WINDOW_PILLAR_WIDTH],
          position: [x, windowY, z],
          material: materials.paintedSteel,
          collider: true,
        }));
      const glassLength = forwardLength - WINDOW_PILLAR_WIDTH * 2;
      addBlock(root, geometries, shellColliders, {
        name: 'wheelhouse-port-window-0',
        size: [WINDOW_GLASS_THICKNESS, windowHeight, glassLength],
        position: [x, windowY, doorMaxZ + WINDOW_PILLAR_WIDTH + glassLength / 2],
        material: materials.glass,
        collider: true,
      });
      return;
    }
    addBlock(root, geometries, shellColliders, {
      name: `wheelhouse-${sideName}-sill`,
      size: [WALL_THICKNESS, WINDOW_SILL_HEIGHT, WHEELHOUSE_LENGTH],
      position: [x, sillY, WHEELHOUSE_Z],
      material: woodVariant(materials.wallPanels, sideIndex + 2),
      collider: true,
    });
    addBlock(root, geometries, shellColliders, {
      name: `wheelhouse-${sideName}-header`,
      size: [WALL_THICKNESS, WINDOW_HEADER_HEIGHT, WHEELHOUSE_LENGTH],
      position: [x, headerY, WHEELHOUSE_Z],
      material: woodVariant(materials.wallPanels, sideIndex + 1),
      collider: true,
    });
    for (let pillar = 0; pillar < 3; pillar += 1) {
      const z = minZ + WINDOW_PILLAR_WIDTH / 2 + pillar * (sideWindowLength + WINDOW_PILLAR_WIDTH);
      addBlock(root, geometries, shellColliders, {
        name: `wheelhouse-${sideName}-pillar-${pillar}`,
        size: [WALL_THICKNESS, windowHeight, WINDOW_PILLAR_WIDTH],
        position: [x, windowY, z],
        material: materials.paintedSteel,
        collider: true,
      });
    }
    for (let windowIndex = 0; windowIndex < 2; windowIndex += 1) {
      const z = minZ + WINDOW_PILLAR_WIDTH + sideWindowLength / 2
        + windowIndex * (sideWindowLength + WINDOW_PILLAR_WIDTH);
      addBlock(root, geometries, shellColliders, {
        name: `wheelhouse-${sideName}-window-${windowIndex}`,
        size: [WINDOW_GLASS_THICKNESS, windowHeight, sideWindowLength],
        position: [x, windowY, z],
        material: materials.glass,
        collider: true,
      });
    }
  });

  const doorSideWidth = (WHEELHOUSE_WIDTH - WHEELHOUSE_DOOR_WIDTH) / 2;
  [-1, 1].forEach((direction, index) => addBlock(root, geometries, shellColliders, {
    name: `wheelhouse-aft-door-side-${index}`,
    size: [doorSideWidth, WHEELHOUSE_WALL_HEIGHT, WALL_THICKNESS],
    position: [direction * (WHEELHOUSE_DOOR_WIDTH / 2 + doorSideWidth / 2), baseY + WHEELHOUSE_WALL_HEIGHT / 2, minZ],
    material: woodVariant(materials.wallPanels, index),
    collider: true,
  }));

  addBlock(root, geometries, shellColliders, {
    name: 'wheelhouse-roof',
    size: [WHEELHOUSE_WIDTH + 0.35, 0.24, WHEELHOUSE_LENGTH + 0.35],
    position: [0, baseY + WHEELHOUSE_WALL_HEIGHT + 0.12, WHEELHOUSE_Z],
    material: materials.paintedSteel,
  });
}

function addCylinder(
  root: Group,
  geometries: Set<BufferGeometry>,
  name: string,
  radius: number,
  height: number,
  position: readonly [number, number, number],
  material: Material,
): Mesh {
  const geometry = new CylinderGeometry(radius, radius * 1.08, height, 12);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  geometries.add(geometry);
  return mesh;
}

function addMachineryAndStacks(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
): readonly [Vector3, Vector3] {
  const machineryY = WALL_BOTTOM_Y + MACHINERY_HEIGHT / 2;
  addBlock(root, geometries, shellColliders, {
    name: 'stern-machinery-housing',
    size: [MACHINERY_WIDTH, MACHINERY_HEIGHT, MACHINERY_LENGTH],
    position: [0, machineryY, MACHINERY_Z],
    material: materials.paintedSteel,
    collider: true,
  });
  const stackCenterY = STACK_OUTLET_Y - STACK_HEIGHT / 2;
  const stackOutlets = [
    new Vector3(-STACK_X, STACK_OUTLET_Y, MACHINERY_Z),
    new Vector3(STACK_X, STACK_OUTLET_Y, MACHINERY_Z),
  ] as const;
  stackOutlets.forEach((outlet, index) => {
    const side = index === 0 ? 'port' : 'starboard';
    addCylinder(root, geometries, `smokestack-${side}`, STACK_RADIUS, STACK_HEIGHT, [outlet.x, stackCenterY, outlet.z], materials.darkMetal);
    addCylinder(root, geometries, `smokestack-${side}-collar`, STACK_COLLAR_RADIUS, STACK_COLLAR_HEIGHT, [outlet.x, stackCenterY - STACK_HEIGHT / 2 + STACK_COLLAR_HEIGHT / 2, outlet.z], materials.exposedMetal);
    addBlock(root, geometries, shellColliders, {
      name: `rust-streak-${side}-stack-collar`,
      size: [0.18, 0.7, 0.035],
      position: [outlet.x, stackCenterY - STACK_HEIGHT / 2 - 0.2, MACHINERY_Z + STACK_RADIUS],
      material: materials.rust,
    });
  });
  return stackOutlets;
}

function addRailSegment(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  sideName: 'port' | 'starboard',
  minZ: number,
  maxZ: number,
): void {
  const x = sideName === 'port' ? -RAIL_X : RAIL_X;
  const length = maxZ - minZ;
  const centerZ = (minZ + maxZ) / 2;
  const railTopY = WALL_BOTTOM_Y + RAIL_HEIGHT;
  addBlock(root, geometries, shellColliders, {
    name: `rail-${sideName}-${minZ}-top`,
    size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, length],
    position: [x, railTopY - RAIL_TOP_THICKNESS / 2, centerZ],
    material: materials.darkMetal,
  });
  const postCount = Math.max(2, Math.ceil(length / RAIL_POST_SPACING));
  for (let index = 0; index <= postCount; index += 1) {
    const z = minZ + (length * index) / postCount;
    addBlock(root, geometries, shellColliders, {
      name: `rail-${sideName}-${minZ}-post-${index}`,
      size: [RAIL_POST_WIDTH, RAIL_HEIGHT, RAIL_POST_WIDTH],
      position: [x, WALL_BOTTOM_Y + RAIL_HEIGHT / 2, z],
      material: materials.darkMetal,
    });
  }
  const colliderX = x + (sideName === 'port' ? -1 : 1) * RAIL_COLLIDER_OUTWARD_OFFSET;
  shellColliders.push(toCollisionBox(
    [colliderX, WALL_BOTTOM_Y + RAIL_HEIGHT / 2, centerZ],
    [RAIL_COLLIDER_THICKNESS, RAIL_HEIGHT, length],
  ));
}

function addTransverseRail(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  end: 'bow' | 'stern',
  z: number,
): void {
  const width = RAIL_X * 2;
  const railTopY = WALL_BOTTOM_Y + RAIL_HEIGHT;
  addBlock(root, geometries, shellColliders, {
    name: `rail-${end}-top`,
    size: [width, RAIL_TOP_THICKNESS, RAIL_THICKNESS],
    position: [0, railTopY - RAIL_TOP_THICKNESS / 2, z],
    material: materials.darkMetal,
  });
  const postCount = Math.ceil(width / RAIL_POST_SPACING);
  for (let index = 0; index <= postCount; index += 1) {
    const x = -RAIL_X + (width * index) / postCount;
    addBlock(root, geometries, shellColliders, {
      name: `rail-${end}-post-${index}`,
      size: [RAIL_POST_WIDTH, RAIL_HEIGHT, RAIL_POST_WIDTH],
      position: [x, WALL_BOTTOM_Y + RAIL_HEIGHT / 2, z],
      material: materials.darkMetal,
    });
  }
  shellColliders.push(toCollisionBox(
    [0, WALL_BOTTOM_Y + RAIL_HEIGHT / 2, z],
    [width, RAIL_HEIGHT, RAIL_COLLIDER_THICKNESS],
  ));
}

function addRails(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
): void {
  const gapMinZ = LIFEBOAT_Z - LIFEBOAT_RAIL_GAP / 2;
  const gapMaxZ = LIFEBOAT_Z + LIFEBOAT_RAIL_GAP / 2;
  addRailSegment(root, geometries, shellColliders, materials, 'port', RAIL_MIN_Z, RAIL_MAX_Z);
  addRailSegment(root, geometries, shellColliders, materials, 'starboard', RAIL_MIN_Z, gapMinZ);
  addRailSegment(root, geometries, shellColliders, materials, 'starboard', gapMaxZ, RAIL_MAX_Z);
  addTransverseRail(root, geometries, shellColliders, materials, 'bow', RAIL_MAX_Z);
  addTransverseRail(root, geometries, shellColliders, materials, 'stern', RAIL_MIN_Z);
}

function addWeathering(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
): void {
  const drainZ = -2.5;
  [-4.8, 4.8].forEach((x, index) => {
    addBlock(root, geometries, shellColliders, {
      name: `deck-drain-${index}`,
      size: [0.34, 0.025, 0.48],
      position: [x, DECK_Y + DECK_THICKNESS / 2 + DECK_PLANK_THICKNESS + 0.02, drainZ],
      material: materials.darkMetal,
    });
    addBlock(root, geometries, shellColliders, {
      name: `rust-streak-deck-drain-${index}`,
      size: [0.09, GRAIN_HEIGHT, 0.8],
      position: [x, DECK_Y + DECK_THICKNESS / 2 + DECK_PLANK_THICKNESS + 0.037, drainZ + 0.5],
      material: materials.rust,
    });
  });
  addBlock(root, geometries, shellColliders, {
    name: 'rust-streak-lifeboat-rail-opening',
    size: [0.025, 0.68, 0.12],
    position: [RAIL_X + RAIL_THICKNESS / 2, WALL_BOTTOM_Y + 0.34, LIFEBOAT_Z],
    material: materials.rust,
  });
}

export function createShipGeometry(materials: ShipMaterials): ShipGeometryBuild {
  const root = new Group();
  root.name = 'coastal-freighter';
  const geometries = new Set<BufferGeometry>();
  const shellColliders: CollisionBox[] = [];

  addBlock(root, geometries, shellColliders, {
    name: 'main-hull-body',
    size: [HALF_WIDTH * 2, HULL_HEIGHT, HULL_LENGTH],
    position: [0, HULL_TOP_Y - HULL_HEIGHT / 2, HULL_Z],
    material: materials.darkHull,
    collider: true,
  });
  addBowWedge(root, geometries, shellColliders, materials.darkHull);
  addBlock(root, geometries, shellColliders, {
    name: 'timber-deck',
    size: [DECK_WIDTH, DECK_THICKNESS, DECK_LENGTH],
    position: [0, DECK_Y, 0],
    material: materials.deckTimber[0],
    collider: true,
  });
  addDeckPlanks(root, geometries, shellColliders, materials);

  addRoom(root, geometries, shellColliders, materials.wallPanels, 'crew-cabin', CABIN_WIDTH, CABIN_MIN_Z, CABIN_MAX_Z, CABIN_DOOR_Z);
  addRoom(root, geometries, shellColliders, materials.wallPanels, 'storage-room', STORAGE_WIDTH, STORAGE_MIN_Z, STORAGE_MAX_Z, STORAGE_DOOR_Z);
  addPlankedFloor(root, geometries, shellColliders, 'crew-cabin-floor', CABIN_WIDTH - 0.5, CABIN_MAX_Z - CABIN_MIN_Z - 0.5, CABIN_Z - 0.8, materials.floorPlanks, materials.darkMetal);
  addPlankedFloor(root, geometries, shellColliders, 'storage-room-floor', STORAGE_WIDTH - 0.5, STORAGE_MAX_Z - STORAGE_MIN_Z - 0.5, STORAGE_Z, materials.floorPlanks, materials.darkMetal);
  addWheelhouse(root, geometries, shellColliders, materials);
  addPlankedFloor(root, geometries, shellColliders, 'wheelhouse-floor', WHEELHOUSE_WIDTH - 0.5, WHEELHOUSE_LENGTH - 0.5, WHEELHOUSE_Z, materials.floorPlanks, materials.darkMetal);

  const stackOutlets = addMachineryAndStacks(root, geometries, shellColliders, materials);
  addRails(root, geometries, shellColliders, materials);
  addWeathering(root, geometries, shellColliders, materials);

  const beaconRoofY = WALL_BOTTOM_Y + WHEELHOUSE_RAISE + WHEELHOUSE_WALL_HEIGHT + 0.24;
  addCylinder(root, geometries, 'alarm-beacon', 0.22, 0.5, [0, beaconRoofY + 0.25, WHEELHOUSE_Z], materials.beacon);

  const zoneCenters = new Map<ShipZoneId, Vector3>([
    ['crewCabin', new Vector3(0, 3.72, 7.5)],
    ['wheelhouse', new Vector3(0, 3.72, 13.2)],
    ['cargoDeck', new Vector3(0, 3.72, -1.5)],
    ['storageRoom', new Vector3(0, 3.72, -9.2)],
    ['lifeboatStation', new Vector3(5.4, 3.72, -6.5)],
  ]);
  let disposed = false;

  return {
    root,
    shellColliders,
    zoneCenters,
    waterExclusion: { halfWidth: 6.05, halfLength: 17.6 },
    stackOutlets,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
