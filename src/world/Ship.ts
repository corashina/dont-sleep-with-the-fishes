import { Group, Vector3 } from 'three';
import type { CollisionArc, CollisionBox } from '../player/collisions';
import type { PlayerNavigationBounds } from '../player/PlayerController';
import { createShipFurniture } from './ShipFurniture';
import { ShipFurnitureLibrary } from './ShipFurnitureLibrary';
import { createShipGeometry } from './ShipGeometry';
import { validateShipItemSurfaces, type ShipItemSurface } from './ShipItemPlacement';
import { SHIP_LAYOUT, validateShipLayout } from './ShipLayout';
import { createShipMaterials } from './ShipMaterials';
import { ShipSmoke } from './ShipSmoke';

export interface ShipBuild {
  root: Group;
  colliders: CollisionBox[];
  arcColliders: CollisionArc[];
  itemSurfaces: ShipItemSurface[];
  furnitureColliderById: ReadonlyMap<string, CollisionBox>;
  playerStart: Vector3;
  evacuationPoint: Vector3;
  lifeboatAnchor: Vector3;
  playerNavigationBounds: PlayerNavigationBounds;
  waterExclusion: { halfWidth: number; halfLength: number };
  updateEffects(delta: number, sinkingProgress: number, reducedMotion: boolean): void;
  dispose(): void;
}

interface SegmentBoxInterval {
  readonly minimum: number;
  readonly maximum: number;
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

function segmentBoxInterval(
  start: Vector3,
  end: Vector3,
  box: CollisionBox,
): SegmentBoxInterval | undefined {
  let minimum = 0;
  let maximum = 1;
  for (const [startValue, delta, min, max] of [
    [start.x, end.x - start.x, box.minX, box.maxX],
    [start.y, end.y - start.y, box.minY, box.maxY],
    [start.z, end.z - start.z, box.minZ, box.maxZ],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (startValue < min || startValue > max) return undefined;
      continue;
    }
    const first = (min - startValue) / delta;
    const second = (max - startValue) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return undefined;
  }
  return maximum > 1e-6 && minimum < 1 - 1e-6
    ? { minimum, maximum }
    : undefined;
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

export function createShip(
  shipFurniture: ShipFurnitureLibrary,
  maxTextureAnisotropy: number,
): ShipBuild {
  validateShipLayout(SHIP_LAYOUT);
  const root = new Group();
  root.name = 'sinking-ship';
  const materials = createShipMaterials(0x51f15e, maxTextureAnisotropy);
  let geometry: ReturnType<typeof createShipGeometry> | undefined;
  let furniture: ReturnType<typeof createShipFurniture> | undefined;
  let smoke: ShipSmoke | undefined;
  try {
    geometry = createShipGeometry(materials);
    furniture = createShipFurniture(materials, shipFurniture, SHIP_LAYOUT);
    validateShipItemSurfaces(
      furniture.surfaces,
      geometry.shellColliders,
      furniture.colliderByFurnitureId,
    );
    smoke = new ShipSmoke(geometry.stackOutlets);
    smoke.points.name = 'freighter-smoke';
    geometry.root.add(furniture.root, smoke.points);
    root.add(geometry.root);
  } catch (error) {
    smoke?.dispose();
    furniture?.disposeGeometry();
    geometry?.disposeGeometry();
    materials.dispose();
    throw error;
  }

  const assembledGeometry = geometry;
  const assembledFurniture = furniture;
  const assembledSmoke = smoke;
  const colliders = [...assembledGeometry.shellColliders, ...assembledFurniture.colliders];
  const itemSurfaces = visibleProductionSurfaces(assembledFurniture.surfaces, colliders);
  let disposed = false;

  return {
    root,
    colliders,
    arcColliders: assembledGeometry.arcColliders,
    itemSurfaces,
    furnitureColliderById: assembledFurniture.colliderByFurnitureId,
    playerStart: new Vector3(0, 3.72, 7.2),
    evacuationPoint: new Vector3(5.4, 3.72, -6.5),
    lifeboatAnchor: new Vector3(9.0, 0.35, -6.5),
    playerNavigationBounds: {
      safe: { minX: -5.9, maxX: 5.9, minZ: -17.2, maxZ: 17.2 },
      fall: { minX: -7, maxX: 7, minZ: -18, maxZ: 18 },
    },
    waterExclusion: assembledGeometry.waterExclusion,
    updateEffects: (delta, progress, reducedMotion) =>
      assembledSmoke.update(delta, progress, reducedMotion),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      assembledSmoke.dispose();
      assembledFurniture.disposeGeometry();
      assembledGeometry.disposeGeometry();
      materials.dispose();
    },
  };
}
