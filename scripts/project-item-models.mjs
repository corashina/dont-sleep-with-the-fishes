import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { prune, unpartition } from '@gltf-transform/functions';

const RED_ORANGE = [0.78, 0.18, 0.08, 1];
const DARK = [0.10, 0.12, 0.14, 1];
const BRASS = [0.67, 0.45, 0.18, 1];
const STEEL = [0.42, 0.49, 0.51, 1];
const PAPER = [0.80, 0.73, 0.55, 1];
const BLUE = [0.23, 0.44, 0.55, 1];
const BROWN = [0.36, 0.22, 0.12, 1];
const IDENTITY = [0, 0, 0, 1];
const HALF_SQRT = Math.SQRT1_2;
const QX90 = [HALF_SQRT, 0, 0, HALF_SQRT];
const QX180 = [1, 0, 0, 0];
const QZ_NEG_90 = [0, 0, -HALF_SQRT, HALF_SQRT];

function quaternion(axis, radians) {
  const sine = Math.sin(radians / 2);
  const cosine = Math.cos(radians / 2);
  return axis === 'x'
    ? [sine, 0, 0, cosine]
    : axis === 'y'
      ? [0, sine, 0, cosine]
      : [0, 0, sine, cosine];
}

function part(name, shape, size, translation, color, rotation = IDENTITY, segments) {
  return segments === undefined
    ? { name, shape, size, translation, rotation, color }
    : { name, shape, size, translation, rotation, color, segments };
}

export const PROJECT_ITEM_IDS = Object.freeze([
  'compass', 'map', 'spyglass', 'fishingNet', 'flareGun',
  'anchor', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
]);

export const PROJECT_ITEM_RECIPES = Object.freeze({
  compass: {
    parts: [
      part('case', 'cylinder', [0.56, 0.10, 0.56], [0, 0, 0], BRASS),
      part('face', 'cylinder', [0.43, 0.02, 0.43], [0, 0.06, 0], PAPER),
      part('needle-north', 'box', [0.04, 0.02, 0.30], [0, 0.08, 0.10], RED_ORANGE),
      part('needle-south', 'box', [0.04, 0.02, 0.30], [0, 0.08, -0.10], PAPER),
    ],
  },
  map: {
    parts: [
      part('sheet', 'box', [0.78, 0.025, 0.52], [0, 0, 0], PAPER),
      part('fold-left', 'box', [0.025, 0.020, 0.50], [-0.20, 0.0225, 0], BRASS),
      part('fold-right', 'box', [0.025, 0.020, 0.50], [0.20, 0.0225, 0], BRASS),
      part('route', 'box', [0.46, 0.018, 0.025], [-0.03, 0.024, 0], BLUE, quaternion('y', -0.34)),
      part('mark', 'cylinder', [0.075, 0.025, 0.075], [0.23, 0.031, -0.08], RED_ORANGE),
    ],
  },
  spyglass: {
    parts: [
      part('main-tube', 'cylinder', [0.18, 0.62, 0.18], [0, 0, 0], BROWN, QX90),
      part('eye-tube', 'cylinder', [0.13, 0.25, 0.13], [0, 0, -0.405], DARK, QX90),
      part('front-rim', 'cylinder', [0.23, 0.07, 0.23], [0, 0, 0.325], BRASS, QX90),
      part('middle-rim', 'cylinder', [0.20, 0.055, 0.20], [0, 0, -0.08], BRASS, QX90),
      part('eye-rim', 'cylinder', [0.17, 0.05, 0.17], [0, 0, -0.535], BRASS, QX90),
    ],
  },
  fishingNet: {
    parts: [
      part('handle', 'cylinder', [0.04, 0.92, 0.04], [0, -0.36, 0], BROWN),
      part('frame', 'torus', [0.42, 0.025, 0.30], [0, 0.22, 0], STEEL, QX90),
      part('net-line-1', 'cylinder', [0.010, 0.28, 0.010], [-0.10, 0.22, 0], PAPER),
      part('net-line-2', 'cylinder', [0.010, 0.30, 0.010], [0, 0.22, 0], PAPER),
      part('net-line-3', 'cylinder', [0.010, 0.28, 0.010], [0.10, 0.22, 0], PAPER),
      part('net-line-4', 'cylinder', [0.010, 0.36, 0.010], [0, 0.22, 0], PAPER, quaternion('z', Math.PI / 3)),
      part('net-line-5', 'cylinder', [0.010, 0.36, 0.010], [0, 0.22, 0], PAPER, quaternion('z', -Math.PI / 3)),
      part('net-line-6', 'cylinder', [0.010, 0.34, 0.010], [0, 0.22, 0], PAPER, QZ_NEG_90),
    ],
  },
  flareGun: {
    parts: [
      part('barrel', 'box', [0.18, 0.18, 0.62], [0, 0.15, 0.10], RED_ORANGE),
      part('muzzle', 'cylinder', [0.27, 0.08, 0.27], [0, 0.15, 0.45], RED_ORANGE, QX90),
      part('hinge', 'cylinder', [0.10, 0.24, 0.10], [0, 0.07, -0.17], DARK, QZ_NEG_90),
      part('grip', 'box', [0.17, 0.42, 0.20], [0, -0.15, -0.10], DARK, quaternion('x', Math.PI / 15)),
      part('trigger-guard', 'torus', [0.20, 0.025, 0.18], [0, -0.015, 0.11], DARK, QZ_NEG_90),
      part('trigger', 'box', [0.025, 0.10, 0.03], [0, 0.005, 0.105], BRASS, quaternion('x', -0.24)),
    ],
  },
  anchor: {
    parts: [
      part('shank', 'cylinder', [0.08, 0.82, 0.08], [0, 0, 0], DARK),
      part('crossbar', 'cylinder', [0.06, 0.62, 0.06], [0, 0.25, 0], STEEL, QZ_NEG_90),
      part('ring', 'torus', [0.22, 0.035, 0.22], [0, 0.48, 0], DARK, QX90),
      part('arm-left', 'box', [0.10, 0.38, 0.10], [-0.14, -0.31, 0], DARK, quaternion('z', -0.78)),
      part('arm-right', 'box', [0.10, 0.38, 0.10], [0.14, -0.31, 0], DARK, quaternion('z', 0.78)),
      part('fluke-left', 'cone', [0.20, 0.25, 0.16], [-0.32, -0.40, 0], STEEL, quaternion('z', -0.75), 3),
      part('fluke-right', 'cone', [0.20, 0.25, 0.16], [0.32, -0.40, 0], STEEL, quaternion('z', 0.75), 3),
    ],
  },
  umbrella: {
    parts: [
      part('canopy', 'cone', [0.34, 0.68, 0.34], [0, 0.13, 0], RED_ORANGE, QX180),
      part('shaft', 'cylinder', [0.035, 0.92, 0.035], [0, -0.08, 0], DARK),
      part('tip', 'cone', [0.075, 0.16, 0.075], [0, -0.61, 0], STEEL, QX180),
      part('handle', 'torus', [0.18, 0.025, 0.18], [0.045, -0.51, 0], DARK, QX90),
      part('grip', 'box', [0.16, 0.24, 0.08], [-0.02, -0.46, 0], DARK),
    ],
  },
  swimRing: {
    parts: [
      part('ring', 'torus', [0.70, 0.16, 0.70], [0, 0, 0], RED_ORANGE),
      part('band-north', 'box', [0.14, 0.18, 0.20], [0, 0, 0.27], PAPER),
      part('band-east', 'box', [0.20, 0.18, 0.14], [0.27, 0, 0], PAPER),
      part('band-south', 'box', [0.14, 0.18, 0.20], [0, 0, -0.27], PAPER),
      part('band-west', 'box', [0.20, 0.18, 0.14], [-0.27, 0, 0], PAPER),
    ],
  },
  harpoonGun: {
    parts: [
      part('body', 'box', [0.18, 0.18, 0.68], [0, 0.10, 0], DARK),
      part('stock', 'box', [0.22, 0.27, 0.34], [0, -0.02, -0.42], BROWN, quaternion('x', 0.10)),
      part('grip', 'box', [0.14, 0.36, 0.16], [0, -0.14, -0.18], DARK, quaternion('x', Math.PI / 15)),
      part('barrel', 'cylinder', [0.075, 0.82, 0.075], [0, 0.15, 0.13], STEEL, QX90),
      part('harpoon-shaft', 'cylinder', [0.035, 0.36, 0.035], [0, 0.15, 0.69], STEEL, QX90),
      part('harpoon-tip', 'cone', [0.12, 0.20, 0.12], [0, 0.15, 0.97], STEEL, QX90, 4),
    ],
  },
  energyBar: {
    parts: [
      part('wrapper', 'box', [0.58, 0.16, 0.10], [0, 0, 0], BRASS),
      part('end-seal-left', 'box', [0.08, 0.18, 0.11], [-0.31, 0, 0], RED_ORANGE),
      part('end-seal-right', 'box', [0.08, 0.18, 0.11], [0.31, 0, 0], RED_ORANGE),
      part('label', 'box', [0.28, 0.09, 0.018], [0, 0, 0.059], PAPER),
    ],
  },
});

function normal(first, second, third) {
  const firstEdge = [
    second[0] - first[0], second[1] - first[1], second[2] - first[2],
  ];
  const secondEdge = [
    third[0] - first[0], third[1] - first[1], third[2] - first[2],
  ];
  const cross = [
    firstEdge[1] * secondEdge[2] - firstEdge[2] * secondEdge[1],
    firstEdge[2] * secondEdge[0] - firstEdge[0] * secondEdge[2],
    firstEdge[0] * secondEdge[1] - firstEdge[1] * secondEdge[0],
  ];
  const length = Math.hypot(...cross);
  return cross.map((component) => component / length);
}

function pushFace(geometry, vertices, faceNormal, indices = [0, 1, 2, 0, 2, 3]) {
  const offset = geometry.positions.length / 3;
  for (const vertex of vertices) {
    geometry.positions.push(...vertex);
    geometry.normals.push(...faceNormal);
  }
  geometry.indices.push(...indices.map((index) => index + offset));
}

function boxGeometry([width, height, depth]) {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const geometry = { positions: [], normals: [], indices: [] };
  pushFace(geometry, [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], [0, 0, 1]);
  pushFace(geometry, [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]], [0, 0, -1]);
  pushFace(geometry, [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]], [1, 0, 0]);
  pushFace(geometry, [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]], [-1, 0, 0]);
  pushFace(geometry, [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]], [0, 1, 0]);
  pushFace(geometry, [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], [0, -1, 0]);
  return geometry;
}

function cylinderGeometry([width, height, depth], segments) {
  const radiusX = width / 2;
  const radiusZ = depth / 2;
  const halfHeight = height / 2;
  const geometry = { positions: [], normals: [], indices: [] };
  for (let segment = 0; segment < segments; segment += 1) {
    const firstAngle = segment / segments * Math.PI * 2;
    const secondAngle = (segment + 1) / segments * Math.PI * 2;
    const firstBottom = [radiusX * Math.cos(firstAngle), -halfHeight, radiusZ * Math.sin(firstAngle)];
    const firstTop = [firstBottom[0], halfHeight, firstBottom[2]];
    const secondTop = [radiusX * Math.cos(secondAngle), halfHeight, radiusZ * Math.sin(secondAngle)];
    const secondBottom = [secondTop[0], -halfHeight, secondTop[2]];
    pushFace(geometry, [firstBottom, firstTop, secondTop, secondBottom], normal(firstBottom, firstTop, secondTop));
    pushFace(geometry, [[0, halfHeight, 0], secondTop, firstTop], [0, 1, 0], [0, 1, 2]);
    pushFace(geometry, [[0, -halfHeight, 0], firstBottom, secondBottom], [0, -1, 0], [0, 1, 2]);
  }
  return geometry;
}

function coneGeometry([width, height, depth], segments) {
  const radiusX = width / 2;
  const radiusZ = depth / 2;
  const halfHeight = height / 2;
  const tip = [0, halfHeight, 0];
  const geometry = { positions: [], normals: [], indices: [] };
  for (let segment = 0; segment < segments; segment += 1) {
    const firstAngle = segment / segments * Math.PI * 2;
    const secondAngle = (segment + 1) / segments * Math.PI * 2;
    const first = [radiusX * Math.cos(firstAngle), -halfHeight, radiusZ * Math.sin(firstAngle)];
    const second = [radiusX * Math.cos(secondAngle), -halfHeight, radiusZ * Math.sin(secondAngle)];
    pushFace(geometry, [first, tip, second], normal(first, tip, second), [0, 1, 2]);
    pushFace(geometry, [[0, -halfHeight, 0], first, second], [0, -1, 0], [0, 1, 2]);
  }
  return geometry;
}

function torusPoint(majorX, majorZ, tubeRadius, around, radial) {
  const tube = tubeRadius * Math.cos(radial);
  return [
    (majorX + tube) * Math.cos(around),
    tubeRadius * Math.sin(radial),
    (majorZ + tube) * Math.sin(around),
  ];
}

function torusGeometry([width, tubeDiameter, depth], tubularSegments) {
  const radialSegments = 8;
  const tubeRadius = tubeDiameter / 2;
  const majorX = width / 2 - tubeRadius;
  const majorZ = depth / 2 - tubeRadius;
  const geometry = { positions: [], normals: [], indices: [] };
  for (let tubular = 0; tubular < tubularSegments; tubular += 1) {
    const firstAround = tubular / tubularSegments * Math.PI * 2;
    const secondAround = (tubular + 1) / tubularSegments * Math.PI * 2;
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const firstRadial = radial / radialSegments * Math.PI * 2;
      const secondRadial = (radial + 1) / radialSegments * Math.PI * 2;
      const first = torusPoint(majorX, majorZ, tubeRadius, firstAround, firstRadial);
      const second = torusPoint(majorX, majorZ, tubeRadius, secondAround, firstRadial);
      const third = torusPoint(majorX, majorZ, tubeRadius, secondAround, secondRadial);
      const fourth = torusPoint(majorX, majorZ, tubeRadius, firstAround, secondRadial);
      pushFace(geometry, [first, fourth, third], normal(first, fourth, third), [0, 1, 2]);
      pushFace(geometry, [first, third, second], normal(first, third, second), [0, 1, 2]);
    }
  }
  return geometry;
}

function createGeometry(spec) {
  switch (spec.shape) {
    case 'box': return boxGeometry(spec.size);
    case 'cylinder': return cylinderGeometry(spec.size, spec.segments ?? 8);
    case 'cone': return coneGeometry(spec.size, spec.segments ?? 8);
    case 'torus': return torusGeometry(spec.size, spec.segments ?? 12);
    default: throw new Error(`${spec.name}: unknown shape ${spec.shape}`);
  }
}

function createPart(document, buffer, itemId, spec) {
  const geometry = createGeometry(spec);
  const position = document.createAccessor(`${itemId}:${spec.name}:position`, buffer)
    .setType('VEC3')
    .setArray(new Float32Array(geometry.positions));
  const normalAccessor = document.createAccessor(`${itemId}:${spec.name}:normal`, buffer)
    .setType('VEC3')
    .setArray(new Float32Array(geometry.normals));
  const indices = document.createAccessor(`${itemId}:${spec.name}:indices`, buffer)
    .setType('SCALAR')
    .setArray(new Uint16Array(geometry.indices));
  const material = document.createMaterial(`${spec.name}-material`)
    .setBaseColorFactor(spec.color)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.9);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normalAccessor)
    .setIndices(indices)
    .setMaterial(material);
  return document.createNode(spec.name)
    .setMesh(document.createMesh(`${itemId}:${spec.name}-mesh`).addPrimitive(primitive))
    .setTranslation(spec.translation)
    .setRotation(spec.rotation);
}

async function buildModel(itemId, recipe) {
  const document = new Document();
  const buffer = document.createBuffer('buffer');
  const scene = document.createScene(itemId);
  document.getRoot().setDefaultScene(scene);
  for (const spec of recipe.parts) {
    scene.addChild(createPart(document, buffer, itemId, spec));
  }
  await document.transform(prune(), unpartition());
  return document;
}

const io = new NodeIO();

export async function buildProjectItemModels({ outputRoot, recipes = PROJECT_ITEM_RECIPES }) {
  await mkdir(outputRoot, { recursive: true });
  for (const [itemId, recipe] of Object.entries(recipes)) {
    try {
      await io.write(join(outputRoot, `${itemId}.glb`), await buildModel(itemId, recipe));
    } catch (error) {
      throw new Error(`${itemId}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}

async function runCli(args) {
  if (args.length !== 1) {
    throw new Error('Usage: node scripts/project-item-models.mjs <outputRoot>');
  }
  await buildProjectItemModels({ outputRoot: args[0] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
