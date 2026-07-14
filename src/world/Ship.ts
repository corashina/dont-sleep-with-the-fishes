import { Group, Vector3 } from 'three';
import type { CollisionBox } from '../player/collisions';
import type { PlayerNavigationBounds } from '../player/PlayerController';
import { createShipFurniture } from './ShipFurniture';
import { createShipGeometry } from './ShipGeometry';
import type { ShipItemAnchor } from './ShipItemPlacement';
import { createShipMaterials } from './ShipMaterials';
import { ShipSmoke } from './ShipSmoke';

export interface ShipBuild {
  root: Group;
  colliders: CollisionBox[];
  itemAnchors: ShipItemAnchor[];
  playerStart: Vector3;
  evacuationPoint: Vector3;
  lifeboatAnchor: Vector3;
  playerNavigationBounds: PlayerNavigationBounds;
  waterExclusion: { halfWidth: number; halfLength: number };
  updateEffects(delta: number, sinkingProgress: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createShip(): ShipBuild {
  const root = new Group();
  root.name = 'sinking-ship';
  const materials = createShipMaterials();
  const geometry = createShipGeometry(materials);
  const furniture = createShipFurniture(materials);
  const smoke = new ShipSmoke(geometry.stackOutlets);
  smoke.points.name = 'freighter-smoke';
  geometry.root.add(furniture.root, smoke.points);
  root.add(geometry.root);
  let disposed = false;

  return {
    root,
    colliders: [...geometry.shellColliders, ...furniture.colliders],
    itemAnchors: furniture.anchors,
    playerStart: new Vector3(0, 3.72, 7.5),
    evacuationPoint: new Vector3(5.4, 3.72, -6.5),
    lifeboatAnchor: new Vector3(7.6, 0.35, -6.5),
    playerNavigationBounds: {
      safe: { minX: -5.9, maxX: 5.9, minZ: -16, maxZ: 15.2 },
      fall: { minX: -7, maxX: 7, minZ: -18, maxZ: 18 },
    },
    waterExclusion: geometry.waterExclusion,
    updateEffects: (delta, progress, reducedMotion) => smoke.update(delta, progress, reducedMotion),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      smoke.dispose();
      furniture.disposeGeometry();
      geometry.disposeGeometry();
      materials.dispose();
    },
  };
}
