import {
  BoxGeometry,
  BufferGeometry,
  Euler,
  Group,
  Material,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import { ShipFurnitureLibrary } from './ShipFurnitureLibrary';
import { SHIP_LAYOUT } from './shipLayoutData';
import { analyzeShipNavigation } from './ShipNavigation';
import {
  type ShipFurniturePlacementSpec,
  type ShipLayoutSpec,
} from './ShipLayoutTypes';
import type { ShipItemSurface } from './ShipItemPlacement';
import type { ShipMaterials } from './ShipMaterials';
import { SHIP_FURNITURE_MODEL_SPECS } from './shipFurnitureManifest';

export interface ShipFurnitureCollider extends CollisionBox {
  readonly furnitureId: string;
  readonly furnitureModelId: ShipFurniturePlacementSpec['modelId'];
  readonly furnitureFamily: string;
}

export interface ShipFurnitureBuild {
  root: Group;
  colliders: ShipFurnitureCollider[];
  colliderByFurnitureId: ReadonlyMap<string, ShipFurnitureCollider>;
  surfaces: ShipItemSurface[];
  disposeGeometry(): void;
}

interface GeneratedGeometry {
  readonly box: BoxGeometry;
  readonly owned: ReadonlySet<BufferGeometry>;
}

function createGeneratedGeometry(): GeneratedGeometry {
  const box = new BoxGeometry(1, 1, 1);
  return { box, owned: new Set([box]) };
}

function addBox(
  parent: Group,
  geometry: BoxGeometry,
  material: Material,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...size);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createCargoCrate(
  parent: Group,
  library: ShipFurnitureLibrary,
  size: readonly [number, number, number],
): void {
  const model = library.clone('cargoCrate');
  const canonicalSize = SHIP_FURNITURE_MODEL_SPECS.cargoCrate.canonicalSize;
  model.scale.set(
    size[0] / canonicalSize[0],
    size[1] / canonicalSize[1],
    size[2] / canonicalSize[2],
  );
  parent.add(model);
}

function createCargoCrateStack(
  parent: Group,
  library: ShipFurnitureLibrary,
  size: readonly [number, number, number],
): void {
  const columns = size[0] > 1.2 ? 2 : 1;
  const crateSize = 1.05;
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const crate = new Group();
      crate.position.set(
        (column - (columns - 1) / 2) * crateSize,
        row * crateSize,
        0,
      );
      crate.rotation.y = (row + column) % 2 === 0 ? -0.018 : 0.022;
      createCargoCrate(crate, library, [crateSize, crateSize, crateSize]);
      parent.add(crate);
    }
  }
}

function createCargoRack(
  parent: Group,
  geometry: BoxGeometry,
  materials: ShipMaterials,
  size: readonly [number, number, number],
): void {
  const topHeight = 0.12;
  const legHeight = size[1] - topHeight;
  addBox(
    parent,
    geometry,
    materials.hatchTimber,
    'cargo-rack-top',
    [size[0], topHeight, size[2]],
    [0, size[1] - topHeight / 2, 0],
  );
  ([-1, 1] as const).forEach((xSign) => ([-1, 1] as const).forEach((zSign) => {
    addBox(
      parent,
      geometry,
      materials.darkMetal,
      `cargo-rack-leg-${xSign}-${zSign}`,
      [0.12, legHeight, 0.12],
      [xSign * (size[0] / 2 - 0.12), legHeight / 2, zSign * (size[2] / 2 - 0.12)],
    );
  }));
}

function createOpenShelf(
  parent: Group,
  library: ShipFurnitureLibrary,
  placementSpec: ShipFurniturePlacementSpec,
): void {
  const shelfHeight = SHIP_FURNITURE_MODEL_SPECS.bookcaseOpen.canonicalSize[1];
  const surface = placementSpec.surfaces[0];
  if (surface === undefined) return;
  const shelf = library.clone('bookcaseOpen');
  shelf.name = 'open-shelf';
  shelf.position.set(
    0,
    surface.localPosition[1] - shelfHeight,
    surface.localPosition[2],
  );
  shelf.rotation.y = Math.PI / 2;
  parent.add(shelf);
}

function addFocalFurnitureConstruction(
  placementSpec: ShipFurniturePlacementSpec,
  placementRoot: Group,
  geometry: BoxGeometry,
  materials: ShipMaterials,
): void {
  const [width, height, depth] = placementSpec.colliderSize;
  if (placementSpec.id === 'cabin-desk-aft') {
    addBox(
      placementRoot,
      geometry,
      materials.darkMetal,
      'construction:desk-edge-band',
      [width * 0.9, 0.08, 0.07],
      [0, height - 0.12, depth / 2 + 0.035],
    );
    ([
      ['port', -1],
      ['starboard', 1],
    ] as const).forEach(([side, sign]) => {
      addBox(
        placementRoot,
        geometry,
        materials.darkMetal,
        `construction:desk-floor-cleat-${side}`,
        [0.13, 0.09, depth * 0.72],
        [sign * (width / 2 - 0.16), 0.045, 0],
      );
      addBox(
        placementRoot,
        geometry,
        materials.exposedMetal,
        `construction:desk-bracket-${side}`,
        [0.1, 0.3, 0.06],
        [sign * (width / 2 - 0.12), height * 0.55, depth / 2 + 0.03],
      );
    });
  } else {
    return;
  }

}

function worldCollider(placementSpec: ShipFurniturePlacementSpec): ShipFurnitureCollider {
  const quarterTurn = Math.abs(Math.sin(placementSpec.rotationY)) > 0.5;
  const width = (quarterTurn ? placementSpec.colliderSize[2] : placementSpec.colliderSize[0])
    * (quarterTurn ? placementSpec.scale[2] : placementSpec.scale[0]);
  const depth = (quarterTurn ? placementSpec.colliderSize[0] : placementSpec.colliderSize[2])
    * (quarterTurn ? placementSpec.scale[0] : placementSpec.scale[2]);
  return {
    minX: placementSpec.position[0] - width / 2,
    maxX: placementSpec.position[0] + width / 2,
    minY: placementSpec.position[1],
    maxY: placementSpec.position[1] + placementSpec.colliderSize[1] * placementSpec.scale[1],
    minZ: placementSpec.position[2] - depth / 2,
    maxZ: placementSpec.position[2] + depth / 2,
    furnitureId: placementSpec.id,
    furnitureModelId: placementSpec.modelId,
    furnitureFamily: placementSpec.modelId,
  };
}

function transformedSurfaces(
  owner: ShipFurniturePlacementSpec,
  ownerRoot: Group,
): ShipItemSurface[] {
  ownerRoot.updateMatrixWorld(true);
  const quarterTurn = Math.abs(Math.sin(owner.rotationY)) > 0.5;
  return owner.surfaces.map((surface) => {
    const localRotation = new Euler(...surface.localRotation);
    const rotation = new Euler().setFromQuaternion(
      new Quaternion().setFromEuler(localRotation).premultiply(ownerRoot.quaternion),
      localRotation.order,
    );
    return {
      id: surface.id,
      physicalSlotId: surface.physicalSlotId,
      furnitureId: owner.id,
      furnitureModelId: owner.modelId,
      regionId: surface.regionId,
      branch: surface.branch,
      position: new Vector3(...surface.localPosition).applyMatrix4(ownerRoot.matrixWorld),
      rotation,
      footprint: {
        width: (quarterTurn ? surface.footprint.depth : surface.footprint.width)
          * (quarterTurn ? owner.scale[2] : owner.scale[0]),
        depth: (quarterTurn ? surface.footprint.width : surface.footprint.depth)
          * (quarterTurn ? owner.scale[0] : owner.scale[2]),
      },
      clearanceHeight: surface.clearanceHeight * owner.scale[1],
      standingPoints: surface.standingPoints.map((point) =>
        new Vector3(...point).applyMatrix4(ownerRoot.matrixWorld)),
    };
  });
}

export function createShipFurniture(
  materials: ShipMaterials,
  library: ShipFurnitureLibrary,
  layout: ShipLayoutSpec = SHIP_LAYOUT,
): ShipFurnitureBuild {
  const root = new Group();
  root.name = 'ship-furniture';
  const geometry = createGeneratedGeometry();
  const colliders: ShipFurnitureCollider[] = [];
  const colliderByFurnitureId = new Map<string, ShipFurnitureCollider>();
  const surfaces: ShipItemSurface[] = [];

  for (const placementSpec of layout.furniture) {
    const placementRoot = new Group();
    placementRoot.name = `furniture:${placementSpec.id}`;
    placementRoot.position.set(...placementSpec.position);
    placementRoot.rotation.y = placementSpec.rotationY;
    placementRoot.scale.set(...placementSpec.scale);
    placementRoot.userData.furnitureId = placementSpec.id;
    placementRoot.userData.modelId = placementSpec.modelId;
    if (placementSpec.modelId === 'cargoCrate') {
      createCargoCrate(
        placementRoot,
        library,
        placementSpec.colliderSize,
      );
    } else if (placementSpec.modelId === 'cargoCrateStack') {
      createCargoCrateStack(
        placementRoot,
        library,
        placementSpec.colliderSize,
      );
    } else if (placementSpec.modelId === 'cargoRack') {
      createCargoRack(placementRoot, geometry.box, materials, placementSpec.colliderSize);
    } else if (placementSpec.modelId === 'bookcaseOpen') {
      createOpenShelf(placementRoot, library, placementSpec);
    } else {
      placementRoot.add(library.clone(placementSpec.modelId));
    }
    addFocalFurnitureConstruction(
      placementSpec,
      placementRoot,
      geometry.box,
      materials,
    );
    root.add(placementRoot);
    const collider = worldCollider(placementSpec);
    colliders.push(collider);
    colliderByFurnitureId.set(placementSpec.id, collider);
    surfaces.push(...transformedSurfaces(placementSpec, placementRoot));
  }
  for (const decorationSpec of layout.decorations) {
    const decorationRoot = new Group();
    decorationRoot.name = `decoration:${decorationSpec.id}`;
    decorationRoot.position.set(...decorationSpec.position);
    decorationRoot.rotation.set(...decorationSpec.rotation);
    decorationRoot.scale.set(...decorationSpec.scale);
    decorationRoot.userData.decorationId = decorationSpec.id;
    decorationRoot.userData.modelId = decorationSpec.modelId;
    decorationRoot.add(library.clone(decorationSpec.modelId));
    root.add(decorationRoot);
  }
  const reachableStandingPoints = new Set(
    analyzeShipNavigation(layout).reachableSurfaceStandingPointIds,
  );
  const usableSurfaces = surfaces.map((surface) => ({
    ...surface,
    standingPoints: surface.standingPoints.filter((point, index) =>
      reachableStandingPoints.has(`${surface.id}-standing-${index}`)
      && colliders.every((box) => point.x < box.minX - 0.35
        || point.x > box.maxX + 0.35
        || point.z < box.minZ - 0.35
        || point.z > box.maxZ + 0.35)),
  }));

  let disposed = false;
  return {
    root,
    colliders,
    colliderByFurnitureId,
    surfaces: usableSurfaces,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      geometry.owned.forEach((ownedGeometry) => ownedGeometry.dispose());
    },
  };
}
