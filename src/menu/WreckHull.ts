import { TorusGeometry } from 'three';
import { WreckGeometry, type WreckPoint } from './WreckGeometry';
import type { WreckMaterials } from './WreckMaterials';

// Bow to stern: the stern is fuller, and the deck rises toward the bow.
const STATIONS = [
  [-9, 0.04, 0.96, -0.48], [-7.5, 1.42, 0.9, -1.12],
  [-5.5, 2.13, 0.78, -1.34], [-3, 2.48, 0.72, -1.4],
  [0, 2.6, 0.7, -1.42], [3, 2.53, 0.72, -1.4],
  [5.5, 2.26, 0.77, -1.3], [7.5, 1.64, 0.85, -1.12],
  [9, 0.65, 0.92, -0.72],
] as const;
const STRAKES = [0, 0.24, 0.53, 0.78, 1] as const;
const PLATE_TINTS = [0xffffff, 0xd6dfd3, 0xe4e2ce, 0xc1cec4, 0xe0e8df];

export function wreckSection(z: number): { width: number; deck: number; keel: number } {
  const value = Math.max(-9, Math.min(9, z));
  for (let i = 0; i < STATIONS.length - 1; i += 1) {
    const a = STATIONS[i]!;
    const b = STATIONS[i + 1]!;
    if (value > b[0]) continue;
    const t = (value - a[0]) / (b[0] - a[0]);
    return {
      width: a[1] + (b[1] - a[1]) * t,
      deck: a[2] + (b[2] - a[2]) * t,
      keel: a[3] + (b[3] - a[3]) * t,
    };
  }
  throw new Error('Invalid wreck station');
}

function skin(side: number, z: number, depth: number, offset = 0): WreckPoint {
  const { width, deck, keel } = wreckSection(z);
  const taper = depth < 0.53 ? 1 - depth * 0.2 : 0.894 - (depth - 0.53) * 1.37;
  return [side * (width * taper + offset), deck + (keel - deck) * depth, z];
}

function buildPlating(g: WreckGeometry, m: WreckMaterials): void {
  for (const side of [-1, 1]) {
    for (let column = 0; column < 24; column += 1) {
      const z0 = -9 + column * 0.75;
      const z1 = z0 + 0.75;
      const breach = side === 1 && column >= 9 && column <= 12;
      for (let row = 0; row < STRAKES.length - 1; row += 1) {
        if (breach && row < 2) continue;
        const top = STRAKES[row]!;
        const bottom = STRAKES[row + 1]!;
        const tint = PLATE_TINTS[(column * 3 + row * 2) % PLATE_TINTS.length]!;
        g.panel([
          skin(side, z0 + 0.009, top + 0.004), skin(side, z1 - 0.009, top + 0.004),
          skin(side, z1 - 0.009, bottom - 0.004), skin(side, z0 + 0.009, bottom - 0.004),
        ], row === 3 ? m.rust : m.hull, tint);
        buildPlateSeam(g, m, side, column, row);
      }
      // Longitudinal keel closes the bottom of the shell.
      if (side === 1) g.panel([
        skin(-1, z0, 1), skin(-1, z1, 1), skin(1, z1, 1), skin(1, z0, 1),
      ], m.dark);
    }
  }
  for (const z of [-9, 9]) {
    g.panel([skin(-1, z, 0), skin(1, z, 0), skin(1, z, 1), skin(-1, z, 1)], m.hull);
  }
}

function buildPlateSeam(g: WreckGeometry, m: WreckMaterials, side: number, column: number, row: number): void {
  const z = -9 + column * 0.75;
  const top = STRAKES[row]!;
  const bottom = STRAKES[row + 1]!;
  g.beam(skin(side, z, top, 0.014), skin(side, z + 0.75, top, 0.014), 0.026, m.rust);
  // Runoff follows selected joints, with different lengths and widths.
  if ((column * 7 + row * 3) % 5 < 2) {
    const streakDepth = Math.min(bottom, top + 0.09 + (column % 4) * 0.04);
    g.panel([skin(side, z + 0.025, top, 0.022),
      skin(side, z + 0.07 + (column % 3) * 0.025, top, 0.022),
      skin(side, z + 0.045, streakDepth, 0.022)], m.rust, 0xb9ad92);
  }
  if (row < 2 && column % 2 === 0) {
    for (const depth of [top + 0.045, bottom - 0.04]) {
      g.box([0.04, 0.045, 0.045], skin(side, z + 0.06, depth, 0.03), m.iron);
    }
  }
}

function buildFrames(g: WreckGeometry, m: WreckMaterials): void {
  for (let z = -7.5; z <= 7.5; z += 0.75) {
    for (const side of [-1, 1]) {
      for (let row = 0; row < STRAKES.length - 1; row += 1) {
        g.beam(skin(side, z, STRAKES[row]!, -0.1),
          skin(side, z, STRAKES[row + 1]!, -0.1), 0.09, m.iron, 0.12);
      }
    }
  }
  // The breach opens into a compartment with a floor, bulkheads, and exposed deck beams.
  g.box([3.6, 0.1, 3.6], [0, -0.73, -0.9], m.dark);
  for (const z of [-2.45, 0.95]) {
    g.box([4.35, 1.38, 0.1], [0, -0.02, z], m.dark);
    for (const x of [-1.4, 0, 1.4]) g.box([0.08, 1.35, 0.12], [x, -0.02, z + 0.06], m.rust);
  }
  // Jagged edges curl out from the missing plating and reveal its thickness.
  for (let i = 0; i < 4; i += 1) {
    const z = -2.25 + i * 0.75;
    const a = skin(1, z, 0.53, 0.035);
    const b = skin(1, z + 0.73, 0.53, 0.035);
    g.panel([a, b, [b[0] + 0.24, b[1] + 0.22, z + 0.55],
      [a[0] + 0.36, a[1] + 0.39, z + 0.19]], m.rust);
  }
  for (const [z, direction] of [[-2.25, 1], [0.75, -1]] as const) {
    const a = skin(1, z, 0.05, 0.02);
    const b = skin(1, z, 0.52, 0.02);
    g.panel([a, b, [b[0] + 0.24, b[1] + 0.15, z + direction * 0.21],
      [a[0] + 0.36, a[1] - 0.15, z + direction * 0.36]], m.rust);
  }
}

function buildDeck(g: WreckGeometry, m: WreckMaterials): void {
  for (let i = 0; i < 36; i += 1) {
    const z0 = -9 + i * 0.5;
    const z1 = z0 + 0.485;
    const a = wreckSection(z0);
    const b = wreckSection(z1);
    for (let strip = 0; strip < 8; strip += 1) {
      if (z0 >= -2.5 && z0 < 0.5 && strip >= 3) continue;
      const left = -1 + strip * 0.25 + 0.003;
      const right = left + 0.242;
      g.panel([[a.width * left, a.deck, z0], [b.width * left, b.deck, z1],
        [b.width * right, b.deck, z1], [a.width * right, a.deck, z0]],
      m.timber, PLATE_TINTS[(i + strip * 3) % PLATE_TINTS.length]!);
    }
    for (const side of [-1, 1]) {
      if (side === 1 && z0 >= -2.5 && z0 < 0.5) continue;
      g.beam([side * a.width, a.deck + 0.05, z0],
        [side * b.width, b.deck + 0.05, z1 + 0.015], 0.11, m.iron);
    }
  }
  for (const z of [-2.15, -1.35, -0.55, 0.25]) {
    const { width, deck } = wreckSection(z);
    g.beam([-width + 0.1, deck - 0.11, z], [width - 0.15, deck - 0.24, z], 0.12, m.rust);
  }
  // Broken boards rest on the beams at the edge of the collapsed deck.
  for (let i = 0; i < 5; i += 1) {
    g.box([0.18, 0.06, 1.1 + i * 0.13], [-0.52 + i * 0.24, 0.66 - i * 0.04, -2.1],
      m.timber, [0.14 + i * 0.06, 0.07 * i, 0]);
  }
}

function buildRailPost(g: WreckGeometry, m: WreckMaterials, base: WreckPoint, broken: boolean, index: number): void {
  const [x, y, z] = base;
  const lean = broken ? 0.3 : 0.025 * Math.sin(index * 2.3);
  g.beam(base, [x + lean, y + (broken ? 0.25 : 0.56), z + lean], 0.055, m.iron);
  g.box([0.13, 0.05, 0.13], [x, y + 0.02, z], m.rust);
}

function isDamagedRail(side: number, index: number): boolean {
  return side === 1 && index >= 7 && index <= 11;
}

function buildRails(g: WreckGeometry, m: WreckMaterials): void {
  for (const side of [-1, 1]) {
    for (let i = 0; i < 20; i += 1) {
      const z = -7.5 + i * 0.75;
      const broken = isDamagedRail(side, i);
      if (broken && i !== 7 && i !== 11) continue;
      const a = wreckSection(z);
      const x = side * (a.width - 0.1);
      buildRailPost(g, m, [x, a.deck, z], broken, i);
      if (broken || i === 19 || (side === -1 && i === 16)) continue;
      const b = wreckSection(z + 0.75);
      for (const height of [0.29, 0.56]) {
        g.beam([x, a.deck + height, z], [side * (b.width - 0.1), b.deck + height, z + 0.75], 0.04, m.iron);
      }
    }
  }
}

function buildWear(g: WreckGeometry, m: WreckMaterials): void {
  for (const side of [-1, 1]) {
    // Portholes sit on intact upper plates. Their iron rims cast a small contact shadow.
    for (const z of [-6.5, -5.5, -4.5, 2, 3, 4, 5, 6]) {
      const p = skin(side, z, 0.12, 0.025);
      const rim = new TorusGeometry(0.14, 0.033, 5, 12);
      rim.rotateY(Math.PI / 2);
      rim.translate(...p);
      g.add(rim, m.rust);
      g.cylinder(0.12, 0.12, 0.035, p, m.dark, [0, 0, Math.PI / 2]);
      g.panel([[p[0] + side * 0.02, p[1] - 0.12, z - 0.09],
        [p[0] + side * 0.02, p[1] - 0.12, z + 0.09],
        skin(side, z + 0.015, 0.4, 0.025)], m.rust);
    }
    for (let i = 0; i < 45; i += 1) {
      const z = -7.8 + i * 0.35;
      const depth = 0.63 + 0.06 * Math.sin(i * 1.7);
      const p = skin(side, z, depth, 0.03);
      const radius = 0.07 + (i % 4) * 0.025;
      g.cylinder(radius * 0.6, radius, 0.06, p, i % 4 === 0 ? m.silt : m.growth,
        [0, 0, side * Math.PI / 2]);
    }
  }
}

export function buildWreckHull(g: WreckGeometry, m: WreckMaterials): void {
  buildPlating(g, m);
  buildFrames(g, m);
  buildDeck(g, m);
  buildRails(g, m);
  buildWear(g, m);
}
