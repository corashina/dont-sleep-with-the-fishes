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

  // Retain only the silhouette and the four visible service-panel fasteners.
  for (const x of [-2.55, 2.55]) {
    for (const y of [roof + 0.3, top - 0.3]) {
      d.rod(m.exposedMetal, [x, y, front + 0.04], [x, y, front + 0.1], 0.045);
    }
  }
  for (const x of [-2.9, 2.9]) {
    d.box(m.plainPaintedSteel, [0.12, engine.height, 0.16], [x, roof + engine.height / 2, front]);
  }
  d.box(m.plainPaintedSteel, [engine.width, 0.12, engine.depth + 0.08], [0, top, z], 0, 0.04);
  for (const outlet of outlets) {
    d.ring(m.exposedMetal, [outlet.x, outlet.y - 1.05, outlet.z], 0.585, 0.035, true);
  }
  d.finish(context.root, 'machinery-fittings');
}
