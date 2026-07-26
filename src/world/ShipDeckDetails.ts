import {
  Group,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import type { ShipDeckDetailKind, ShipDeckDetailSpec } from './ShipLayout';
import type { ShipFurnitureLibrary } from './ShipFurnitureLibrary';

export interface ShipDeckDetailsBuild {
  readonly root: Group;
  readonly colliders: CollisionBox[];
  disposeGeometry(): void;
}

function addDetailParts(
  kind: ShipDeckDetailKind,
  root: Group,
  library: ShipFurnitureLibrary,
): void {
  root.add(library.clone(kind === 'barrel' ? 'barrel' : 'cargoBox'));
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
  library: ShipFurnitureLibrary,
  specs: readonly ShipDeckDetailSpec[],
): ShipDeckDetailsBuild {
  const root = new Group();
  root.name = 'ship-deck-details';
  const colliders: CollisionBox[] = [];

  specs.forEach((spec) => {
    const detailRoot = new Group();
    detailRoot.name = `detail:${spec.id}`;
    detailRoot.position.set(...spec.position);
    detailRoot.rotation.y = spec.rotationY;
    detailRoot.scale.set(...spec.scale);
    detailRoot.userData.detailKind = spec.kind;
    addDetailParts(spec.kind, detailRoot, library);
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
    },
  };
}
