import { Mesh, Shape, ShapeGeometry } from 'three';
import { addShipCabinTrim } from './ShipCabinTrim';
import type { ShipGeometryBuildContext } from './ShipGeometryPrimitives';
import {
  FREIGHTER_DIMENSIONS, SHIP_ROOM_WALL_HEIGHT,
  type ShipLayoutSpec,
} from './ShipLayoutTypes';

export function addShipCabinDetails(context: ShipGeometryBuildContext, layout: ShipLayoutSpec): void {
  const { materials: m } = context;
  const floor = FREIGHTER_DIMENSIONS.deckY;
  const ceiling = floor + SHIP_ROOM_WALL_HEIGHT;
  for (const zone of layout.zones.filter((zone) => zone.enclosed)) {
    addShipCabinTrim(context, zone);
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

  }
}
