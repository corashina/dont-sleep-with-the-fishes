import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  RingGeometry,
  Vector3,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import {
  SHIP_ROOF_ENGINE,
  SHIP_STERN_CHAMFER,
} from './shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  SHIP_ROOM_ROOF_THICKNESS,
  SHIP_ROOM_WALL_HEIGHT,
  type ShipLayoutSpec,
  type ShipZoneId,
  type ShipZoneSpec,
} from './ShipLayoutTypes';
import type { ShipMaterials } from './ShipMaterials';
import {
  addBlock,
  addCylinder,
  addRotatedBlock,
  roundedBowPoint,
  toCollisionBox,
  toOrientedCollisionBox,
  type ShipGeometryBuildContext,
} from './ShipGeometryPrimitives';

const ROOM_WALL_HEIGHT = SHIP_ROOM_WALL_HEIGHT;

const BOW_DEPTH = 8.5;
const STRUCTURAL_DECK_TOP_Y = 2.18;
const STACK_X = 1.35;
const STACK_SHAFT_HEIGHT = 3.5;
const STACK_RADIUS = 0.58;
const STACK_COLLAR_RADIUS = 0.72;
const STACK_COLLAR_HEIGHT = 0.22;

const RAIL_THICKNESS = 0.2;
const RAIL_COLLIDER_THICKNESS = 0.25;
const RAIL_TOP_THICKNESS = 0.14;
const RAIL_POST_WIDTH = 0.12;
const RAIL_POST_SPACING = 2.4;
const RAIL_END_SEGMENTS = 12;
function requiredZone(layout: ShipLayoutSpec, id: ShipZoneId): ShipZoneSpec {
  const zone = layout.zones.find((candidate) => candidate.id === id);
  if (!zone) throw new Error(`Ship geometry requires zone ${id}`);
  return zone;
}

function roomWallHeight(_zoneId: ShipZoneId): number {
  return ROOM_WALL_HEIGHT;
}

function balconyDeckTopY(zoneId: ShipZoneId): number {
  return FREIGHTER_DIMENSIONS.deckY
    + roomWallHeight(zoneId)
    + SHIP_ROOM_ROOF_THICKNESS;
}

function addExteriorConstructionDetails(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const cargo = requiredZone(layout, 'cargoDeck').bounds;
  const bowShoulderZ = cargo.maxZ - BOW_DEPTH;

  const stemHeight = 1.4;
  const stemGeometry = new CylinderGeometry(0.2, 0.46, stemHeight, 4);
  const stem = new Mesh(stemGeometry, materials.exposedMetal);
  stem.name = 'bow-stem';
  stem.position.set(0, STRUCTURAL_DECK_TOP_Y - stemHeight / 2, cargo.maxZ - 0.18);
  stem.rotation.y = Math.PI / 4;
  stem.castShadow = true;
  stem.receiveShadow = true;
  root.add(stem);
  geometries.add(stemGeometry);

  addBlock(context, root, {
    name: 'stern-transom',
    size: [5.4, 1.08, 0.42],
    position: [0, 1.59, cargo.minZ + 0.16],
    material: materials.upperHull,
  });
  addBlock(context, root, {
    name: 'stern-transom-waterline',
    size: [4.3, 0.18, 0.48],
    position: [0, 1.18, cargo.minZ + 0.12],
    material: materials.waterline,
  });

  const hatch = layout.deckHatch;
  addRotatedBlock(context, root, {
    name: hatch.id,
    size: hatch.size,
    position: [
      hatch.position[0],
      hatch.position[1] + hatch.size[1] / 2,
      hatch.position[2],
    ],
    material: materials.darkMetal,
  }, hatch.rotationY);
  addRotatedBlock(context, root, {
    name: 'deck-hatch-timber-panel',
    size: [
      Math.max(0.1, hatch.size[0] - 0.27),
      0.04,
      Math.max(0.1, hatch.size[2] - 0.3),
    ],
    position: [
      hatch.position[0],
      hatch.position[1] + hatch.size[1] + 0.02,
      hatch.position[2],
    ],
    material: materials.hatchTimber,
  }, hatch.rotationY);

  const hawseGeometry = new RingGeometry(0.24, 0.38, 16);
  geometries.add(hawseGeometry);
  const hawseX = (cargo.maxX - cargo.minX) * 0.18;
  const hawseZ = bowShoulderZ + BOW_DEPTH * 0.9 - 0.08;
  ([
    ['port', -hawseX],
    ['starboard', hawseX],
  ] as const).forEach(([side, x]) => {
    const hawse = new Mesh(hawseGeometry, materials.darkMetal);
    hawse.name = `anchor-hawse-${side}`;
    hawse.position.set(x, 1.72, hawseZ);
    hawse.castShadow = true;
    hawse.receiveShadow = true;
    root.add(hawse);
  });

}

function addRoofEngine(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): readonly [Vector3, Vector3] {
  const storage = requiredZone(layout, 'storageWorkroom');
  const engineZ = (storage.bounds.minZ + storage.bounds.maxZ) / 2;
  const roofY = balconyDeckTopY(storage.id);
  const engineCenterY = roofY + SHIP_ROOF_ENGINE.height / 2;
  const engineTopY = roofY + SHIP_ROOF_ENGINE.height;
  const engineFrontZ = engineZ + SHIP_ROOF_ENGINE.depth / 2;
  addBlock(context, root, {
    name: 'roof-engine-body',
    size: [SHIP_ROOF_ENGINE.width, SHIP_ROOF_ENGINE.height, SHIP_ROOF_ENGINE.depth],
    position: [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineZ],
    material: materials.paintedSteel,
  });
  addBlock(context, root, {
    name: 'roof-engine-service-panel',
    size: [4.8, 1.08, 0.06],
    position: [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineFrontZ + 0.03],
    material: materials.darkMetal,
  });
  [-0.34, 0, 0.34].forEach((offsetY, index) => {
    addBlock(context, root, {
      name: `roof-engine-vent-${index + 1}`,
      size: [3.8, 0.08, 0.07],
      position: [
        SHIP_ROOF_ENGINE.centerX,
        engineCenterY + offsetY,
        engineFrontZ + 0.07,
      ],
      material: materials.exposedMetal,
    });
  });
  const crank = addCylinder(
    context,
    root,
    'roof-engine-crank',
    0.42,
    0.14,
    [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineFrontZ + 0.14],
    materials.exposedMetal,
  );
  crank.rotation.x = Math.PI / 2;

  const stackZ = engineZ;
  const stackBaseY = engineTopY;
  const stackShaftBaseY = stackBaseY + STACK_COLLAR_HEIGHT;
  const stackOutletY = stackShaftBaseY + STACK_SHAFT_HEIGHT;
  const stackCenterY = stackShaftBaseY + STACK_SHAFT_HEIGHT / 2;
  const stackOutlets = [
    new Vector3(-STACK_X, stackOutletY, stackZ),
    new Vector3(STACK_X, stackOutletY, stackZ),
  ] as const;
  stackOutlets.forEach((outlet, index) => {
    const side = index === 0 ? 'port' : 'starboard';
    addCylinder(context, root, `smokestack-${side}`, STACK_RADIUS, STACK_SHAFT_HEIGHT, [
      outlet.x,
      stackCenterY,
      outlet.z,
    ], materials.darkMetal);
    addCylinder(context, root, `smokestack-${side}-collar`, STACK_COLLAR_RADIUS, STACK_COLLAR_HEIGHT, [
      outlet.x,
      stackBaseY + STACK_COLLAR_HEIGHT / 2,
      outlet.z,
    ], materials.exposedMetal);
  });
  return stackOutlets;
}

function addRailSegment(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  sideName: 'port' | 'starboard',
  minZ: number,
  maxZ: number,
  layout: ShipLayoutSpec,
): void {
  const railX = layout.rail.innerFaceX + RAIL_COLLIDER_THICKNESS / 2;
  const x = sideName === 'port' ? -railX : railX;
  const length = maxZ - minZ;
  const centerZ = (minZ + maxZ) / 2;
  const railTopY = FREIGHTER_DIMENSIONS.deckY + layout.rail.height;
  addBlock(context, root, {
    name: `rail-${sideName}-${minZ}-top`,
    size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, length],
    position: [x, railTopY - RAIL_TOP_THICKNESS / 2, centerZ],
    material: materials.darkMetal,
  });
  const postCount = Math.max(2, Math.ceil(length / RAIL_POST_SPACING));
  const postSpan = Math.max(0, length - RAIL_POST_WIDTH);
  for (let index = 0; index <= postCount; index += 1) {
    const z = minZ + RAIL_POST_WIDTH / 2 + (postSpan * index) / postCount;
    addBlock(context, root, {
      name: `rail-${sideName}-${minZ}-post-${index}`,
      size: [RAIL_POST_WIDTH, layout.rail.height, RAIL_POST_WIDTH],
      position: [x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, z],
      material: materials.darkMetal,
    });
  }
  shellColliders.push(toCollisionBox(
    [x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, centerZ],
    [RAIL_COLLIDER_THICKNESS, layout.rail.height, length],
  ));
}

function addChamferedSternRail(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  sternZ: number,
  layout: ShipLayoutSpec,
): void {
  const railTopY = FREIGHTER_DIMENSIONS.deckY + layout.rail.height;
  const railX = layout.rail.innerFaceX + RAIL_COLLIDER_THICKNESS / 2;
  const rearHalfWidth = railX - SHIP_STERN_CHAMFER;
  addBlock(context, root, {
    name: 'rail-stern-top',
    size: [rearHalfWidth * 2, RAIL_TOP_THICKNESS, RAIL_THICKNESS],
    position: [0, railTopY - RAIL_TOP_THICKNESS / 2, sternZ],
    material: materials.darkMetal,
  });
  ([
    ['port', -rearHalfWidth, -railX],
    ['starboard', rearHalfWidth, railX],
  ] as const).forEach(([side, rearX, sideX]) => {
    const deltaX = sideX - rearX;
    const deltaZ = SHIP_STERN_CHAMFER;
    const length = Math.hypot(deltaX, deltaZ);
    const position = [
      (rearX + sideX) / 2,
      railTopY - RAIL_TOP_THICKNESS / 2,
      sternZ + SHIP_STERN_CHAMFER / 2,
    ] as const;
    const rotationY = Math.atan2(deltaX, deltaZ);
    addRotatedBlock(context, root, {
      name: `rail-stern-chamfer-${side}`,
      size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, length],
      position,
      material: materials.darkMetal,
    }, rotationY);
    shellColliders.push(toOrientedCollisionBox(
      [position[0], FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, position[2]],
      [RAIL_COLLIDER_THICKNESS, layout.rail.height, length],
      rotationY,
    ));
  });
  ([-rearHalfWidth, rearHalfWidth] as const).forEach((x, index) => {
    addBlock(context, root, {
      name: `rail-stern-post-${index}`,
      size: [RAIL_POST_WIDTH, layout.rail.height, RAIL_POST_WIDTH],
      position: [x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, sternZ],
      material: materials.darkMetal,
    });
  });
  shellColliders.push(toCollisionBox(
    [0, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, sternZ],
    [rearHalfWidth * 2, layout.rail.height, RAIL_COLLIDER_THICKNESS],
  ));
}

function addRoundedBowRail(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  shoulderZ: number,
  layout: ShipLayoutSpec,
): void {
  const railTopY = FREIGHTER_DIMENSIONS.deckY + layout.rail.height;
  const railX = layout.rail.innerFaceX + RAIL_COLLIDER_THICKNESS / 2;
  const tipZ = shoulderZ + BOW_DEPTH + RAIL_COLLIDER_THICKNESS / 2;
  const pointAt = (index: number): { x: number; z: number } => roundedBowPoint(
    railX,
    shoulderZ,
    tipZ,
    index / RAIL_END_SEGMENTS,
  );
  for (let index = 0; index < RAIL_END_SEGMENTS; index += 1) {
    const start = pointAt(index);
    const finish = pointAt(index + 1);
    const deltaX = finish.x - start.x;
    const deltaZ = finish.z - start.z;
    const chordLength = Math.hypot(deltaX, deltaZ);
    const position = [
      (start.x + finish.x) / 2,
      railTopY - RAIL_TOP_THICKNESS / 2,
      (start.z + finish.z) / 2,
    ] as const;
    const rotationY = Math.atan2(deltaX, deltaZ);
    addRotatedBlock(context, root, {
      name: `rail-bow-top-${index}`,
      size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, chordLength],
      position,
      material: materials.darkMetal,
    }, rotationY);
    shellColliders.push(toOrientedCollisionBox(
      [position[0], FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, position[2]],
      [RAIL_COLLIDER_THICKNESS, layout.rail.height, chordLength],
      rotationY,
    ));
  }
  for (let index = 0; index <= RAIL_END_SEGMENTS; index += 1) {
    const point = pointAt(index);
    addBlock(context, root, {
      name: `rail-bow-post-${index}`,
      size: [RAIL_POST_WIDTH, layout.rail.height, RAIL_POST_WIDTH],
      position: [point.x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, point.z],
      material: materials.darkMetal,
    });
  }
}

function addRails(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const cargo = requiredZone(layout, 'cargoDeck').bounds;
  const minZ = cargo.minZ + SHIP_STERN_CHAMFER;
  const maxZ = cargo.maxZ - BOW_DEPTH;
  const opening = layout.rail.starboardOpening;
  const gapMinZ = opening.centerZ - opening.width / 2;
  const gapMaxZ = opening.centerZ + opening.width / 2;
  addRailSegment(context, root, geometries, shellColliders, materials, 'port', minZ, maxZ, layout);
  addRailSegment(context, root, geometries, shellColliders, materials, 'starboard', minZ, gapMinZ, layout);
  addRailSegment(context, root, geometries, shellColliders, materials, 'starboard', gapMaxZ, maxZ, layout);
  addRoundedBowRail(context, root, geometries, shellColliders, materials, maxZ, layout);
  addChamferedSternRail(
    context,
    root,
    geometries,
    shellColliders,
    materials,
    cargo.minZ,
    layout,
  );
}

export function addShipExterior(
  context: ShipGeometryBuildContext,
  layout: ShipLayoutSpec,
): readonly [Vector3, Vector3] {
  addExteriorConstructionDetails(
    context,
    context.root,
    context.geometries,
    context.shellColliders,
    context.materials,
    layout,
  );
  const stackOutlets = addRoofEngine(
    context,
    context.root,
    context.geometries,
    context.shellColliders,
    context.materials,
    layout,
  );
  addRails(
    context,
    context.root,
    context.geometries,
    context.shellColliders,
    context.materials,
    layout,
  );
  return stackOutlets;
}
