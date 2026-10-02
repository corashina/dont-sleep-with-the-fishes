import { describe, expect, it } from 'vitest';
import {
  Bone, BufferGeometry, Float32BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute,
  MeshBasicMaterial, Skeleton, SkinnedMesh, Uint8BufferAttribute, Vector3,
} from 'three';
import { SkinnedVertexSampler } from '../src/rendering/SkinnedVertexSampler';

describe('SkinnedVertexSampler', () => {
  it.each([false, true])('matches Three across poses with relative morph targets: %s', relative => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([1, 2, 3, -2, 0, 1, 0, -1, 2], 3));
    const indices = new InterleavedBuffer(new Float32Array([
      9, 0, 1, 0, 0, 9, 1, 0, 0, 0, 9, 0, 1, 0, 0,
    ]), 5);
    geometry.setAttribute('skinIndex', new InterleavedBufferAttribute(indices, 4, 1));
    geometry.setAttribute('skinWeight', new Uint8BufferAttribute([127, 128, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0], 4, true));
    geometry.morphAttributes.position = [new Float32BufferAttribute([2, 1, 4, -1, 1, 2, 1, -2, 3], 3)];
    geometry.morphTargetsRelative = relative;
    const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
    const root = new Bone();
    const child = new Bone();
    child.position.set(0.2, 0.4, -0.1);
    root.add(child);
    mesh.add(root);
    mesh.position.set(2, -1, 3);
    mesh.rotation.set(0.1, 0.3, -0.2);
    mesh.updateMatrixWorld(true);
    mesh.bind(new Skeleton([root, child]));
    const sampler = new SkinnedVertexSampler(mesh);
    const expected = new Vector3();
    const actual = new Vector3();
    for (let pose = 0; pose < 12; pose++) {
      root.rotation.y = pose * 0.1;
      child.rotation.set(pose * -0.07, pose * 0.03, pose * 0.12);
      child.scale.set(1 + pose * 0.02, 1, 1 - pose * 0.01);
      mesh.morphTargetInfluences![0] = pose / 11;
      mesh.position.x += 0.05;
      mesh.updateMatrixWorld(true);
      sampler.prepare();
      for (let vertex = 0; vertex < 3; vertex++) {
        mesh.getVertexPosition(vertex, expected);
        expect(sampler.getVertexPosition(vertex, actual)).toBe(actual);
        expect(actual.toArray()).toEqual(expected.toArray());
      }
    }
    geometry.dispose();
    mesh.material.dispose();
  });
});
