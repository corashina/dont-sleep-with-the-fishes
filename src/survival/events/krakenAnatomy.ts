import { BufferAttribute, SphereGeometry } from 'three';

// Round scars from old fights with whales. Each entry is x, y, radius on the unit mantle.
const SUCKER_SCARS = [
  [-0.34, 0.52, 0.07], [-0.22, 0.66, 0.05], [0.41, 0.63, 0.06], [0.18, 0.44, 0.045],
  [-0.62, 0.40, 0.055], [0.66, 0.33, 0.05], [0.05, 0.82, 0.06],
] as const;

/** Sculpt folds, scars, and eye recesses into the mantle instead of attaching separate ridges. */
export function createKrakenMantle(): SphereGeometry {
  const geometry = new SphereGeometry(1, 160, 120);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    const front = Math.max(0, z) ** 1.5;
    const crown = Math.max(0, y - 0.18);
    const taper = 1 - Math.max(0, -y) * 0.28;
    let relief = 0;
    let crease = 0;
    for (const side of [-1, 1]) {
      const eyeX = (x - side * 0.50) / 0.17;
      const eyeY = (y - 0.19) / 0.10;
      relief -= Math.exp(-eyeX * eyeX - eyeY * eyeY) * 0.13;
      // Thick brow tissue hangs over each eye socket.
      relief += Math.exp(-eyeX * eyeX * 0.5 - ((y - 0.33) / 0.08) ** 2) * 0.19;
      const orbit = Math.hypot(eyeX * 0.70, eyeY * 0.58);
      const orbitalFold = Math.exp(-((orbit - 1.22) ** 2) / 0.045);
      relief += orbitalFold * 0.045;
      crease += Math.exp(-((orbit - 1.44) ** 2) / 0.025) * 0.6;
      for (let fold = 0; fold < 3; fold++) {
        const path = side * (0.07 + fold * 0.115 + (0.85 - y) * 0.29);
        const distance = (x - path) / (0.038 + fold * 0.005);
        const length = Math.exp(-(((y - 0.56 + fold * 0.035) / 0.26) ** 4));
        const ridge = Math.exp(-distance * distance);
        const valley = Math.exp(-(((distance - side * 1.5) / 0.65) ** 2));
        relief += (ridge * 0.13 - valley * 0.035) * length;
        crease += valley * length * front;
      }
      const cheek = (x - side * 0.61) / 0.15;
      relief += Math.exp(-cheek * cheek - ((y + 0.02) / 0.18) ** 2) * 0.075;
      const cheekMask = Math.exp(-cheek * cheek - ((y + 0.06) / 0.24) ** 2);
      const cheekPleats = Math.sin(y * 52 + Math.abs(x) * 18);
      relief += cheekPleats * cheekMask * 0.022;
      crease += Math.max(0, -cheekPleats) * cheekMask * 0.22;
    }
    const pebbles = Math.max(0, Math.sin(x * 47 + y * 11) * Math.sin(y * 41 - z * 19)) ** 3;
    const papillae = pebbles * 0.026 * Math.max(0, y + 0.15);
    // One healed crease follows the left cheek. Its raised edges remain part of the skin.
    const scarDistance = (x + 0.62 + y * 0.18) / 0.011;
    const scarLength = Math.exp(-(((y + 0.015) / 0.20) ** 4));
    const scar = Math.exp(-scarDistance * scarDistance) * scarLength;
    relief += (Math.exp(-((Math.abs(scarDistance) - 1.7) ** 2)) * 0.016 - scar * 0.023) * scarLength;
    crease += scar * 0.8;
    let scars = 0;
    for (const [scarX, scarY, radius] of SUCKER_SCARS) {
      const ring = Math.hypot(x - scarX, y - scarY) - radius;
      scars += Math.exp(-((ring / 0.011) ** 2)) * front ** 0.3;
    }
    relief -= scars * 0.02;
    crease += scars * 0.9;
    // The sac swells up and back behind the eyes. It leans a little to one side.
    const sac = Math.max(0, Math.min(1, (y - 0.3) / 0.7));
    const lift = sac * sac;
    const wrinkle = Math.sin(y * 23 + Math.sin(x * 5 + z * 3) * 1.6) * 0.018 * sac
      + Math.sin(x * 31 - y * 9) * Math.sin(z * 27 + y * 6) * 0.01 * sac;
    crease += Math.max(0, -wrinkle) * 9 * sac;
    const swell = 1 + wrinkle + papillae;
    positions.setXYZ(index,
      (x * taper * (1 + 0.045 * Math.sin(y * 7 + x * 4)) + crown * 0.045) * (1 - lift * 0.14) * swell + lift * 0.14,
      (y + crown * 0.13 + Math.sin(x * 8 + z * 3) * 0.055 * crown) * swell + lift * 0.85,
      (z * taper + relief * front) * (1 - lift * 0.08) * swell - lift * 0.62,
    );
    const mottle = 0.08 * Math.sin(x * 13 + y * 7) * Math.cos(z * 11 - y * 5);
    const shade = 0.9 - Math.min(0.3, crease * 0.2) - crown * 0.16 + mottle;
    colors.set([shade * 0.98, shade, shade * 0.93], index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
