import { ExtrudeGeometry, Mesh, Path, Shape, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ShipGeometryBuildContext } from './ShipGeometryPrimitives';
import {
  FREIGHTER_DIMENSIONS, SHIP_ROOM_WALL_HEIGHT, SHIP_WHEELHOUSE_ROOF_OVERHANG,
  shipRoomRoofTopY, type ShipZoneSpec,
} from './ShipLayoutTypes';

const TRIM_PROJECTION = 0.025;

/** Offset the convex room outline with equal-width, mitered corners. */
function offsetOutline(polygon: ShipZoneSpec['polygon'], distance: number): Vector2[] {
  return polygon.map(([x, z], index) => {
    const [px, pz] = polygon[(index + polygon.length - 1) % polygon.length]!;
    const [nx, nz] = polygon[(index + 1) % polygon.length]!;
    const previousNormal = new Vector2(z - pz, px - x).normalize();
    const nextNormal = new Vector2(nz - z, x - nx).normalize();
    const scale = distance / (1 + previousNormal.dot(nextNormal));
    return previousNormal.add(nextNormal).multiplyScalar(scale).add(new Vector2(x, z));
  });
}

function cornerShape(polygon: ShipZoneSpec['polygon'], index: number): Shape {
  const point = new Vector2(...polygon[index]!);
  const previous = new Vector2(...polygon[(index + polygon.length - 1) % polygon.length]!);
  const next = new Vector2(...polygon[(index + 1) % polygon.length]!);
  const incoming = point.clone().sub(previous).normalize();
  const outgoing = next.sub(point).normalize();
  const start = point.clone().addScaledVector(incoming, -0.18);
  const end = point.clone().addScaledVector(outgoing, 0.18);
  const previousNormal = new Vector2(incoming.y, -incoming.x);
  const nextNormal = new Vector2(outgoing.y, -outgoing.x);
  return new Shape([
    start.clone().addScaledVector(previousNormal, TRIM_PROJECTION),
    offsetOutline(polygon, TRIM_PROJECTION)[index]!,
    end.clone().addScaledVector(nextNormal, TRIM_PROJECTION),
    end.clone().addScaledVector(nextNormal, -0.04),
    offsetOutline(polygon, -0.04)[index]!,
    start.clone().addScaledVector(previousNormal, -0.04),
  ]);
}

export function addShipCabinTrim(context: ShipGeometryBuildContext, zone: ShipZoneSpec): void {
  const floor = FREIGHTER_DIMENSIONS.deckY;
  const ceiling = floor + SHIP_ROOM_WALL_HEIGHT;
  const roof = shipRoomRoofTopY(zone.id);
  const overhang = zone.id === 'wheelhouse' ? SHIP_WHEELHOUSE_ROOF_OVERHANG : 0;
  const shape = new Shape(offsetOutline(zone.polygon, overhang + TRIM_PROJECTION));
  shape.holes.push(new Path(offsetOutline(zone.polygon, -0.04).reverse()));
  const geometry = new ExtrudeGeometry(shape, {
    depth: roof - ceiling + 0.11, bevelEnabled: false, steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  context.geometries.add(geometry);
  const fascia = new Mesh(geometry, context.materials.plainPaintedSteel);
  fascia.name = `cabin-roof-trim:${zone.id}`;
  fascia.position.y = roof + 0.03;
  // The roof already casts the structural shadow; trim must not add a dark stripe.
  fascia.castShadow = false;
  fascia.receiveShadow = true;
  context.root.add(fascia);

  const parts = zone.polygon.map((_, index) => {
    const part = new ExtrudeGeometry(cornerShape(zone.polygon, index), {
      depth: SHIP_ROOM_WALL_HEIGHT + 0.04, bevelEnabled: false, steps: 1,
    });
    part.rotateX(Math.PI / 2);
    part.translate(0, ceiling + 0.04, 0);
    return part;
  });
  const cornerGeometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!cornerGeometry) throw new Error(`Cannot join ${zone.id} corner trim`);
  context.geometries.add(cornerGeometry);
  const corners = new Mesh(cornerGeometry, context.materials.plainPaintedSteel);
  corners.name = `cabin-corner-trim:${zone.id}`;
  corners.castShadow = true;
  corners.receiveShadow = true;
  context.root.add(corners);
}
