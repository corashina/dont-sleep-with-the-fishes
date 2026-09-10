import {
  BufferGeometry, CatmullRomCurve3, CylinderGeometry, DataTexture, ExtrudeGeometry, Group,
  LatheGeometry, LinearFilter, Mesh, MeshStandardMaterial, RepeatWrapping, Shape, SphereGeometry, TorusGeometry,
  TubeGeometry, Vector2, Vector3,
} from 'three';

export type SimpleJunkId =
  | 'trafficCone' | 'clothesHanger' | 'toiletPlunger'
  | 'golfBall' | 'bowlingPin' | 'tableTennisPaddle';

function part(root: Group, name: string, geometry: BufferGeometry, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function lathe(points: readonly (readonly [number, number])[], segments = 12): LatheGeometry {
  return new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), segments);
}

function roundedPlate(width: number, height: number, depth: number, radius: number): ExtrudeGeometry {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005,
    bevelSegments: 1, steps: 1, curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function trafficCone(body: MeshStandardMaterial, stripe: MeshStandardMaterial): Group {
  const root = new Group();
  const rubber = new MeshStandardMaterial({ color: 0x343a39, roughness: 0.9 });
  const base = part(root, 'rubber-base', roundedPlate(0.62, 0.62, 0.055, 0.045), rubber);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.032;
  part(root, 'orange-cone', lathe([
    [0.26, 0.06], [0.26, 0.085], [0.066, 0.85], [0.045, 0.865],
    [0.029, 0.855], [0.029, 0.815], [0.05, 0.815], [0.24, 0.075], [0.26, 0.06],
  ]), body);
  for (const [bottom, top] of [[0.3, 0.41], [0.58, 0.69]]) {
    const radius = (height: number) => 0.26 - (height - 0.085) * (0.194 / 0.765) + 0.001;
    part(root, 'reflective-band', lathe([[radius(bottom!), bottom!], [radius(top!), top!]]), stripe);
  }
  return root;
}

function clothesHanger(body: MeshStandardMaterial, accent: MeshStandardMaterial): Group {
  const root = new Group();
  body.metalness = 0.55;
  body.roughness = 0.4;
  const wire = (name: string, points: number[][], radius: number, segments: number) => {
    const curve = new CatmullRomCurve3(points.map(([x, y]) => new Vector3(x!, y!, 0)), false, 'centripetal');
    part(root, name, new TubeGeometry(curve, segments, radius, 4, false), body);
  };
  wire('continuous-triangle', [
    [-0.02, 0.43], [-0.1, 0.39], [-0.46, 0.2], [-0.48, 0.16],
    [-0.4, 0.145], [0.4, 0.145], [0.48, 0.16], [0.46, 0.2], [0.06, 0.42], [0.015, 0.44],
  ], 0.012, 16);
  wire('open-hook', [[0.015, 0.43], [0, 0.53], [-0.065, 0.59], [-0.075, 0.68],
    [-0.025, 0.735], [0.065, 0.72], [0.09, 0.66]], 0.013, 12);
  const collar = part(root, 'neck-sleeve', new CylinderGeometry(0.022, 0.022, 0.075, 6), accent);
  collar.position.y = 0.45;
  return root;
}

function toiletPlunger(body: MeshStandardMaterial, wood: MeshStandardMaterial): Group {
  const root = new Group();
  part(root, 'hollow-rubber-cup', lathe([
    [0.19, 0.01], [0.21, 0.02], [0.21, 0.055], [0.185, 0.11],
    [0.14, 0.17], [0.08, 0.195], [0.06, 0.24], [0.035, 0.245],
    [0.035, 0.18], [0.07, 0.16], [0.12, 0.145], [0.16, 0.1], [0.18, 0.04], [0.19, 0.01],
  ], 8), body);
  part(root, 'wooden-handle', lathe([
    [0, 0.205], [0.03, 0.205], [0.031, 0.93], [0.027, 0.955], [0, 0.965],
  ], 8), wood);
  const rim = part(root, 'cup-rim', new TorusGeometry(0.196, 0.012, 4, 12), body);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.026;
  return root;
}

function golfBall(body: MeshStandardMaterial): Group {
  const root = new Group();
  body.flatShading = false;
  body.roughness = 0.46;
  // Keep the dimples in the surface shading instead of adding mesh detail.
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const dx = (x - 15.5) / 11;
      const dy = (y - 15.5) / 11;
      const slope = Math.max(0, 1 - dx * dx - dy * dy);
      const normal = new Vector3(-dx * slope, -dy * slope, 1).normalize();
      const index = (y * 32 + x) * 4;
      pixels[index] = Math.round((normal.x + 1) * 127.5);
      pixels[index + 1] = Math.round((normal.y + 1) * 127.5);
      pixels[index + 2] = Math.round((normal.z + 1) * 127.5);
      pixels[index + 3] = 255;
    }
  }
  const dimples = new DataTexture(pixels, 32, 32);
  dimples.wrapS = dimples.wrapT = RepeatWrapping;
  dimples.magFilter = dimples.minFilter = LinearFilter;
  dimples.repeat.set(16, 8);
  dimples.needsUpdate = true;
  body.normalMap = dimples;
  const geometry = new SphereGeometry(0.5, 16, 8);
  part(root, 'ball', geometry, body);
  return root;
}

function bowlingPin(body: MeshStandardMaterial, stripe: MeshStandardMaterial): Group {
  const root = new Group();
  body.flatShading = false;
  body.roughness = 0.35;
  part(root, 'pin-body', lathe([
    [0, 0], [0.12, 0], [0.15, 0.035], [0.185, 0.14], [0.195, 0.27],
    [0.17, 0.4], [0.12, 0.52], [0.075, 0.63], [0.064, 0.71],
    [0.085, 0.79], [0.112, 0.85], [0.105, 0.91], [0.07, 0.96], [0, 0.98],
  ], 12), body);
  part(root, 'lower-red-band', lathe([[0.073, 0.65], [0.068, 0.68]], 12), stripe);
  part(root, 'upper-red-band', lathe([[0.0672, 0.72], [0.0754, 0.75]], 12), stripe);
  return root;
}

function tableTennisPaddle(body: MeshStandardMaterial, wood: MeshStandardMaterial): Group {
  const root = new Group();
  const back = new MeshStandardMaterial({ color: 0x303638, roughness: 0.88 });
  const head = (name: string, radius: number, depth: number, material: MeshStandardMaterial, z: number) => {
    const mesh = part(root, name, new CylinderGeometry(radius, radius, depth, 16), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.scale.z = 1.08;
    mesh.position.set(0, 0.27, z);
  };
  head('plywood-edge', 0.235, 0.022, wood, 0);
  head('red-rubber-face', 0.229, 0.006, body, 0.015);
  head('black-rubber-face', 0.229, 0.006, back, -0.015);
  const handle = part(root, 'wooden-grip', roundedPlate(0.075, 0.27, 0.034, 0.018), wood);
  handle.position.y = -0.065;
  const inlay = part(root, 'grip-inlay', roundedPlate(0.014, 0.19, 0.003, 0.006), body);
  inlay.position.set(0, -0.085, 0.021);
  return root;
}

const BUILDERS = { trafficCone, clothesHanger, toiletPlunger, golfBall, bowlingPin, tableTennisPaddle };

export function buildSimpleJunk(id: SimpleJunkId, body: MeshStandardMaterial, accent: MeshStandardMaterial): Group {
  return BUILDERS[id](body, accent);
}
