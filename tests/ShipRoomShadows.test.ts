import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BackSide,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  Raycaster,
} from 'three';
import { SUN_DIRECTION } from '../src/world/celestialLight';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  SHIP_ROOM_WALL_HEIGHT,
  SHIP_ROOM_WALL_THICKNESS,
} from '../src/world/ShipLayoutTypes';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { addShipRooms } from '../src/world/ShipRoomGeometry';

const rooms = SHIP_LAYOUT.zones.filter((zone) => zone.enclosed);
const wallTopY = FREIGHTER_DIMENSIONS.deckY + SHIP_ROOM_WALL_HEIGHT;
// Match Environment's normal bias, depth bias, and shadow camera range.
const normalBias = 0.03;
const depthBiasDistance = 0.0005 * (80 - 0.5);

function expectShadow(receiver: Vector3, toLight: Vector3, casters: Mesh[], label: string): void {
  const origin = receiver.clone().addScaledVector(toLight, 20);
  const ray = new Raycaster(origin, toLight.clone().negate(), 0, 20);
  const hit = ray.intersectObjects(casters, false)[0];
  expect(hit, label).toBeDefined();
  expect(20 - hit!.distance, label).toBeGreaterThan(depthBiasDistance);
}

describe('room seam shadows', () => {
  let materials: ReturnType<typeof createShipMaterials>;
  let root: Group;
  let geometries: Set<BufferGeometry>;
  let depthMaterials: MeshBasicMaterial[];
  let walls: Mesh[];

  beforeEach(() => {
    materials = createShipMaterials();
    root = new Group();
    geometries = new Set();
    depthMaterials = [];
    walls = [];
    addShipRooms({ root, geometries, materials, shellColliders: [] }, SHIP_LAYOUT);
    // Reproduce PCF shadow-map face selection without a WebGL context.
    const shadowSides = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };
    for (const material of [materials.paintedPanel, materials.paintedSteel]) {
      const depthMaterial = new MeshBasicMaterial({
        side: material.shadowSide ?? shadowSides[material.side],
      });
      depthMaterials.push(depthMaterial);
      root.traverse((object) => {
        if (!(object instanceof Mesh) || object.material !== material) return;
        if (material === materials.paintedPanel && object.castShadow) walls.push(object);
        object.material = depthMaterial;
      });
    }
    root.updateMatrixWorld(true);
  });

  afterEach(() => {
    depthMaterials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    materials.dispose();
  });

  it.each(rooms)('shadows both walls at every $id corner, including chamfers', (room) => {
    const points = room.polygon.map(([x, z]) => new Vector3(x, wallTopY - 0.4, z));
    points.forEach((corner, index) => {
      const previous = points[(index + points.length - 1) % points.length]!;
      const next = points[(index + 1) % points.length]!;
      const alongPrevious = corner.clone().sub(previous).normalize();
      const alongNext = next.clone().sub(corner).normalize();
      const previousNormal = new Vector3(-alongPrevious.z, 0, alongPrevious.x);
      const nextNormal = new Vector3(-alongNext.z, 0, alongNext.x);
      const innerCorner = corner.clone().addScaledVector(
        previousNormal.clone().add(nextNormal),
        SHIP_ROOM_WALL_THICKNESS / (1 + previousNormal.dot(nextNormal)),
      );
      // Test each wall five millimetres from the seam, with sunlight across the other wall.
      for (const [alongWall, normal, occluderNormal] of [
        [alongNext, nextNormal, previousNormal],
        [alongPrevious.clone().negate(), previousNormal, nextNormal],
      ] as const) {
        const receiver = innerCorner.clone().addScaledVector(alongWall, 0.005)
          .addScaledVector(normal, normalBias);
        const toLight = occluderNormal.clone().multiplyScalar(-0.7)
          .addScaledVector(normal, 0.42);
        toLight.y = SUN_DIRECTION[1];
        expectShadow(receiver, toLight.normalize(), walls, `${room.id} corner ${index}`);
      }
    });
  });

  it.each(rooms)('shadows the full wall-to-roof perimeter in $id', (room) => {
    const roofName = room.id === 'wheelhouse' ? 'wheelhouse-roof' : `${room.id}-roof`;
    const roof = root.getObjectByName(roofName) as Mesh;
    expect(roof.castShadow).toBe(true);
    const toLight = new Vector3(...SUN_DIRECTION).normalize();
    room.polygon.forEach(([x, z], index) => {
      const [nextX, nextZ] = room.polygon[(index + 1) % room.polygon.length]!;
      const start = new Vector3(x, wallTopY - 0.02, z);
      const edge = new Vector3(nextX - x, 0, nextZ - z);
      const inward = new Vector3(-edge.z, 0, edge.x).normalize();
      for (const fraction of [0.1, 0.5, 0.9]) {
        const receiver = start.clone().addScaledVector(edge, fraction)
          .addScaledVector(inward, SHIP_ROOM_WALL_THICKNESS + normalBias);
        expectShadow(receiver, toLight, [roof], `${room.id} roof edge ${index} at ${fraction}`);
      }
    });
  });
});
