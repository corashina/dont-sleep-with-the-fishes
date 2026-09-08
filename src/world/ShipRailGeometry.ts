import { CubicBezierCurve3, CurvePath, Vector3 } from 'three';
import { ShipDetailGeometry } from './ShipDetailGeometry';
import { toCollisionBox, toOrientedCollisionBox, type ShipGeometryBuildContext } from './ShipGeometryPrimitives';
import { FREIGHTER_DIMENSIONS, requiredShipZone, SHIP_BOW_DEPTH,
  SHIP_BOW_NOSE_CONTROL_WIDTH_SCALE, SHIP_BOW_SHOULDER_CONTROL_DEPTH_SCALE,
  type ShipLayoutSpec } from './ShipLayoutTypes';
import { SHIP_STERN_CHAMFER } from './shipLayoutData';

const COLLIDER_THICKNESS = 0.25;
const TOP_RADIUS = 0.055;
const POST_RADIUS = 0.04;
const END_SEGMENTS = 12;

export function addShipRails(context: ShipGeometryBuildContext, layout: ShipLayoutSpec): void {
  const { materials, shellColliders } = context;
  const details = new ShipDetailGeometry(context.geometries);
  const deckY = FREIGHTER_DIMENSIONS.deckY;
  const topY = deckY + layout.rail.height - TOP_RADIUS;
  const middleY = deckY + layout.rail.height * 0.48;
  const centerY = deckY + layout.rail.height / 2;
  const railX = layout.rail.innerFaceX + COLLIDER_THICKNESS / 2;
  const cargo = requiredShipZone(layout, 'cargoDeck').bounds;
  const minZ = cargo.minZ + SHIP_STERN_CHAMFER;
  const shoulderZ = cargo.maxZ - SHIP_BOW_DEPTH;
  const post = (x: number, z: number): void => {
    details.rod(materials.deckSteel, [x, deckY, z], [x, topY, z], POST_RADIUS);
    details.box(materials.darkMetal, [0.17, 0.035, 0.17], [x, deckY + 0.0175, z], 0, 0);
  };
  const span = (x1: number, z1: number, x2: number, z2: number): void => {
    details.rod(materials.deckSteel, [x1, topY, z1], [x2, topY, z2], TOP_RADIUS);
    details.rod(materials.deckSteel, [x1, middleY, z1], [x2, middleY, z2], 0.028);
  };
  const side = (x: number, startZ: number, endZ: number): void => {
    const length = endZ - startZ;
    span(x, startZ, x, endZ);
    const count = Math.max(2, Math.ceil(length / 2.4));
    for (let index = 0; index <= count; index += 1) {
      post(x, startZ + length * index / count);
    }
    shellColliders.push(toCollisionBox([x, centerY, (startZ + endZ) / 2],
      [COLLIDER_THICKNESS, layout.rail.height, length]));
  };
  const opening = layout.rail.starboardOpening;
  side(-railX, minZ, shoulderZ);
  side(railX, minZ, opening.centerZ - opening.width / 2);
  side(railX, opening.centerZ + opening.width / 2, shoulderZ);

  // Continuous bow tubes follow the same two Bezier curves as the deck outline.
  const tipZ = shoulderZ + SHIP_BOW_DEPTH + COLLIDER_THICKNESS / 2;
  const bowDepth = tipZ - shoulderZ;
  const bow = (y: number): CurvePath<Vector3> => {
    const path = new CurvePath<Vector3>();
    path.add(new CubicBezierCurve3(new Vector3(railX, y, shoulderZ),
      new Vector3(railX, y, shoulderZ + bowDepth * SHIP_BOW_SHOULDER_CONTROL_DEPTH_SCALE),
      new Vector3(railX * SHIP_BOW_NOSE_CONTROL_WIDTH_SCALE, y, tipZ), new Vector3(0, y, tipZ)));
    path.add(new CubicBezierCurve3(new Vector3(0, y, tipZ),
      new Vector3(-railX * SHIP_BOW_NOSE_CONTROL_WIDTH_SCALE, y, tipZ),
      new Vector3(-railX, y, shoulderZ + bowDepth * SHIP_BOW_SHOULDER_CONTROL_DEPTH_SCALE),
      new Vector3(-railX, y, shoulderZ)));
    return path;
  };
  const topBow = bow(topY);
  details.tube(materials.deckSteel, topBow, 48, TOP_RADIUS);
  details.tube(materials.deckSteel, bow(middleY), 48, 0.028);
  // Keep the existing twelve collision chords and their parameter spacing.
  const pointAt = (index: number): Vector3 => {
    const progress = index / END_SEGMENTS;
    return topBow.curves[progress <= 0.5 ? 0 : 1]!.getPoint(
      progress <= 0.5 ? progress * 2 : (progress - 0.5) * 2);
  };
  for (let index = 0; index < END_SEGMENTS; index += 1) {
    const start = pointAt(index);
    const end = pointAt(index + 1);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    shellColliders.push(toOrientedCollisionBox([(start.x + end.x) / 2, centerY, (start.z + end.z) / 2],
      [COLLIDER_THICKNESS, layout.rail.height, Math.hypot(dx, dz)], Math.atan2(dx, dz)));
    if (index > 0) post(start.x, start.z);
  }

  const rearHalfWidth = railX - SHIP_STERN_CHAMFER;
  span(-rearHalfWidth, cargo.minZ, rearHalfWidth, cargo.minZ);
  for (const sign of [-1, 1]) {
    const rearX = sign * rearHalfWidth;
    const sideX = sign * railX;
    const dx = sideX - rearX;
    span(rearX, cargo.minZ, sideX, minZ);
    shellColliders.push(toOrientedCollisionBox([(rearX + sideX) / 2, centerY,
      cargo.minZ + SHIP_STERN_CHAMFER / 2],
    [COLLIDER_THICKNESS, layout.rail.height, Math.hypot(dx, SHIP_STERN_CHAMFER)],
    Math.atan2(dx, SHIP_STERN_CHAMFER)));
    post(rearX, cargo.minZ);
  }
  const sternPosts = Math.ceil(rearHalfWidth * 2 / 2.4);
  for (let index = 1; index < sternPosts; index += 1) {
    post(-rearHalfWidth + rearHalfWidth * 2 * index / sternPosts, cargo.minZ);
  }
  shellColliders.push(toCollisionBox([0, centerY, cargo.minZ],
    [rearHalfWidth * 2, layout.rail.height, COLLIDER_THICKNESS]));
  details.finish(context.root, 'rail-deck');
}
