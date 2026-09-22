import { BufferAttribute, SphereGeometry } from 'three';

/** Sculpt folds and eye recesses into the mantle instead of attaching separate ridges. */
export function createKrakenMantle(): SphereGeometry {
  const geometry = new SphereGeometry(1, 128, 96);
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
      relief -= Math.exp(-eyeX * eyeX - eyeY * eyeY) * 0.11;
      // Thick upper tissue grows from the mantle into the eye socket.
      relief += Math.exp(-eyeX * eyeX * 0.55 - ((y - 0.33) / 0.075) ** 2) * 0.14;
      const orbit = Math.hypot(eyeX * 0.70, eyeY * 0.58);
      const orbitalFold = Math.exp(-((orbit - 1.22) ** 2) / 0.045);
      relief += orbitalFold * 0.035;
      crease += Math.exp(-((orbit - 1.44) ** 2) / 0.025) * 0.48;
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
    const papillae = pebbles * 0.022 * Math.max(0, y + 0.15);
    // One healed crease follows the left cheek. Its raised edges remain part of the skin.
    const scarDistance = (x + 0.62 + y * 0.18) / 0.011;
    const scarLength = Math.exp(-(((y + 0.015) / 0.20) ** 4));
    const scar = Math.exp(-scarDistance * scarDistance) * scarLength;
    relief += (Math.exp(-((Math.abs(scarDistance) - 1.7) ** 2)) * 0.016 - scar * 0.023) * scarLength;
    crease += scar * 0.8;
    positions.setXYZ(index,
      x * taper * (1 + 0.045 * Math.sin(y * 7 + x * 4)) + crown * 0.045,
      y + crown * 0.13 + Math.sin(x * 8 + z * 3) * 0.055 * crown + papillae * y,
      z * taper + relief * front + papillae * z,
    );
    const shade = 0.92 - Math.min(0.23, crease * 0.17);
    colors.set([shade * 0.96, shade, shade * 0.94], index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
