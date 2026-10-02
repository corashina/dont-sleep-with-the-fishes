import { Matrix4, Mesh, SkinnedMesh, Vector3 } from 'three';

/** Samples one current pose without rebuilding bone matrices for each vertex. */
export class SkinnedVertexSampler {
  private readonly boneMatrices: Matrix4[];
  private readonly base = new Vector3();
  private readonly weighted = new Vector3();

  constructor(private readonly mesh: SkinnedMesh) {
    this.boneMatrices = mesh.skeleton.bones.map(() => new Matrix4());
  }

  /** Call after world matrices update, before sampling this pose. */
  prepare(): void {
    const { bones, boneInverses } = this.mesh.skeleton;
    for (let index = 0; index < bones.length; index++) {
      this.boneMatrices[index]!.multiplyMatrices(bones[index]!.matrixWorld, boneInverses[index]!);
    }
  }

  getVertexPosition(index: number, target: Vector3): Vector3 {
    // Keep Three's morph target handling before applying the current skin pose.
    Mesh.prototype.getVertexPosition.call(this.mesh, index, target);
    const indices = this.mesh.geometry.getAttribute('skinIndex');
    const weights = this.mesh.geometry.getAttribute('skinWeight');
    this.base.copy(target).applyMatrix4(this.mesh.bindMatrix);
    target.set(0, 0, 0);
    for (let influence = 0; influence < 4; influence++) {
      const weight = weights.getComponent(index, influence);
      if (weight === 0) continue;
      this.weighted.copy(this.base).applyMatrix4(this.boneMatrices[indices.getComponent(index, influence)]!);
      target.addScaledVector(this.weighted, weight);
    }
    return target.applyMatrix4(this.mesh.bindMatrixInverse);
  }
}
