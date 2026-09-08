import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export type MenuPlantKind = 'grass' | 'kelp' | 'frond';

export function createMenuPlantGeometry(kind: MenuPlantKind): BufferGeometry {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const height = kind === 'grass' ? 0.46 : kind === 'kelp' ? 1.35 : 0.82;
  // Three vertices across each leaf form a folded midrib.
  const ribbon = (base: Vector3, tip: Vector3, width: number, yaw: number, steps: number): void => {
    const start = vertices.length / 3;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const w = width * Math.pow(Math.sin(Math.PI * t), 0.7) + 0.008 * (1 - t);
      const x = base.x + (tip.x - base.x) * t * t;
      const y = base.y + (tip.y - base.y) * t;
      const z = base.z + (tip.z - base.z) * t * t;
      for (let edge = -1; edge <= 1; edge += 1) {
        vertices.push(x + Math.cos(yaw) * edge * w,
          y + (edge === 0 ? w * 0.17 : 0),
          z + Math.sin(yaw) * edge * w + Math.sin(t * 7) * w * 0.2);
        uvs.push((edge + 1) / 2, y / height);
      }
      if (step === 0) continue;
      const row = start + step * 3;
      for (let edge = 0; edge < 2; edge += 1) {
        indices.push(row + edge - 3, row + edge, row + edge - 2,
          row + edge, row + edge + 1, row + edge - 2);
      }
    }
  };
  if (kind === 'grass' || kind === 'kelp') {
    const leaves = kind === 'grass' ? 5 : 3;
    for (let leaf = 0; leaf < leaves; leaf += 1) {
      const yaw = leaf * 2.4;
      const reach = kind === 'grass' ? 0.24 : 0.32;
      ribbon(new Vector3(Math.cos(yaw) * 0.035, 0, Math.sin(yaw) * 0.035),
        new Vector3(Math.cos(yaw) * reach, height * (0.65 + leaf / leaves * 0.35), Math.sin(yaw) * reach),
        kind === 'grass' ? 0.025 : 0.14, yaw + 0.7, kind === 'grass' ? 3 : 6);
    }
  } else {
    ribbon(new Vector3(), new Vector3(0.12, 0.82, 0.08), 0.016, 0, 5);
    for (let leaf = 0; leaf < 8; leaf += 1) {
      const y = 0.12 + leaf * 0.072;
      const side = leaf % 2 === 0 ? -1 : 1;
      ribbon(new Vector3(y * 0.14, y, y * 0.1),
        new Vector3(y * 0.14 + side * 0.31 * (1 - y * 0.65), y + 0.18, y * 0.1 + 0.08),
        0.055 * (1 - y * 0.45), 0.4, 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
