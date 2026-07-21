import {
  Box3,
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Texture,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { createLifeboatTextures } from './LifeboatTextures';

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
  readonly textures: readonly Texture[];
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

const FLOOR_EDGE_INSET = 0.06;
const FLOOR_HEIGHT = -0.38;

function materialSet(textures: ReturnType<typeof createLifeboatTextures>) {
  return {
    hull: new MeshStandardMaterial({
      color: 0xffffff,
      map: textures.paintColor,
      roughnessMap: textures.paintRoughness,
      roughness: 0.82,
      metalness: 0.02,
      flatShading: true,
    }),
    wood: new MeshStandardMaterial({
      color: 0xffffff,
      map: textures.woodColor,
      roughnessMap: textures.woodRoughness,
      roughness: 0.90,
      flatShading: true,
    }),
    rope: new MeshStandardMaterial({
      color: 0xffffff,
      map: textures.ropeColor,
      roughness: 1,
      flatShading: true,
    }),
    metal: new MeshStandardMaterial({
      color: 0x8a8170,
      roughnessMap: textures.metalRoughness,
      roughness: 0.78,
      metalness: 0.18,
      flatShading: true,
    }),
    seam: new MeshStandardMaterial({ color: 0x302e2a, roughness: 0.96, flatShading: true }),
  };
}

function addHullSegments(target: Group, material: MeshStandardMaterial): void {
  for (const sign of [-1, 1] as const) {
    for (let index = 0; index < HULL_STATIONS.length - 1; index += 1) {
      const first = HULL_STATIONS[index]!;
      const second = HULL_STATIONS[index + 1]!;
      const x1 = sign * first.halfWidth;
      const x2 = sign * second.halfWidth;
      const dx = x2 - x1;
      const dz = second.z - first.z;
      const segment = new Mesh(
        new BoxGeometry(0.22, 0.74, Math.hypot(dx, dz) + 0.04),
        material,
      );
      segment.name = `hull-segment-${sign < 0 ? 'port' : 'starboard'}-${index}`;
      segment.position.set((x1 + x2) / 2, -0.02, (first.z + second.z) / 2);
      segment.rotation.set(0, Math.atan2(dx, dz), sign * 0.10);
      target.add(segment);
    }
  }
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
  if (!first) throw new Error('Survival floor requires hull stations');
  shape.moveTo(first.x, first.y);
  remaining.forEach(({ x, y }) => shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

function createPaddle(
  side: 'port' | 'starboard',
  wood: MeshStandardMaterial,
  metal: MeshStandardMaterial,
  rope: MeshStandardMaterial,
): Group {
  const sign = side === 'port' ? -1 : 1;
  const paddle = new Group();
  paddle.name = `paddle-${side}`;
  paddle.position.set(sign * 1.88, 0.22, 0.05);
  paddle.rotation.y = sign * 0.06;

  const shaft = new Mesh(new CylinderGeometry(0.035, 0.045, 2.95, 8), wood);
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
  }), wood);
  blade.name = `paddle-blade-${side}`;
  blade.rotation.x = -Math.PI / 2;
  blade.position.z = -1.49;
  paddle.add(blade);

  for (const z of [-0.62, 0.62]) {
    const lashing = new Mesh(new TorusGeometry(0.09, 0.018, 5, 10), rope);
    lashing.name = `paddle-lashing-${side}-${z < 0 ? 'forward' : 'aft'}`;
    lashing.position.z = z;
    lashing.rotation.y = Math.PI / 2;
    paddle.add(lashing);
  }
  const collar = new Mesh(new CylinderGeometry(0.055, 0.055, 0.10, 8), metal);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 1.36;
  paddle.add(collar);
  return paddle;
}

function outlinePoints(height: number): Vector3[] {
  const starboard = HULL_STATIONS.map(({ halfWidth, z }) => new Vector3(halfWidth, height, z));
  const port = [...HULL_STATIONS]
    .reverse()
    .map(({ halfWidth, z }) => new Vector3(-halfWidth, height, z));
  return [...starboard, ...port];
}

function createRepairTools(wood: MeshStandardMaterial, metal: MeshStandardMaterial): Group {
  const tools = new Group();
  tools.name = 'hull-repair-tools';
  tools.position.set(-0.72, -0.31, 0.82);

  const plank = new Mesh(new BoxGeometry(0.68, 0.055, 0.18), wood);
  plank.name = 'repair-tool-plank';
  plank.rotation.set(0.06, -0.22, -0.18);
  tools.add(plank);

  const hammer = new Group();
  hammer.name = 'repair-tool-hammer';
  const handle = new Mesh(new CylinderGeometry(0.028, 0.035, 0.44, 8), wood);
  handle.rotation.z = Math.PI / 2;
  const head = new Mesh(new BoxGeometry(0.18, 0.08, 0.09), metal);
  head.position.x = 0.22;
  hammer.add(handle, head);
  hammer.position.set(0.03, 0.07, -0.10);
  hammer.rotation.set(0.10, 0.28, 0.20);
  tools.add(hammer);
  return tools;
}

export function createLifeboat(): LifeboatBuild {
  const textures = createLifeboatTextures();
  const materials = materialSet(textures);
  const root = new Group();
  root.name = 'lifeboat';

  const hull = new Group();
  hull.name = 'lifeboat-hull-geometry';
  addHullSegments(hull, materials.hull);
  for (const [name, z] of [['bow', -3.00], ['stern', 3.00]] as const) {
    const cap = new Mesh(new CylinderGeometry(0.43, 0.50, 0.74, 8), materials.hull);
    cap.name = `hull-${name}-rounded-cap`;
    cap.position.set(0, -0.02, z);
    cap.scale.set(1.0, 1.0, 0.54);
    hull.add(cap);
  }
  root.add(hull);

  const floorGeometry = new ShapeGeometry(floorShape(), 10);
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new Mesh(floorGeometry, materials.wood);
  floor.name = 'survival-floor';
  floor.position.y = FLOOR_HEIGHT;
  root.add(floor);

  const gunwaleCurve = new CatmullRomCurve3(outlinePoints(0.39), true, 'centripetal');
  const gunwale = new Mesh(
    new TubeGeometry(gunwaleCurve, 64, 0.075, 6, true),
    materials.hull,
  );
  gunwale.name = 'survival-gunwale';
  root.add(gunwale);

  const ribs = new Group();
  ribs.name = 'survival-ribs';
  for (const z of [-1.62, -0.32, 0.98]) {
    const rib = new Mesh(new BoxGeometry(2.62, 0.07, 0.10), materials.wood);
    rib.name = `survival-rib-${z}`;
    rib.position.set(0, -0.39, z);
    ribs.add(rib);
  }
  root.add(ribs);

  const fittings = new Group();
  fittings.name = 'survival-fittings';
  for (const sign of [-1, 1] as const) {
    const seam = new Mesh(new BoxGeometry(0.05, 0.05, 4.65), materials.seam);
    seam.name = `inner-seam-${sign < 0 ? 'port' : 'starboard'}`;
    seam.position.set(sign * 1.49, 0.10, 0.10);
    fittings.add(seam);
    for (const z of [-2.10, -1.25, -0.40, 0.45, 1.30]) {
      const fastener = new Mesh(new CylinderGeometry(0.035, 0.035, 0.025, 6), materials.metal);
      fastener.name = `fastener-${sign < 0 ? 'port' : 'starboard'}-${z}`;
      fastener.position.set(sign * 1.52, 0.18, z);
      fastener.rotation.z = Math.PI / 2;
      fittings.add(fastener);
    }
  }
  root.add(fittings);

  const patch = new Mesh(new BoxGeometry(0.74, 0.06, 0.54), materials.wood);
  patch.name = 'damaged-plank-patch';
  patch.position.set(-1.18, -0.28, 0.62);
  patch.rotation.set(0.04, -0.16, 0.20);
  root.add(patch);
  root.add(createRepairTools(materials.wood, materials.metal));

  for (const sign of [-1, 1] as const) {
    const mount = new Mesh(new TorusGeometry(0.13, 0.035, 6, 12, Math.PI), materials.metal);
    mount.name = sign < 0 ? 'oar-mount-port' : 'oar-mount-starboard';
    mount.position.set(sign * 1.54, 0.40, -0.42);
    mount.rotation.set(Math.PI / 2, 0, sign * Math.PI / 2);
    root.add(mount);
  }

  root.add(
    createPaddle('port', materials.wood, materials.metal, materials.rope),
    createPaddle('starboard', materials.wood, materials.metal, materials.rope),
  );

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
    textures: textures.all,
  };
}
