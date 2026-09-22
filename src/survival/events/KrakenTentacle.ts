import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, DynamicDrawUsage, Group,
  InstancedMesh, Mesh, Object3D, Vector3, type Material,
} from 'three';

const SIDES = 24;
const SUCKER_ROWS = 24;
const FRONT = new Vector3(0, 0, 1);

/** Fixed buffers follow a deforming centreline. No geometry is rebuilt during animation. */
export class KrakenTentacle {
  readonly root = new Group();
  readonly points: Vector3[];
  private readonly curve: CatmullRomCurve3;
  private readonly geometry = new BufferGeometry();
  private readonly positions: BufferAttribute;
  private readonly normals: BufferAttribute;
  private readonly cups: InstancedMesh;
  private readonly cup = new Object3D();
  private readonly center = new Vector3();
  private readonly tangent = new Vector3();
  private readonly normal = new Vector3();
  private readonly across = new Vector3();
  private readonly offset = new Vector3();
  private readonly cupNormal = new Vector3();
  private frameT = -1;

  constructor(pointCount: number, private readonly rings: number, private readonly radius: number,
    skin: Material, suckerGeometry: BufferGeometry, suckerMaterial: Material,
    private readonly taperEnd = 1) {
    this.points = Array.from({ length: pointCount }, () => new Vector3());
    this.curve = new CatmullRomCurve3(this.points);
    const count = (rings + 1) * (SIDES + 1);
    this.positions = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.normals = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setAttribute('normal', this.normals);
    const colors = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const indices: number[] = [];
    for (let ring = 0; ring <= rings; ring++) {
      for (let side = 0; side <= SIDES; side++) {
        const index = ring * (SIDES + 1) + side;
        const angle = side / SIDES * Math.PI * 2;
        uvs[index * 2] = side / SIDES;
        uvs[index * 2 + 1] = ring / rings * 6;
        const underside = Math.max(0, Math.cos(angle)) ** 4;
        const shade = 0.69 + 0.08 * Math.sin(ring * 0.37 + Math.sin(angle) * 2)
          + 0.05 * Math.cos(ring * 0.19 - Math.cos(angle) * 3);
        colors.set([shade * 0.85 + underside * 0.25, shade + underside * 0.16,
          shade * 0.96 + underside * 0.12], index * 3);
        if (ring < rings && side < SIDES) {
          const next = index + SIDES + 1;
          indices.push(index, index + 1, next, next, index + 1, next + 1);
        }
      }
    }
    this.geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
    const mesh = new Mesh(this.geometry, skin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.cups = new InstancedMesh(suckerGeometry, suckerMaterial, SUCKER_ROWS * 2);
    this.cups.instanceMatrix.setUsage(DynamicDrawUsage);
    this.cups.frustumCulled = false;
    this.root.add(mesh, this.cups);
  }

  update(): void {
    this.frameT = -1;
    for (let ring = 0; ring <= this.rings; ring++) {
      const t = ring / this.rings;
      this.sampleFrame(t);
      const radius = this.radiusAt(t);
      for (let side = 0; side <= SIDES; side++) {
        const angle = side / SIDES * Math.PI * 2;
        const depth = Math.cos(angle);
        const width = Math.sin(angle);
        this.offset.copy(this.normal).multiplyScalar(depth / 0.82)
          .addScaledVector(this.across, width / 1.06).normalize();
        const index = ring * (SIDES + 1) + side;
        this.normals.setXYZ(index, this.offset.x, this.offset.y, this.offset.z);
        this.offset.copy(this.normal).multiplyScalar(depth * radius * 0.82)
          .addScaledVector(this.across, width * radius * 1.06).add(this.center);
        this.positions.setXYZ(index, this.offset.x, this.offset.y, this.offset.z);
      }
    }
    this.positions.needsUpdate = true;
    this.normals.needsUpdate = true;
    for (let row = 0; row < SUCKER_ROWS; row++) {
      const t = 0.08 + row / (SUCKER_ROWS - 1) * 0.85;
      this.sampleFrame(t, true);
      const radius = this.radiusAt(t);
      for (let lane = 0; lane < 2; lane++) {
        const side = lane * 2 - 1;
        this.cup.position.copy(this.center).addScaledVector(this.normal, radius * 0.77)
          .addScaledVector(this.across, side * radius * 0.38);
        this.cupNormal.copy(this.normal).multiplyScalar(0.93 / 0.82)
          .addScaledVector(this.across, side * 0.36 / 1.06).normalize();
        this.cup.quaternion.setFromUnitVectors(FRONT, this.cupNormal);
        const size = radius * (1.02 + Math.sin(row * 1.7 + lane) * 0.09);
        this.cup.scale.set(size * (1 + Math.sin(row * 2.3) * 0.06), size, size * 0.8);
        this.cup.updateMatrix();
        this.cups.setMatrixAt(row * 2 + lane, this.cup.matrix);
      }
    }
    this.cups.instanceMatrix.needsUpdate = true;
  }

  private radiusAt(t: number): number {
    const tip = 0.024 * (1 - Math.max(0, (t - 0.9) / 0.1) * 0.8);
    const muscle = 1 + Math.sin(t * Math.PI * 7) * Math.sin(t * Math.PI) * 0.055;
    return tip + this.radius * Math.pow(Math.max(0, 1 - t / this.taperEnd), 1.35) * muscle;
  }

  private sampleFrame(t: number, fromSurface = false): void {
    this.curve.getPoint(t, this.center);
    this.curve.getTangent(t, this.tangent).normalize();
    // Transport the underside along the curve instead of flipping at steep bends.
    if (fromSurface) {
      const ring = t * this.rings;
      const lower = Math.floor(ring) * (SIDES + 1);
      const upper = Math.min(this.rings, Math.floor(ring) + 1) * (SIDES + 1);
      this.normal.fromBufferAttribute(this.normals, lower);
      this.offset.fromBufferAttribute(this.normals, upper);
      this.normal.lerp(this.offset, ring - Math.floor(ring));
    } else if (this.frameT < 0 || t < this.frameT) {
      this.normal.set(0, 0, 1);
      if (Math.abs(this.tangent.z) > 0.95) this.normal.set(0, 1, 0);
    }
    this.normal.addScaledVector(this.tangent, -this.normal.dot(this.tangent)).normalize();
    this.across.crossVectors(this.tangent, this.normal).normalize();
    this.frameT = t;
  }

  dispose(): void {
    this.geometry.dispose();
    this.cups.dispose();
    this.root.clear();
  }
}
