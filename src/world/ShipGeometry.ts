import {
  BufferGeometry,
  Group,
  Vector3,
} from 'three';
import type {
  CollisionArc,
  CollisionBox,
} from '../player/collisions';
import type { LadderClimbZone } from '../player/LadderTraversal';
import { SHIP_LAYOUT } from './shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  type ShipLayoutSpec,
  type ShipZoneId,
} from './ShipLayoutTypes';
import type { ShipMaterials } from './ShipMaterials';
import { disposeResourceSets, ignoreCleanupError } from './SceneResources';
import { addShipAccess } from './ShipAccessGeometry';
import { addShipExterior } from './ShipExteriorGeometry';
import {
  type ShipGeometryBuildContext,
} from './ShipGeometryPrimitives';
import { addShipHull, type ShipHullWaterExclusion } from './ShipHullGeometry';
import { addShipRooms } from './ShipRoomGeometry';

export interface ShipGeometryBuild {
  root: Group;
  shellColliders: CollisionBox[];
  arcColliders: CollisionArc[];
  zoneCenters: ReadonlyMap<ShipZoneId, Vector3>;
  waterExclusion: ShipHullWaterExclusion;
  stackOutlets: readonly [Vector3, Vector3];
  climbZones: readonly LadderClimbZone[];
  disposeGeometry(): void;
}

export function createShipGeometry(
  materials: ShipMaterials,
  layout: ShipLayoutSpec = SHIP_LAYOUT,
): ShipGeometryBuild {
  const root = new Group();
  root.name = 'coastal-freighter';
  const geometries = new Set<BufferGeometry>();
  const shellColliders: CollisionBox[] = [];
  const arcColliders: CollisionArc[] = [];
  const context: ShipGeometryBuildContext = {
    root,
    geometries,
    shellColliders,
    materials,
  };

  try {
    const { waterExclusion } = addShipHull(context, layout);
    addShipRooms(context, layout);
    const climbZones = addShipAccess(context, layout);
    const stackOutlets = addShipExterior(context, layout);

    const zoneCenters = new Map<ShipZoneId, Vector3>(layout.zones.map((zone) => [
      zone.id,
      new Vector3(
        (zone.bounds.minX + zone.bounds.maxX) / 2,
        FREIGHTER_DIMENSIONS.deckY + 1.5,
        (zone.bounds.minZ + zone.bounds.maxZ) / 2,
      ),
    ]));
    root.updateMatrixWorld(true);
    let disposed = false;

    return {
      root,
      shellColliders,
      arcColliders,
      zoneCenters,
      waterExclusion,
      stackOutlets,
      climbZones,
      disposeGeometry: () => {
        if (disposed) return;
        disposed = true;
        disposeResourceSets(geometries);
      },
    };
  } catch (error) {
    ignoreCleanupError(() => disposeResourceSets(geometries));
    throw error;
  }
}
