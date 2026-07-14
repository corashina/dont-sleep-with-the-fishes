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

interface FurnitureCollider extends CollisionBox {
  furnitureFamily: string;
}

interface AnchorSupportMetadata {
  surfaceGroupId: string;
  surface: ShipSurface;
  centerX: number;
  centerZ: number;
  topY: number;
  width: number;
  depth: number;
}

interface AnchorSpec {
  id: string;
  categories: readonly ShipItemCategory[];
  position: readonly [number, number, number];
  surface: ShipSurface;
  surfaceGroupId: string;
  footprint: { width: number; depth: number };
  clearanceHeight: number;
  emergency: boolean;
}

const PLAYER_COLLIDER_CEILING = 4.2;

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
  group.userData.furnitureFamily = family;
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
  addBox(group, 'workbench-top', [2.3, 0.16, 1.3], [0, 0.86, 0], woodVariant(materials.furnitureWood, 0));
  [-0.98, 0.98].forEach((x, index) => addBox(
    group,
    `workbench-support-${index}`,
    [0.16, 0.82, 1.12],
    [x, 0.41, 0],
    woodVariant(materials.furnitureWood, index + 1),
  ));
  addBox(group, 'workbench-brace', [1.85, 0.15, 0.15], [0, 0.28, -0.46], woodVariant(materials.furnitureWood, 3));
  addWoodGrain(group, materials, 2.3, 0.95, 1.3);
  return group;
}

function addEquipmentRack(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group {
  const group = createFamilyGroup(parent, 'equipment-rack', position, rotationY);
  [0.16, 0.72].forEach((y, index) => addBox(
    group,
    `rack-deck-${index}`,
    [2.3, 0.12, 1.3],
    [0, y, 0],
    woodVariant(materials.deckTimber, index),
  ));
  [-1.06, 1.06].forEach((x, index) => addBox(group, `rack-end-${index}`, [0.12, 0.82, 1.2], [x, 0.41, 0], materials.darkMetal));
  addWoodGrain(group, materials, 2.3, 0.78, 1.3);
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
  furnitureFamily: string,
  rotationY = 0,
): void {
  const quarterTurn = Math.abs(Math.sin(rotationY)) > 0.5;
  const width = quarterTurn ? size[2] : size[0];
  const depth = quarterTurn ? size[0] : size[2];
  const collider: FurnitureCollider = {
    minX: position.x - width / 2,
    maxX: position.x + width / 2,
    minY: position.y,
    maxY: PLAYER_COLLIDER_CEILING,
    minZ: position.z - depth / 2,
    maxZ: position.z + depth / 2,
    furnitureFamily,
  };
  colliders.push(collider);
}

function makeAnchor(spec: AnchorSpec): ShipItemAnchor {
  return {
    id: spec.id,
    categories: spec.categories,
    position: new Vector3(...spec.position),
    rotation: new Euler(0, 0, 0),
    scale: 1,
    surface: spec.surface,
    surfaceGroupId: spec.surfaceGroupId,
    footprint: { ...spec.footprint },
    clearanceHeight: spec.clearanceHeight,
    emergency: spec.emergency,
  };
}

const REGULAR_ANCHOR_SPECS: readonly AnchorSpec[] = [
  { id: 'galley-shelf-port', categories: ['foodWater'], position: [-3.2, 3.05, 8.1], surface: 'shelf', surfaceGroupId: 'galley-shelf-port', footprint: { width: 0.7, depth: 0.55 }, clearanceHeight: 0.85, emergency: false },
  { id: 'galley-shelf-starboard', categories: ['foodWater'], position: [3.2, 3.05, 8.1], surface: 'shelf', surfaceGroupId: 'galley-shelf-starboard', footprint: { width: 0.7, depth: 0.55 }, clearanceHeight: 0.85, emergency: false },
  { id: 'cabin-desk-port', categories: ['foodWater'], position: [-2.25, 3.16, 6.25], surface: 'desk', surfaceGroupId: 'cabin-desk-port', footprint: { width: 0.65, depth: 0.55 }, clearanceHeight: 0.85, emergency: false },
  { id: 'cabin-desk-starboard', categories: ['foodWater'], position: [2.25, 3.16, 6.25], surface: 'desk', surfaceGroupId: 'cabin-desk-starboard', footprint: { width: 0.65, depth: 0.55 }, clearanceHeight: 0.85, emergency: false },
  { id: 'cabin-table', categories: ['foodWater'], position: [0, 3.16, 9], surface: 'desk', surfaceGroupId: 'cabin-table', footprint: { width: 0.65, depth: 0.55 }, clearanceHeight: 0.85, emergency: false },
  { id: 'crate-top-food-port', categories: ['foodWater'], position: [-1.5, 3.27, -4.1], surface: 'crate', surfaceGroupId: 'crate-top-food-port', footprint: { width: 0.8, depth: 0.7 }, clearanceHeight: 0.85, emergency: false },
  { id: 'crate-top-food-starboard', categories: ['foodWater'], position: [1.5, 3.27, -4.1], surface: 'crate', surfaceGroupId: 'crate-top-food-starboard', footprint: { width: 0.8, depth: 0.7 }, clearanceHeight: 0.85, emergency: false },

  { id: 'emergency-cabinet-lower', categories: ['medicalEmergency'], position: [3.2, 3.35, 12.15], surface: 'cabinet', surfaceGroupId: 'emergency-cabinet-lower', footprint: { width: 0.7, depth: 0.5 }, clearanceHeight: 0.55, emergency: false },
  { id: 'emergency-cabinet-upper', categories: ['medicalEmergency'], position: [3.2, 3.95, 12.15], surface: 'cabinet', surfaceGroupId: 'emergency-cabinet-upper', footprint: { width: 0.7, depth: 0.5 }, clearanceHeight: 0.55, emergency: false },
  { id: 'wheelhouse-helm-port', categories: ['medicalEmergency'], position: [-0.45, 3.26, 14.45], surface: 'desk', surfaceGroupId: 'wheelhouse-helm-port', footprint: { width: 0.65, depth: 0.5 }, clearanceHeight: 0.65, emergency: false },
  { id: 'wheelhouse-helm-starboard', categories: ['medicalEmergency'], position: [0.45, 3.26, 14.45], surface: 'desk', surfaceGroupId: 'wheelhouse-helm-starboard', footprint: { width: 0.65, depth: 0.5 }, clearanceHeight: 0.65, emergency: false },
  { id: 'wheelhouse-chart-port', categories: ['medicalEmergency'], position: [-0.45, 3.26, 12.65], surface: 'desk', surfaceGroupId: 'wheelhouse-chart-port', footprint: { width: 0.65, depth: 0.5 }, clearanceHeight: 0.65, emergency: false },
  { id: 'wheelhouse-chart-starboard', categories: ['medicalEmergency'], position: [0.45, 3.26, 12.65], surface: 'desk', surfaceGroupId: 'wheelhouse-chart-starboard', footprint: { width: 0.65, depth: 0.5 }, clearanceHeight: 0.65, emergency: false },

  { id: 'workbench-port', categories: ['toolsRepair'], position: [-3.1, 3.08, -9.4], surface: 'workbench', surfaceGroupId: 'workbench-port', footprint: { width: 0.55, depth: 0.5 }, clearanceHeight: 0.7, emergency: false },
  { id: 'workbench-starboard', categories: ['toolsRepair'], position: [3.2, 3.16, -8], surface: 'workbench', surfaceGroupId: 'workbench-starboard', footprint: { width: 0.55, depth: 0.5 }, clearanceHeight: 0.7, emergency: false },
  { id: 'storage-shelf-tools-port', categories: ['toolsRepair'], position: [-4.15, 3.24, -9.75], surface: 'shelf', surfaceGroupId: 'storage-shelf-tools-port', footprint: { width: 0.38, depth: 0.75 }, clearanceHeight: 0.65, emergency: false },
  { id: 'storage-shelf-tools-starboard', categories: ['toolsRepair'], position: [4.15, 3.24, -9.75], surface: 'shelf', surfaceGroupId: 'storage-shelf-tools-starboard', footprint: { width: 0.38, depth: 0.75 }, clearanceHeight: 0.65, emergency: false },
  { id: 'crate-top-tools', categories: ['toolsRepair'], position: [-1.5, 3.27, -1.1], surface: 'crate', surfaceGroupId: 'crate-top-tools', footprint: { width: 0.7, depth: 0.7 }, clearanceHeight: 0.65, emergency: false },
  { id: 'machinery-service', categories: ['toolsRepair'], position: [0, 3.43, -9.4], surface: 'workbench', surfaceGroupId: 'machinery-service', footprint: { width: 0.7, depth: 0.6 }, clearanceHeight: 0.65, emergency: false },

  { id: 'deck-rack-rod-port', categories: ['fishingDiving'], position: [-3.8, 2.98, -8.4], surface: 'rack', surfaceGroupId: 'deck-rack-rod-port', footprint: { width: 1.9, depth: 0.32 }, clearanceHeight: 0.7, emergency: false },
  { id: 'deck-rack-rod-starboard', categories: ['fishingDiving'], position: [3.8, 2.98, -8.4], surface: 'rack', surfaceGroupId: 'deck-rack-rod-starboard', footprint: { width: 1.9, depth: 0.32 }, clearanceHeight: 0.7, emergency: false },
  { id: 'deck-rack-scuba-port', categories: ['fishingDiving'], position: [-3.8, 2.42, -8.4], surface: 'rack', surfaceGroupId: 'deck-rack-scuba-port', footprint: { width: 1.1, depth: 0.8 }, clearanceHeight: 0.9, emergency: false },
  { id: 'deck-rack-scuba-starboard', categories: ['fishingDiving'], position: [3.2, 2.42, -8.4], surface: 'rack', surfaceGroupId: 'deck-rack-scuba-starboard', footprint: { width: 1.1, depth: 0.8 }, clearanceHeight: 0.9, emergency: false },
  { id: 'crate-top-gear', categories: ['fishingDiving'], position: [1.5, 3.27, -1.1], surface: 'crate', surfaceGroupId: 'crate-top-gear', footprint: { width: 0.5, depth: 0.5 }, clearanceHeight: 0.65, emergency: false },
];

const EMERGENCY_ANCHOR_SPECS: readonly AnchorSpec[] = [
  { id: 'emergency-food', categories: ['foodWater'], position: [-3.8, 3.05, 8.8], surface: 'shelf', surfaceGroupId: 'emergency-food-surface', footprint: { width: 2.1, depth: 1.2 }, clearanceHeight: 1.3, emergency: true },
  { id: 'emergency-medical', categories: ['medicalEmergency'], position: [3.7, 3.35, 12.4], surface: 'cabinet', surfaceGroupId: 'emergency-medical-surface', footprint: { width: 2.1, depth: 1.2 }, clearanceHeight: 1.3, emergency: true },
  { id: 'emergency-tools', categories: ['toolsRepair'], position: [-3.5, 3.08, -9.4], surface: 'workbench', surfaceGroupId: 'emergency-tools-surface', footprint: { width: 2.1, depth: 1.2 }, clearanceHeight: 1.3, emergency: true },
  { id: 'emergency-gear', categories: ['fishingDiving'], position: [3.8, 2.42, -8.4], surface: 'rack', surfaceGroupId: 'emergency-gear-surface', footprint: { width: 2.1, depth: 1.2 }, clearanceHeight: 1.3, emergency: true },
];

function supportMaterial(materials: ShipMaterials, spec: AnchorSpec): Material {
  if (spec.emergency) return materials.emergency;
  switch (spec.surface) {
    case 'shelf':
    case 'desk':
    case 'workbench':
      return materials.furnitureWood[0];
    case 'cabinet':
      return materials.paintedSteel;
    case 'rack':
      return materials.deckTimber[0];
    case 'crate':
      return materials.crateWood[0];
  }
}

function createAnchorsAndSupports(root: Group, materials: ShipMaterials): ShipItemAnchor[] {
  const specs = [...REGULAR_ANCHOR_SPECS, ...EMERGENCY_ANCHOR_SPECS];
  specs.forEach((spec) => {
    const [x, topY, z] = spec.position;
    const mesh = addBox(
      root,
      `anchor-support-${spec.id}`,
      [spec.footprint.width, 0.06, spec.footprint.depth],
      [x, topY - 0.03, z],
      supportMaterial(materials, spec),
    );
    const metadata: AnchorSupportMetadata = {
      surfaceGroupId: spec.surfaceGroupId,
      surface: spec.surface,
      centerX: x,
      centerZ: z,
      topY,
      width: spec.footprint.width,
      depth: spec.footprint.depth,
    };
    mesh.userData.anchorSupport = metadata;
  });
  return specs.map(makeAnchor);
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

function addCargoDeckEquipment(
  root: Group,
  materials: ShipMaterials,
  colliders: CollisionBox[],
): void {
  [[-3.5, 2.34, 0.4], [3.5, 2.34, 0.4]].forEach((position, index) => {
    const mesh = new Mesh(geometryLibrary(root).torus, materials.rope);
    mesh.name = `rope-coil-${index + 1}`;
    mesh.position.set(position[0]!, position[1]!, position[2]!);
    mesh.rotation.x = Math.PI / 2;
    mesh.scale.setScalar(0.48);
    mesh.castShadow = true;
    root.add(mesh);
  });
  [[-2.8, 2.62, -5.35], [2.8, 2.62, -5.35]].forEach((position, index) => {
    addCylinder(root, `deck-vent-${index + 1}`, 0.34, 0.75, position as [number, number, number], materials.paintedSteel);
    addCollider(colliders, new Vector3(position[0], 2.22, position[2]), [0.68, 0.75, 0.68], 'deck-vent');
  });
  [[-2.5, 2.72, 1.2], [2.5, 2.72, 1.2]].forEach((position, index) => {
    addCylinder(root, `winch-drum-${index + 1}`, 0.48, 0.85, position as [number, number, number], materials.darkMetal, Math.PI / 2);
    addCollider(colliders, new Vector3(position[0], 2.22, position[2]), [0.85, 0.96, 0.96], 'winch-drum');
  });
}

export function createShipFurniture(materials: ShipMaterials): ShipFurnitureBuild {
  const root = new Group();
  root.name = 'ship-furniture';
  const library = geometryLibrary(root);
  const colliders: CollisionBox[] = [];

  const bunks = [new Vector3(-3.25, 2.22, 7.75), new Vector3(3.25, 2.22, 9.1)];
  bunks.forEach((position) => {
    addBunk(root, materials, position, 0);
    addCollider(colliders, position, [1.05, 1.65, 2.18], 'bunk');
  });
  const cabinDesks = [new Vector3(-2.25, 2.22, 6.25), new Vector3(2.25, 2.22, 6.25)];
  cabinDesks.forEach((position, index) => {
    addDesk(root, materials, position, 0);
    addCollider(colliders, position, [1.7, 0.94, 0.78], 'desk');
    addChair(root, materials, new Vector3(position.x, position.y, position.z - 0.82), index === 0 ? 0 : Math.PI);
  });
  [new Vector3(-3.45, 2.22, 8.75), new Vector3(3.45, 2.22, 8.05)].forEach((position) => {
    addShelf(root, materials, position, Math.PI / 2);
    addCollider(colliders, position, [1.85, 1.72, 0.44], 'wall-shelf', Math.PI / 2);
  });
  [new Vector3(-3.45, 2.22, 10.05), new Vector3(3.45, 2.22, 10.05)].forEach((position) => {
    addLocker(root, materials, position, 0);
    addCollider(colliders, position, [0.78, 1.82, 0.64], 'locker');
  });
  const table = addDesk(root, materials, new Vector3(0, 2.22, 9), 0);
  table.name = 'small-table';
  addCollider(colliders, table.position, [1.7, 0.94, 0.78], 'desk');

  const helm = addDesk(root, materials, new Vector3(0, 2.32, 14.45), 0);
  helm.name = 'helm-desk';
  addCollider(colliders, helm.position, [1.7, 0.94, 0.78], 'desk');
  const chartTable = addDesk(root, materials, new Vector3(0, 2.32, 12.65), 0);
  chartTable.name = 'chart-table';
  addCollider(colliders, chartTable.position, [1.7, 0.94, 0.78], 'desk');
  [new Vector3(-3.2, 2.32, 14), new Vector3(3.2, 2.32, 14)].forEach((position, index) => {
    const cabinet = addLocker(root, materials, position, 0);
    cabinet.name = `instrument-cabinet-${index + 1}`;
    addCollider(colliders, position, [0.78, 1.82, 0.64], 'locker');
  });
  const emergencyCabinet = addLocker(root, materials, new Vector3(3.2, 2.32, 12.35), 0);
  emergencyCabinet.name = 'emergency-cabinet';
  emergencyCabinet.traverse((object) => {
    if (object instanceof Mesh && object.name === 'locker-door') object.material = materials.emergency;
  });
  addCollider(colliders, emergencyCabinet.position, [0.78, 1.82, 0.64], 'locker');

  [new Vector3(-4.15, 2.22, -9.75), new Vector3(4.15, 2.22, -9.75)].forEach((position) => {
    addShelf(root, materials, position, Math.PI / 2);
    addCollider(colliders, position, [1.85, 1.72, 0.44], 'wall-shelf', Math.PI / 2);
  });
  [new Vector3(-3.5, 2.14, -9.4), new Vector3(3.2, 2.22, -8)].forEach((position) => {
    addWorkbench(root, materials, position, 0);
    addCollider(colliders, position, [2.3, 0.95, 1.3], 'workbench');
  });
  [new Vector3(-3.9, 2.22, -10.9), new Vector3(0, 2.22, -10.95), new Vector3(3.9, 2.22, -10.9)].forEach((position) => {
    addLocker(root, materials, position, 0);
    addCollider(colliders, position, [0.78, 1.82, 0.64], 'locker');
  });
  [new Vector3(-3.8, 2.2, -8.4), new Vector3(3.8, 2.2, -8.4)].forEach((position) => {
    addEquipmentRack(root, materials, position, 0);
    addCollider(colliders, position, [2.3, 0.82, 1.3], 'equipment-rack');
  });
  addBox(root, 'machinery-block', [1.9, 1.18, 1.45], [0, 2.81, -9.4], materials.paintedSteel);
  addCollider(colliders, new Vector3(0, 2.22, -9.4), [1.9, 1.18, 1.45], 'machinery-block');

  const cratePositions = [
    new Vector3(-1.5, 2.22, -4.1), new Vector3(1.5, 2.22, -4.1),
    new Vector3(-1.5, 2.22, -1.1), new Vector3(1.5, 2.22, -1.1),
    new Vector3(-1.5, 2.22, 1.9), new Vector3(1.5, 2.22, 1.9),
  ];
  const crateSize = new Vector3(1.35, 1.05, 1.15);
  cratePositions.forEach((position) => {
    addCargoCrate(root, materials, position, crateSize);
    addCollider(colliders, position, [crateSize.x, crateSize.y, crateSize.z], 'cargo-crate');
  });
  addCargoDeckEquipment(root, materials, colliders);
  addDecorations(root, materials);

  const routeClearancePoints = [-10, -8.2, -6.5, -4, 0, 2, 5.2, 8.2, 10.4, 12, 14.5].flatMap((z) => [
    new Vector3(z === -6.5 ? -5.4 : -5.6, 3.72, z),
    new Vector3(z === -6.5 ? 5.4 : 5.6, 3.72, z),
  ]);
  const anchors = createAnchorsAndSupports(root, materials);
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
