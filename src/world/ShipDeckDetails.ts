import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
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
  readonly cylinder: CylinderGeometry;
  readonly owned: ReadonlySet<BufferGeometry>;
}

function createDetailGeometry(): DetailGeometry {
  const cylinder = new CylinderGeometry(0.5, 0.5, 1, 12);
  return { cylinder, owned: new Set([cylinder]) };
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
  addPart(root, geometry.cylinder, materials.timber, 'barrel-body', [0.9, 1.15, 0.9], [0, 0.575, 0]);
  addPart(root, geometry.cylinder, materials.darkMetal, 'barrel-band-lower', [0.96, 0.09, 0.96], [0, 0.27, 0]);
  addPart(root, geometry.cylinder, materials.darkMetal, 'barrel-band-upper', [0.96, 0.09, 0.96], [0, 0.88, 0]);
}

function addDetailParts(
  _kind: ShipDeckDetailKind,
  root: Group,
  geometry: DetailGeometry,
  materials: ShipMaterials,
): void {
  addBarrel(root, geometry, materials);
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
