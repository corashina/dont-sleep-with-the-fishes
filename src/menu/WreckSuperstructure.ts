import { ExtrudeGeometry, Shape, TorusGeometry, Vector3 } from 'three';
import { WreckGeometry, type WreckPoint } from './WreckGeometry';
import type { WreckMaterials } from './WreckMaterials';
import { wreckSection } from './WreckHull';

function buildCabin(g: WreckGeometry, m: WreckMaterials, z: number, width: number,
  length: number, height: number, damaged: boolean): void {
  const floor = 0.82;
  const top = floor + height;
  const half = width / 2;
  const end = length / 2;
  g.box([width, 0.14, length], [0, floor, z], m.rust);
  g.box([width - 0.16, 0.06, length - 0.16], [0, floor + 0.09, z], m.dark);
  // Wall panels stop at the windows; the dark space behind them is a real interior.
  for (const side of [-1, 1]) {
    const x = side * half;
    g.box([0.1, height * 0.43, length], [x, floor + height * 0.23, z], m.paint);
    g.box([0.13, 0.13, length + 0.06], [x, floor + height * 0.46, z], m.rust);
    g.box([0.1, 0.12, length], [x, top - 0.08, z], m.paint);
    for (let i = 0; i <= 3; i += 1) {
      const frameZ = z - end + i * length / 3;
      if (damaged && side === 1 && i === 2) {
        g.beam([x, floor + height * 0.48, frameZ], [x + 0.21, top - 0.22, frameZ + 0.16], 0.08, m.rust);
      } else {
        g.box([0.12, height * 0.52, 0.09], [x, floor + height * 0.72, frameZ], m.paint);
      }
      // Runoff follows window jambs, tapering down the wall.
      g.panel([[x + side * 0.055, floor + height * 0.44, frameZ - 0.055],
        [x + side * 0.055, floor + height * 0.44, frameZ + 0.09],
        [x + side * 0.055, floor + 0.08, frameZ + 0.02]], m.rust);
    }
  }
  for (const side of [-1, 1]) {
    const wallZ = z + side * end;
    g.box([width, height * 0.43, 0.1], [0, floor + height * 0.23, wallZ], m.paint);
    g.box([width, 0.1, 0.12], [0, top - 0.08, wallZ], m.paint);
    for (const x of [-half + 0.06, 0, half - 0.06]) {
      g.box([0.09, height * 0.52, 0.12], [x, floor + height * 0.72, wallZ], m.paint);
    }
  }
  buildCabinRoof(g, m, z, width, length, top, damaged);
  for (const x of [-half + 0.2, 0, half - 0.2]) {
    g.box([0.055, 0.11, length - 0.12], [x, top - 0.13, z], m.iron);
  }
  // Door panel, hinge straps, and a raised handle explain the scale of the cabin.
  g.box([0.035, 0.76, 0.38], [half + 0.07, floor + 0.4, z - end + 0.24], m.iron);
  for (const y of [floor + 0.15, floor + 0.66]) {
    g.box([0.055, 0.055, 0.26], [half + 0.1, y, z - end + 0.24], m.rust);
  }
  g.beam([half + 0.14, floor + 0.4, z - end + 0.36],
    [half + 0.14, floor + 0.53, z - end + 0.36], 0.035, m.paint);
}

function buildCabinRoof(g: WreckGeometry, m: WreckMaterials, z: number, width: number,
  length: number, top: number, damaged: boolean): void {
  const half = width / 2;
  const end = length / 2;
  // Bevels catch the overhead light. A missing roof corner follows the damaged wall.
  const shape = new Shape();
  shape.moveTo(-half - 0.12, -end - 0.12);
  shape.lineTo(half + 0.12, -end - 0.12);
  shape.lineTo(half + 0.12, damaged ? end - 0.6 : end + 0.12);
  if (damaged) {
    shape.lineTo(half - 0.17, end - 0.39);
    shape.lineTo(half - 0.31, end - 0.1);
  }
  shape.lineTo(damaged ? half - 0.52 : half + 0.12, end + 0.12);
  shape.lineTo(-half - 0.12, end + 0.12);
  shape.closePath();
  const roof = new ExtrudeGeometry(shape, {
    depth: 0.08, bevelEnabled: true, bevelThickness: 0.035,
    bevelSize: 0.045, bevelSegments: 1, steps: 1,
  });
  roof.rotateX(Math.PI / 2);
  roof.translate(0, top + 0.08, z);
  g.add(roof, m.silt);
}

function buildFunnel(g: WreckGeometry, m: WreckMaterials, z: number, lean: number): void {
  const base: WreckPoint = [0, 0.92, z];
  const local = (x: number, y: number, offsetZ: number): WreckPoint => {
    const point = new Vector3(x, y, offsetZ).applyAxisAngle(new Vector3(0, 0, 1), lean);
    return [point.x + base[0], point.y + base[1], point.z + base[2]];
  };
  g.cylinder(0.63, 0.68, 0.19, base, m.iron);
  g.cylinder(0.43, 0.54, 1.75, local(0, 0.87, 0), m.rust, [0, 0, lean], true);
  // Recessed inner wall and bottom leave a visible open mouth.
  g.cylinder(0.385, 0.39, 0.7, local(0, 1.38, 0), m.dark, [0, 0, lean], true);
  g.cylinder(0.39, 0.39, 0.025, local(0, 1.02, 0), m.dark, [0, 0, lean]);
  for (const y of [0.18, 0.78, 1.72]) {
    const radius = y > 1 ? 0.435 : y > 0.5 ? 0.49 : 0.53;
    const ring = new TorusGeometry(radius, 0.042, 5, 16);
    ring.rotateX(Math.PI / 2);
    ring.rotateZ(lean);
    ring.translate(...local(0, y, 0));
    g.add(ring, m.iron);
  }
  for (const angle of [0.4, 1.5, 2.4, 3.6, 4.8, 5.6]) {
    const x = Math.cos(angle);
    const dz = Math.sin(angle);
    g.panel([local(x * 0.47, 1.25, dz * 0.47), local(x * 0.49 + 0.06, 1.25, dz * 0.49),
      local(x * 0.535, 0.23, dz * 0.535)], m.dark, 0xb7b09a);
  }
  for (const side of [-1, 1]) {
    const foot: WreckPoint = [side * 1.15, 0.8, z + 0.38];
    g.cable([local(side * 0.43, 1.15, 0), [side * 0.76, 1.07, z + 0.2], foot], 0.018, m.rope);
    g.box([0.16, 0.06, 0.2], foot, m.rust);
  }
}

function buildRigging(g: WreckGeometry, m: WreckMaterials): void {
  const foot: WreckPoint = [0, 0.8, -5];
  const head: WreckPoint = [0.82, 4.75, -5.22];
  g.cylinder(0.26, 0.3, 0.2, foot, m.rust);
  g.beam(foot, head, 0.13, m.iron);
  g.beam([-1.18, 3.9, -5.17], [2.04, 3.5, -5.17], 0.09, m.iron);
  g.cable([head, [-0.32, 2.4, -5.15], [-1.85, 0.86, -5.4]], 0.018, m.rope);
  g.cable([head, [0.24, 2.14, -7.08], [0, 0.95, -8.4]], 0.02, m.rope);
  g.cable([[2.04, 3.5, -5.17], [1.52, 2.35, -5.2], [1.76, 1.05, -4.9]], 0.018, m.rope);
  // The snapped stay hangs from its last attachment, clear of the open deck.
  g.cable([head, [0.95, 3.72, -4.1], [1.35, 2.28, -3.1]], 0.018, m.rope);
  g.beam([0.4, 0.89, 5.9], [1.44, 1.2, 7.48], 0.11, m.iron);
  g.cable([[1.44, 1.2, 7.48], [0.7, 0.9, 6.72], [-0.4, 0.87, 6.1]], 0.025, m.rope);
}

function buildFittings(g: WreckGeometry, m: WreckMaterials): void {
  // Bow capstan, bollards, and their mounting plates.
  for (const z of [-7.3, 6.8]) {
    const { deck } = wreckSection(z);
    g.box([0.95, 0.09, 0.75], [0, deck + 0.05, z], m.rust);
    g.cylinder(0.26, 0.32, 0.43, [0, deck + 0.28, z], m.iron);
    g.cylinder(0.34, 0.34, 0.08, [0, deck + 0.51, z], m.rust);
    for (const side of [-1, 1]) {
      g.cylinder(0.09, 0.12, 0.25, [side * 0.92, deck + 0.15, z + 0.2], m.iron);
      g.box([0.31, 0.065, 0.14], [side * 0.92, deck + 0.28, z + 0.2], m.iron);
    }
  }
  // A ladder stands against the aft cabin and reaches the roof edge.
  for (const z of [3.65, 4.05]) g.beam([1.8, 0.82, z], [1.5, 2.4, z], 0.045, m.iron);
  for (let step = 0; step < 7; step += 1) {
    const t = step / 7;
    g.beam([1.8 - t * 0.3, 0.9 + t * 1.5, 3.65], [1.8 - t * 0.3, 0.9 + t * 1.5, 4.05], 0.045, m.rust);
  }
  // Local sediment and small weed tufts collect along fittings and the cabin foot.
  for (const z of [-7.4, -3.9, -3.1, 3.5, 4.4, 5.3, 6.9]) {
    const section = wreckSection(z);
    for (let i = 0; i < 3; i += 1) {
      const x = Math.min(1.57, section.width - 0.36) + i * 0.1;
      const y = section.deck + 0.045;
      g.box([0.23, 0.025, 0.3], [x, y, z], m.silt, [0, i * 0.6, 0]);
      g.panel([[x, y, z], [x + 0.065, y, z + 0.02],
        [x + 0.1, y + 0.24 + i * 0.07, z + 0.05], [x + 0.03, y + 0.19, z]], m.growth);
    }
  }
  // Raised cargo-hatch frame with two displaced covers on the stern deck.
  for (const x of [-0.56, 0.56]) g.box([0.08, 0.17, 0.95], [x, 0.9, 6], m.rust);
  for (const z of [5.53, 6.47]) g.box([1.2, 0.17, 0.08], [0, 0.9, z], m.rust);
  g.box([1.04, 0.04, 0.84], [0, 0.78, 6], m.dark);
  g.box([0.52, 0.07, 0.86], [-0.33, 1.02, 6], m.timber, [0, 0.13, 0.12]);
}

export function buildWreckSuperstructure(g: WreckGeometry, m: WreckMaterials): void {
  buildCabin(g, m, -3.75, 2.3, 2.2, 1.15, true);
  buildCabin(g, m, 4.15, 2.8, 2.6, 1.4, false);
  buildFunnel(g, m, 0.95, 0.08);
  buildFunnel(g, m, 2.15, -0.16);
  buildRigging(g, m);
  buildFittings(g, m);
}
