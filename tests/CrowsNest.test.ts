// Importance: 4/5. Protects climbable mast geometry and full player traversal.
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { InputController } from '../src/input/InputController';
import type { MovementAxes } from '../src/player/collisions';
import { circleOverlapsCollisionFootprint } from '../src/player/collisions';
import { PlayerController, type PlayerNavigationBounds } from '../src/player/PlayerController';
import { createCrowsNest } from '../src/world/CrowsNest';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_LAYOUT,
} from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { createShipRigging } from '../src/world/ShipRigging';

const noDynamicMovement = (): void => undefined;

class TestInput {
  movement: MovementAxes = { x: 0, z: 0 };
  sprinting = false;

  consumeLook(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }

  consumeJump(): boolean {
    return false;
  }

  asControllerInput(): InputController {
    return this as unknown as InputController;
  }
}

const MAINMAST = SHIP_LAYOUT.rigging.masts[0]!;
const NEST_BOUNDS: PlayerNavigationBounds = {
  safe: {
    minX: -2,
    maxX: 2,
    minZ: MAINMAST.position[2] - 2,
    maxZ: MAINMAST.position[2] + 2,
  },
  fall: {
    minX: -3,
    maxX: 3,
    minZ: MAINMAST.position[2] - 3,
    maxZ: MAINMAST.position[2] + 3,
  },
};

describe('mainmast crow\'s nest', () => {
  it('builds a climbable lookout with intro anchors', () => {
    const materials = createShipMaterials();
    const mast = SHIP_LAYOUT.rigging.masts[0]!;
    const build = createCrowsNest(materials, mast, SHIP_LAYOUT.rigging.crowsNest);

    try {
      expect(build.root.name).toBe('crows-nest:mainmast-lookout');
      expect(build.climbZone.id).toBe('mainmast-ladder');
      expect(build.climbZone.bottomEyeY).toBe(FREIGHTER_DIMENSIONS.deckY + 1.5);
      expect(build.climbZone.topEyeY).toBe(FREIGHTER_DIMENSIONS.deckY + 16.07);
      expect(build.climbZone.bottomDismount).toEqual([0, mast.position[2] - 1.3]);
      expect(build.climbZone.topDismount).toEqual([0.73, mast.position[2] - 0.02]);
      expect(build.introAnchors.seatedPosition).toEqual([
        0.69, FREIGHTER_DIMENSIONS.deckY + 15.52, mast.position[2] + 0.48,
      ]);
      expect(build.introAnchors.standingPosition).toEqual([
        0.73, FREIGHTER_DIMENSIONS.deckY + 16.07, mast.position[2] + 0.14,
      ]);
      expect(build.introAnchors.ladderApproachPosition).toEqual([
        0.73, FREIGHTER_DIMENSIONS.deckY + 16.07, mast.position[2] - 0.975,
      ]);
      expect(build.introAnchors.ladderTopPosition).toEqual([
        0, FREIGHTER_DIMENSIONS.deckY + 16.07, mast.position[2] - 0.975,
      ]);
      expect(build.introAnchors.ladderBottomPosition).toEqual([
        0, FREIGHTER_DIMENSIONS.deckY + 1.5, mast.position[2] - 0.975,
      ]);
      expect(build.introAnchors.exitPosition).toEqual([
        0, FREIGHTER_DIMENSIONS.deckY + 1.5, mast.position[2] - 1.3,
      ]);
      expect(build.root.getObjectByName('crows-nest-seat')).toBeUndefined();
      expect(build.root.getObjectByName('crows-nest-seat-support')).toBeUndefined();
      expect(build.root.getObjectByName('crows-nest-seat-back')).toBeUndefined();
      const firstRung = build.root.getObjectByName(
        'mainmast-ladder:rung:0',
      ) as Mesh<BoxGeometry>;
      expect(firstRung).toBeDefined();
      [0, 1].forEach((index) => {
        const rail = build.root.getObjectByName(
          `mainmast-ladder:rail:${index}`,
        ) as Mesh<BoxGeometry>;
        expect(rail.position.y - rail.geometry.parameters.height / 2)
          .toBeCloseTo(FREIGHTER_DIMENSIONS.deckY - 0.18);
      });
      expect(firstRung.position.z - build.climbZone.climbZ).toBeCloseTo(
        PLAYER_LAYOUT_RADIUS + firstRung.geometry.parameters.depth / 2 + 0.03,
      );

      const opening = build.openingBounds;
      expect(opening.maxX - opening.minX).toBeCloseTo(0.9);
      expect(opening.maxZ - opening.minZ).toBeCloseTo(0.9);
      expect(opening.minX).toBeCloseTo(-0.45);
      expect(opening.maxX).toBeCloseTo(0.45);
      expect(opening.minZ).toBeCloseTo(mast.position[2] - 0.99);
      expect(opening.maxZ).toBeCloseTo(mast.position[2] - 0.09);
      const floor = (name: string): Mesh<BoxGeometry> =>
        build.root.getObjectByName(`crows-nest:floor:${name}`) as Mesh<BoxGeometry>;
      const floors = ['forward', 'aft', 'port', 'starboard'].map(floor);
      expect(floors.every(Boolean)).toBe(true);
      expect(floor('forward').geometry.parameters.width).toBe(4);
      expect(floor('forward').position.z - floor('forward').geometry.parameters.depth / 2)
        .toBeCloseTo(opening.maxZ);
      expect(floor('aft').position.z + floor('aft').geometry.parameters.depth / 2)
        .toBeCloseTo(opening.minZ);
      expect(floor('port').position.x + floor('port').geometry.parameters.width / 2)
        .toBeCloseTo(opening.minX);
      expect(floor('starboard').position.x - floor('starboard').geometry.parameters.width / 2)
        .toBeCloseTo(opening.maxX);
      floors.forEach((mesh) => {
        const halfFloorWidth = mesh.geometry.parameters.width / 2;
        const halfFloorDepth = mesh.geometry.parameters.depth / 2;
        const overlapsX = mesh.position.x - halfFloorWidth < opening.maxX - 1e-9
          && mesh.position.x + halfFloorWidth > opening.minX + 1e-9;
        const overlapsZ = mesh.position.z - halfFloorDepth < opening.maxZ - 1e-9
          && mesh.position.z + halfFloorDepth > opening.minZ + 1e-9;
        expect(overlapsX && overlapsZ, mesh.name).toBe(false);
      });

      const guard = (name: string): Mesh<BoxGeometry> =>
        build.root.getObjectByName(`crows-nest:guard:${name}`) as Mesh<BoxGeometry>;
      const portTop = guard('port-top');
      const starboardTop = guard('starboard-top');
      expect(portTop.geometry.parameters.width).toBe(0.12);
      expect(portTop.geometry.parameters.height).toBe(0.14);
      expect(portTop.position.x).toBe(-1.94);
      expect(portTop.geometry.parameters.depth).toBe(4);
      expect(starboardTop.geometry.parameters.width).toBe(0.12);
      expect(starboardTop.position.x).toBe(1.94);

      const aftTop = guard('aft-top');
      expect(aftTop.geometry.parameters.width).toBe(4);
      expect(aftTop.position.x).toBe(0);
      expect(aftTop.position.z).toBe(mast.position[2] - 1.94);
      const guardPosts = build.root.children.filter(
        ({ name }) => name.startsWith('crows-nest:guard:') && name.includes('post'),
      );
      expect(guardPosts).toHaveLength(8);
      expect(build.root.getObjectByName('crows-nest:guard:port')).toBeUndefined();
      expect(build.root.getObjectByName('crows-nest:guard:aft')).toBeUndefined();
      expect(build.climbZone.topFloor).toEqual({
        minX: -1.88,
        maxX: 1.88,
        minZ: mast.position[2] - 1.88,
        maxZ: mast.position[2] + 1.88,
      });

      const floorSurfaceY = FREIGHTER_DIMENSIONS.deckY + 14.57;
      const portPost = guard('port-post-0');
      expect(portPost.geometry.parameters.height).toBe(1.05);
      expect(portPost.position.y - portPost.geometry.parameters.height / 2)
        .toBe(floorSurfaceY);
      expect(portTop.position.y + portTop.geometry.parameters.height / 2)
        .toBeCloseTo(floorSurfaceY + 1.05);
      expect(build.root.getObjectByName('crows-nest:bracket:1')).toBeUndefined();
      expect(build.root.getObjectByName('crows-nest:rope-collar:1')).toBeUndefined();
      const support = build.root.getObjectByName('crows-nest:support-beam') as Mesh<BoxGeometry>;
      expect(support.position.y + support.geometry.parameters.height / 2)
        .toBeCloseTo(floorSurfaceY - 0.14);

      const mastCollider = {
        minX: -mast.baseDiameter / 2,
        maxX: mast.baseDiameter / 2,
        minY: mast.position[1],
        maxY: mast.position[1] + mast.height,
        minZ: mast.position[2] - mast.baseDiameter / 2,
        maxZ: mast.position[2] + mast.baseDiameter / 2,
      };
      expect(build.introAnchors.ladderApproachPosition[0] - mastCollider.maxX)
        .toBeGreaterThan(PLAYER_LAYOUT_RADIUS);
      expect(build.introAnchors.ladderApproachPosition[2])
        .toBe(build.introAnchors.ladderTopPosition[2]);
      expect(build.introAnchors.ladderTopPosition[2]).toBeLessThan(mastCollider.minZ);
      const landing = {
        x: build.climbZone.topDismount[0],
        z: build.climbZone.topDismount[1],
      };
      expect(circleOverlapsCollisionFootprint(landing, PLAYER_LAYOUT_RADIUS, mastCollider))
        .toBe(false);
      expect(landing.x - mastCollider.maxX - PLAYER_LAYOUT_RADIUS).toBeCloseTo(0.02);
      const sideGuardCollider = {
        minX: starboardTop.position.x - starboardTop.geometry.parameters.width / 2,
        maxX: starboardTop.position.x + starboardTop.geometry.parameters.width / 2,
        minY: floorSurfaceY,
        maxY: floorSurfaceY + SHIP_LAYOUT.rigging.crowsNest.guardHeight,
        minZ: starboardTop.position.z - starboardTop.geometry.parameters.depth / 2,
        maxZ: starboardTop.position.z + starboardTop.geometry.parameters.depth / 2,
      };
      expect(circleOverlapsCollisionFootprint(landing, PLAYER_LAYOUT_RADIUS, sideGuardCollider))
        .toBe(false);
      expect(sideGuardCollider.minX - landing.x - PLAYER_LAYOUT_RADIUS).toBeGreaterThan(0.2);

      const landingSlat = floor('forward');
      expect(landing.x).toBeGreaterThanOrEqual(
        landingSlat.position.x - landingSlat.geometry.parameters.width / 2,
      );
      expect(landing.x).toBeLessThanOrEqual(
        landingSlat.position.x + landingSlat.geometry.parameters.width / 2,
      );
      expect(landing.z).toBeGreaterThanOrEqual(
        landingSlat.position.z - landingSlat.geometry.parameters.depth / 2,
      );
      expect(landing.z).toBeLessThanOrEqual(
        landingSlat.position.z + landingSlat.geometry.parameters.depth / 2,
      );
      [build.introAnchors.seatedPosition, build.introAnchors.standingPosition]
        .forEach(([x, , z]) => {
          const supported = build.root.children
            .filter(({ name }) => name.startsWith('crows-nest:floor:'))
            .some((object) => {
              const floor = object as Mesh<BoxGeometry>;
              return Math.abs(x - floor.position.x) <= floor.geometry.parameters.width / 2
                && Math.abs(z - floor.position.z) <= floor.geometry.parameters.depth / 2;
            });
          expect(supported).toBe(true);
          expect(circleOverlapsCollisionFootprint({ x, z }, PLAYER_LAYOUT_RADIUS, mastCollider))
            .toBe(false);
          [portTop, starboardTop, guard('forward-top')].forEach((mesh) => {
            const collider = {
              minX: mesh.position.x - mesh.geometry.parameters.width / 2,
              maxX: mesh.position.x + mesh.geometry.parameters.width / 2,
              minY: floorSurfaceY,
              maxY: floorSurfaceY + SHIP_LAYOUT.rigging.crowsNest.guardHeight,
              minZ: mesh.position.z - mesh.geometry.parameters.depth / 2,
              maxZ: mesh.position.z + mesh.geometry.parameters.depth / 2,
            };
            expect(circleOverlapsCollisionFootprint({ x, z }, PLAYER_LAYOUT_RADIUS, collider))
              .toBe(false);
          });
          const openingCollider = { ...opening, minY: floorSurfaceY, maxY: floorSurfaceY };
          expect(circleOverlapsCollisionFootprint({ x, z }, PLAYER_LAYOUT_RADIUS, openingCollider))
            .toBe(false);
        });
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('traverses both ways with the full player controller and real colliders', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    const zone = rigging.climbZones[0]!;
    const input = new TestInput();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(zone.bottomDismount[0], zone.bottomEyeY, zone.bottomDismount[1]),
      rigging.colliders,
      NEST_BOUNDS,
      () => undefined,
      noDynamicMovement,
      [],
      rigging.climbZones,
    );

    try {
      input.movement = { x: 0, z: -1 };
      for (let frame = 0; frame < 240 && controller.localPosition.y < zone.topEyeY; frame += 1) {
        controller.update(0.05, input.asControllerInput());
      }
      expect(controller.localPosition.toArray()).toEqual([
        zone.topDismount[0], zone.topEyeY, zone.topDismount[1],
      ]);

      controller.update(0.05, input.asControllerInput());
      controller.update(0.05, input.asControllerInput());
      expect(controller.localPosition.y).toBe(zone.topEyeY);
      expect(controller.localPosition.z).toBeGreaterThan(zone.topDismount[1] + 0.3);

      input.movement = { x: -1, z: 0 };
      for (let frame = 0; frame < 8; frame += 1) {
        controller.update(0.05, input.asControllerInput());
      }
      expect(controller.localPosition.x).toBeGreaterThan(1.4);
      expect(controller.localPosition.y).toBe(zone.topEyeY);

      input.movement = { x: 1, z: 0 };
      for (let frame = 0; frame < 8 && controller.localPosition.x > 0.8; frame += 1) {
        controller.update(0.05, input.asControllerInput());
      }
      expect(controller.localPosition.y).toBe(zone.topEyeY);

      input.movement = { x: 0, z: 1 };
      for (let frame = 0; frame < 240 && controller.localPosition.y > zone.bottomEyeY; frame += 1) {
        controller.update(0.05, input.asControllerInput());
      }
      expect(controller.localPosition.toArray()).toEqual([
        zone.bottomDismount[0], zone.bottomEyeY, zone.bottomDismount[1],
      ]);
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });
});
