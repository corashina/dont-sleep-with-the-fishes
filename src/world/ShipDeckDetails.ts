import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  TorusGeometry,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import type { ShipDeckDetailKind, ShipDeckDetailSpec } from './ShipLayout';
import type { ShipMaterials } from './ShipMaterials';

export interface ShipDeckDetailsBuild {
  readonly root: Group;
  readonly colliders: CollisionBox[];
  disposeGeometry(): void;
}

interface DetailGeometry {
  readonly box: BoxGeometry;
  readonly cylinder: CylinderGeometry;
  readonly torus: TorusGeometry;
  readonly owned: ReadonlySet<BufferGeometry>;
}

function createDetailGeometry(): DetailGeometry {
  const box = new BoxGeometry(1, 1, 1);
  const cylinder = new CylinderGeometry(0.5, 0.5, 1, 12);
  const torus = new TorusGeometry(0.5, 0.1, 10, 24);
  return { box, cylinder, torus, owned: new Set([box, cylinder, torus]) };
}

function addPart(
  parent: Group,
  geometry: BufferGeometry,
  material: Material,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...size);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBarrel(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.cylinder, materials.crewFloor, 'barrel-body', [0.9, 1.15, 0.9], [0, 0.575, 0]);
  addPart(root, geometry.cylinder, materials.darkMetal, 'barrel-band-lower', [0.96, 0.09, 0.96], [0, 0.27, 0]);
  addPart(root, geometry.cylinder, materials.darkMetal, 'barrel-band-upper', [0.96, 0.09, 0.96], [0, 0.88, 0]);
}

function addRopeCoil(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.torus, materials.rope, 'rope-coil', [1.1, 1.1, 0.55], [0, 0.07, 0], [Math.PI / 2, 0, 0]);
}

function addLifeRing(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.torus, materials.emergency, 'life-ring', [1.05, 1.05, 0.6], [0, 0.72, 0]);
}

function addSpareTimber(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  ([-0.2, 0, 0.2] as const).forEach((z, index) => {
    addPart(root, geometry.box, materials.crewFloor, `spare-timber-${index + 1}`, [1.8, 0.22, 0.16], [0, 0.11, z]);
  });
}

function addDetailParts(
  kind: ShipDeckDetailKind,
  root: Group,
  geometry: DetailGeometry,
  materials: ShipMaterials,
): void {
  switch (kind) {
    case 'barrel': addBarrel(root, geometry, materials); break;
    case 'ropeCoil': addRopeCoil(root, geometry, materials); break;
    case 'lifeRing': addLifeRing(root, geometry, materials); break;
    case 'spareTimber': addSpareTimber(root, geometry, materials); break;
  }
}

function toCollider(spec: ShipDeckDetailSpec): CollisionBox | undefined {
  if (!spec.colliderSize) return undefined;
  const localWidth = spec.colliderSize[0] * spec.scale[0];
  const height = spec.colliderSize[1] * spec.scale[1];
  const localDepth = spec.colliderSize[2] * spec.scale[2];
  const rawCosine = Math.abs(Math.cos(spec.rotationY));
  const rawSine = Math.abs(Math.sin(spec.rotationY));
  const cosine = rawCosine < 1e-12 ? 0 : rawCosine;
  const sine = rawSine < 1e-12 ? 0 : rawSine;
  const width = localWidth * cosine + localDepth * sine;
  const depth = localWidth * sine + localDepth * cosine;
  return {
    minX: spec.position[0] - width / 2,
    maxX: spec.position[0] + width / 2,
    minY: spec.position[1],
    maxY: spec.position[1] + height,
    minZ: spec.position[2] - depth / 2,
    maxZ: spec.position[2] + depth / 2,
  };
}

export function createShipDeckDetails(
  materials: ShipMaterials,
  specs: readonly ShipDeckDetailSpec[],
): ShipDeckDetailsBuild {
  const root = new Group();
  root.name = 'ship-deck-details';
  const geometry = createDetailGeometry();
  const colliders: CollisionBox[] = [];

  specs.forEach((spec) => {
    const detailRoot = new Group();
    detailRoot.name = `detail:${spec.id}`;
    detailRoot.position.set(...spec.position);
    detailRoot.rotation.y = spec.rotationY;
    detailRoot.scale.set(...spec.scale);
    detailRoot.userData.detailKind = spec.kind;
    addDetailParts(spec.kind, detailRoot, geometry, materials);
    root.add(detailRoot);
    const collider = toCollider(spec);
    if (collider) colliders.push(collider);
  });

  let disposed = false;
  return {
    root,
    colliders,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      geometry.owned.forEach((ownedGeometry) => ownedGeometry.dispose());
    },
  };
}
