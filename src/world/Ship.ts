import { Group, Vector3 } from 'three';
import type { WaterExclusionHeightProfile } from '../ocean/WaterExclusion';
import {
  segmentBoxInterval,
  type CollisionArc,
  type CollisionBox,
} from '../player/collisions';
import type { LadderClimbZone } from '../player/LadderTraversal';
import type { PlayerNavigationBounds } from '../player/PlayerController';
import { enableItemAmbientOcclusionOccluder } from '../rendering/ItemAmbientOcclusion';
import { createShipDeckDetails } from './ShipDeckDetails';
import { createShipFurniture } from './ShipFurniture';
import { ShipFurnitureLibrary } from './ShipFurnitureLibrary';
import { createShipGeometry } from './ShipGeometry';
import { validateShipItemSurfaces, type ShipItemSurface } from './ShipItemPlacement';
import { FREIGHTER_DIMENSIONS, SHIP_LAYOUT, validateShipLayout } from './ShipLayout';
import { createShipMaterials } from './ShipMaterials';
import { createShipRigging } from './ShipRigging';
import { ShipSmoke } from './ShipSmoke';
import type { ShipAssets } from './ShipAssets';

export interface ShipBuild {
  root: Group;
  colliders: CollisionBox[];
  interactionOccluders: readonly CollisionBox[];
  arcColliders: CollisionArc[];
  readonly climbZones: readonly LadderClimbZone[];
  itemSurfaces: ShipItemSurface[];
  furnitureColliderById: ReadonlyMap<string, CollisionBox>;
  playerStart: Vector3;
  evacuationPoint: Vector3;
  lifeboatAnchor: Vector3;
  playerNavigationBounds: PlayerNavigationBounds;
  waterExclusion: {
    halfWidth: number;
    halfLength: number;
    taperStart: number;
    minimumLocalY: number;
    heightProfile: WaterExclusionHeightProfile;
  };
  updateEffects(delta: number, sinkingProgress: number): void;
  dispose(): void;
}

const SURFACE_EPSILON = 1e-6;

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= SURFACE_EPSILON;
}

function matchesAuthoredOpenShelfSurface(surface: ShipItemSurface): boolean {
  const owner = SHIP_LAYOUT.furniture.find(({ id }) => id === surface.furnitureId);
  if (!owner || owner.modelId !== 'bookcaseOpen'
    || surface.furnitureModelId !== owner.modelId) return false;
  const authored = owner.surfaces.find(({ id }) => id === surface.id);
  if (!authored) return false;
  const cosine = Math.cos(owner.rotationY);
  const sine = Math.sin(owner.rotationY);
  const localX = authored.localPosition[0] * owner.scale[0];
  const localY = authored.localPosition[1] * owner.scale[1];
  const localZ = authored.localPosition[2] * owner.scale[2];
  const expectedPosition = new Vector3(
    owner.position[0] + localX * cosine + localZ * sine,
    owner.position[1] + localY,
    owner.position[2] - localX * sine + localZ * cosine,
  );
  return surface.position.distanceTo(expectedPosition) <= SURFACE_EPSILON
    && surface.physicalSlotId === authored.physicalSlotId
    && nearlyEqual(surface.footprint.width, authored.footprint.width * owner.scale[0])
    && nearlyEqual(surface.footprint.depth, authored.footprint.depth * owner.scale[2])
    && nearlyEqual(surface.clearanceHeight, authored.clearanceHeight * owner.scale[1])
    && nearlyEqual(surface.rotation.x, authored.localRotation[0])
    && nearlyEqual(surface.rotation.y, authored.localRotation[1] + owner.rotationY)
    && nearlyEqual(surface.rotation.z, authored.localRotation[2])
    && surface.fallback === authored.fallback;
}

function ownerApertureAllowsRay(
  surface: ShipItemSurface,
  eye: Vector3,
  target: Vector3,
  collider: CollisionBox,
): boolean {
  const authoredOpenShelf = surface.furnitureModelId === 'bookcaseOpen'
    && matchesAuthoredOpenShelfSurface(surface);
  if (surface.furnitureModelId === 'bookcaseOpen' && !authoredOpenShelf) return false;
  const aboveSurface = {
    ...collider,
    minY: Math.max(collider.minY, surface.position.y + 1e-6),
  };
  if (aboveSurface.minY >= aboveSurface.maxY - 1e-6) return true;
  const interval = segmentBoxInterval(eye, target, aboveSurface);
  if (!interval) return true;
  if (!authoredOpenShelf) return false;
  const entryY = eye.y + (target.y - eye.y) * interval.minimum;
  const exitY = eye.y + (target.y - eye.y) * interval.maximum;
  const apertureTop = surface.position.y + surface.clearanceHeight;
  return Math.min(entryY, exitY) >= surface.position.y - 1e-6
    && Math.max(entryY, exitY) <= apertureTop + 1e-6;
}

export function isShipSurfaceStandingPointVisible(
  surface: ShipItemSurface,
  standingPoint: Vector3,
  colliders: readonly CollisionBox[],
): boolean {
  if (standingPoint.distanceTo(surface.position) > 2.2 + 1e-6) return false;
  const outsideInflatedColliders = colliders.every((collider) => {
    if (collider.maxY <= standingPoint.y + 1e-6) return true;
    const closestX = Math.max(collider.minX, Math.min(standingPoint.x, collider.maxX));
    const closestZ = Math.max(collider.minZ, Math.min(standingPoint.z, collider.maxZ));
    return (standingPoint.x - closestX) ** 2 + (standingPoint.z - closestZ) ** 2
      >= 0.35 ** 2 - 1e-6;
  });
  if (!outsideInflatedColliders) return false;
  const eye = standingPoint.clone();
  eye.y += 1.5;
  const target = surface.position.clone();
  target.y += Math.min(0.35, surface.clearanceHeight / 2);
  return colliders.every((collider) => {
    const owned = collider as CollisionBox & { furnitureId?: string };
    if (owned.furnitureId === surface.furnitureId) {
      return ownerApertureAllowsRay(surface, eye, target, collider);
    }
    return !segmentBoxInterval(eye, target, collider);
  });
}

function visibleProductionSurfaces(
  surfaces: readonly ShipItemSurface[],
  colliders: readonly CollisionBox[],
): ShipItemSurface[] {
  return surfaces.flatMap((surface) => {
    const standingPoints = surface.standingPoints.filter((standingPoint) =>
      isShipSurfaceStandingPointVisible(surface, standingPoint, colliders));
    return standingPoints.length > 0 ? [{ ...surface, standingPoints }] : [];
  });
}

function requiredTarget(id: string): readonly [number, number] {
  const target = SHIP_LAYOUT.targets.find((candidate) => candidate.id === id);
  if (!target) throw new Error(`Ship assembly requires navigation target ${id}`);
  return target.position;
}

export function createShip(
  shipFurniture: ShipFurnitureLibrary,
  maxTextureAnisotropy: number,
  shipAssets?: ShipAssets,
): ShipBuild {
  validateShipLayout(SHIP_LAYOUT);
  const [startX, startZ] = requiredTarget('start');
  const [evacuationX, evacuationZ] = requiredTarget('evacuation');
  const halfWidth = FREIGHTER_DIMENSIONS.width / 2;
  const halfLength = FREIGHTER_DIMENSIONS.length / 2;
  const root = new Group();
  root.name = 'sinking-ship';
  const materials = createShipMaterials(0x51f15e, maxTextureAnisotropy, shipAssets);
  let geometry: ReturnType<typeof createShipGeometry> | undefined;
  let furniture: ReturnType<typeof createShipFurniture> | undefined;
  let details: ReturnType<typeof createShipDeckDetails> | undefined;
  let rigging: ReturnType<typeof createShipRigging> | undefined;
  let smoke: ShipSmoke | undefined;
  try {
    geometry = createShipGeometry(materials, SHIP_LAYOUT);
    furniture = createShipFurniture(materials, shipFurniture, SHIP_LAYOUT);
    details = createShipDeckDetails(shipFurniture, SHIP_LAYOUT.details);
    rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    const structuralColliders = [
      ...geometry.shellColliders,
      ...details.colliders,
      ...rigging.colliders,
    ];
    validateShipItemSurfaces(
      furniture.surfaces,
      structuralColliders,
      furniture.colliderByFurnitureId,
    );
    smoke = new ShipSmoke(geometry.stackOutlets);
    smoke.points.name = 'freighter-smoke';
    geometry.root.add(
      furniture.root,
      details.root,
      rigging.root,
      smoke.points,
    );
    root.add(geometry.root);
    enableItemAmbientOcclusionOccluder(root);
  } catch (error) {
    smoke?.dispose();
    rigging?.disposeGeometry();
    details?.disposeGeometry();
    furniture?.disposeGeometry();
    geometry?.disposeGeometry();
    materials.dispose();
    throw error;
  }

  const assembledGeometry = geometry;
  const assembledFurniture = furniture;
  const assembledDetails = details;
  const assembledRigging = rigging;
  const assembledSmoke = smoke;
  const colliders = [
    ...assembledGeometry.shellColliders,
    ...assembledFurniture.colliders,
    ...assembledDetails.colliders,
    ...assembledRigging.colliders,
  ];
  const itemSurfaces = visibleProductionSurfaces(assembledFurniture.surfaces, colliders);
  let disposed = false;

  return {
    root,
    colliders,
    interactionOccluders: assembledGeometry.shellColliders,
    arcColliders: assembledGeometry.arcColliders,
    climbZones: assembledGeometry.climbZones,
    itemSurfaces,
    furnitureColliderById: assembledFurniture.colliderByFurnitureId,
    playerStart: new Vector3(startX, FREIGHTER_DIMENSIONS.deckY + 1.5, startZ),
    evacuationPoint: new Vector3(
      evacuationX,
      FREIGHTER_DIMENSIONS.deckY + 1.5,
      evacuationZ,
    ),
    lifeboatAnchor: new Vector3(halfWidth + 2.75, 0.35, evacuationZ),
    playerNavigationBounds: {
      safe: {
        minX: -halfWidth + 0.35,
        maxX: halfWidth - 0.35,
        minZ: -halfLength + 0.8,
        maxZ: halfLength - 0.8,
      },
      fall: {
        minX: -halfWidth - 0.8,
        maxX: halfWidth + 0.8,
        minZ: -halfLength - 0.8,
        maxZ: halfLength + 0.8,
      },
    },
    waterExclusion: assembledGeometry.waterExclusion,
    updateEffects: (delta, progress) => {
      if (disposed) return;
      assembledSmoke.update(delta, progress);
      assembledRigging.update(delta);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      assembledSmoke.dispose();
      assembledRigging.disposeGeometry();
      assembledDetails.disposeGeometry();
      assembledFurniture.disposeGeometry();
      assembledGeometry.disposeGeometry();
      materials.dispose();
    },
  };
}
