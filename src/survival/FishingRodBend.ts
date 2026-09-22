import { BufferGeometry, Matrix3, Matrix4, Mesh, Object3D, Vector3 } from 'three';

interface RodMesh {
  readonly mesh: Mesh;
  readonly original: BufferGeometry;
  readonly geometry: BufferGeometry;
  readonly toRoot: Matrix4;
  readonly fromRoot: Matrix4;
  readonly normalToRoot: Matrix3;
  readonly normalFromRoot: Matrix3;
}

/** Bend the shaft on a circular arc. Preserve the handle and rotate surface normals with it. */
export class FishingRodBend {
  private readonly meshes: RodMesh[] = [];
  private readonly point = new Vector3();
  private readonly normal = new Vector3();
  private readonly target = new Vector3();
  private readonly restTip: Vector3;
  private readonly shaftStart: number;
  private readonly shaftLength: number;
  private angle = 0;
  private directionX = 0;
  private directionY = 1;

  constructor(private readonly root: Object3D, private readonly tip: Object3D) {
    this.restTip = tip.position.clone();
    root.updateWorldMatrix(true, true);
    const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
    let minimumZ = this.restTip.z;
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const original = object.geometry;
      const positions = original.getAttribute('position');
      if (!positions) return;
      const toRoot = new Matrix4().multiplyMatrices(inverseRoot, object.matrixWorld);
      const fromRoot = toRoot.clone().invert();
      const geometry = original.clone();
      for (let i = 0; i < positions.count; i++) {
        this.point.fromBufferAttribute(positions, i).applyMatrix4(toRoot);
        minimumZ = Math.min(minimumZ, this.point.z);
      }
      this.meshes.push({
        mesh: object, original, geometry, toRoot, fromRoot,
        normalToRoot: new Matrix3().getNormalMatrix(toRoot),
        normalFromRoot: new Matrix3().getNormalMatrix(fromRoot),
      });
      object.geometry = geometry;
    });
    this.shaftStart = minimumZ + (this.restTip.z - minimumZ) * 0.25;
    this.shaftLength = Math.max(0.001, this.restTip.z - this.shaftStart);
  }

  update(strain: number, targetWorld: Vector3): void {
    const nextAngle = Math.max(0, Math.min(1, strain)) * 0.8;
    if (nextAngle === 0 && this.angle === 0) return;
    this.angle = nextAngle;
    this.target.copy(targetWorld);
    this.root.worldToLocal(this.target);
    this.target.sub(this.restTip);
    const length = Math.hypot(this.target.x, this.target.y);
    if (length > 1e-6) {
      this.directionX = this.target.x / length;
      this.directionY = this.target.y / length;
    }
    for (const entry of this.meshes) this.deformMesh(entry);
    this.point.copy(this.restTip);
    this.bendPoint(this.point);
    this.tip.position.copy(this.point);
  }

  dispose(): void {
    for (const entry of this.meshes) {
      entry.mesh.geometry = entry.original;
      entry.geometry.dispose();
    }
    this.meshes.length = 0;
    this.tip.position.copy(this.restTip);
  }

  private bendPoint(point: Vector3): number {
    const distance = Math.max(0, point.z - this.shaftStart);
    if (this.angle < 1e-6 || distance === 0) return 0;
    const theta = distance / this.shaftLength * this.angle;
    const radius = this.shaftLength / this.angle;
    const along = point.x * this.directionX + point.y * this.directionY;
    const offset = radius * (1 - Math.cos(theta)) + along * (Math.cos(theta) - 1);
    point.x += this.directionX * offset;
    point.y += this.directionY * offset;
    point.z = this.shaftStart + radius * Math.sin(theta) - along * Math.sin(theta);
    return theta;
  }

  private deformMesh(entry: RodMesh): void {
    const source = entry.original.getAttribute('position');
    const positions = entry.geometry.getAttribute('position');
    const sourceNormals = entry.original.getAttribute('normal');
    const normals = entry.geometry.getAttribute('normal');
    for (let i = 0; i < positions.count; i++) {
      this.point.fromBufferAttribute(source, i).applyMatrix4(entry.toRoot);
      const theta = this.bendPoint(this.point);
      this.point.applyMatrix4(entry.fromRoot);
      positions.setXYZ(i, this.point.x, this.point.y, this.point.z);
      if (!sourceNormals || !normals) continue;
      this.normal.fromBufferAttribute(sourceNormals, i).applyNormalMatrix(entry.normalToRoot);
      const along = this.normal.x * this.directionX + this.normal.y * this.directionY;
      const offset = along * (Math.cos(theta) - 1) + this.normal.z * Math.sin(theta);
      this.normal.z = this.normal.z * Math.cos(theta) - along * Math.sin(theta);
      this.normal.x += this.directionX * offset;
      this.normal.y += this.directionY * offset;
      this.normal.applyNormalMatrix(entry.normalFromRoot);
      normals.setXYZ(i, this.normal.x, this.normal.y, this.normal.z);
    }
    positions.needsUpdate = true;
    if (normals) normals.needsUpdate = true;
    entry.geometry.computeBoundingSphere();
  }
}
