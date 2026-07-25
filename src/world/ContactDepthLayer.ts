import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type BufferGeometry,
} from 'three';

export interface ContactAccentSpec {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

export interface ContactDepthLayer {
  readonly root: Group;
  addFootprint(spec: ContactAccentSpec): Mesh;
  addSeam(spec: ContactAccentSpec): Mesh;
  dispose(): void;
}

export function createContactDepthLayer(): ContactDepthLayer {
  const root = new Group();
  root.name = 'contact-depth-layer';

  const footprintGeometry = new PlaneGeometry(1, 1);
  footprintGeometry.rotateX(-Math.PI / 2);
  const seamGeometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({
    color: 0x11181a,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  });

  let disposed = false;
  const add = (geometry: BufferGeometry, spec: ContactAccentSpec): Mesh => {
    if (disposed) throw new Error('Cannot add an accent to a disposed contact-depth layer.');
    const mesh = new Mesh(geometry, material);
    mesh.name = spec.name;
    mesh.position.set(...spec.position);
    mesh.scale.set(...spec.scale);
    if (spec.rotation) mesh.rotation.set(...spec.rotation);
    mesh.renderOrder = 1;
    root.add(mesh);
    return mesh;
  };

  return {
    root,
    addFootprint: (spec) => add(footprintGeometry, spec),
    addSeam: (spec) => add(seamGeometry, spec),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      footprintGeometry.dispose();
      seamGeometry.dispose();
      material.dispose();
    },
  };
}
