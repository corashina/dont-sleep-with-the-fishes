import {
  Box3,
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  type MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createLifeboatRailGeometry, mapLifeboatWoodGrain } from './LifeboatGeometry';
import { mergeLifeboatFastenings } from './LifeboatFastenings';
import type { LifeboatAssets } from './LifeboatAssets';
import type { WaterExclusionLongitudinalProfile } from '../ocean/WaterExclusion';
import {
  createLifeboatMaterials,
  type LifeboatMaterials,
} from './LifeboatTextures';

export interface LifeboatBuild {
  readonly root: Group;
  readonly storageRoot: Group;
  readonly darkTimberMaterial: MeshStandardMaterial;
  readonly acceptanceBox: Box3;
  readonly interiorBounds: Box3;
  readonly waterExclusion: {
    readonly halfWidth: number;
    readonly halfLength: number;
    readonly taperStart: number;
    readonly minimumLocalY: number;
    readonly longitudinalProfile: WaterExclusionLongitudinalProfile;
  };
}

const HULL_STATIONS = [
  { z: -3.00, halfWidth: 0.34 },
  { z: -2.65, halfWidth: 1.05 },
  { z: -2.08, halfWidth: 1.48 },
  { z: -1.12, halfWidth: 1.63 },
  { z: 0.00, halfWidth: 1.63 },
  { z: 0.58, halfWidth: 1.60 },
  { z: 1.60, halfWidth: 1.28 },
  { z: 2.12, halfWidth: 0.72 },
  { z: 2.40, halfWidth: 0.34 },
] as const;

const FLOOR_EDGE_INSET = 0.06;
const FLOOR_HEIGHT = -0.38;
const FLOORBOARD_WIDTH = 0.205;
const FLOORBOARD_GAP = 0.055;
const FLOORBOARD_THICKNESS = 0.055;
export const LIFEBOAT_FLOOR_SURFACE_Y = FLOOR_HEIGHT + 0.0655;
export const LIFEBOAT_DISPLAY_SHELF_SURFACE_Y = 0.22;
export const LIFEBOAT_GUNWALE_SURFACE_Y = 0.472;
export const LIFEBOAT_STARBOARD_EDGE_SHELF_SURFACE_Y = 0.3275;
export const LIFEBOAT_FLOOR_RIB_DEPTH = 0.105;
export const LIFEBOAT_FLOOR_RIB_CENTERS_Z = Object.freeze([
  -2.18,
  -1.45,
  -0.68,
  0.32,
  1.12,
  1.70,
]);
const DISPLAY_BENCH_Z = -1.58;
export const LIFEBOAT_PLAYER_BENCH_Z = 0.18;
export const LIFEBOAT_VISIBLE_STERN_BENCH_Z = 0.88;

export function lifeboatHullHalfWidthAt(z: number): number | null {
  for (let index = 0; index < HULL_STATIONS.length - 1; index += 1) {
    const first = HULL_STATIONS[index]!;
    const second = HULL_STATIONS[index + 1]!;
    if (z < first.z || z > second.z) continue;
    const progress = (z - first.z) / (second.z - first.z);
    return first.halfWidth + (second.halfWidth - first.halfWidth) * progress;
  }
  return null;
}

interface FloorPoint {
  readonly x: number;
  readonly y: number;
}

function floorOutline(): FloorPoint[] {
  const starboard = HULL_STATIONS.map(({ halfWidth, z }) => ({
    x: halfWidth - FLOOR_EDGE_INSET,
    y: -z,
  }));
  const port = [...HULL_STATIONS].reverse().map(({ halfWidth, z }) => ({
    x: -halfWidth + FLOOR_EDGE_INSET,
    y: -z,
  }));
  return [...starboard, ...port];
}

function shapeFromPoints(points: readonly FloorPoint[]): Shape {
  const shape = new Shape();
  const [first, ...remaining] = points;
  if (!first) throw new Error('Lifeboat floor requires hull stations');
  shape.moveTo(first.x, first.y);
  remaining.forEach(({ x, y }) => shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

function floorShape(): Shape {
  return shapeFromPoints(floorOutline());
}

function clipFloorAtX(
  points: readonly FloorPoint[],
  boundary: number,
  keepGreater: boolean,
): FloorPoint[] {
  const clipped: FloorPoint[] = [];
  let previous = points.at(-1);
  if (!previous) return clipped;
  let previousInside = keepGreater
    ? previous.x >= boundary
    : previous.x <= boundary;

  for (const current of points) {
    const currentInside = keepGreater
      ? current.x >= boundary
      : current.x <= boundary;
    if (currentInside !== previousInside) {
      const progress = (boundary - previous.x) / (current.x - previous.x);
      clipped.push({
        x: boundary,
        y: previous.y + (current.y - previous.y) * progress,
      });
    }
    if (currentInside) clipped.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return clipped;
}

function floorboardShape(centerX: number): Shape {
  const halfWidth = FLOORBOARD_WIDTH / 2;
  const afterPortEdge = clipFloorAtX(
    floorOutline(),
    centerX - halfWidth,
    true,
  );
  return shapeFromPoints(clipFloorAtX(
    afterPortEdge,
    centerX + halfWidth,
    false,
  ));
}

function outlinePoints(height: number, inset = 0): Vector3[] {
  const starboard = HULL_STATIONS.map(
    ({ halfWidth, z }) => new Vector3(halfWidth - inset, height, z),
  );
  const port = [...HULL_STATIONS]
    .reverse()
    .map(({ halfWidth, z }) => new Vector3(-halfWidth + inset, height, z));
  return [...starboard, ...port];
}

function addHullPlanks(target: Group, materials: LifeboatMaterials): void {
  const hull = new Group();
  hull.name = 'lifeboat-hull-geometry';
  const plankGroup = new Group();
  plankGroup.name = 'lifeboat-hull-planks';
  for (let strake = 0; strake < 5; strake += 1) {
    const curve = new CatmullRomCurve3(
      outlinePoints(-0.32 + strake * 0.153, (4 - strake) * 0.009),
      true,
      'centripetal',
    );
    const plank = new Mesh(
      createLifeboatRailGeometry(curve, 0.22, 0.158, 0.018 + strake * 0.125),
      strake === 0 ? materials.darkTimber
        : strake === 4 ? materials.rescueTrim : materials.timber,
    );
    plank.name = `lifeboat-hull-strake-${strake}`;
    plankGroup.add(plank);
  }
  hull.add(plankGroup);
  target.add(hull);
}

function addFloor(target: Group, materials: LifeboatMaterials): void {
  const floorGeometry = new ShapeGeometry(floorShape(), 10);
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new Mesh(floorGeometry, materials.darkTimber);
  floor.name = 'survival-floor';
  floor.position.y = FLOOR_HEIGHT;
  target.add(floor);

  const floorboards = new Group();
  floorboards.name = 'lifeboat-floorboards';
  const boardStep = FLOORBOARD_WIDTH + FLOORBOARD_GAP;
  const xPositions = Array.from(
    { length: 13 },
    (_, index) => (index - 6) * boardStep,
  );
  xPositions.forEach((x, index) => {
    const geometry = new ExtrudeGeometry(floorboardShape(x), {
      depth: FLOORBOARD_THICKNESS - 0.012,
      bevelEnabled: true,
      bevelSize: 0.005,
      bevelThickness: 0.006,
      bevelSegments: 2,
    });
    geometry.rotateX(-Math.PI / 2);
    mapLifeboatWoodGrain(geometry, 'z', FLOORBOARD_WIDTH, 0.018 + (index % 7) * 0.125, x);
    const board = new Mesh(
      geometry,
      index % 3 === 0 ? materials.cutWood : materials.timber,
    );
    board.name = `lifeboat-floorboard-${index}`;
    board.position.y = FLOOR_HEIGHT + 0.0165;
    floorboards.add(board);
  });
  target.add(floorboards);
}

function addFramesAndBenches(target: Group, materials: LifeboatMaterials): void {
  const ribs = new Group();
  ribs.name = 'survival-ribs';
  const frameGeometry = new RoundedBoxGeometry(0.075, 0.68, 0.09, 1, 0.012);
  mapLifeboatWoodGrain(frameGeometry, 'y', 0.075, 0.143);
  for (const [index, z] of LIFEBOAT_FLOOR_RIB_CENTERS_Z.entries()) {
    const halfWidth = Math.max(0.48, (lifeboatHullHalfWidthAt(z) ?? 1.4) - 0.15);
    const rib = new Mesh(
      new RoundedBoxGeometry(halfWidth * 2, 0.085, LIFEBOAT_FLOOR_RIB_DEPTH, 1, 0.012),
      materials.darkTimber,
    );
    rib.name = `survival-rib-${index}`;
    mapLifeboatWoodGrain(rib.geometry, 'x', LIFEBOAT_FLOOR_RIB_DEPTH, 0.018);
    rib.position.set(0, FLOOR_HEIGHT + 0.075, z);
    ribs.add(rib);
    for (const sign of [-1, 1]) {
      const frame = new Mesh(frameGeometry, materials.darkTimber);
      frame.name = `lifeboat-side-frame-${index}-${sign}`;
      frame.position.set(sign * (halfWidth - 0.015), -0.025, z);
      frame.rotation.z = -sign * 0.07;
      ribs.add(frame);
      const fasteningGeometry = new CylinderGeometry(0.016, 0.016, 0.008, 8);
      fasteningGeometry.rotateZ(Math.PI / 2);
      for (const y of [-0.21, 0.22]) {
        const fastening = new Mesh(fasteningGeometry, materials.iron);
        fastening.position.set(sign * (halfWidth - 0.062), y, z);
        ribs.add(fastening);
      }
    }
  }
  target.add(ribs);

  const benches = new Group();
  benches.name = 'survival-benches';
  const supportGeometry = new RoundedBoxGeometry(0.13, 0.39, 0.34, 1, 0.012);
  mapLifeboatWoodGrain(supportGeometry, 'y', 0.13, 0.393);
  const createBench = (
    name: string,
    seatName: string,
    z: number,
  ): Group => {
    const halfWidth = (lifeboatHullHalfWidthAt(z) ?? 1.5) - 0.17;
    const bench = new Group();
    bench.name = name;
    const seatGeometry = new RoundedBoxGeometry(halfWidth * 2, 0.12, 0.48, 3, 0.014);
    mapLifeboatWoodGrain(seatGeometry, 'x', 0.48, 0.268);
    const seat = new Mesh(
      seatGeometry,
      materials.trimTimber,
    );
    seat.name = seatName;
    seat.position.y = 0.16;
    const frontRail = new Mesh(
      new BoxGeometry(halfWidth * 1.8, 0.12, 0.09),
      materials.trimTimber,
    );
    frontRail.position.set(0, 0.03, -0.18);
    mapLifeboatWoodGrain(frontRail.geometry, 'x', 0.09, 0.018);
    const backRail = frontRail.clone();
    backRail.position.z = 0.18;
    bench.add(seat, frontRail, backRail);
    const fasteningGeometry = new CylinderGeometry(0.018, 0.018, 0.004, 10);
    for (const sign of [-1, 1]) {
      const support = new Mesh(
        supportGeometry,
        materials.trimTimber,
      );
      support.position.set(sign * (halfWidth - 0.19), -0.095, 0);
      if (z === DISPLAY_BENCH_Z) {
        // Keep the front bench legs beneath its front rail, clear of the stored net.
        support.scale.z = 0.12 / 0.34;
        support.position.z = -0.15;
      }
      bench.add(support);
      for (const seatZ of [-0.15, 0.15]) {
        const fastening = new Mesh(fasteningGeometry, materials.iron);
        fastening.position.set(sign * (halfWidth - 0.19), 0.22, seatZ);
        bench.add(fastening);
      }
    }
    bench.position.z = z;
    return bench;
  };
  [LIFEBOAT_PLAYER_BENCH_Z, LIFEBOAT_VISIBLE_STERN_BENCH_Z].forEach((z, index) => {
    benches.add(createBench(
      `survival-bench-${index}`,
      `survival-bench-seat-${index}`,
      z,
    ));
  });
  benches.add(createBench(
    'lifeboat-display-bench',
    'lifeboat-display-bench-seat',
    DISPLAY_BENCH_Z,
  ));

  target.add(benches);
}

function addGunwalesAndKeel(target: Group, materials: LifeboatMaterials): void {
  const gunwales = new Group();
  gunwales.name = 'survival-gunwale';
  const outerCurve = new CatmullRomCurve3(outlinePoints(0.39), true, 'centripetal');
  const innerCurve = new CatmullRomCurve3(outlinePoints(0.315, 0.08), true, 'centripetal');
  const outer = new Mesh(
    createLifeboatRailGeometry(outerCurve, 0.19, 0.164, 0.393),
    materials.trimTimber,
  );
  outer.name = 'lifeboat-outer-gunwale';
  const inner = new Mesh(
    createLifeboatRailGeometry(innerCurve, 0.09, 0.09, 0.518),
    materials.trimTimber,
  );
  inner.name = 'lifeboat-faded-rescue-trim';
  gunwales.add(outer, inner);

  target.add(gunwales);

  const keel = new Mesh(new BoxGeometry(0.16, 0.16, 5.05), materials.darkTimber);
  keel.name = 'lifeboat-keel-strip';
  keel.position.set(0, -0.49, -0.3);
  target.add(keel);

  for (const [name, z] of [['bow', -3], ['stern', 2.4]] as const) {
    const capPlate = new Mesh(new RoundedBoxGeometry(0.58, 0.08, 0.30, 2, 0.015), materials.trimTimber);
    capPlate.name = `lifeboat-${name}-cap-plate`;
    capPlate.position.set(0, 0.38, z + (name === 'bow' ? 0.04 : -0.04));
    target.add(capPlate);
  }
}

function addWear(target: Group, materials: LifeboatMaterials): void {
  const wear = new Group();
  wear.name = 'lifeboat-wear-details';
  for (const sign of [-1, 1] as const) {
    for (const [index, z] of [-1.78, -0.34, 0.62].entries()) {
      const isSideShelf = index === 1;
      const scuff = new Mesh(
        new RoundedBoxGeometry(
          isSideShelf ? 0.315 : 0.245,
          0.035,
          isSideShelf ? 0.48 : 0.34,
          2,
          0.008,
        ),
        materials.cutWood,
      );
      scuff.name = `lifeboat-edge-wear-${sign}-${index}`;
      scuff.position.set(
        sign * (isSideShelf ? 1.40 : 1.535),
        0.31,
        z,
      );
      scuff.rotation.y = isSideShelf
        ? sign * -0.09
        : index % 2 === 0 ? 0.12 : -0.09;
      wear.add(scuff);
    }
  }
  const patch = new Mesh(new RoundedBoxGeometry(0.74, 0.06, 0.54, 2, 0.008), materials.cutWood);
  patch.name = 'damaged-plank-patch';
  patch.position.set(-1.18, -0.28, 0.02);
  patch.rotation.set(0.04, -0.16, 0.20);
  wear.add(patch);
  for (const x of [-1, 1]) {
    const lashing = new Mesh(new TorusGeometry(0.13, 0.018, 5, 12), materials.rope);
    lashing.name = `lifeboat-rope-lashing-${x < 0 ? 'port' : 'starboard'}`;
    lashing.position.set(x * 1.48, 0.33, 1.58);
    lashing.rotation.y = Math.PI / 2;
    wear.add(lashing);
  }
  target.add(wear);
}

function createPaddle(
  side: 'port' | 'starboard',
  materials: LifeboatMaterials,
): Group {
  const sign = side === 'port' ? -1 : 1;
  const paddle = new Group();
  paddle.name = `paddle-${side}`;
  paddle.position.set(sign * 1.88, 0.22, 0.05);
  paddle.rotation.y = sign * 0.06;
  paddle.rotation.z = Math.PI / 2;
  const shaft = new Mesh(
    new CylinderGeometry(0.035, 0.045, 2.95, 8),
    materials.cutWood,
  );
  shaft.name = `paddle-shaft-${side}`;
  mapLifeboatWoodGrain(shaft.geometry, 'y', 0.09, 0.518);
  shaft.rotation.x = Math.PI / 2;
  paddle.add(shaft);

  const bladeShape = new Shape();
  bladeShape.moveTo(-0.18, 0);
  bladeShape.quadraticCurveTo(-0.25, 0.34, -0.15, 0.66);
  bladeShape.lineTo(0.15, 0.66);
  bladeShape.quadraticCurveTo(0.25, 0.34, 0.18, 0);
  bladeShape.closePath();
  const blade = new Mesh(new ExtrudeGeometry(bladeShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.02,
  }), materials.cutWood);
  blade.name = `paddle-blade-${side}`;
  mapLifeboatWoodGrain(blade.geometry, 'y', 0.5, 0.643);
  blade.rotation.x = -Math.PI / 2;
  blade.position.z = -1.49;
  paddle.add(blade);
  for (const [index, z] of [-0.62, 0.62].entries()) {
    const lashing = new Mesh(new TorusGeometry(0.09, 0.018, 5, 10), materials.rope);
    lashing.name = `paddle-lashing-${side}-${index}`;
    lashing.position.z = z;
    lashing.rotation.y = Math.PI / 2;
    paddle.add(lashing);
  }
  return paddle;
}

export function createLifeboat(assets: LifeboatAssets): LifeboatBuild {
  const materials = createLifeboatMaterials(assets);
  const root = new Group();
  root.name = 'lifeboat';
  addHullPlanks(root, materials);
  addFloor(root, materials);
  addFramesAndBenches(root, materials);
  addGunwalesAndKeel(root, materials);
  addWear(root, materials);
  root.add(createPaddle('port', materials), createPaddle('starboard', materials));
  mergeLifeboatFastenings(root, materials.iron);

  const storageRoot = new Group();
  storageRoot.name = 'lifeboat-storage';
  root.add(storageRoot);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  return {
    root,
    storageRoot,
    darkTimberMaterial: materials.darkTimber,
    acceptanceBox: new Box3(
      new Vector3(-1.35, -0.30, -2.72),
      new Vector3(1.35, 1.00, 2.12),
    ),
    interiorBounds: new Box3(
      new Vector3(-1.45, -0.50, -2.96),
      new Vector3(1.45, 1.00, 2.36),
    ),
    waterExclusion: {
      halfWidth: 1.60,
      halfLength: 2.74,
      taperStart: 1.05,
      minimumLocalY: FLOOR_HEIGHT,
      longitudinalProfile: {
        minZ: -3.04,
        maxZ: 2.44,
        taperStartMinZ: -1.05,
        taperStartMaxZ: 0.45,
        lowerMinZ: -3.04,
        lowerMaxZ: 2.44,
        lowerTaperStartMinZ: -1.05,
        lowerTaperStartMaxZ: 0.45,
      },
    },
  };
}
