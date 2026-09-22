import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, DynamicDrawUsage, Group,
  InstancedMesh, Mesh, Object3D, Vector3, type Material,
} from 'three';

const SIDES = 10;
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
    const indices: number[] = [];
    for (let ring = 0; ring <= rings; ring++) {
      for (let side = 0; side <= SIDES; side++) {
        const index = ring * (SIDES + 1) + side;
        const shade = 0.72 + 0.16 * Math.sin(ring * 0.71 + side * 1.3)
          + 0.1 * Math.cos(ring * 0.29 - side);
        colors.set([shade * 0.85, shade, shade * 0.96], index * 3);
        if (ring < rings && side < SIDES) {
          const next = index + SIDES + 1;
          indices.push(index, index + 1, next, next, index + 1, next + 1);
        }
      }
    }
    this.geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.geometry.setIndex(indices);
    const mesh = new Mesh(this.geometry, skin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.cups = new InstancedMesh(suckerGeometry, suckerMaterial, 28);
    this.cups.instanceMatrix.setUsage(DynamicDrawUsage);
    this.cups.frustumCulled = false;
    this.root.add(mesh, this.cups);
  }

  update(): void {
    for (let ring = 0; ring <= this.rings; ring++) {
      const t = ring / this.rings;
      this.sampleFrame(t);
      const radius = this.radiusAt(t);
      for (let side = 0; side <= SIDES; side++) {
        const angle = side / SIDES * Math.PI * 2;
        this.offset.copy(this.normal).multiplyScalar(Math.cos(angle))
          .addScaledVector(this.across, Math.sin(angle));
        const index = ring * (SIDES + 1) + side;
        this.normals.setXYZ(index, this.offset.x, this.offset.y, this.offset.z);
        this.offset.multiplyScalar(radius).add(this.center);
        this.positions.setXYZ(index, this.offset.x, this.offset.y, this.offset.z);
      }
    }
    this.positions.needsUpdate = true;
    this.normals.needsUpdate = true;
    for (let row = 0; row < 14; row++) {
      const t = 0.10 + row * 0.064;
      this.sampleFrame(t);
      const radius = this.radiusAt(t);
      for (let lane = 0; lane < 2; lane++) {
        this.cup.position.copy(this.center).addScaledVector(this.normal, radius * 0.94)
          .addScaledVector(this.across, (lane * 2 - 1) * radius * 0.28);
        this.cup.quaternion.setFromUnitVectors(FRONT, this.normal);
        this.cup.scale.setScalar(radius * 0.8);
        this.cup.updateMatrix();
        this.cups.setMatrixAt(row * 2 + lane, this.cup.matrix);
      }
    }
    this.cups.instanceMatrix.needsUpdate = true;
  }

  private radiusAt(t: number): number {
    const tip = 0.024 * (1 - Math.max(0, (t - 0.9) / 0.1) * 0.8);
    return tip + this.radius * Math.pow(Math.max(0, 1 - t / this.taperEnd), 1.35);
  }

  private sampleFrame(t: number): void {
    this.curve.getPoint(t, this.center);
    this.curve.getTangent(t, this.tangent).normalize();
    this.normal.set(0, 0, 1);
    if (Math.abs(this.tangent.z) > 0.95) this.normal.set(0, 1, 0);
    this.normal.addScaledVector(this.tangent, -this.normal.dot(this.tangent)).normalize();
    this.across.crossVectors(this.tangent, this.normal).normalize();
  }

  dispose(): void {
    this.geometry.dispose();
    this.cups.dispose();
    this.root.clear();
  }
}
