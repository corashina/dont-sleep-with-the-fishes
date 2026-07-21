import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
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
  readonly cone: ConeGeometry;
  readonly torus: TorusGeometry;
  readonly owned: ReadonlySet<BufferGeometry>;
}

function createDetailGeometry(): DetailGeometry {
  const box = new BoxGeometry(1, 1, 1);
  const cylinder = new CylinderGeometry(0.5, 0.5, 1, 12);
  const cone = new ConeGeometry(0.5, 1, 12);
  const torus = new TorusGeometry(0.5, 0.1, 10, 24);
  return { box, cylinder, cone, torus, owned: new Set([box, cylinder, cone, torus]) };
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

function addBollard(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.cylinder, materials.exposedMetal, 'bollard-post', [0.3, 0.58, 0.3], [0, 0.29, 0]);
  addPart(root, geometry.cylinder, materials.darkMetal, 'bollard-cap', [0.42, 0.12, 0.42], [0, 0.58, 0]);
}

function addCleat(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.box, materials.exposedMetal, 'cleat-centre', [0.42, 0.1, 0.16], [0, 0.05, 0]);
  addPart(root, geometry.box, materials.darkMetal, 'cleat-arm-port', [0.12, 0.14, 0.56], [-0.22, 0.1, 0]);
  addPart(root, geometry.box, materials.darkMetal, 'cleat-arm-starboard', [0.12, 0.14, 0.56], [0.22, 0.1, 0]);
}

function addLamp(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.cylinder, materials.exposedMetal, 'lamp-post', [0.12, 1.15, 0.12], [0, 0.575, 0]);
  addPart(root, geometry.cylinder, materials.emergency, 'lamp-lens', [0.24, 0.22, 0.24], [0, 1.08, 0]);
  addPart(root, geometry.cone, materials.darkMetal, 'lamp-hood', [0.44, 0.28, 0.44], [0, 1.28, 0]);
}

function addVent(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.cylinder, materials.exposedMetal, 'vent-body', [0.5, 0.55, 0.5], [0, 0.275, 0]);
  addPart(root, geometry.cylinder, materials.darkMetal, 'vent-cap', [0.58, 0.28, 0.58], [0.12, 0.59, 0], [0, 0, -0.38]);
}

function addLifeRing(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.torus, materials.emergency, 'life-ring', [1.05, 1.05, 0.6], [0, 0.72, 0]);
}

function addCoveredHatch(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.box, materials.paintedSteel, 'covered-hatch', [2.2, 0.18, 1.5], [0, 0.09, 0]);
  ([-0.54, -0.18, 0.18, 0.54] as const).forEach((z, index) => {
    addPart(root, geometry.box, materials.darkMetal, `covered-hatch-strap-${index + 1}`, [2.3, 0.05, 0.08], [0, 0.205, z]);
  });
}

function addSpareTimber(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  ([-0.2, 0, 0.2] as const).forEach((z, index) => {
    addPart(root, geometry.box, materials.crewFloor, `spare-timber-${index + 1}`, [1.8, 0.22, 0.16], [0, 0.11, z]);
  });
}

function addToolbox(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  addPart(root, geometry.box, materials.paintedSteel, 'toolbox-body', [1, 0.35, 0.5], [0, 0.175, 0]);
  addPart(root, geometry.box, materials.darkMetal, 'toolbox-handle-port', [0.08, 0.3, 0.08], [-0.28, 0.45, 0]);
  addPart(root, geometry.box, materials.darkMetal, 'toolbox-handle-starboard', [0.08, 0.3, 0.08], [0.28, 0.45, 0]);
  addPart(root, geometry.box, materials.darkMetal, 'toolbox-handle-grip', [0.64, 0.08, 0.08], [0, 0.6, 0]);
}

function addFoldedCanvas(root: Group, geometry: DetailGeometry, materials: ShipMaterials): void {
  ([0.05, 0.15, 0.25] as const).forEach((y, index) => {
    addPart(root, geometry.box, materials.rope, `folded-canvas-${index + 1}`, [1 - index * 0.06, 0.1, 0.65], [0, y, 0]);
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
    case 'bollard': addBollard(root, geometry, materials); break;
    case 'cleat': addCleat(root, geometry, materials); break;
    case 'lamp': addLamp(root, geometry, materials); break;
    case 'vent': addVent(root, geometry, materials); break;
    case 'lifeRing': addLifeRing(root, geometry, materials); break;
    case 'coveredHatch': addCoveredHatch(root, geometry, materials); break;
    case 'spareTimber': addSpareTimber(root, geometry, materials); break;
    case 'toolbox': addToolbox(root, geometry, materials); break;
    case 'foldedCanvas': addFoldedCanvas(root, geometry, materials); break;
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
