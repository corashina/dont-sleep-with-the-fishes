import { Group, Mesh, Shape, ShapeGeometry, SpotLight } from 'three';
import { ShipDetailGeometry } from './ShipDetailGeometry';
import type { ShipGeometryBuildContext } from './ShipGeometryPrimitives';
import {
  FREIGHTER_DIMENSIONS, SHIP_ROOM_WALL_HEIGHT, shipRoomRoofTopY,
  type ShipLayoutSpec,
} from './ShipLayoutTypes';

export function addShipCabinDetails(context: ShipGeometryBuildContext, layout: ShipLayoutSpec): void {
  const { materials: m } = context;
  const details = new ShipDetailGeometry(context.geometries);
  const floor = FREIGHTER_DIMENSIONS.deckY;
  const ceiling = floor + SHIP_ROOM_WALL_HEIGHT;
  for (const zone of layout.zones.filter((zone) => zone.enclosed)) {
    const roof = shipRoomRoofTopY(zone.id);
    const ceilingShape = new Shape();
    zone.polygon.forEach(([x, z], index) => {
      if (index === 0) ceilingShape.moveTo(x, z);
      else ceilingShape.lineTo(x, z);
    });
    ceilingShape.closePath();
    const ceilingGeometry = new ShapeGeometry(ceilingShape);
    ceilingGeometry.rotateX(Math.PI / 2);
    context.geometries.add(ceilingGeometry);
    const lining = new Mesh(ceilingGeometry, m.paintedPanel);
    lining.name = `cabin-ceiling:${zone.id}`;
    lining.position.y = ceiling - 0.012;
    lining.receiveShadow = true;
    context.root.add(lining);
    // Follow the authored polygon, including the wheelhouse's chamfered bow.
    zone.polygon.forEach(([x, z], index) => {
      const [nextX, nextZ] = zone.polygon[(index + 1) % zone.polygon.length]!;
      const length = Math.hypot(nextX - x, nextZ - z);
      const angle = Math.atan2(-(nextZ - z), nextX - x);
      details.box(m.plainPaintedSteel, [length + 0.08, 0.18, 0.16],
        [(x + nextX) / 2, roof - 0.06, (z + nextZ) / 2], angle);
      details.box(m.darkMetal, [length, 0.055, 0.18],
        [(x + nextX) / 2, ceiling - 0.08, (z + nextZ) / 2], angle, 0.01);
      // Narrow corner straps sit on the existing wall boundary.
      details.box(m.plainPaintedSteel, [0.18, SHIP_ROOM_WALL_HEIGHT, 0.18],
        [x, floor + SHIP_ROOM_WALL_HEIGHT / 2, z]);
      for (const y of [floor + 0.22, ceiling - 0.25]) {
        details.box(m.exposedMetal, [0.2, 0.055, 0.2], [x, y, z], 0, 0.01);
      }
    });

    const x = (zone.bounds.minX + zone.bounds.maxX) / 2;
    const z = (zone.bounds.minZ + zone.bounds.maxZ) / 2 + 1.25;
    details.box(m.darkMetal, [0.72, 0.12, 0.36], [x, ceiling - 0.07, z]);
    details.box(m.lamp, [0.56, 0.08, 0.23], [x, ceiling - 0.16, z]);
    for (const offset of [-0.2, 0, 0.2]) {
      details.rod(m.darkMetal, [x + offset, ceiling - 0.215, z - 0.15],
        [x + offset, ceiling - 0.215, z + 0.15], 0.012);
    }
    // Aim the warm pool down from its housing without adding shadow maps.
    const light = new SpotLight(0xffd6a0, 12, 4.2, 0.9, 0.8, 2);
    light.name = `cabin-work-light:${zone.id}`;
    light.position.set(x, ceiling - 0.3, z);
    light.target.position.set(x, floor, z);
    context.root.add(light, light.target);
    details.rod(m.darkMetal, [x, ceiling - 0.035, z],
      [zone.bounds.minX + 0.2, ceiling - 0.035, z], 0.018);
  }

  for (const door of layout.doors) {
    const frame = new Group();
    frame.position.set(door.center[0], floor, door.center[1]);
    frame.rotation.y = door.orientation === 'side'
      ? (door.side === 'port' ? -Math.PI / 2 : Math.PI / 2) : Math.PI;
    frame.name = `door-hardware:${door.id}`;
    context.root.add(frame);
    const fittings = new ShipDetailGeometry(context.geometries);
    // Hinges and a grab handle sit beside the opening, outside the walking space.
    const jambX = door.width / 2 + 0.05;
    for (const y of [0.48, 1.9]) {
      fittings.box(m.exposedMetal, [0.18, 0.2, 0.06], [-jambX, y, 0.18]);
      fittings.rod(m.darkMetal, [-jambX, y - 0.13, 0.23], [-jambX, y + 0.13, 0.23], 0.035);
    }
    fittings.box(m.darkMetal, [0.15, 0.56, 0.045], [jambX + 0.11, 1.28, 0.18]);
    fittings.tube(m.exposedMetal, [
      [jambX + 0.11, 1.05, 0.2], [jambX + 0.11, 1.09, 0.3],
      [jambX + 0.11, 1.46, 0.3], [jambX + 0.11, 1.51, 0.2],
    ], 0.025);
    fittings.finish(frame, 'door-fittings');
  }
  details.finish(context.root, 'cabin-construction');
}
