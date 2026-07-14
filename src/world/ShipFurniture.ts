import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Material,
  Mesh,
  TorusGeometry,
  Vector3,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import type { ShipItemAnchor, ShipItemCategory, ShipSurface } from './ShipItemPlacement';
import type { ShipMaterials, WoodMaterialFamily } from './ShipMaterials';

export interface ShipFurnitureBuild {
  root: Group;
  colliders: CollisionBox[];
  anchors: ShipItemAnchor[];
  routeClearancePoints: Vector3[];
  disposeGeometry(): void;
}

interface GeometryLibrary {
  box: BoxGeometry;
  cylinder: CylinderGeometry;
  torus: TorusGeometry;
  owned: Set<BufferGeometry>;
}

const geometryLibraries = new WeakMap<Group, GeometryLibrary>();
const familyCounts = new WeakMap<Group, Map<string, number>>();

function geometryLibrary(parent: Group): GeometryLibrary {
  const existing = geometryLibraries.get(parent);
  if (existing) return existing;
  const box = new BoxGeometry(1, 1, 1);
  const cylinder = new CylinderGeometry(1, 1, 1, 12);
  const torus = new TorusGeometry(1, 0.12, 8, 18);
  const created = { box, cylinder, torus, owned: new Set<BufferGeometry>([box, cylinder, torus]) };
  geometryLibraries.set(parent, created);
  return created;
}

function nextFamilyName(parent: Group, family: string): string {
  let counts = familyCounts.get(parent);
  if (!counts) {
    counts = new Map<string, number>();
    familyCounts.set(parent, counts);
  }
  const index = counts.get(family) ?? 0;
  counts.set(family, index + 1);
  return index === 0 ? family : `${family}-${index + 1}`;
}

function woodVariant(family: WoodMaterialFamily, partIndex: number): Material {
  return family[partIndex % family.length]!;
}

function addBox(
  parent: Group,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: Material,
): Mesh {
  const mesh = new Mesh(geometryLibrary(parent).box, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...size);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: Group,
  name: string,
  radius: number,
  height: number,
  position: readonly [number, number, number],
  material: Material,
  rotationZ = 0,
): Mesh {
  const mesh = new Mesh(geometryLibrary(parent).cylinder, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(radius, height, radius);
  mesh.rotation.z = rotationZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addWoodGrain(
  group: Group,
  materials: ShipMaterials,
  width: number,
  y: number,
  depth: number,
): void {
  [-0.22, 0.24].forEach((offset, index) => addBox(
    group,
    `grain-strip-${index}`,
    [width * 0.7, 0.018, 0.025],
    [0, y + 0.012, depth * offset],
    materials.darkMetal,
  ));
}

function createFamilyGroup(
  parent: Group,
  family: string,
  position: Vector3,
  rotationY: number,
): Group {
  const group = new Group();
  group.name = nextFamilyName(parent, family);
  group.position.copy(position);
  group.rotation.y = rotationY;
  parent.add(group);
  geometryLibraries.set(group, geometryLibrary(parent));
  return group;
}

function addDesk(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group {
  const group = createFamilyGroup(parent, 'desk', position, rotationY);
  addBox(group, 'desktop', [1.7, 0.12, 0.78], [0, 0.88, 0], woodVariant(materials.furnitureWood, 0));
  [-0.7, 0.7].forEach((x, index) => addBox(
    group,
    `desk-side-${index}`,
    [0.12, 0.82, 0.65],
    [x, 0.41, 0],
    woodVariant(materials.furnitureWood, index + 1),
  ));
  addBox(group, 'desk-drawer', [0.62, 0.28, 0.7], [0.35, 0.7, 0], woodVariant(materials.furnitureWood, 3));
  addWoodGrain(group, materials, 1.7, 0.94, 0.78);
  return group;
}

function addChair(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group {
  const group = createFamilyGroup(parent, 'chair', position, rotationY);
  addBox(group, 'chair-seat', [0.64, 0.1, 0.62], [0, 0.48, 0], woodVariant(materials.furnitureWood, 0));
  addBox(group, 'chair-back', [0.64, 0.72, 0.1], [0, 0.82, 0.27], woodVariant(materials.furnitureWood, 1));
  [[-0.24, -0.22], [0.24, -0.22], [-0.24, 0.22], [0.24, 0.22]].forEach(([x, z], index) => addBox(
    group,
    `chair-leg-${index}`,
    [0.08, 0.48, 0.08],
    [x!, 0.24, z!],
    woodVariant(materials.furnitureWood, index),
  ));
  addWoodGrain(group, materials, 0.64, 0.54, 0.62);
  return group;
}

function addBunk(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group {
  const group = createFamilyGroup(parent, 'bunk', position, rotationY);
  [0.38, 1.42].forEach((y, bunkIndex) => {
    addBox(group, `bunk-frame-${bunkIndex}`, [1.05, 0.13, 2.18], [0, y, 0], woodVariant(materials.furnitureWood, bunkIndex));
    addBox(group, `bunk-mattress-${bunkIndex}`, [0.92, 0.16, 1.98], [0, y + 0.14, 0], materials.wallPanels[(bunkIndex + 1) % 4]!);
  });
  [[-0.46, -0.98], [0.46, -0.98], [-0.46, 0.98], [0.46, 0.98]].forEach(([x, z], index) => addBox(
    group,
    `bunk-post-${index}`,
    [0.1, 1.65, 0.1],
    [x!, 0.825, z!],
    woodVariant(materials.furnitureWood, index),
  ));
  addWoodGrain(group, materials, 1.05, 1.49, 2.18);
  return group;
}

function addShelf(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group {
  const group = createFamilyGroup(parent, 'wall-shelf', position, rotationY);
  [0.42, 1.02, 1.62].forEach((y, index) => addBox(
    group,
    `shelf-board-${index}`,
    [1.85, 0.1, 0.44],
    [0, y, 0],
    woodVariant(materials.furnitureWood, index),
  ));
  [-0.88, 0.88].forEach((x, index) => addBox(
    group,
    `shelf-upright-${index}`,
    [0.1, 1.72, 0.42],
    [x, 0.86, 0],
    woodVariant(materials.furnitureWood, index + 2),
  ));
  addWoodGrain(group, materials, 1.85, 1.68, 0.44);
  return group;
}

function addLocker(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group {
  const group = createFamilyGroup(parent, 'locker', position, rotationY);
  addBox(group, 'locker-body', [0.78, 1.82, 0.64], [0, 0.91, 0], materials.paintedSteel);
  addBox(group, 'locker-door', [0.68, 1.62, 0.05], [0, 0.92, 0.345], materials.darkHull);
  [0.62, 0.82, 1.02].forEach((y, index) => addBox(group, `locker-vent-${index}`, [0.36, 0.025, 0.025], [0, y, 0.38], materials.exposedMetal));
  return group;
}

function addWorkbench(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group {
  const group = createFamilyGroup(parent, 'workbench', position, rotationY);
  addBox(group, 'workbench-top', [2.05, 0.16, 0.9], [0, 0.86, 0], woodVariant(materials.furnitureWood, 0));
  [-0.86, 0.86].forEach((x, index) => addBox(
    group,
    `workbench-support-${index}`,
    [0.16, 0.82, 0.74],
    [x, 0.41, 0],
    woodVariant(materials.furnitureWood, index + 1),
  ));
  addBox(group, 'workbench-brace', [1.6, 0.15, 0.15], [0, 0.28, -0.27], woodVariant(materials.furnitureWood, 3));
  addWoodGrain(group, materials, 2.05, 0.95, 0.9);
  return group;
}

function addEquipmentRack(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group {
  const group = createFamilyGroup(parent, 'equipment-rack', position, rotationY);
  [0.16, 0.72].forEach((y, index) => addBox(
    group,
    `rack-deck-${index}`,
    [2.15, 0.12, 0.92],
    [0, y, 0],
    woodVariant(materials.deckTimber, index),
  ));
  [-0.98, 0.98].forEach((x, index) => addBox(group, `rack-end-${index}`, [0.12, 0.82, 0.82], [x, 0.41, 0], materials.darkMetal));
  addWoodGrain(group, materials, 2.15, 0.78, 0.92);
  return group;
}

function addCargoCrate(parent: Group, materials: ShipMaterials, position: Vector3, size: Vector3): Group {
  const group = createFamilyGroup(parent, 'cargo-crate', position, 0);
  addBox(group, 'crate-body', [size.x, size.y, size.z], [0, size.y / 2, 0], woodVariant(materials.crateWood, 0));
  [-0.42, 0.42].forEach((fraction, index) => {
    addBox(group, `crate-band-x-${index}`, [0.08, size.y + 0.04, size.z + 0.04], [size.x * fraction, size.y / 2, 0], woodVariant(materials.crateWood, index + 1));
    addBox(group, `crate-band-z-${index}`, [size.x + 0.04, size.y + 0.04, 0.08], [0, size.y / 2, size.z * fraction], woodVariant(materials.crateWood, index + 2));
  });
  addWoodGrain(group, materials, size.x, size.y + 0.03, size.z);
  return group;
}

function addCollider(
  colliders: CollisionBox[],
  position: Vector3,
  size: readonly [number, number, number],
  rotationY = 0,
): void {
  const quarterTurn = Math.abs(Math.sin(rotationY)) > 0.5;
  const width = quarterTurn ? size[2] : size[0];
  const depth = quarterTurn ? size[0] : size[2];
  colliders.push({
    minX: position.x - width / 2,
    maxX: position.x + width / 2,
    minY: position.y,
    maxY: position.y + size[1],
    minZ: position.z - depth / 2,
    maxZ: position.z + depth / 2,
  });
}

function makeAnchor(
  id: string,
  categories: readonly ShipItemCategory[],
  position: readonly [number, number, number],
  surface: ShipSurface,
  surfaceGroupId: string,
  emergency = false,
): ShipItemAnchor {
  return {
    id,
    categories,
    position: new Vector3(...position),
    rotation: new Euler(0, 0, 0),
    scale: 1,
    surface,
    surfaceGroupId,
    footprint: { width: 2.1, depth: 1.2 },
    clearanceHeight: 1.3,
    emergency,
  };
}

function createAnchors(): ShipItemAnchor[] {
  const regular: ShipItemAnchor[] = [
    makeAnchor('galley-shelf-port', ['foodWater'], [-3.25, 3.72, 8.1], 'shelf', 'galley-shelf-port'),
    makeAnchor('galley-shelf-starboard', ['foodWater'], [3.25, 3.72, 8.1], 'shelf', 'galley-shelf-starboard'),
    makeAnchor('cabin-desk-port', ['foodWater', 'medicalEmergency'], [-2.2, 3.25, 6.3], 'desk', 'cabin-desk-port'),
    makeAnchor('cabin-desk-starboard', ['foodWater', 'medicalEmergency'], [2.2, 3.25, 6.3], 'desk', 'cabin-desk-starboard'),
    makeAnchor('cabin-table', ['foodWater'], [0, 3.25, 9], 'desk', 'cabin-table'),
    makeAnchor('crate-top-food-port', ['foodWater'], [-1.5, 3.28, -4.1], 'crate', 'crate-top-food-port'),
    makeAnchor('crate-top-food-starboard', ['foodWater'], [1.5, 3.28, -4.1], 'crate', 'crate-top-food-starboard'),
    makeAnchor('crate-top-food-forward', ['foodWater'], [1.5, 3.28, 1.9], 'crate', 'crate-top-food-forward'),

    makeAnchor('emergency-cabinet-lower', ['medicalEmergency'], [3.15, 3.05, 12.1], 'cabinet', 'emergency-cabinet-lower'),
    makeAnchor('emergency-cabinet-upper', ['medicalEmergency'], [3.15, 4.05, 12.1], 'cabinet', 'emergency-cabinet-upper'),
    makeAnchor('wheelhouse-helm-port', ['medicalEmergency', 'toolsRepair'], [-1.2, 3.25, 14.4], 'desk', 'wheelhouse-helm-port'),
    makeAnchor('wheelhouse-helm-starboard', ['medicalEmergency', 'toolsRepair'], [1.2, 3.25, 14.4], 'desk', 'wheelhouse-helm-starboard'),
    makeAnchor('wheelhouse-chart-port', ['medicalEmergency'], [-1.2, 3.25, 12.6], 'desk', 'wheelhouse-chart-port'),
    makeAnchor('wheelhouse-chart-starboard', ['medicalEmergency'], [1.2, 3.25, 12.6], 'desk', 'wheelhouse-chart-starboard'),
    makeAnchor('instrument-cabinet-port', ['medicalEmergency'], [-3.2, 3.35, 14], 'cabinet', 'instrument-cabinet-port'),
    makeAnchor('instrument-cabinet-starboard', ['medicalEmergency'], [3.2, 3.35, 14], 'cabinet', 'instrument-cabinet-starboard'),

    makeAnchor('workbench-port-aft', ['toolsRepair'], [-3.2, 3.18, -9.9], 'workbench', 'workbench-port-aft'),
    makeAnchor('workbench-port-forward', ['toolsRepair'], [-3.2, 3.18, -7.6], 'workbench', 'workbench-port-forward'),
    makeAnchor('workbench-starboard-aft', ['toolsRepair'], [3.2, 3.18, -9.9], 'workbench', 'workbench-starboard-aft'),
    makeAnchor('workbench-starboard-forward', ['toolsRepair'], [3.2, 3.18, -7.6], 'workbench', 'workbench-starboard-forward'),
    makeAnchor('storage-shelf-tools-port', ['toolsRepair'], [-4.05, 3.72, -10.2], 'shelf', 'storage-shelf-tools-port'),
    makeAnchor('storage-shelf-tools-starboard', ['toolsRepair'], [4.05, 3.72, -10.2], 'shelf', 'storage-shelf-tools-starboard'),
    makeAnchor('crate-top-tools', ['toolsRepair'], [-1.5, 3.28, -1.1], 'crate', 'crate-top-tools'),
    makeAnchor('machinery-service', ['toolsRepair'], [0, 3.45, -9.4], 'workbench', 'machinery-service'),

    makeAnchor('deck-rack-rod-port', ['fishingDiving'], [-3.55, 2.96, -7.35], 'rack', 'deck-rack-rod-port'),
    makeAnchor('deck-rack-rod-starboard', ['fishingDiving'], [3.55, 2.96, -7.35], 'rack', 'deck-rack-rod-starboard'),
    makeAnchor('deck-rack-scuba-port', ['fishingDiving'], [-3.55, 2.43, -8.55], 'rack', 'deck-rack-scuba-port'),
    makeAnchor('deck-rack-scuba-starboard', ['fishingDiving'], [3.55, 2.43, -8.55], 'rack', 'deck-rack-scuba-starboard'),
    makeAnchor('storage-shelf-gear-port', ['fishingDiving'], [-4.05, 3.12, -9], 'shelf', 'storage-shelf-gear-port'),
    makeAnchor('storage-shelf-gear-starboard', ['fishingDiving'], [4.05, 3.12, -9], 'shelf', 'storage-shelf-gear-starboard'),
    makeAnchor('crate-top-gear-port', ['fishingDiving'], [-1.5, 3.28, 1.9], 'crate', 'crate-top-gear-port'),
    makeAnchor('crate-top-gear-starboard', ['fishingDiving'], [1.5, 3.28, -1.1], 'crate', 'crate-top-gear-starboard'),
  ];

  return [
    ...regular,
    makeAnchor('emergency-food', ['foodWater'], [-3.8, 3.05, 8.8], 'shelf', 'emergency-food-surface', true),
    makeAnchor('emergency-medical', ['medicalEmergency'], [3.7, 3.35, 12.4], 'cabinet', 'emergency-medical-surface', true),
    makeAnchor('emergency-tools', ['toolsRepair'], [-3.5, 3.08, -9.4], 'workbench', 'emergency-tools-surface', true),
    makeAnchor('emergency-gear', ['fishingDiving'], [3.8, 2.42, -8.4], 'rack', 'emergency-gear-surface', true),
  ];
}

function addDecorations(root: Group, materials: ShipMaterials): void {
  const charts: readonly [number, number, number][] = [
    [-0.55, 3.23, 12.35], [0.55, 3.23, 12.35], [-2.25, 3.23, 6.15], [2.25, 3.23, 6.15],
  ];
  charts.forEach((position, index) => addBox(root, `chart-${index + 1}`, [0.72, 0.018, 0.46], position, materials.wallPanels[index % 4]!));

  const mugs: readonly [number, number, number][] = [
    [-2.6, 3.32, 6.2], [2.6, 3.32, 6.2], [-0.4, 3.32, 9], [0.4, 3.32, 9], [-0.8, 3.32, 12.7], [0.8, 3.32, 12.7],
  ];
  mugs.forEach((position, index) => addCylinder(root, `mug-or-dish-${index + 1}`, 0.11, 0.2, position, materials.exposedMetal));

  const toolPositions: readonly [number, number, number][] = [
    [-3.55, 3.24, -7.8], [-3.1, 3.24, -7.8], [-2.65, 3.24, -7.8],
    [2.65, 3.24, -9.8], [3.1, 3.24, -9.8], [3.55, 3.24, -9.8],
  ];
  toolPositions.forEach((position, index) => addBox(root, `hand-tool-${index + 1}`, [0.38, 0.06, 0.11], position, index % 2 === 0 ? materials.darkMetal : materials.exposedMetal));

  const machinePartPositions: readonly [number, number, number][] = [
    [-0.65, 3.47, -9.4], [-0.22, 3.47, -9.4], [0.22, 3.47, -9.4], [0.65, 3.47, -9.4],
  ];
  machinePartPositions.forEach((position, index) => addCylinder(root, `machine-part-${index + 1}`, 0.16, 0.16, position, index % 2 === 0 ? materials.exposedMetal : materials.rust, Math.PI / 2));
}

function addCargoDeckEquipment(root: Group, materials: ShipMaterials): void {
  [[-3.5, 2.34, 0.4], [3.5, 2.34, 0.4]].forEach((position, index) => {
    const mesh = new Mesh(geometryLibrary(root).torus, materials.rope);
    mesh.name = `rope-coil-${index + 1}`;
    mesh.position.set(position[0]!, position[1]!, position[2]!);
    mesh.rotation.x = Math.PI / 2;
    mesh.scale.setScalar(0.48);
    mesh.castShadow = true;
    root.add(mesh);
  });
  [[-2.8, 2.62, -5.35], [2.8, 2.62, -5.35]].forEach((position, index) => addCylinder(root, `deck-vent-${index + 1}`, 0.34, 0.75, position as [number, number, number], materials.paintedSteel));
  [[-2.5, 2.72, 1.2], [2.5, 2.72, 1.2]].forEach((position, index) => addCylinder(root, `winch-drum-${index + 1}`, 0.48, 0.85, position as [number, number, number], materials.darkMetal, Math.PI / 2));
}

export function createShipFurniture(materials: ShipMaterials): ShipFurnitureBuild {
  const root = new Group();
  root.name = 'ship-furniture';
  const library = geometryLibrary(root);
  const colliders: CollisionBox[] = [];

  const bunks = [new Vector3(-3.25, 2.22, 7.75), new Vector3(3.25, 2.22, 9.1)];
  bunks.forEach((position) => {
    addBunk(root, materials, position, 0);
    addCollider(colliders, position, [1.05, 1.65, 2.18]);
  });
  const cabinDesks = [new Vector3(-2.25, 2.22, 6.25), new Vector3(2.25, 2.22, 6.25)];
  cabinDesks.forEach((position, index) => {
    addDesk(root, materials, position, 0);
    addCollider(colliders, position, [1.7, 0.94, 0.78]);
    addChair(root, materials, new Vector3(position.x, position.y, position.z - 0.82), index === 0 ? 0 : Math.PI);
  });
  [new Vector3(-3.45, 2.22, 8.75), new Vector3(3.45, 2.22, 8.05)].forEach((position) => {
    addShelf(root, materials, position, Math.PI / 2);
    addCollider(colliders, position, [1.85, 1.72, 0.44], Math.PI / 2);
  });
  [new Vector3(-3.45, 2.22, 10.05), new Vector3(3.45, 2.22, 10.05)].forEach((position) => {
    addLocker(root, materials, position, 0);
    addCollider(colliders, position, [0.78, 1.82, 0.64]);
  });
  const table = addDesk(root, materials, new Vector3(0, 2.22, 9), 0);
  table.name = 'small-table';
  addCollider(colliders, table.position, [1.7, 0.94, 0.78]);

  const helm = addDesk(root, materials, new Vector3(0, 2.32, 14.45), 0);
  helm.name = 'helm-desk';
  addCollider(colliders, helm.position, [1.7, 0.94, 0.78]);
  const chartTable = addDesk(root, materials, new Vector3(0, 2.32, 12.65), 0);
  chartTable.name = 'chart-table';
  addCollider(colliders, chartTable.position, [1.7, 0.94, 0.78]);
  [new Vector3(-3.2, 2.32, 14), new Vector3(3.2, 2.32, 14)].forEach((position, index) => {
    const cabinet = addLocker(root, materials, position, 0);
    cabinet.name = `instrument-cabinet-${index + 1}`;
    addCollider(colliders, position, [0.78, 1.82, 0.64]);
  });
  const emergencyCabinet = addLocker(root, materials, new Vector3(3.2, 2.32, 12.35), 0);
  emergencyCabinet.name = 'emergency-cabinet';
  emergencyCabinet.traverse((object) => {
    if (object instanceof Mesh && object.name === 'locker-door') object.material = materials.emergency;
  });
  addCollider(colliders, emergencyCabinet.position, [0.78, 1.82, 0.64]);

  [new Vector3(-4.15, 2.22, -9.75), new Vector3(4.15, 2.22, -9.75)].forEach((position) => {
    addShelf(root, materials, position, Math.PI / 2);
    addCollider(colliders, position, [1.85, 1.72, 0.44], Math.PI / 2);
  });
  [new Vector3(-3.15, 2.22, -7.65), new Vector3(3.15, 2.22, -9.75)].forEach((position) => {
    addWorkbench(root, materials, position, 0);
    addCollider(colliders, position, [2.05, 0.95, 0.9]);
  });
  [new Vector3(-3.9, 2.22, -10.9), new Vector3(0, 2.22, -10.95), new Vector3(3.9, 2.22, -10.9)].forEach((position) => {
    addLocker(root, materials, position, 0);
    addCollider(colliders, position, [0.78, 1.82, 0.64]);
  });
  [new Vector3(-3.55, 2.22, -7.15), new Vector3(3.55, 2.22, -7.15)].forEach((position) => {
    addEquipmentRack(root, materials, position, 0);
    addCollider(colliders, position, [2.15, 0.82, 0.92]);
  });
  addBox(root, 'machinery-block', [1.9, 1.18, 1.45], [0, 2.81, -9.4], materials.paintedSteel);
  addCollider(colliders, new Vector3(0, 2.22, -9.4), [1.9, 1.18, 1.45]);

  const cratePositions = [
    new Vector3(-1.5, 2.22, -4.1), new Vector3(1.5, 2.22, -4.1),
    new Vector3(-1.5, 2.22, -1.1), new Vector3(1.5, 2.22, -1.1),
    new Vector3(-1.5, 2.22, 1.9), new Vector3(1.5, 2.22, 1.9),
  ];
  const crateSize = new Vector3(1.35, 1.05, 1.15);
  cratePositions.forEach((position) => {
    addCargoCrate(root, materials, position, crateSize);
    addCollider(colliders, position, [crateSize.x, crateSize.y, crateSize.z]);
  });
  addCargoDeckEquipment(root, materials);
  addDecorations(root, materials);

  const routeClearancePoints = [-10, -8.2, -4, 0, 5.2, 10.4].flatMap((z) => [
    new Vector3(-5.15, 3.72, z),
    new Vector3(5.15, 3.72, z),
  ]);
  const anchors = createAnchors();
  let disposed = false;

  return {
    root,
    colliders,
    anchors,
    routeClearancePoints,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      library.owned.forEach((geometry) => geometry.dispose());
    },
  };
}
