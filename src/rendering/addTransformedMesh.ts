import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
} from 'three';

export type VectorTuple = readonly [number, number, number];

export function addTransformedMesh(
  parent: Group,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  position: VectorTuple = [0, 0, 0],
  rotation: VectorTuple = [0, 0, 0],
  scale: VectorTuple = [1, 1, 1],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}
