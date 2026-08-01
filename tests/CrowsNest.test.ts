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

const NEST_BOUNDS: PlayerNavigationBounds = {
  safe: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
  fall: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 },
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
      expect(build.climbZone.topEyeY).toBe(FREIGHTER_DIMENSIONS.deckY + 12.07);
      expect(build.climbZone.bottomDismount).toEqual([0, -1.3]);
      expect(build.climbZone.topDismount).toEqual([0.73, -0.02]);
      expect(build.introAnchors.seatedPosition).toEqual([
        0.69, FREIGHTER_DIMENSIONS.deckY + 11.52, 0.48,
      ]);
      expect(build.introAnchors.standingPosition).toEqual([
        0.73, FREIGHTER_DIMENSIONS.deckY + 12.07, 0.14,
      ]);
      expect(build.introAnchors.ladderApproachPosition).toEqual([
        0.73, FREIGHTER_DIMENSIONS.deckY + 12.07, -0.54,
      ]);
      expect(build.introAnchors.ladderTopPosition).toEqual([
        0, FREIGHTER_DIMENSIONS.deckY + 12.07, -0.54,
      ]);
      expect(build.introAnchors.exitPosition).toEqual([0, FREIGHTER_DIMENSIONS.deckY + 1.5, -1.3]);
      expect(build.root.getObjectByName('crows-nest-seat')).toBeDefined();
      expect(build.root.getObjectByName('mainmast-ladder:rung:0')).toBeDefined();

      const aftSlat = (index: number, side: 'port' | 'starboard'): Mesh<BoxGeometry> =>
        build.root.getObjectByName(`crows-nest:floor-slat:${index}:${side}`) as Mesh<BoxGeometry>;
      const outerPortEdges: number[] = [];
      [0, 1, 2, 3].forEach((index) => {
        const port = aftSlat(index, 'port');
        const starboard = aftSlat(index, 'starboard');
        const portInnerEdge = port.position.x + port.geometry.parameters.width / 2;
        const starboardInnerEdge = starboard.position.x - starboard.geometry.parameters.width / 2;
        outerPortEdges.push(port.position.x - port.geometry.parameters.width / 2);
        expect(portInnerEdge).toBeCloseTo(-0.45);
        expect(starboardInnerEdge).toBeCloseTo(0.45);
        expect(starboardInnerEdge - portInnerEdge).toBeCloseTo(0.9);
      });
      [-0.99, -1.12, -1.18, -1.2].forEach((edge, index) => {
        expect(outerPortEdges[index]).toBeCloseTo(edge);
      });

      const opening = build.openingBounds;
      expect(opening.maxX - opening.minX).toBeCloseTo(0.9);
      expect(opening.maxZ - opening.minZ).toBeCloseTo(0.9);
      expect(opening.minX).toBeCloseTo(-0.45);
      expect(opening.maxX).toBeCloseTo(0.45);
      expect(opening.minZ).toBeCloseTo(-0.99);
      expect(opening.maxZ).toBeCloseTo(-0.09);
      build.root.children
        .filter(({ name }) => name.startsWith('crows-nest:floor-slat:'))
        .forEach((object) => {
          const floor = object as Mesh<BoxGeometry>;
          const halfFloorWidth = floor.geometry.parameters.width / 2;
          const halfFloorDepth = floor.geometry.parameters.depth / 2;
          const overlapsX = floor.position.x - halfFloorWidth < opening.maxX - 1e-9
            && floor.position.x + halfFloorWidth > opening.minX + 1e-9;
          const overlapsZ = floor.position.z - halfFloorDepth < opening.maxZ - 1e-9
            && floor.position.z + halfFloorDepth > opening.minZ + 1e-9;
          expect(overlapsX && overlapsZ, floor.name).toBe(false);
        });

      const guard = (name: string): Mesh<BoxGeometry> =>
        build.root.getObjectByName(`crows-nest:guard:${name}`) as Mesh<BoxGeometry>;
      const portGuard = guard('port');
      const starboardGuard = guard('starboard');
      expect(portGuard.geometry.parameters.width).toBe(0.1);
      expect(portGuard.position.x).toBe(-1.15);
      expect(starboardGuard.geometry.parameters.width).toBe(0.1);
      expect(starboardGuard.position.x).toBe(1.15);

      const aftPort = guard('aft-port');
      const aftStarboard = guard('aft-starboard');
      expect(aftPort.geometry.parameters.width).toBe(0.75);
      expect(aftPort.position.x).toBe(-0.825);
      expect(aftStarboard.geometry.parameters.width).toBe(0.75);
      expect(aftStarboard.position.x).toBe(0.825);
      const aftPortInnerEdge = aftPort.position.x + aftPort.geometry.parameters.width / 2;
      const aftStarboardInnerEdge = aftStarboard.position.x
        - aftStarboard.geometry.parameters.width / 2;
      expect(aftPortInnerEdge).toBeCloseTo(-0.45);
      expect(aftStarboardInnerEdge).toBeCloseTo(0.45);
      expect(aftStarboardInnerEdge - aftPortInnerEdge).toBeCloseTo(0.9);
      expect(opening.minX).toBeCloseTo(aftPortInnerEdge);
      expect(opening.maxX).toBeCloseTo(aftStarboardInnerEdge);

      const floorSurfaceY = FREIGHTER_DIMENSIONS.deckY + 10.57;
      expect(portGuard.position.y - portGuard.geometry.parameters.height / 2)
        .toBe(floorSurfaceY);

      const mastCollider = {
        minX: -mast.baseDiameter / 2,
        maxX: mast.baseDiameter / 2,
        minY: mast.position[1],
        maxY: mast.position[1] + mast.height,
        minZ: -mast.baseDiameter / 2,
        maxZ: mast.baseDiameter / 2,
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
        minX: 1.1,
        maxX: 1.2,
        minY: floorSurfaceY,
        maxY: floorSurfaceY + SHIP_LAYOUT.rigging.crowsNest.guardHeight,
        minZ: -0.82,
        maxZ: 0.82,
      };
      expect(circleOverlapsCollisionFootprint(landing, PLAYER_LAYOUT_RADIUS, sideGuardCollider))
        .toBe(false);
      expect(sideGuardCollider.minX - landing.x - PLAYER_LAYOUT_RADIUS).toBeCloseTo(0.02);

      const landingSlat = build.root.getObjectByName(
        'crows-nest:floor-slat:3:forward',
      ) as Mesh<BoxGeometry>;
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
      const seat = build.root.getObjectByName('crows-nest-seat')!;
      expect(Math.hypot(
        build.introAnchors.seatedPosition[0] - seat.position.x,
        build.introAnchors.seatedPosition[2] - seat.position.z,
      )).toBeLessThan(0.2);
      [build.introAnchors.seatedPosition, build.introAnchors.standingPosition]
        .forEach(([x, , z]) => {
          const supported = build.root.children
            .filter(({ name }) => name.startsWith('crows-nest:floor-slat:'))
            .some((object) => {
              const floor = object as Mesh<BoxGeometry>;
              return Math.abs(x - floor.position.x) <= floor.geometry.parameters.width / 2
                && Math.abs(z - floor.position.z) <= floor.geometry.parameters.depth / 2;
            });
          expect(supported).toBe(true);
          expect(circleOverlapsCollisionFootprint({ x, z }, PLAYER_LAYOUT_RADIUS, mastCollider))
            .toBe(false);
          [portGuard, starboardGuard, guard('forward')].forEach((mesh) => {
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
      [],
      rigging.climbZones,
    );

    try {
      input.movement = { x: 0, z: -1 };
      for (let frame = 0; frame < 120 && controller.localPosition.y < zone.topEyeY; frame += 1) {
        controller.update(0.05, input.asControllerInput());
      }
      expect(controller.localPosition.toArray()).toEqual([
        zone.topDismount[0], zone.topEyeY, zone.topDismount[1],
      ]);

      controller.update(0.05, input.asControllerInput());
      controller.update(0.05, input.asControllerInput());
      expect(controller.localPosition.y).toBe(zone.topEyeY);
      expect(controller.localPosition.z).toBeGreaterThan(zone.topDismount[1] + 0.3);

      input.movement = { x: 0, z: 1 };
      for (let frame = 0; frame < 130 && controller.localPosition.y > zone.bottomEyeY; frame += 1) {
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
