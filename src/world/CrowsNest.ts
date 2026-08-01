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
import type { ShipCrowsNestSpec, ShipMastSpec } from './ShipLayout';
import type { ShipMaterials } from './ShipMaterials';

export interface CrowsNestBuild {
  readonly root: Group;
  readonly colliders: readonly CollisionBox[];
  readonly climbZone: LadderClimbZone;
  readonly introAnchors: ScavengeIntroAnchors;
  disposeGeometry(): void;
}

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

  for (let index = 0; index < 8; index += 1) {
    const z = -0.875 + index * 0.25;
    const octagonInset = index === 0 || index === 7 ? 0.42 : index === 1 || index === 6 ? 0.14 : 0;
    const width = spec.outerWidth - octagonInset - 0.02 * (index % 3);
    if (z < -0.35) {
      const sideWidth = (width - spec.openingSize) / 2;
      ([
        [-halfWidth + sideWidth / 2, 'port'],
        [halfWidth - sideWidth / 2, 'starboard'],
      ] as const).forEach(([x, side]) => {
        const size: readonly [number, number, number] = [sideWidth, floorThickness, 0.22];
        const position: readonly [number, number, number] = [
          mast.position[0] + x,
          floorY,
          mast.position[2] + z,
        ];
        addBox(`crows-nest:floor-slat:${index}:${side}`, size, position, materials.timberFloor);
        colliders.push(boxCollider(position, size));
      });
      continue;
    }
    const size: readonly [number, number, number] = [width, floorThickness, 0.22];
    const position: readonly [number, number, number] = [mast.position[0], floorY, mast.position[2] + z];
    addBox(`crows-nest:floor-slat:${index}`, size, position, materials.timberFloor);
    colliders.push(boxCollider(position, size));
  }

  const guardY = floorY + spec.guardHeight / 2;
  const addGuard = (
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
  ): void => {
    addBox(`crows-nest:guard:${name}`, size, position, materials.timber);
    colliders.push(boxCollider(position, size));
  };
  addGuard('port', [0.14, spec.guardHeight, 1.64], [
    mast.position[0] - halfWidth + 0.07, guardY, mast.position[2],
  ]);
  addGuard('starboard', [0.14, spec.guardHeight, 1.64], [
    mast.position[0] + halfWidth - 0.07, guardY, mast.position[2],
  ]);
  addGuard('forward', [1.58, spec.guardHeight, 0.14], [
    mast.position[0], guardY, mast.position[2] + 0.94,
  ]);
  addGuard('aft', [0.14, spec.guardHeight, 0.14], [
    mast.position[0] - halfWidth + 0.07, guardY, mast.position[2] - 0.94,
  ]);
  addGuard('aft-opening', [0.14, spec.guardHeight, 0.14], [
    mast.position[0] + halfWidth - 0.07, guardY, mast.position[2] - 0.94,
  ]);

  ([
    [-0.96, -0.66], [0.96, -0.66], [-0.96, 0.66], [0.96, 0.66],
  ] as const).forEach(([x, z], index) => {
    addBox(`crows-nest:bracket:${index + 1}`, [0.22, 0.16, 0.22], [
      mast.position[0] + x,
      floorY - 0.2,
      mast.position[2] + z,
    ], materials.darkMetal);
  });
  ([floorY - 0.16, floorY + 0.12] as const).forEach((y, index) => {
    addBox(`crows-nest:rope-collar:${index + 1}`, [0.88, 0.06, 0.88], [
      mast.position[0], y, mast.position[2],
    ], materials.rope);
  });

  const seat = addBox('crows-nest-seat', [0.46, 0.12, 0.38], [
    mast.position[0] + 0.58,
    floorY + 0.31,
    mast.position[2] + 0.38,
  ], materials.timber);
  seat.rotation.y = -0.08;
  addBox('crows-nest-seat-back', [0.46, 0.36, 0.08], [
    mast.position[0] + 0.58,
    floorY + 0.51,
    mast.position[2] + 0.55,
  ], materials.timber);

  const climbZ = mast.position[2] - mast.baseDiameter / 2 - spec.ladder.mastOffset;
  const ladderBaseY = mast.position[1] + 0.2;
  const ladderHeight = floorY - ladderBaseY + 0.1;
  ([-spec.ladder.width / 2, spec.ladder.width / 2] as const).forEach((x, index) => {
    addBox(`${spec.ladder.id}:rail:${index}`, [0.09, ladderHeight, 0.09], [
      mast.position[0] + x,
      ladderBaseY + ladderHeight / 2,
      climbZ,
    ], materials.darkMetal);
  });
  const rungCount = Math.ceil((floorY - mast.position[1]) / spec.ladder.rungSpacing) + 1;
  for (let index = 0; index < rungCount; index += 1) {
    addBox(`${spec.ladder.id}:rung:${index}`, [spec.ladder.width, 0.07, 0.11], [
      mast.position[0],
      mast.position[1] + index * spec.ladder.rungSpacing,
      climbZ,
    ], materials.exposedMetal);
  }

  const bottomEyeY = mast.position[1] + 1.5;
  const topEyeY = floorY + 1.5;
  const climbZone: LadderClimbZone = {
    id: spec.ladder.id,
    climbX: mast.position[0],
    climbZ,
    outwardX: 0,
    outwardZ: -1,
    bottomEyeY,
    topEyeY,
    topFloor: { minX: -1.05, maxX: 1.05, minZ: -1.05, maxZ: 1.05 },
    bottomEntry: { minX: -0.4, maxX: 0.4, minZ: -1.35, maxZ: climbZ - 0.05 },
    topEntry: { minX: -0.4, maxX: 0.4, minZ: -1.05, maxZ: climbZ - 0.05 },
    bottomDismount: [0, -1.3],
    topDismount: [0, -0.85],
  };
  const introAnchors: ScavengeIntroAnchors = {
    seatedPosition: [0, floorY + 0.95, -0.85],
    standingPosition: [0, topEyeY, -0.85],
    ladderBottomPosition: [0, bottomEyeY, climbZ],
    exitPosition: [0, bottomEyeY, -1.3],
  };
  let disposed = false;
  return {
    root,
    colliders,
    climbZone,
    introAnchors,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
