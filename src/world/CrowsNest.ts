import {
  BoxGeometry,
  BufferGeometry,
  CubicBezierCurve3,
  Group,
  Material,
  Mesh,
  Vector3,
} from 'three';
import type { ScavengeIntroAnchors } from '../game/scavengeIntro';
import type { CollisionBox } from '../player/collisions';
import type { LadderClimbZone } from '../player/LadderTraversal';
import {
  PLAYER_LAYOUT_RADIUS,
  type ShipCrowsNestSpec,
  type ShipMastSpec,
} from './ShipLayoutTypes';
import type { ShipMaterials } from './ShipMaterials';
import { disposeResourceSets } from './SceneResources';
import { ShipDetailGeometry } from './ShipDetailGeometry';

export interface CrowsNestBuild {
  readonly root: Group;
  readonly colliders: readonly CollisionBox[];
  readonly climbZone: LadderClimbZone;
  readonly introAnchors: ScavengeIntroAnchors;
  readonly openingBounds: Readonly<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }>;
  disposeGeometry(): void;
}

const LADDER_RUNG_DEPTH = 0.11;
const LADDER_CLIMB_MARGIN = 0.03;
const LADDER_DECK_EMBED = 0.18;

function boxCollider(
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

export function createCrowsNest(
  materials: ShipMaterials,
  mast: ShipMastSpec,
  spec: ShipCrowsNestSpec,
): CrowsNestBuild {
  const root = new Group();
  root.name = `crows-nest:${spec.id}`;
  const geometries = new Set<BufferGeometry>();
  const colliders: CollisionBox[] = [];
  const addBox = (
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: Material,
  ): Mesh => {
    const geometry = new BoxGeometry(...size);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    geometries.add(geometry);
    return mesh;
  };
  const floorY = mast.position[1] + spec.floorOffsetY;
  const halfWidth = spec.outerWidth / 2;
  const floorThickness = 0.14;
  const floorSurfaceY = floorY + floorThickness / 2;
  const ladderZ = mast.position[2] - mast.baseDiameter / 2 - spec.ladder.mastOffset;
  const climbZ = ladderZ + spec.ladder.outwardZ * (
    PLAYER_LAYOUT_RADIUS + LADDER_RUNG_DEPTH / 2 + LADDER_CLIMB_MARGIN
  );
  const openingHalfSize = spec.openingSize / 2;
  const openingBounds = {
    minX: mast.position[0] - openingHalfSize,
    maxX: mast.position[0] + openingHalfSize,
    minZ: ladderZ - openingHalfSize,
    maxZ: ladderZ + openingHalfSize,
  };
  const minX = mast.position[0] - halfWidth;
  const maxX = mast.position[0] + halfWidth;
  const minZ = mast.position[2] - halfWidth;
  const maxZ = mast.position[2] + halfWidth;
  const addFloor = (
    name: string,
    xMin: number,
    xMax: number,
    zMin: number,
    zMax: number,
  ): void => {
    const size: readonly [number, number, number] = [
      xMax - xMin,
      floorThickness,
      zMax - zMin,
    ];
    const position: readonly [number, number, number] = [
      (xMin + xMax) / 2,
      floorY,
      (zMin + zMax) / 2,
    ];
    addBox(`crows-nest:floor:${name}`, size, position, materials.timberFloor);
    colliders.push(boxCollider(position, size));
  };
  addFloor('forward', minX, maxX, openingBounds.maxZ, maxZ);
  addFloor('aft', minX, maxX, minZ, openingBounds.minZ);
  addFloor('port', minX, openingBounds.minX, openingBounds.minZ, openingBounds.maxZ);
  addFloor('starboard', openingBounds.maxX, maxX, openingBounds.minZ, openingBounds.maxZ);

  const guardY = floorSurfaceY + spec.guardHeight / 2;
  const sideGuardThickness = 0.12;
  const postWidth = 0.12;
  const portX = minX + sideGuardThickness / 2;
  const starboardX = maxX - sideGuardThickness / 2;
  const aftZ = minZ + sideGuardThickness / 2;
  const forwardZ = maxZ - sideGuardThickness / 2;
  const topRailY = floorSurfaceY + spec.guardHeight - 0.055;
  const guard = new ShipDetailGeometry(geometries);
  const addPost = (x: number, z: number): void => {
    if ((x === portX || x === starboardX) && (z === aftZ || z === forwardZ)) {
      x += x === portX ? 0.02 : -0.02;
      z += z === aftZ ? 0.02 : -0.02;
    }
    guard.rod(materials.deckSteel, [x, floorSurfaceY, z], [x, topRailY, z], 0.04);
    guard.box(materials.darkMetal, [0.17, 0.035, 0.17], [x, floorSurfaceY + 0.0175, z], 0, 0);
  };
  const corners = [[portX, aftZ], [portX, forwardZ], [starboardX, forwardZ], [starboardX, aftZ]] as const;
  for (const [index, corner] of corners.entries()) {
    const previous = corners[(index + corners.length - 1) % corners.length]!;
    const next = corners[(index + 1) % corners.length]!;
    const beforeX = corner[0] + Math.sign(previous[0] - corner[0]) * 0.12;
    const beforeZ = corner[1] + Math.sign(previous[1] - corner[1]) * 0.12;
    const afterX = corner[0] + Math.sign(next[0] - corner[0]) * 0.12;
    const afterZ = corner[1] + Math.sign(next[1] - corner[1]) * 0.12;
    const endX = next[0] + Math.sign(corner[0] - next[0]) * 0.12;
    const endZ = next[1] + Math.sign(corner[1] - next[1]) * 0.12;
    for (const [y, radius] of [[topRailY, 0.055], [floorSurfaceY + spec.guardHeight * 0.48, 0.028]] as const) {
      guard.tube(materials.deckSteel, new CubicBezierCurve3(
        new Vector3(beforeX, y, beforeZ), new Vector3(corner[0], y, corner[1]),
        new Vector3(corner[0], y, corner[1]), new Vector3(afterX, y, afterZ)), 4, radius);
      guard.rod(materials.deckSteel, [afterX, y, afterZ], [endX, y, endZ], radius);
    }
  }
  ([minZ + postWidth / 2, mast.position[2], maxZ - postWidth / 2] as const)
    .forEach((z) => {
      addPost(portX, z);
      addPost(starboardX, z);
    });
  addPost(mast.position[0], forwardZ);
  addPost(mast.position[0], aftZ);
  guard.finish(root, 'crows-nest:guard');
  colliders.push(
    boxCollider([portX, guardY, mast.position[2]], [
      sideGuardThickness, spec.guardHeight, spec.outerWidth,
    ]),
    boxCollider([starboardX, guardY, mast.position[2]], [
      sideGuardThickness, spec.guardHeight, spec.outerWidth,
    ]),
    boxCollider([mast.position[0], guardY, forwardZ], [
      spec.outerWidth, spec.guardHeight, sideGuardThickness,
    ]),
    boxCollider([mast.position[0], guardY, aftZ], [
      spec.outerWidth, spec.guardHeight, sideGuardThickness,
    ]),
  );

  addBox('crows-nest:support-beam', [spec.outerWidth, 0.18, 0.2], [
    mast.position[0], floorY - floorThickness / 2 - 0.09, mast.position[2] + 0.42,
  ], materials.timber);

  const ladderBaseY = mast.position[1] - LADDER_DECK_EMBED;
  const ladderHeight = floorY - ladderBaseY + 0.1;
  const ladder = new ShipDetailGeometry(geometries);
  ([-spec.ladder.width / 2, spec.ladder.width / 2] as const).forEach((x) => {
    ladder.rod(materials.paintedSteel, [mast.position[0] + x, ladderBaseY, ladderZ],
      [mast.position[0] + x, ladderBaseY + ladderHeight, ladderZ], 0.045);
    const mountCount = Math.ceil(ladderHeight / 2.4);
    for (let index = 1; index < mountCount; index += 1) {
      const y = ladderBaseY + ladderHeight * index / mountCount;
      ladder.rod(materials.paintedSteel, [mast.position[0] + x, y, ladderZ],
        [mast.position[0], y, ladderZ + spec.ladder.mastOffset + 0.08], 0.025);
    }
  });
  const rungCount = Math.ceil((floorY - mast.position[1]) / spec.ladder.rungSpacing) + 1;
  for (let index = 0; index < rungCount; index += 1) {
    const y = mast.position[1] + index * spec.ladder.rungSpacing;
    ladder.rod(materials.exposedMetal, [mast.position[0] - spec.ladder.width / 2, y, ladderZ],
      [mast.position[0] + spec.ladder.width / 2, y, ladderZ], 0.033);
  }
  ladder.finish(root, spec.ladder.id);

  const bottomEyeY = mast.position[1] + 1.5;
  const topEyeY = floorSurfaceY + 1.5;
  const climbZone: LadderClimbZone = {
    id: spec.ladder.id,
    climbX: mast.position[0],
    climbZ,
    outwardX: 0,
    outwardZ: spec.ladder.outwardZ,
    bottomEyeY,
    topEyeY,
    topFloor: {
      minX: minX + sideGuardThickness,
      maxX: maxX - sideGuardThickness,
      minZ: minZ + sideGuardThickness,
      maxZ: maxZ - sideGuardThickness,
    },
    bottomEntry: {
      minX: mast.position[0] - 0.4,
      maxX: mast.position[0] + 0.4,
      minZ: mast.position[2] - 1.35,
      maxZ: climbZ - 0.05,
    },
    topEntry: {
      minX: mast.position[0] + 0.63,
      maxX: mast.position[0] + 0.83,
      minZ: mast.position[2] - 0.12,
      maxZ: mast.position[2] + 0.08,
    },
    bottomDismount: [mast.position[0], mast.position[2] - 1.3],
    topDismount: [mast.position[0] + 0.73, mast.position[2] - 0.02],
  };
  const introAnchors: ScavengeIntroAnchors = {
    seatedPosition: [mast.position[0] + 0.69, floorSurfaceY + 0.95, mast.position[2] + 0.48],
    standingPosition: [mast.position[0] + 0.73, topEyeY, mast.position[2] + 0.14],
    ladderApproachPosition: [mast.position[0] + 0.73, topEyeY, climbZ],
    ladderTopPosition: [mast.position[0], topEyeY, climbZ],
    ladderBottomPosition: [mast.position[0], bottomEyeY, climbZ],
    exitPosition: [mast.position[0], bottomEyeY, mast.position[2] - 1.3],
  };
  let disposed = false;
  return {
    root,
    colliders,
    climbZone,
    introAnchors,
    openingBounds,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      disposeResourceSets(geometries);
    },
  };
}
