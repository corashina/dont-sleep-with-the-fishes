import { BoxGeometry, SphereGeometry, TorusGeometry } from 'three';
import { WreckGeometry, type WreckPoint } from './WreckGeometry';
import type { WreckMaterials } from './WreckMaterials';
import { wreckSection, wreckSkin } from './WreckHull';

// The anchor chain runs from the bow hawse pipe and lies slack on the sand.
function buildAnchorChain(g: WreckGeometry, m: WreckMaterials): void {
  const hawse = wreckSkin(1, -8.1, 0.08, 0.04);
  g.cylinder(0.11, 0.13, 0.12, hawse, m.rust, [0, 0, Math.PI / 2]);
  const linkCount = 34;
  for (let index = 0; index < linkCount; index += 1) {
    const t = index / (linkCount - 1);
    const drop = Math.min(1, t * 1.6);
    const point: WreckPoint = [
      hawse[0] + 0.25 + t * 1.6,
      hawse[1] - (1 - (1 - drop) * (1 - drop)) * 1.15,
      hawse[2] - 0.1 + t * 2.4,
    ];
    const link = new TorusGeometry(0.07, 0.022, 4, 8);
    link.scale(1, 1.55, 1);
    if (index % 2 === 0) link.rotateY(Math.PI / 2);
    link.rotateX(-0.6 + drop * 0.6);
    link.translate(...point);
    g.add(link, m.rust);
  }
  // The anchor lies half buried where the chain ends.
  const [x, y, z] = [hawse[0] + 2.0, hawse[1] - 1.18, hawse[2] + 2.7];
  g.beam([x, y, z - 0.55], [x, y + 0.08, z + 0.55], 0.1, m.iron);
  g.beam([x - 0.5, y + 0.1, z + 0.5], [x + 0.5, y, z + 0.5], 0.07, m.iron);
  const arms = new TorusGeometry(0.42, 0.06, 5, 12, Math.PI);
  arms.rotateX(Math.PI / 2);
  arms.rotateZ(0.15);
  arms.translate(x, y + 0.02, z - 0.55);
  g.add(arms, m.iron);
}

// Cowl vents turn their mouths toward the old wind.
function buildCowlVent(g: WreckGeometry, m: WreckMaterials, x: number, z: number, turn: number): void {
  const { deck } = wreckSection(z);
  g.cylinder(0.08, 0.09, 0.62, [x, deck + 0.31, z], m.paint);
  const bend = new TorusGeometry(0.13, 0.08, 6, 10, Math.PI / 2);
  bend.rotateY(turn);
  bend.translate(x - Math.cos(turn) * 0.13, deck + 0.62, z + Math.sin(turn) * 0.13);
  g.add(bend, m.paint);
  g.cylinder(0.15, 0.1, 0.12, [
    x - Math.cos(turn) * 0.2, deck + 0.75, z + Math.sin(turn) * 0.2,
  ], m.dark, [0, turn, Math.PI / 2], true);
  g.cylinder(0.12, 0.12, 0.05, [x, deck + 0.03, z], m.rust);
}

// A lifebuoy still hangs on the aft cabin wall, its paint faded.
function buildLifebuoy(g: WreckGeometry, m: WreckMaterials): void {
  const center: WreckPoint = [1.48, 1.2, 4.75];
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const segment = new TorusGeometry(0.22, 0.06, 6, 5, Math.PI / 2);
    segment.rotateZ(quarter * Math.PI / 2 + 0.3);
    segment.rotateY(Math.PI / 2);
    segment.translate(...center);
    g.add(segment, quarter % 2 === 0 ? m.buoy : m.paint);
  }
  g.box([0.04, 0.08, 0.04], [center[0] - 0.02, center[1] + 0.3, center[2]], m.iron);
}

// A searchlight sits on the wheelhouse roof, its glass dark.
function buildSearchlight(g: WreckGeometry, m: WreckMaterials): void {
  const base: WreckPoint = [0.55, 2.13, -3.45];
  g.cylinder(0.07, 0.1, 0.22, [base[0], base[1] + 0.11, base[2]], m.iron);
  g.cylinder(0.17, 0.17, 0.3, [base[0] + 0.05, base[1] + 0.34, base[2]], m.rust, [0, 0, Math.PI / 2 - 0.2]);
  g.cylinder(0.14, 0.14, 0.03, [base[0] + 0.21, base[1] + 0.37, base[2]], m.dark, [0, 0, Math.PI / 2 - 0.2]);
}

// Rivet rows follow the upper strake seams on the near side.
function buildRivets(g: WreckGeometry, m: WreckMaterials): void {
  for (const depth of [0.03, 0.22]) {
    for (let z = -8.4; z <= 8.4; z += 0.19) {
      if (depth > 0.1 && z > -2.4 && z < 0.9) continue;
      g.box([0.035, 0.035, 0.035], wreckSkin(1, z, depth, 0.022), m.iron);
    }
  }
}

// The rudder hangs a little off centre and the propeller has lost one blade.
function buildSternGear(g: WreckGeometry, m: WreckMaterials): void {
  const hub: WreckPoint = [0, -0.92, 9.12];
  g.cylinder(0.06, 0.06, 0.9, [0, hub[1] + 0.04, 8.72], m.iron, [Math.PI / 2 + 0.05, 0, 0]);
  const cap = new SphereGeometry(0.13, 10, 6);
  cap.scale(1, 1, 1.5);
  cap.translate(...hub);
  g.add(cap, m.rust);
  for (let blade = 0; blade < 4; blade += 1) {
    if (blade === 2) {
      g.box([0.1, 0.12, 0.05], [0, hub[1] - 0.14, hub[2]], m.rust, [0, 0, 0.2]);
      continue;
    }
    const geometry = new BoxGeometry(0.26, 0.42, 0.035);
    geometry.translate(0, 0.27, 0);
    geometry.rotateY(0.45);
    geometry.rotateZ(blade * Math.PI / 2 + 0.3);
    geometry.translate(...hub);
    g.add(geometry, m.rust);
  }
  const rudderZ = 9.58;
  g.cylinder(0.05, 0.05, 1.5, [0, -0.45, rudderZ - 0.04], m.iron);
  g.box([0.07, 1.05, 0.62], [0.05, -0.62, rudderZ + 0.27], m.hull, [0, 0.22, 0]);
  for (const y of [-0.2, -0.62, -1.02]) {
    g.box([0.1, 0.06, 0.66], [0.05, y, rudderZ + 0.27], m.iron, [0, 0.22, 0]);
  }
  g.beam([0, -1.25, 8.6], [0, -1.2, rudderZ], 0.09, m.iron);
}

// A stem bar closes the bow, and a timber rubbing strake runs under the deck edge.
function buildStemAndStrake(g: WreckGeometry, m: WreckMaterials): void {
  g.beam(wreckSkin(1, -9, 0, -0.02), wreckSkin(1, -9, 1, -0.02), 0.1, m.iron, 0.14);
  for (const side of [-1, 1]) {
    const runs = side === 1 ? [[-8.8, -2.35], [0.85, 8.8]] : [[-8.8, 8.8]];
    for (const [start, end] of runs) {
      const points: WreckPoint[] = [];
      for (let z = start!; z < end! + 0.01; z += (end! - start!) / Math.ceil((end! - start!) / 0.6)) {
        points.push(wreckSkin(side, z, 0.035, 0.045));
      }
      g.cable(points, 0.05, m.timber);
    }
  }
}

export function buildWreckDetails(g: WreckGeometry, m: WreckMaterials): void {
  buildSternGear(g, m);
  buildStemAndStrake(g, m);
  buildAnchorChain(g, m);
  buildCowlVent(g, m, 0.95, 1.6, 0.4);
  buildCowlVent(g, m, -0.9, -1.2, 2.6);
  buildCowlVent(g, m, 0.7, -6.1, 1.2);
  buildLifebuoy(g, m);
  buildSearchlight(g, m);
  buildRivets(g, m);
}
