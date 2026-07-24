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
const BROWN = [0.36, 0.22, 0.12, 1];
const NET_BROWN = [0.044, 0.021, 0.010, 1];
const NET_DARK = [0.023, 0.010, 0.005, 1];
const CHART_WATER = [0.159, 0.342, 0.410, 1];
const CHART_LAND = [0.658, 0.533, 0.250, 1];
const CHART_INK = [0.035, 0.076, 0.091, 1];
const CHART_ROUTE = [0.78, 0.18, 0.08, 1];
const PURPLE = [0.162, 0.061, 0.366, 1];
const SAFETY_ORANGE = [0.95, 0.28, 0.03, 1];
const WARM_WHITE = [0.96, 0.92, 0.82, 1];
const IDENTITY = [0, 0, 0, 1];
const HALF_SQRT = Math.SQRT1_2;
const QX90 = [HALF_SQRT, 0, 0, HALF_SQRT];
const QX180 = [1, 0, 0, 0];

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

function tubePathPart(name, points, radius, color, radialSegments = 6) {
  return {
    name, shape: 'tubePath', points, radius, color, radialSegments,
    translation: [0, 0, 0], rotation: IDENTITY,
  };
}

function polygonPart(name, points, height, translation, color) {
  return {
    name, shape: 'polygon', points, height, translation,
    rotation: IDENTITY, color,
  };
}

function torusArcPart(
  name, size, translation, color, arcStart, arcLength, segments = 8,
  rotation = IDENTITY,
) {
  return {
    name, shape: 'torusArc', size, translation, rotation,
    color, arcStart, arcLength, segments,
  };
}

export const PROJECT_ITEM_IDS = Object.freeze([
  'map', 'spyglass', 'fishingNet', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
]);

export const PROJECT_ITEM_RECIPE_VERSION = 2;

const mapGrid = [
  ...[-0.30, -0.10, 0.10, 0.30].map((x, index) =>
    part(`grid-longitude-${index + 1}`, 'box', [0.008, 0.010, 0.52],
      [x, 0.025, 0], CHART_INK)),
  ...[-0.18, -0.06, 0.06, 0.18].map((z, index) =>
    part(`grid-latitude-${index + 1}`, 'box', [0.80, 0.010, 0.008],
      [0, 0.026, z], CHART_INK)),
];

const UMBRELLA_FOLDS = Array.from({ length: 8 }, (_, index) => {
  const angle = index / 8 * Math.PI * 2;
  return part(
    `fabric-fold-${index + 1}`,
    'cone',
    [0.13, 0.86, 0.09],
    [Math.cos(angle) * 0.045, Math.sin(angle) * 0.045, 0.05],
    PURPLE,
    QX90,
    8,
  );
});

const WHITE_ARC = Math.PI * 2 * 0.04;
const ORANGE_ARC = Math.PI * 2 * 0.21;
const ringParts = [];
let ringAngle = 0;
for (let index = 0; index < 4; index += 1) {
  ringParts.push({
    ...torusArcPart(`orange-${index + 1}`, [0.74, 0.18, 0.74], [0, 0, 0],
      SAFETY_ORANGE, ringAngle, ORANGE_ARC, 11),
    role: 'orange-body',
  });
  ringAngle += ORANGE_ARC;
  ringParts.push({
    ...torusArcPart(`white-${index + 1}`, [0.74, 0.18, 0.74], [0, 0, 0],
      WARM_WHITE, ringAngle, WHITE_ARC, 3),
    role: 'white-band',
  });
  ringAngle += WHITE_ARC;
}

const NET_GRID_STOPS = [0.12, 0.36, 0.62, 0.86];

function foldedNetLayer(layer, {
  center, width, depth, angle, rise, skew,
}) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const foldedPoint = (u, v) => {
    const localZ = (v - 0.5) * depth;
    const taper = 0.80 + (1 - v) * 0.20;
    const irregularity = 0.022 * Math.sin((u * 3 + v * 2 + layer * 0.37) * Math.PI);
    const localX = (u - 0.5) * width * taper + skew * (v - 0.5) + irregularity;
    const distance = Math.min(1, Math.hypot((u - 0.5) * 1.45, (v - 0.5) * 1.25));
    const height = center[1]
      + rise * (1 - distance)
      + 0.014 * Math.sin((u + v + layer * 0.23) * Math.PI * 2);
    return [
      center[0] + localX * cosine - localZ * sine,
      Math.max(0.018, height),
      center[2] + localX * sine + localZ * cosine,
    ];
  };

  return [
    ...NET_GRID_STOPS.map((u, index) => ({
      ...tubePathPart(
        `fold-${layer}-warp-${index + 1}`,
        NET_GRID_STOPS.map((v) => foldedPoint(u, v)),
        0.010,
        index % 2 === 0 ? NET_BROWN : NET_DARK,
      ),
      role: 'folded-mesh',
      foldLayer: layer,
    })),
    ...NET_GRID_STOPS.map((v, index) => ({
      ...tubePathPart(
        `fold-${layer}-weft-${index + 1}`,
        NET_GRID_STOPS.map((u) => foldedPoint(u, v)),
        0.010,
        index % 2 === 0 ? NET_DARK : NET_BROWN,
      ),
      role: 'folded-mesh',
      foldLayer: layer,
    })),
  ];
}

const foldedNetLayers = [
  ...foldedNetLayer(1, {
    center: [-0.08, 0.045, 0.01], width: 0.82, depth: 0.56,
    angle: -0.14, rise: 0.07, skew: 0.10,
  }),
  ...foldedNetLayer(2, {
    center: [0.11, 0.115, -0.04], width: 0.60, depth: 0.43,
    angle: 0.38, rise: 0.08, skew: -0.08,
  }),
  ...foldedNetLayer(3, {
    center: [-0.15, 0.175, 0.09], width: 0.48, depth: 0.34,
    angle: -0.48, rise: 0.07, skew: 0.06,
  }),
];

export const PROJECT_ITEM_RECIPES = Object.freeze({
  map: {
    parts: [
      part('chart-sheet', 'box', [0.86, 0.025, 0.58], [0, 0, 0], CHART_WATER),
      polygonPart('landmass-west', [
        [-0.40, -0.23], [-0.16, -0.25], [-0.09, -0.12],
        [-0.18, 0.02], [-0.11, 0.24], [-0.39, 0.25],
      ], 0.018, [0, 0.022, 0], CHART_LAND),
      polygonPart('landmass-east', [
        [0.12, -0.25], [0.40, -0.18], [0.35, 0.02],
        [0.42, 0.24], [0.15, 0.22], [0.07, 0.06],
      ], 0.018, [0, 0.022, 0], CHART_LAND),
      ...mapGrid,
      tubePathPart('route', [
        [-0.30, 0.038, -0.15], [-0.12, 0.040, -0.03],
        [0.10, 0.040, 0.04], [0.29, 0.038, 0.17],
      ], 0.009, CHART_ROUTE, 6),
      part('compass-north', 'cone', [0.045, 0.012, 0.10],
        [0.27, 0.041, -0.08], CHART_INK, IDENTITY, 4),
      part('compass-east', 'cone', [0.045, 0.012, 0.07],
        [0.32, 0.041, -0.13], CHART_INK, quaternion('y', Math.PI / 2), 4),
      part('compass-south', 'cone', [0.045, 0.012, 0.07],
        [0.27, 0.041, -0.18], CHART_INK, QX180, 4),
      part('compass-west', 'cone', [0.045, 0.012, 0.07],
        [0.22, 0.041, -0.13], CHART_INK, quaternion('y', -Math.PI / 2), 4),
      tubePathPart('corner-curl-left', [
        [-0.43, 0.00, -0.29], [-0.41, 0.035, -0.27], [-0.38, 0.045, -0.25],
      ], 0.012, CHART_WATER, 6),
      tubePathPart('corner-curl-right', [
        [0.43, 0.00, 0.29], [0.41, 0.035, 0.27], [0.38, 0.045, 0.25],
      ], 0.012, CHART_WATER, 6),
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
      ...foldedNetLayers,
      {
        ...tubePathPart('gather-left', [
          [-0.42, 0.055, -0.18], [-0.31, 0.10, -0.03], [-0.23, 0.16, 0.10],
          [-0.17, 0.22, 0.12], [-0.11, 0.235, 0.08],
        ], 0.020, NET_DARK, 8),
        role: 'gather-line',
      },
      {
        ...tubePathPart('gather-right', [
          [0.37, 0.045, -0.19], [0.30, 0.11, -0.06], [0.24, 0.17, 0.05],
          [0.17, 0.215, 0.10], [0.09, 0.23, 0.08],
        ], 0.020, NET_DARK, 8),
        role: 'gather-line',
      },
      {
        ...tubePathPart('loose-edge-coil', [
          [-0.34, 0.045, 0.19], [-0.42, 0.055, 0.25], [-0.39, 0.07, 0.34],
          [-0.28, 0.085, 0.37], [-0.18, 0.10, 0.32], [-0.20, 0.12, 0.24],
          [-0.29, 0.13, 0.22], [-0.33, 0.15, 0.28], [-0.27, 0.17, 0.31],
        ], 0.023, NET_DARK, 8),
        role: 'loose-edge',
      },
      ...[
        [-0.11, 0.235, 0.08], [0.09, 0.23, 0.08],
        [-0.22, 0.15, -0.01], [0.17, 0.16, 0.00],
      ].map((translation, index) =>
        part(`bundle-knot-${index + 1}`, 'cylinder', [0.045, 0.032, 0.045],
          translation, NET_DARK, IDENTITY, 8)),
    ],
  },
  umbrella: {
    parts: [
      ...UMBRELLA_FOLDS,
      part('shaft', 'cylinder', [0.028, 1.08, 0.028], [0, 0, 0], DARK, QX90, 10),
      part('metal-tip', 'cone', [0.055, 0.16, 0.055], [0, 0, 0.61], STEEL, QX90, 8),
      part('fastening-strap', 'torus', [0.18, 0.025, 0.18], [0, 0, -0.12], DARK, QX90, 12),
      torusArcPart('curved-handle', [0.24, 0.035, 0.24],
        [0, -0.08, -0.57], DARK, -Math.PI * 0.15, Math.PI * 1.3, 12, QX90),
    ],
  },
  swimRing: {
    parts: ringParts,
  },
  harpoonGun: {
    parts: [
      part('barrel', 'cylinder', [0.12, 1.10, 0.12], [0, 0.10, 0.10],
        DARK, QX90, 12),
      part('rail', 'box', [0.055, 0.035, 1.08], [0, 0.17, 0.10], STEEL),
      part('grip', 'box', [0.16, 0.32, 0.18], [0, -0.08, -0.30],
        BROWN, quaternion('x', -0.18)),
      part('trigger', 'box', [0.035, 0.10, 0.035], [0, 0.01, -0.17], STEEL,
        quaternion('x', -0.35)),
      tubePathPart('trigger-guard', [
        [-0.08, 0.07, -0.24], [-0.09, 0.055, -0.235],
        [-0.10, 0.035, -0.225], [-0.105, 0.015, -0.21],
        [-0.105, -0.002, -0.195], [-0.10, -0.014, -0.183],
        [-0.09, -0.019, -0.174], [-0.075, -0.02, -0.167],
        [-0.055, -0.02, -0.162], [-0.025, -0.02, -0.16],
        [0.025, -0.02, -0.16], [0.055, -0.02, -0.162],
        [0.075, -0.02, -0.167], [0.09, -0.019, -0.174],
        [0.10, -0.014, -0.183], [0.105, -0.002, -0.195],
        [0.105, 0.015, -0.21], [0.10, 0.035, -0.225],
        [0.09, 0.055, -0.235], [0.08, 0.07, -0.24],
      ], 0.014, DARK, 6),
      part('spear-shaft', 'cylinder', [0.025, 1.42, 0.025],
        [0, 0.21, 0.31], STEEL, QX90, 8),
      part('spear-head', 'cone', [0.10, 0.20, 0.10],
        [0, 0.21, 1.12], STEEL, QX90, 4),
      tubePathPart('rubber-band-left', [
        [-0.055, 0.14, -0.34], [-0.07, 0.19, 0.55], [-0.035, 0.20, 0.70],
      ], 0.018, DARK, 8),
      tubePathPart('rubber-band-right', [
        [0.055, 0.14, -0.34], [0.07, 0.19, 0.55], [0.035, 0.20, 0.70],
      ], 0.018, DARK, 8),
      part('line-spool', 'cylinder', [0.14, 0.08, 0.14],
        [0, -0.01, 0.20], BRASS, QX90, 14),
      tubePathPart('spool-line', [
        [0.07, -0.01, 0.20], [0.10, 0.08, 0.42], [0.04, 0.16, 0.72],
      ], 0.009, PAPER, 6),
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

function torusGeometry(
  [width, tubeDiameter, depth],
  tubularSegments,
  arcStart = 0,
  arcLength = Math.PI * 2,
) {
  const radialSegments = 8;
  const tubeRadius = tubeDiameter / 2;
  const majorX = width / 2 - tubeRadius;
  const majorZ = depth / 2 - tubeRadius;
  const geometry = { positions: [], normals: [], indices: [] };
  for (let tubular = 0; tubular < tubularSegments; tubular += 1) {
    const firstAround = arcStart + tubular / tubularSegments * arcLength;
    const secondAround = arcStart + (tubular + 1) / tubularSegments * arcLength;
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

function normalizeVector(vector, message) {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length === 0) {
    throw new Error(message);
  }
  return vector.map((component) => component / length);
}

function subtractVector(first, second) {
  return [
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2],
  ];
}

function crossVector(first, second) {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function tubePathGeometry(points, radius, radialSegments) {
  if (points.length < 2) {
    throw new Error('tubePath requires at least two points');
  }

  const geometry = { positions: [], normals: [], indices: [] };
  points.forEach((point, index) => {
    const tangent = normalizeVector(
      index === 0
        ? subtractVector(points[1], point)
        : index === points.length - 1
          ? subtractVector(point, points[index - 1])
          : subtractVector(points[index + 1], points[index - 1]),
      `tubePath point ${index} has no usable tangent`,
    );
    const reference = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const firstNormal = normalizeVector(
      crossVector(tangent, reference),
      `tubePath point ${index} has no usable frame`,
    );
    const secondNormal = crossVector(tangent, firstNormal);
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const angle = radial / radialSegments * Math.PI * 2;
      const firstWeight = Math.cos(angle);
      const secondWeight = Math.sin(angle);
      const sideNormal = [
        firstNormal[0] * firstWeight + secondNormal[0] * secondWeight,
        firstNormal[1] * firstWeight + secondNormal[1] * secondWeight,
        firstNormal[2] * firstWeight + secondNormal[2] * secondWeight,
      ];
      geometry.positions.push(
        point[0] + sideNormal[0] * radius,
        point[1] + sideNormal[1] * radius,
        point[2] + sideNormal[2] * radius,
      );
      geometry.normals.push(...sideNormal);
    }
  });

  for (let pathIndex = 0; pathIndex < points.length - 1; pathIndex += 1) {
    const firstRing = pathIndex * radialSegments;
    const secondRing = (pathIndex + 1) * radialSegments;
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const nextRadial = (radial + 1) % radialSegments;
      geometry.indices.push(
        firstRing + radial,
        firstRing + nextRadial,
        secondRing + nextRadial,
        firstRing + radial,
        secondRing + nextRadial,
        secondRing + radial,
      );
    }
  }
  return geometry;
}

function polygonGeometry(points, height) {
  if (points.length < 3) {
    throw new Error('polygon requires at least three points');
  }

  const signedArea = points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (!Number.isFinite(signedArea) || signedArea === 0) {
    throw new Error('polygon requires a finite non-zero area');
  }
  const counterClockwise = signedArea > 0 ? points : [...points].reverse();
  const halfHeight = height / 2;
  const top = counterClockwise.map(([x, z]) => [x, halfHeight, z]);
  const bottom = counterClockwise.map(([x, z]) => [x, -halfHeight, z]);
  const geometry = { positions: [], normals: [], indices: [] };

  for (let index = 1; index < points.length - 1; index += 1) {
    pushFace(
      geometry,
      [top[0], top[index + 1], top[index]],
      [0, 1, 0],
      [0, 1, 2],
    );
    pushFace(
      geometry,
      [bottom[0], bottom[index], bottom[index + 1]],
      [0, -1, 0],
      [0, 1, 2],
    );
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const vertices = [bottom[index], top[index], top[next], bottom[next]];
    pushFace(geometry, vertices, normal(vertices[0], vertices[1], vertices[2]));
  }
  return geometry;
}

function createGeometry(spec) {
  switch (spec.shape) {
    case 'box': return boxGeometry(spec.size);
    case 'cylinder': return cylinderGeometry(spec.size, spec.segments ?? 8);
    case 'cone': return coneGeometry(spec.size, spec.segments ?? 8);
    case 'torus': return torusGeometry(spec.size, spec.segments ?? 12);
    case 'torusArc': return torusGeometry(
      spec.size,
      spec.segments ?? 8,
      spec.arcStart,
      spec.arcLength,
    );
    case 'tubePath': return tubePathGeometry(spec.points, spec.radius, spec.radialSegments ?? 6);
    case 'polygon': return polygonGeometry(spec.points, spec.height);
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
