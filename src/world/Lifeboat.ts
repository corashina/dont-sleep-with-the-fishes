import {
  Box3,
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { LifeboatAssets } from './LifeboatAssets';
import {
  createLifeboatMaterials,
  type LifeboatMaterials,
} from './LifeboatTextures';

export interface LifeboatBuild {
  readonly root: Group;
  readonly storageRoot: Group;
  readonly acceptanceBox: Box3;
  readonly interiorBounds: Box3;
  readonly waterExclusion: {
    readonly halfWidth: number;
    readonly halfLength: number;
    readonly taperStart: number;
    readonly minimumLocalY: number;
  };
}

const HULL_STATIONS = [
  { z: -3.00, halfWidth: 0.34 },
  { z: -2.65, halfWidth: 1.05 },
  { z: -2.08, halfWidth: 1.48 },
  { z: -1.12, halfWidth: 1.63 },
  { z: 0.00, halfWidth: 1.63 },
  { z: 1.18, halfWidth: 1.60 },
  { z: 2.20, halfWidth: 1.28 },
  { z: 2.72, halfWidth: 0.72 },
  { z: 3.00, halfWidth: 0.34 },
] as const;

const FLOOR_EDGE_INSET = 0.06;
const FLOOR_HEIGHT = -0.38;

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

function floorShape(): Shape {
  const shape = new Shape();
  const starboard = HULL_STATIONS.map(({ halfWidth, z }) => ({
    x: halfWidth - FLOOR_EDGE_INSET,
    y: -z,
  }));
  const port = [...HULL_STATIONS].reverse().map(({ halfWidth, z }) => ({
    x: -halfWidth + FLOOR_EDGE_INSET,
    y: -z,
  }));
  const [first, ...remaining] = [...starboard, ...port];
  if (!first) throw new Error('Lifeboat floor requires hull stations');
  shape.moveTo(first.x, first.y);
  remaining.forEach(({ x, y }) => shape.lineTo(x, y));
  shape.closePath();
  return shape;
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
  for (const sign of [-1, 1] as const) {
    const side = sign < 0 ? 'port' : 'starboard';
    for (let index = 0; index < HULL_STATIONS.length - 1; index += 1) {
      const first = HULL_STATIONS[index]!;
      const second = HULL_STATIONS[index + 1]!;
      const x1 = sign * first.halfWidth;
      const x2 = sign * second.halfWidth;
      const dx = x2 - x1;
      const dz = second.z - first.z;
      const length = Math.hypot(dx, dz) + 0.04;
      const segment = new Mesh(
        new BoxGeometry(0.22, 0.74, length),
        materials.darkTimber,
      );
      segment.name = `hull-segment-${side}-${index}`;
      segment.position.set((x1 + x2) / 2, -0.02, (first.z + second.z) / 2);
      segment.rotation.set(0, Math.atan2(dx, dz), sign * 0.10);
      plankGroup.add(segment);

      for (let strake = 0; strake < 4; strake += 1) {
        const overlay = new Mesh(
          new BoxGeometry(0.235, 0.145, length - 0.025),
          strake === 3 ? materials.rescueTrim : materials.timber,
        );
        overlay.name = `hull-strake-${side}-${index}-${strake}`;
        overlay.position.set(
          (x1 + x2) / 2 - sign * 0.012,
          -0.285 + strake * 0.19,
          (first.z + second.z) / 2,
        );
        overlay.rotation.set(0, Math.atan2(dx, dz), sign * 0.10);
        plankGroup.add(overlay);
      }
    }
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
  const xPositions = [-1.04, -0.78, -0.52, -0.26, 0, 0.26, 0.52, 0.78, 1.04];
  xPositions.forEach((x, index) => {
    const outer = Math.abs(x) > 0.9;
    const board = new Mesh(
      new BoxGeometry(0.205, 0.055, outer ? 3.72 : Math.abs(x) > 0.65 ? 4.72 : 5.25),
      index % 3 === 0 ? materials.cutWood : materials.timber,
    );
    board.name = `lifeboat-floorboard-${index}`;
    board.position.set(x, FLOOR_HEIGHT + 0.038, 0.08);
    floorboards.add(board);
  });
  target.add(floorboards);
}

function addFramesAndBenches(target: Group, materials: LifeboatMaterials): void {
  const ribs = new Group();
  ribs.name = 'survival-ribs';
  for (const [index, z] of [-2.18, -1.45, -0.68, 0.12, 0.92, 1.72, 2.30].entries()) {
    const halfWidth = Math.max(0.48, (lifeboatHullHalfWidthAt(z) ?? 1.4) - 0.15);
    const rib = new Mesh(
      new BoxGeometry(halfWidth * 2, 0.085, 0.105),
      materials.cutWood,
    );
    rib.name = `survival-rib-${index}`;
    rib.position.set(0, FLOOR_HEIGHT + 0.075, z);
    ribs.add(rib);
  }
  target.add(ribs);

  const benches = new Group();
  benches.name = 'survival-benches';
  [0.78, 1.48, 2.14].forEach((z, index) => {
    const halfWidth = (lifeboatHullHalfWidthAt(z) ?? 1.5) - 0.17;
    const bench = new Group();
    bench.name = `survival-bench-${index}`;
    const seat = new Mesh(
      new BoxGeometry(halfWidth * 2, 0.12, 0.48),
      materials.timber,
    );
    seat.name = `survival-bench-seat-${index}`;
    seat.position.y = 0.16;
    const frontRail = new Mesh(
      new BoxGeometry(halfWidth * 1.8, 0.12, 0.09),
      materials.darkTimber,
    );
    frontRail.position.set(0, 0.03, -0.18);
    const backRail = frontRail.clone();
    backRail.position.z = 0.18;
    bench.add(seat, frontRail, backRail);
    bench.position.z = z;
    benches.add(bench);
  });
  target.add(benches);
}

function addGunwalesAndKeel(target: Group, materials: LifeboatMaterials): void {
  const gunwales = new Group();
  gunwales.name = 'survival-gunwale';
  const outerCurve = new CatmullRomCurve3(outlinePoints(0.39), true, 'centripetal');
  const innerCurve = new CatmullRomCurve3(outlinePoints(0.315, 0.08), true, 'centripetal');
  const outer = new Mesh(
    new TubeGeometry(outerCurve, 80, 0.082, 7, true),
    materials.darkTimber,
  );
  outer.name = 'lifeboat-outer-gunwale';
  const inner = new Mesh(
    new TubeGeometry(innerCurve, 80, 0.045, 6, true),
    materials.rescueTrim,
  );
  inner.name = 'lifeboat-faded-rescue-trim';
  gunwales.add(outer, inner);
  target.add(gunwales);

  const keel = new Mesh(new BoxGeometry(0.16, 0.16, 5.65), materials.darkTimber);
  keel.name = 'lifeboat-keel-strip';
  keel.position.set(0, -0.49, 0);
  target.add(keel);

  for (const [name, z] of [['bow', -3], ['stern', 3]] as const) {
    const cap = new Mesh(
      new CylinderGeometry(0.43, 0.50, 0.74, 8),
      materials.darkTimber,
    );
    cap.name = `hull-${name}-rounded-cap`;
    cap.position.set(0, -0.02, z);
    cap.scale.set(1, 1, 0.54);
    target.add(cap);
    const capPlate = new Mesh(new BoxGeometry(0.58, 0.08, 0.30), materials.cutWood);
    capPlate.name = `lifeboat-${name}-cap-plate`;
    capPlate.position.set(0, 0.38, z + (name === 'bow' ? 0.04 : -0.04));
    target.add(capPlate);
  }
}

function createCleat(
  name: string,
  x: number,
  z: number,
  materials: LifeboatMaterials,
): Group {
  const cleat = new Group();
  cleat.name = name;
  cleat.position.set(x, 0.46, z);
  const base = new Mesh(new BoxGeometry(0.22, 0.05, 0.08), materials.metal);
  const horn = new Mesh(new BoxGeometry(0.38, 0.07, 0.07), materials.metal);
  horn.position.y = 0.07;
  cleat.add(base, horn);
  return cleat;
}

function addFittings(target: Group, materials: LifeboatMaterials): void {
  const fittings = new Group();
  fittings.name = 'survival-fittings';
  for (const sign of [-1, 1] as const) {
    const side = sign < 0 ? 'port' : 'starboard';
    const seam = new Mesh(new BoxGeometry(0.045, 0.045, 4.75), materials.seam);
    seam.name = `inner-seam-${side}`;
    seam.position.set(sign * 1.47, 0.08, 0.08);
    fittings.add(seam);
    for (const [index, z] of [-2.12, -1.48, -0.82, -0.16, 0.50, 1.16, 1.82, 2.35].entries()) {
      const fastener = new Mesh(
        new CylinderGeometry(0.032, 0.032, 0.026, 7),
        materials.metal,
      );
      fastener.name = `fastener-${side}-${index}`;
      fastener.position.set(sign * 1.51, 0.17, z);
      fastener.rotation.z = Math.PI / 2;
      fittings.add(fastener);
    }
    for (const [index, z] of [-1.92, 1.66].entries()) {
      fittings.add(createCleat(
        `lifeboat-cleat-${side}-${index}`,
        sign * 1.47,
        z,
        materials,
      ));
    }
    const oarMount = new Mesh(
      new TorusGeometry(0.13, 0.035, 6, 12, Math.PI),
      materials.metal,
    );
    oarMount.name = `oar-mount-${side}`;
    oarMount.position.set(sign * 1.54, 0.40, -0.42);
    oarMount.rotation.set(Math.PI / 2, 0, sign * Math.PI / 2);
    fittings.add(oarMount);
  }
  target.add(fittings);
}

function addWear(target: Group, materials: LifeboatMaterials): void {
  const wear = new Group();
  wear.name = 'lifeboat-wear-details';
  for (const sign of [-1, 1] as const) {
    const strip = new Mesh(new BoxGeometry(0.235, 0.08, 4.65), materials.waterline);
    strip.name = `lifeboat-waterline-${sign < 0 ? 'port' : 'starboard'}`;
    strip.position.set(sign * 1.52, -0.27, 0.08);
    wear.add(strip);
    for (const [index, z] of [-1.78, -0.34, 1.22].entries()) {
      const scuff = new Mesh(new BoxGeometry(0.245, 0.035, 0.34), materials.cutWood);
      scuff.name = `lifeboat-edge-wear-${sign}-${index}`;
      scuff.position.set(sign * 1.535, 0.31, z);
      scuff.rotation.y = index % 2 === 0 ? 0.12 : -0.09;
      wear.add(scuff);
    }
  }
  const patch = new Mesh(new BoxGeometry(0.74, 0.06, 0.54), materials.cutWood);
  patch.name = 'damaged-plank-patch';
  patch.position.set(-1.18, -0.28, 0.62);
  patch.rotation.set(0.04, -0.16, 0.20);
  wear.add(patch);
  for (const x of [-1, 1]) {
    const lashing = new Mesh(new TorusGeometry(0.13, 0.018, 5, 12), materials.rope);
    lashing.name = `lifeboat-rope-lashing-${x < 0 ? 'port' : 'starboard'}`;
    lashing.position.set(x * 1.48, 0.33, 2.18);
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
  const shaft = new Mesh(
    new CylinderGeometry(0.035, 0.045, 2.95, 8),
    materials.cutWood,
  );
  shaft.name = `paddle-shaft-${side}`;
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
  addFittings(root, materials);
  addWear(root, materials);
  root.add(createPaddle('port', materials), createPaddle('starboard', materials));

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
    acceptanceBox: new Box3(
      new Vector3(-1.35, -0.30, -2.72),
      new Vector3(1.35, 1.00, 2.72),
    ),
    interiorBounds: new Box3(
      new Vector3(-1.45, -0.50, -2.96),
      new Vector3(1.45, 1.00, 2.96),
    ),
    waterExclusion: {
      halfWidth: 1.60,
      halfLength: 3.04,
      taperStart: 1.05,
      minimumLocalY: FLOOR_HEIGHT,
    },
  };
}
