import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh,
  LatheGeometry, Matrix4, MeshStandardMaterial, Object3D, Raycaster, Vector2, Vector3,
} from 'three';
import { menuSandChannelContains, menuSeabedHeight } from './MenuSceneLayout';
import type { MenuSceneComponent } from './MenuSceneComponent';

const SHELL_BEDS = [
  [-3.4, 4.65], [-1.35, 5.45], [1.45, 5.1], [3.55, 4.1],
  [-5.0, 2.4], [-1.45, 1.4], [1.5, 1.25], [5.7, -1.8],
  [-6.6, -0.9], [-3.9, -4.7], [4.4, -6.1], [8.6, -5.0],
  [-7.0, -7.4], [-10.0, -9.5], [10.7, -11.0], [6.8, -10.5],
] as const;

function createShell(): BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  for (let ring = 0; ring <= 4; ring += 1) {
    const radius = ring / 4;
    for (let rib = 0; rib <= 16; rib += 1) {
      const angle = -1.25 + rib / 16 * 2.5;
      const ridge = rib % 2 === 0 ? 1 : 0.92;
      vertices.push(Math.sin(angle) * radius * 0.21,
        Math.sin(radius * Math.PI) * 0.065 * ridge + radius * 0.012,
        Math.cos(angle) * radius * 0.28);
      const shade = (rib % 2 === 0 ? 0.52 : 0.36) - radius * 0.07;
      colors.push(shade, shade * 0.91, shade * 0.72);
      if (ring === 0 || rib === 0) continue;
      const n = ring * 17 + rib;
      indices.push(n - 18, n - 1, n, n - 18, n, n - 17);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createTube(sponge: boolean): BufferGeometry {
  // The profile folds into a dark cavity. The opening has real thickness.
  const points = sponge
    ? [[0.09, 0], [0.12, 0.12], [0.1, 0.31], [0.13, 0.39], [0.09, 0.4], [0.057, 0.16], [0, 0.14]]
    : [[0.13, 0], [0.11, 0.05], [0.055, 0.14], [0.033, 0.14], [0.025, 0.065], [0, 0.06]];
  const geometry = new LatheGeometry(points.map(([x, y]) => new Vector2(x!, y!)), sponge ? 9 : 7);
  const position = geometry.getAttribute('position');
  const colors = new Float32BufferAttribute(position.count * 3, 3);
  for (let index = 0; index < position.count; index += 1) {
    const inside = index % points.length >= (sponge ? 4 : 3);
    const y = position.getY(index);
    const wave = Math.sin(position.getX(index) * 37 + position.getZ(index) * 21);
    position.setX(index, position.getX(index) + y * y * 0.28);
    if (sponge) position.setY(index, y * (1 + wave * 0.07));
    const shade = inside ? 0.1 : 0.54 + wave * 0.06;
    colors.setXYZ(index, shade, shade * (sponge ? 0.78 : 0.96), shade * (sponge ? 0.52 : 0.85));
  }
  geometry.setAttribute('color', colors);
  geometry.computeVertexNormals();
  return geometry;
}

export class MenuSeabedLife implements MenuSceneComponent {
  readonly root = new Group();
  private readonly material = new MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 1, side: DoubleSide,
  });
  private disposed = false;

  constructor(stones: InstancedMesh) {
    this.root.name = 'menu:seabed-life';
    const shells = new InstancedMesh(createShell(), this.material, SHELL_BEDS.length * 3);
    shells.name = 'menu:shell-beds';
    const transform = new Object3D();
    const tint = new Color();
    let count = 0;
    for (let bed = 0; bed < SHELL_BEDS.length; bed += 1) {
      const [cx, cz] = SHELL_BEDS[bed]!;
      for (let index = 0; index < 3; index += 1) {
        const angle = index * 2.4 + bed;
        const radius = Math.sqrt((index + 0.4) / 3) * 0.9;
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        if (menuSandChannelContains(x, z, 0.15)) continue;
        transform.position.set(x, menuSeabedHeight(x, z) - 0.005, z);
        transform.rotation.set(0.05 * (index % 3), angle, 0.04);
        transform.scale.setScalar(0.5 + (index % 4) * 0.2);
        transform.updateMatrix();
        shells.setMatrixAt(count, transform.matrix);
        tint.set(index % 3 === 0 ? 0x708580 : 0xffffff);
        shells.setColorAt(count, tint);
        count += 1;
      }
    }
    shells.count = count;

    const barnacles = new InstancedMesh(createTube(false), this.material, 72);
    const sponges = new InstancedMesh(createTube(true), this.material, 24);
    barnacles.name = 'menu:barnacle-colonies';
    sponges.name = 'menu:sponge-colonies';
    barnacles.count = 0;
    sponges.count = 0;
    const matrix = new Matrix4();
    const point = new Vector3();
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
    stones.updateMatrixWorld(true);
    for (let index = 0; index < stones.count && sponges.count < 24; index += 1) {
      stones.getMatrixAt(index, matrix);
      point.setFromMatrixPosition(matrix).applyMatrix4(stones.matrixWorld);
      if (point.z < -12 || point.z > 4.5) continue;
      // Query the actual stone surface once during construction.
      ray.ray.origin.set(point.x, 8, point.z);
      const hit = ray.intersectObject(stones, false)[0];
      if (!hit) continue;
      for (let member = 0; member < 3; member += 1) {
        const angle = member * 2.4 + index;
        transform.position.set(hit.point.x + Math.cos(angle) * 0.035,
          hit.point.y - 0.025, hit.point.z + Math.sin(angle) * 0.035);
        transform.rotation.set(0, angle, 0);
        transform.scale.setScalar(0.42 + member * 0.13);
        transform.updateMatrix();
        barnacles.setMatrixAt(barnacles.count++, transform.matrix);
      }
      // Small sponges grow beside the stone, rooted in sediment.
      const x = point.x + 0.28;
      const z = point.z - 0.12;
      transform.position.set(x, menuSeabedHeight(x, z) - 0.025, z);
      transform.rotation.set(0, index * 1.7, 0.08);
      transform.scale.setScalar(0.55 + index % 3 * 0.13);
      transform.updateMatrix();
      sponges.setMatrixAt(sponges.count++, transform.matrix);
    }
    for (const batch of [shells, barnacles, sponges]) {
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      batch.updateMatrix();
      batch.matrixAutoUpdate = false;
      this.root.add(batch);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const child of this.root.children) {
      const batch = child as InstancedMesh;
      batch.dispose();
      batch.geometry.dispose();
    }
    this.material.dispose();
  }
}
