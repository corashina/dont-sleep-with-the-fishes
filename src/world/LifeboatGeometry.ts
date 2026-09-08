import {
  BufferGeometry,
  type CatmullRomCurve3,
  Float32BufferAttribute,
} from 'three';

/** Sweep a bevelled timber section around the boat, with grain along its length. */
export function createLifeboatRailGeometry(
  curve: CatmullRomCurve3,
  width: number,
  height: number,
  grainBand: number,
): BufferGeometry {
  const bevel = Math.min(width, height) * 0.16;
  const x = width / 2;
  const y = height / 2;
  const section = [
    [-x + bevel, -y], [x - bevel, -y],
    [x, -y + bevel], [x, y - bevel],
    [x - bevel, y], [-x + bevel, y],
    [-x, y - bevel], [-x, -y + bevel],
  ] as const;
  const segments = 128;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const length = curve.getLength();
  for (let ring = 0; ring <= segments; ring += 1) {
    const t = ring / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const inverseLength = 1 / Math.hypot(tangent.x, tangent.z);
    const normalX = tangent.z * inverseLength;
    const normalZ = -tangent.x * inverseLength;
    for (const [side, up] of section) {
      positions.push(point.x + normalX * side, point.y + up, point.z + normalZ * side);
      // Each timber uses the interior of one photographed plank, excluding its seams.
      uvs.push(
        t * length / 2.8,
        grainBand + (up / height + 0.5) * 0.065 + (side / width + 0.5) * 0.02,
      );
      const upperEdge = Math.max(0, up / height * 2);
      const lowerEdge = Math.max(0, -up / height * 2);
      const contactWear = upperEdge ** 4;
      const wetBase = Math.max(0, Math.min(1, (-point.y - up + 0.05) / 0.45));
      const timberVariation = 0.035 * Math.sin(point.z * 2.4 + point.x * 1.7);
      const value = 1 + contactWear * 0.24 - lowerEdge ** 4 * 0.2 - wetBase * 0.17 + timberVariation;
      colors.push(value, value * (1 - wetBase * 0.025), value * (1 - wetBase * 0.035));
    }
    if (ring === segments) continue;
    for (let corner = 0; corner < section.length; corner += 1) {
      const a = ring * section.length + corner;
      const b = ring * section.length + (corner + 1) % section.length;
      const c = b + section.length;
      const d = a + section.length;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Weld the shading at the closing ring without joining the UV seam.
  const normals = geometry.getAttribute('normal');
  for (let corner = 0; corner < section.length; corner += 1) {
    const last = segments * section.length + corner;
    const nx = normals.getX(corner) + normals.getX(last);
    const ny = normals.getY(corner) + normals.getY(last);
    const nz = normals.getZ(corner) + normals.getZ(last);
    const scale = 1 / Math.hypot(nx, ny, nz);
    normals.setXYZ(corner, nx * scale, ny * scale, nz * scale);
    normals.setXYZ(last, nx * scale, ny * scale, nz * scale);
  }
  return geometry;
}

export function mapLifeboatWoodGrain(
  geometry: BufferGeometry,
  lengthAxis: 'x' | 'y' | 'z',
  width: number,
  band: number,
  center = 0,
): void {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const along = lengthAxis === 'x' ? positions.getX(index)
      : lengthAxis === 'y' ? positions.getY(index) : positions.getZ(index);
    const across = lengthAxis === 'x' ? positions.getZ(index) : positions.getX(index);
    uvs.setXY(index, along / 2.8 + band * 3, band + ((across - center) / width + 0.5) * 0.085);
    const edge = Math.min(1, Math.abs((across - center) / width) * 2);
    const top = Math.max(0, normals.getY(index));
    const edgeWear = edge ** 8 * top;
    const underside = Math.max(0, -normals.getY(index));
    const variation = 0.04 * Math.sin(band * 41);
    const value = 0.97 + variation + edgeWear * 0.22 - underside * 0.15;
    colors.set([value, value * (1 + edgeWear * 0.015), value * (1 + edgeWear * 0.025)], index * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}
