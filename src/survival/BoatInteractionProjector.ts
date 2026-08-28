import type {
  Object3D,
  PerspectiveCamera,
  Scene,
} from 'three';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
} from '../game/ItemState';
import type { BoatSupplyGroupId } from '../world/BoatStorage';
import {
  createBoatObjectBoundsCache,
  projectBoatObjectBoundsInto,
  projectCachedBoatObjectBoundsInto,
  type BoatInteractionAnchor,
  type BoatInteractionHitArea,
  type BoatObjectBoundsCache,
  type ProjectedBoatBounds,
} from './BoatInteraction';
import type { BoatSupplyPresentationRecord } from './BoatSupplyDisplay';
import type { FocusedEventInteractionTarget } from './FocusedEventPresentation';
import { CARLITOS_LAB_INSTANCE_ID } from './ItemAnimationLab';
import { isDriftingItemEventId } from './eventCatalog';
import {
  FEATURED_EVENT_IDS,
  type FeaturedEventId,
} from './eventPresentationRoutes';
import type { ChestState, DayActionId } from './survivalTypes';

export const ACTION_FOR_ITEM = Object.freeze(Object.fromEntries(
  ITEM_IDS.flatMap((id) => {
    const action = ITEM_DEFINITIONS[id].dayAction;
    return action === null ? [] : [[id, action]];
  }),
) as Readonly<Partial<Record<ItemId, DayActionId>>>);

export interface EventInteractionProjectionHost {
  activeEventId(): string | null;
  interactionTargets(): readonly FocusedEventInteractionTarget[];
  interactionRoot(id: string): Object3D | null;
  resultRoot(id: string): Object3D | null;
  itemAimTarget(): Object3D | null;
}

export interface BoatInteractionProjectorRoots {
  readonly supplyRecords: readonly BoatSupplyPresentationRecord[];
  readonly carlitosRoot: Object3D;
  readonly carlitosInteractionRoot: Object3D;
  readonly fishingRoot: Object3D;
  readonly fishingVisibilityRoot: Object3D;
  readonly repairRoot: Object3D;
  readonly pillowRoot: Object3D;
  readonly chestRoot: Object3D;
  readonly chestState: () => ChestState;
  readonly radioInteractionAvailable: () => boolean;
  readonly activeFeaturedEventId: () => FeaturedEventId | null;
}

type MutableAnchor = {
  -readonly [Property in keyof BoatInteractionAnchor]: BoatInteractionAnchor[Property];
};

interface SupplyProjectionEntry {
  readonly record: BoatSupplyPresentationRecord;
  readonly cache: BoatObjectBoundsCache | null;
  readonly projection: ProjectedBoatBounds;
  readonly anchor: MutableAnchor;
}

interface FocusedProjectionEntry {
  readonly target: FocusedEventInteractionTarget;
  readonly cache: BoatObjectBoundsCache | null;
  readonly projection: ProjectedBoatBounds;
  readonly anchor: MutableAnchor;
}

const EMPTY_FOCUSED_ENTRIES: readonly FocusedProjectionEntry[] = Object.freeze([]);

interface FeaturedProjectionEntry {
  readonly eventId: FeaturedEventId;
  readonly projection: ProjectedBoatBounds;
  readonly anchor: MutableAnchor;
}

function projectionOutput(): ProjectedBoatBounds {
  return { x: 0, y: 0, width: 0, height: 0, depth: 0, visible: false };
}

function hitArea(width = 0, height = 0, depth = 0): BoatInteractionHitArea {
  return { width, height, depth };
}

function featuredAnchorLabel(eventId: FeaturedEventId): string {
  if (eventId === 'drifting-supplies') return 'SALVAGE';
  if (eventId === 'drifting-chest') return 'CHEST';
  return 'FLOWERS';
}

function featuredAnchorDescription(eventId: FeaturedEventId): string {
  if (isDriftingItemEventId(eventId)) return 'Floating salvage within reach.';
  return 'Pale blooms pass in the dark water.';
}

function featuredAnchorChoice(eventId: FeaturedEventId): string | null {
  if (isDriftingItemEventId(eventId)) return 'retrieve';
  return null;
}

function updatePoint(
  anchor: MutableAnchor,
  projection: ProjectedBoatBounds,
  visible: boolean,
): void {
  anchor.x = projection.x;
  anchor.y = projection.y;
  anchor.visible = visible;
}

function updateHitArea(
  anchor: MutableAnchor,
  projection: ProjectedBoatBounds,
  minimumWidth = 0,
  minimumHeight = 0,
  scale = 1,
): void {
  const area = anchor.hitArea!;
  area.width = Math.max(minimumWidth, projection.width * scale);
  area.height = Math.max(minimumHeight, projection.height * scale);
  area.depth = projection.depth;
}

export class BoatInteractionProjector {
  private readonly supplyEntries: readonly SupplyProjectionEntry[];
  private readonly fishingCache: BoatObjectBoundsCache | null;
  private readonly repairCache: BoatObjectBoundsCache | null;
  private readonly pillowCache: BoatObjectBoundsCache | null;
  private readonly chestCache: BoatObjectBoundsCache | null;
  private readonly carlitosCache: BoatObjectBoundsCache | null;
  private focusedEntries: readonly FocusedProjectionEntry[] = EMPTY_FOCUSED_ENTRIES;
  private hasFocusedChestTarget = false;
  private readonly featuredEntries: readonly FeaturedProjectionEntry[];
  private readonly fishingProjection = projectionOutput();
  private readonly repairProjection = projectionOutput();
  private readonly pillowProjection = projectionOutput();
  private readonly chestProjection = projectionOutput();
  private readonly carlitosProjection = projectionOutput();
  private readonly eventInteractionProjection = projectionOutput();
  private readonly eventResultProjection = projectionOutput();
  private readonly fishingAnchor: MutableAnchor;
  private readonly repairAnchor: MutableAnchor;
  private readonly pillowAnchor: MutableAnchor;
  private readonly chestAnchor: MutableAnchor;
  private readonly carlitosAnchor: MutableAnchor;
  private readonly nextAnchors: MutableAnchor[] = [];
  private readonly emptyAnchors: readonly BoatInteractionAnchor[] = Object.freeze([]);
  private outputAnchors: readonly BoatInteractionAnchor[] = this.emptyAnchors;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly roots: BoatInteractionProjectorRoots,
    private readonly eventHost: EventInteractionProjectionHost,
  ) {
    this.supplyEntries = roots.supplyRecords.map((record) => {
      const itemType = record.groupId === 'repairMaterial' ? null : record.groupId;
      return {
        record,
        cache: createBoatObjectBoundsCache(record.root),
        projection: projectionOutput(),
        anchor: {
          id: `supply:${record.groupId}`,
          itemType,
          supplyGroupId: record.groupId,
          toolId: null,
          action: null,
          x: 0,
          y: 0,
          visible: false,
          depleted: false,
          remainingUses: null,
          quantity: 0,
          usableQuantity: 0,
          brokenQuantity: 0,
          backingInstanceId: null,
          hitArea: hitArea(),
        },
      };
    });
    this.fishingCache = createBoatObjectBoundsCache(roots.fishingRoot);
    this.repairCache = createBoatObjectBoundsCache(roots.repairRoot);
    this.pillowCache = createBoatObjectBoundsCache(roots.pillowRoot);
    this.chestCache = createBoatObjectBoundsCache(roots.chestRoot);
    this.carlitosCache = createBoatObjectBoundsCache(roots.carlitosInteractionRoot);
    this.fishingAnchor = {
      id: 'fishing-tools',
      itemType: null,
      toolId: 'fishingRod',
      action: 'fish',
      x: 0,
      y: 0,
      visible: false,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: null,
      hitArea: hitArea(),
    };
    this.repairAnchor = {
      id: 'repair-tools',
      itemType: null,
      toolId: 'repairTools',
      action: 'repair',
      x: 0,
      y: 0,
      visible: false,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: null,
      hitArea: hitArea(),
    };
    this.pillowAnchor = {
      id: 'end-day-pillow',
      itemType: null,
      toolId: 'pillow',
      action: 'endDay',
      x: 0,
      y: 0,
      visible: false,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: null,
      hitArea: hitArea(),
    };
    this.chestAnchor = {
      id: 'persistent-chest',
      label: 'OPEN',
      description: 'A closed chest. Opening it costs three energy.',
      itemType: null,
      toolId: 'chest',
      action: null,
      x: 0,
      y: 0,
      visible: false,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: null,
      hitArea: hitArea(),
    };
    this.carlitosAnchor = {
      id: 'carlitos',
      companionId: 'carlitos',
      label: 'CARLITOS',
      description: 'Check his hunger, happiness, and health.',
      itemType: null,
      toolId: null,
      action: null,
      x: 0,
      y: 0,
      visible: false,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: CARLITOS_LAB_INSTANCE_ID,
      hitArea: hitArea(),
    };
    this.featuredEntries = FEATURED_EVENT_IDS.map((eventId) => {
      const anchor: MutableAnchor = {
        id: `event:${eventId}`,
        label: featuredAnchorLabel(eventId),
        description: featuredAnchorDescription(eventId),
        itemType: null,
        toolId: null,
        action: null,
        x: 0,
        y: 0,
        visible: false,
        depleted: false,
        remainingUses: null,
        quantity: 1,
        usableQuantity: 1,
        brokenQuantity: 0,
        backingInstanceId: null,
        hitArea: hitArea(),
      };
      if (isDriftingItemEventId(eventId)) {
        anchor.tooltip = false;
        anchor.eventFocusId = eventId;
      } else {
        const choice = featuredAnchorChoice(eventId);
        if (choice !== null) anchor.eventChoiceId = choice;
      }
      return { eventId, projection: projectionOutput(), anchor };
    });
  }

  installFocusedInteractionTargets(
    targets: readonly FocusedEventInteractionTarget[],
  ): void {
    if (this.disposed) return;
    const entries = targets.map((target): FocusedProjectionEntry => ({
      target,
      cache: createBoatObjectBoundsCache(target.root),
      projection: projectionOutput(),
      anchor: {
        id: target.id,
        label: target.label,
        description: target.description,
        tooltip: target.tooltip,
        ...(target.choiceId === undefined
          ? { eventFocusId: target.focusEventId }
          : { eventChoiceId: target.choiceId }),
        itemType: null,
        toolId: null,
        action: null,
        x: 0,
        y: 0,
        visible: false,
        depleted: false,
        remainingUses: null,
        quantity: 1,
        usableQuantity: 1,
        brokenQuantity: 0,
        backingInstanceId: null,
        hitArea: hitArea(),
      },
    }));
    const hasChestTarget = entries.some(({ target }) => target.id === 'persistent-chest');
    this.focusedEntries = Object.freeze(entries);
    this.hasFocusedChestTarget = hasChestTarget;
  }

  clearFocusedInteractionTargets(): void {
    if (this.focusedEntries.length === 0) return;
    for (const entry of this.focusedEntries) entry.anchor.visible = false;
    this.focusedEntries = EMPTY_FOCUSED_ENTRIES;
    this.hasFocusedChestTarget = false;
  }

  projectAnchors(width: number, height: number): readonly BoatInteractionAnchor[] {
    if (this.disposed || width <= 0 || height <= 0) return this.emptyAnchors;
    this.scene.updateMatrixWorld(true);
    this.nextAnchors.length = 0;

    for (const entry of this.supplyEntries) {
      const record = entry.record;
      if (
        record.visibleCopies <= 0
        || (record.groupId === 'radio' && !this.roots.radioInteractionAvailable())
      ) continue;
      projectCachedBoatObjectBoundsInto(
        entry.projection,
        record.root,
        entry.cache,
        this.camera,
        width,
        height,
      );
      const itemType = entry.anchor.itemType;
      entry.anchor.action = itemType !== null && record.usableQuantity > 0
        ? ACTION_FOR_ITEM[itemType] ?? null
        : null;
      entry.anchor.remainingUses = itemType === null || record.usableQuantity === 0
        ? null
        : ITEM_DEFINITIONS[itemType].charges;
      entry.anchor.quantity = record.quantity;
      entry.anchor.usableQuantity = record.usableQuantity;
      entry.anchor.brokenQuantity = record.brokenQuantity;
      entry.anchor.backingInstanceId = record.backingInstanceId;
      updatePoint(
        entry.anchor,
        entry.projection,
        record.root.visible && entry.projection.visible,
      );
      updateHitArea(entry.anchor, entry.projection, 36, 36, 0.72);
      this.nextAnchors.push(entry.anchor);
    }

    if (this.roots.carlitosRoot.visible) {
      projectCachedBoatObjectBoundsInto(
        this.carlitosProjection,
        this.roots.carlitosInteractionRoot,
        this.carlitosCache,
        this.camera,
        width,
        height,
      );
      updatePoint(this.carlitosAnchor, this.carlitosProjection, this.carlitosProjection.visible);
      updateHitArea(this.carlitosAnchor, this.carlitosProjection, 54, 54);
      this.nextAnchors.push(this.carlitosAnchor);
    }

    projectCachedBoatObjectBoundsInto(
      this.fishingProjection,
      this.roots.fishingRoot,
      this.fishingCache,
      this.camera,
      width,
      height,
    );
    updatePoint(
      this.fishingAnchor,
      this.fishingProjection,
      this.roots.fishingVisibilityRoot.visible && this.fishingProjection.visible,
    );
    updateHitArea(this.fishingAnchor, this.fishingProjection);
    this.nextAnchors.push(this.fishingAnchor);

    projectCachedBoatObjectBoundsInto(
      this.repairProjection,
      this.roots.repairRoot,
      this.repairCache,
      this.camera,
      width,
      height,
    );
    updatePoint(
      this.repairAnchor,
      this.repairProjection,
      this.roots.repairRoot.visible && this.repairProjection.visible,
    );
    updateHitArea(this.repairAnchor, this.repairProjection);
    this.nextAnchors.push(this.repairAnchor);

    projectCachedBoatObjectBoundsInto(
      this.pillowProjection,
      this.roots.pillowRoot,
      this.pillowCache,
      this.camera,
      width,
      height,
    );
    updatePoint(
      this.pillowAnchor,
      this.pillowProjection,
      this.roots.pillowRoot.visible && this.pillowProjection.visible,
    );
    updateHitArea(this.pillowAnchor, this.pillowProjection);
    this.nextAnchors.push(this.pillowAnchor);

    let activeFeaturedEntry: FeaturedProjectionEntry | null = null;
    const featuredEventId = this.roots.activeFeaturedEventId();
    if (featuredEventId !== null) {
      const root = this.eventHost.interactionRoot(featuredEventId);
      const entry = root === null ? null : this.featuredEntry(featuredEventId);
      if (root !== null && entry !== null) {
        projectBoatObjectBoundsInto(
          entry.projection,
          root,
          this.camera,
          width,
          height,
        );
        updatePoint(entry.anchor, entry.projection, entry.projection.visible);
        updateHitArea(entry.anchor, entry.projection, 64, 64);
        activeFeaturedEntry = entry;
      }
    }

    projectCachedBoatObjectBoundsInto(
      this.chestProjection,
      this.roots.chestRoot,
      this.chestCache,
      this.camera,
      width,
      height,
    );
    const chestState = this.roots.chestState();
    this.chestAnchor.action = chestState === 'closed' ? 'openChest' : null;
    updatePoint(
      this.chestAnchor,
      this.chestProjection,
      chestState === 'closed'
        && this.roots.chestRoot.visible
        && this.chestProjection.visible,
    );
    updateHitArea(this.chestAnchor, this.chestProjection, 54, 54);

    for (const entry of this.focusedEntries) {
      const root = entry.target.root;
      projectCachedBoatObjectBoundsInto(
        entry.projection,
        root,
        entry.cache,
        this.camera,
        width,
        height,
      );
      updatePoint(entry.anchor, entry.projection, root.visible && entry.projection.visible);
      updateHitArea(
        entry.anchor,
        entry.projection,
        entry.target.minimumHitWidth ?? 64,
        entry.target.minimumHitHeight ?? 64,
      );
    }

    if (!this.hasFocusedChestTarget) {
      this.nextAnchors.push(this.chestAnchor);
    }
    if (activeFeaturedEntry !== null) {
      this.nextAnchors.push(activeFeaturedEntry.anchor);
    }
    for (const entry of this.focusedEntries) {
      this.nextAnchors.push(entry.anchor);
    }

    if (!this.sameMembership()) {
      this.outputAnchors = Object.freeze(this.nextAnchors.slice());
    }
    return this.outputAnchors;
  }

  projectEventInteraction(
    eventId: string,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    if (!this.canProjectEvent(width, height)) return null;
    this.scene.updateMatrixWorld(true);
    const root = this.focusedInteractionRoot(eventId)
      ?? this.eventHost.interactionRoot(eventId);
    return root === null
      ? null
      : projectBoatObjectBoundsInto(
          this.eventInteractionProjection,
          root,
          this.camera,
          width,
          height,
        );
  }

  projectEventResult(
    eventId: string,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    if (!this.canProjectEvent(width, height)) return null;
    this.scene.updateMatrixWorld(true);
    const root = this.eventHost.resultRoot(eventId);
    return root === null
      ? null
      : projectBoatObjectBoundsInto(
          this.eventResultProjection,
          root,
          this.camera,
          width,
          height,
        );
  }

  eventItemAimTarget(_eventId: string): Object3D | null {
    return this.disposed ? null : this.eventHost.itemAimTarget();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearFocusedInteractionTargets();
    this.disposed = true;
    this.nextAnchors.length = 0;
    this.outputAnchors = this.emptyAnchors;
  }

  private canProjectEvent(width: number, height: number): boolean {
    return !this.disposed
      && this.eventHost.activeEventId() !== null
      && width > 0
      && height > 0;
  }

  private featuredEntry(eventId: FeaturedEventId): FeaturedProjectionEntry | null {
    for (const entry of this.featuredEntries) {
      if (entry.eventId === eventId) return entry;
    }
    return null;
  }

  private focusedInteractionRoot(eventId: string): Object3D | null {
    for (const entry of this.focusedEntries) {
      if (entry.target.focusEventId === eventId) return entry.target.root;
    }
    return null;
  }

  private sameMembership(): boolean {
    if (this.nextAnchors.length !== this.outputAnchors.length) return false;
    for (let index = 0; index < this.nextAnchors.length; index += 1) {
      if (this.nextAnchors[index] !== this.outputAnchors[index]) return false;
    }
    return true;
  }
}
