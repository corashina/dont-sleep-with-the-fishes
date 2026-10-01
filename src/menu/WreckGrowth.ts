import { ConeGeometry, DodecahedronGeometry, SphereGeometry } from 'three';
import { WreckGeometry, type WreckPoint } from './WreckGeometry';
import type { WreckMaterials } from './WreckMaterials';
import { wreckSection, wreckSkin } from './WreckHull';

const SILT_TINTS = [0xffffff, 0xe6e2cf, 0xd2d4c0, 0xf0ead6];

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// Sand drifts against the hull where the current slows along the keel.
function buildSedimentDrifts(g: WreckGeometry, m: WreckMaterials, random: () => number): void {
  for (const side of [-1, 1]) {
    for (let z = -8.4; z <= 8.4; z += 0.55) {
      const drift = new SphereGeometry(1, 9, 5);
      const scale = 0.55 + random() * 0.45;
      drift.scale(0.75 * scale, 0.3 + random() * 0.18, 0.6 + random() * 0.3);
      drift.translate(...wreckSkin(side, z + (random() - 0.5) * 0.3, 0.86, 0.22 + random() * 0.18));
      g.add(drift, m.silt, SILT_TINTS[Math.floor(random() * SILT_TINTS.length)]);
    }
  }
}

// Kelp roots on the deck edge and rises toward the light.
function buildKelp(g: WreckGeometry, m: WreckMaterials, random: () => number): void {
  const roots: readonly [number, number][] = [
    [-1, -7.8], [-1, -5.9], [-1, -1.6], [-1, 1.4], [-1, 6.3], [-1, 8.1],
    [1, -8.1], [1, -6.6], [1, -2.6], [1, 1.2], [1, 1.7], [1, 6.9], [1, 7.9],
  ];
  for (const [side, z] of roots) {
    const { width, deck } = wreckSection(z);
    const base: WreckPoint = [side * (width - 0.22), deck + 0.04, z];
    const height = 1.3 + random() * 1.6;
    const bend = (random() - 0.5) * 0.7;
    const points: WreckPoint[] = [];
    for (let step = 0; step <= 8; step += 1) {
      const t = step / 8;
      points.push([
        base[0] + side * t * 0.35 + Math.sin(t * 3.1 + z) * 0.12,
        base[1] + t * height,
        base[2] + bend * t * t,
      ]);
    }
    g.cable(points, 0.022, m.growth);
    // Long, narrow blades hang from the stipe and droop at their tips.
    for (let leaf = 1; leaf < points.length; leaf += 1) {
      const [x, y, leafZ] = points[leaf]!;
      const direction = leaf % 2 === 0 ? 1 : -1;
      const length = 0.32 + random() * 0.28;
      const twist = (random() - 0.5) * 0.3;
      g.panel([
        [x, y, leafZ],
        [x + direction * length * 0.45, y + length * 0.42, leafZ + twist - 0.05],
        [x + direction * length, y + length * 0.3, leafZ + twist * 1.6],
        [x + direction * length * 0.5, y + length * 0.26, leafZ + twist + 0.05],
      ], m.growth, leaf % 3 === 0 ? 0xb8cfa4 : 0xd8e4b8);
    }
  }
}

// Barnacles, anemones, and coral clumps gather on rails, bollards, and the deck edge.
function buildEncrustation(g: WreckGeometry, m: WreckMaterials, random: () => number): void {
  for (let index = 0; index < 70; index += 1) {
    const side = random() > 0.35 ? 1 : -1;
    const z = -8.3 + random() * 16.6;
    const { width, deck } = wreckSection(z);
    const x = side * (width - 0.12 - random() * 0.45);
    const kind = random();
    if (kind < 0.45) {
      const barnacle = new ConeGeometry(0.05 + random() * 0.04, 0.08, 6);
      barnacle.translate(x, deck + 0.05, z);
      g.add(barnacle, m.silt, 0xe8e4d2);
    } else if (kind < 0.8) {
      const clump = new DodecahedronGeometry(0.1 + random() * 0.12, 0);
      clump.scale(1.2, 0.6, 1);
      clump.translate(x, deck + 0.05, z);
      g.add(clump, m.growth);
    } else {
      // Muted coral fingers, a small warm note among the cool greens.
      for (let finger = 0; finger < 3; finger += 1) {
        const angle = finger * 2.1 + random();
        g.beam([x, deck, z], [
          x + Math.cos(angle) * 0.1, deck + 0.22 + random() * 0.14, z + Math.sin(angle) * 0.1,
        ], 0.045, m.coral);
      }
    }
  }
}

// Weed stains run down from the deck edge where water drains off the plating.
function buildFoulingStreaks(g: WreckGeometry, m: WreckMaterials, random: () => number): void {
  for (const side of [-1, 1]) {
    for (let z = -8.2; z <= 8.2; z += 0.45 + random() * 0.5) {
      const length = 0.12 + random() * 0.3;
      const width = 0.06 + random() * 0.12;
      g.panel([
        wreckSkin(side, z, 0.01, 0.03),
        wreckSkin(side, z + width, 0.01, 0.03),
        wreckSkin(side, z + width * 0.4, length, 0.03),
      ], m.growth, 0x8fa089);
    }
  }
}

// The lifeboat davits on the near side stand empty. Their falls hang slack or snapped.
function buildEmptyDavits(g: WreckGeometry, m: WreckMaterials): void {
  for (const [z, snapped] of [[2.55, false], [5.75, true], [-6.9, false]] as const) {
    const { width, deck } = wreckSection(z);
    const foot: WreckPoint = [width - 0.25, deck, z];
    const tip: WreckPoint = [width + 0.55, deck + 1.5, z];
    g.cylinder(0.12, 0.15, 0.12, [foot[0], deck + 0.06, z], m.rust);
    g.cable([foot, [width - 0.2, deck + 1.1, z], [width + 0.15, deck + 1.62, z], tip], 0.055, m.iron);
    g.box([0.12, 0.16, 0.1], [tip[0], tip[1] - 0.1, z], m.rust);
    const fallEnd: WreckPoint = snapped
      ? [tip[0] + 0.05, tip[1] - 0.55, z + 0.05]
      : [tip[0] - 0.12, deck - 0.75, z + 0.18];
    g.cable([[tip[0], tip[1] - 0.18, z], [tip[0] + 0.03, (tip[1] + fallEnd[1]) / 2, z + 0.08], fallEnd], 0.02, m.rope);
    g.box([0.1, 0.18, 0.08], fallEnd, m.rust);
  }
}

// One rail section tore loose and hangs over the near side.
function buildHangingRail(g: WreckGeometry, m: WreckMaterials): void {
  const { width, deck } = wreckSection(-1.5);
  const top: WreckPoint = [width - 0.1, deck + 0.56, -1.5];
  const bottom: WreckPoint = [width + 0.12, deck - 0.55, -0.95];
  g.beam(top, bottom, 0.045, m.iron);
  g.beam([width - 0.06, deck + 0.29, -1.5], [width + 0.18, deck - 0.8, -0.8], 0.04, m.iron);
  g.beam([top[0] + 0.05, top[1] - 0.45, -1.35], [bottom[0] + 0.05, bottom[1] + 0.35, -0.87], 0.04, m.rust);
}

export function buildWreckGrowth(g: WreckGeometry, m: WreckMaterials): void {
  const random = seededRandom(0xd0e0);
  buildSedimentDrifts(g, m, random);
  buildKelp(g, m, random);
  buildEncrustation(g, m, random);
  buildFoulingStreaks(g, m, random);
  buildEmptyDavits(g, m);
  buildHangingRail(g, m);
}
