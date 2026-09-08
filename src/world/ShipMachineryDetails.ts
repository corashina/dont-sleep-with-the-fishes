import type { Vector3 } from 'three';
import { ShipDetailGeometry } from './ShipDetailGeometry';
import type { ShipGeometryBuildContext } from './ShipGeometryPrimitives';
import { SHIP_ROOF_ENGINE } from './shipLayoutData';
import { requiredShipZone, shipRoomRoofTopY, type ShipLayoutSpec } from './ShipLayoutTypes';

export function addShipMachineryDetails(
  context: ShipGeometryBuildContext,
  layout: ShipLayoutSpec,
  outlets: readonly Vector3[],
): void {
  const { materials: m } = context;
  const d = new ShipDetailGeometry(context.geometries);
  const room = requiredShipZone(layout, 'storageWorkroom');
  const roof = shipRoomRoofTopY(room.id);
  const engine = SHIP_ROOF_ENGINE;
  const z = engine.centerZ;
  const front = z + engine.depth / 2;
  const top = roof + engine.height;

  // Mounts and fasteners give the existing engine housing visible weight.
  for (const x of [-2.55, 2.55]) {
    for (const dz of [-1.5, 1.5]) {
      d.box(m.darkMetal, [0.65, 0.12, 0.6], [x, roof + 0.07, z + dz]);
      d.box(m.rubber, [0.48, 0.11, 0.43], [x, roof + 0.16, z + dz]);
      d.rod(m.exposedMetal, [x, roof + 0.15, z + dz], [x, roof + 0.29, z + dz], 0.065);
    }
    for (const y of [roof + 0.3, top - 0.3]) {
      d.rod(m.exposedMetal, [x, y, front + 0.04], [x, y, front + 0.1], 0.045);
    }
  }
  for (const x of [-2.9, 2.9]) {
    d.box(m.plainPaintedSteel, [0.12, engine.height, 0.16], [x, roof + engine.height / 2, front]);
  }
  d.box(m.plainPaintedSteel, [engine.width, 0.12, engine.depth + 0.08], [0, top, z], 0, 0.04);
  // Two service pipes with curved elbows, flange joints, and retaining straps.
  for (const x of [-2.7, 2.7]) {
    d.tube(m.darkMetal, [
      [x, top - 0.3, z - 1.45], [x, top + 0.25, z - 1.45],
      [x, top + 0.35, z - 1.1], [x, top + 0.35, z + 1.15],
      [x, top + 0.2, z + 1.45], [x, top - 0.25, z + 1.45],
    ], 0.085);
    for (const dz of [-1.45, 1.45]) {
      d.ring(m.exposedMetal, [x, top - 0.06, z + dz], 0.13, 0.035, true);
    }
    for (const dz of [-0.65, 0.65]) {
      d.box(m.exposedMetal, [0.3, 0.08, 0.12], [x, top + 0.45, z + dz]);
      for (const side of [-1, 1]) {
        d.rod(m.exposedMetal, [x + side * 0.12, top, z + dz],
          [x + side * 0.12, top + 0.43, z + dz], 0.025);
      }
    }
  }

  for (const outlet of outlets) {
    for (const y of [top + 0.36, outlet.y - 1.05]) {
      d.ring(m.exposedMetal, [outlet.x, y, outlet.z], 0.585, 0.045, true);
      d.box(m.exposedMetal, [0.2, 0.16, 0.11], [outlet.x, y, outlet.z + 0.61]);
      d.rod(m.darkMetal, [outlet.x, y, outlet.z + 0.66],
        [outlet.x, y, outlet.z + 0.72], 0.042);
    }
    d.ring(m.darkMetal, [outlet.x, outlet.y, outlet.z], 0.58, 0.065, true);
    for (const side of [-1, 1]) {
      d.rod(m.darkMetal, [outlet.x + side * 0.42, top + 0.75, outlet.z],
        [outlet.x + side * 0.85, top + 0.03, outlet.z], 0.045);
    }
  }
  d.finish(context.root, 'machinery-fittings');
}
