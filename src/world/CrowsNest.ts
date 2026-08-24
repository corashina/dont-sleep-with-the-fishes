import {
  BoxGeometry,
  BufferGeometry,
  Group,
  Material,
  Mesh,
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
  const topRailHeight = 0.14;
  const postWidth = 0.12;
  const portX = minX + sideGuardThickness / 2;
  const starboardX = maxX - sideGuardThickness / 2;
  const aftZ = minZ + sideGuardThickness / 2;
  const forwardZ = maxZ - sideGuardThickness / 2;
  const topRailY = floorSurfaceY + spec.guardHeight - topRailHeight / 2;
  const addGuardPart = (
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
  ): void => {
    addBox(`crows-nest:guard:${name}`, size, position, materials.timber);
  };
  addGuardPart('port-top', [sideGuardThickness, topRailHeight, spec.outerWidth], [
    portX, topRailY, mast.position[2],
  ]);
  addGuardPart('starboard-top', [sideGuardThickness, topRailHeight, spec.outerWidth], [
    starboardX, topRailY, mast.position[2],
  ]);
  addGuardPart('forward-top', [spec.outerWidth, topRailHeight, sideGuardThickness], [
    mast.position[0], topRailY, forwardZ,
  ]);
  addGuardPart('aft-top', [spec.outerWidth, topRailHeight, sideGuardThickness], [
    mast.position[0], topRailY, aftZ,
  ]);
  ([minZ + postWidth / 2, mast.position[2], maxZ - postWidth / 2] as const)
    .forEach((z, index) => {
      addGuardPart(`port-post-${index}`, [postWidth, spec.guardHeight, postWidth], [
        portX, guardY, z,
      ]);
      addGuardPart(`starboard-post-${index}`, [postWidth, spec.guardHeight, postWidth], [
        starboardX, guardY, z,
      ]);
    });
  addGuardPart('forward-post', [postWidth, spec.guardHeight, postWidth], [
    mast.position[0], guardY, forwardZ,
  ]);
  addGuardPart('aft-post', [postWidth, spec.guardHeight, postWidth], [
    mast.position[0], guardY, aftZ,
  ]);
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
  ([-spec.ladder.width / 2, spec.ladder.width / 2] as const).forEach((x, index) => {
    addBox(`${spec.ladder.id}:rail:${index}`, [0.09, ladderHeight, 0.09], [
      mast.position[0] + x,
      ladderBaseY + ladderHeight / 2,
      ladderZ,
    ], materials.darkMetal);
  });
  const rungCount = Math.ceil((floorY - mast.position[1]) / spec.ladder.rungSpacing) + 1;
  for (let index = 0; index < rungCount; index += 1) {
    addBox(`${spec.ladder.id}:rung:${index}`, [
      spec.ladder.width, 0.07, LADDER_RUNG_DEPTH,
    ], [
      mast.position[0],
      mast.position[1] + index * spec.ladder.rungSpacing,
      ladderZ,
    ], materials.exposedMetal);
  }

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
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
