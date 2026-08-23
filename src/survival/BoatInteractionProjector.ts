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
import { CARLITOS_LAB_INSTANCE_ID } from './ItemAnimationLab';
import {
  isDriftingCargoEventId,
  isDriftingItemEventId,
} from './eventCatalog';
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
  readonly lanternRoot: Object3D;
  readonly chestRoot: Object3D;
  readonly chestState: () => ChestState;
  readonly activeFeaturedEventId: () => FeaturedEventId | null;
}

interface FocusedInteractionSpec {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly choiceId: string;
  readonly tooltip?: boolean;
  readonly minimumHitWidth: number;
  readonly minimumHitHeight: number;
}

const FOCUSED_INTERACTION_SPECS: readonly FocusedInteractionSpec[] = Object.freeze([
  Object.freeze({
    id: 'handyman:hand',
    label: 'HAND',
    description: 'Touch the waiting hand.',
    choiceId: 'touch',
    tooltip: false,
    minimumHitWidth: 82,
    minimumHitHeight: 82,
  }),
  Object.freeze({
    id: 'persistent-chest',
    label: 'CHEST',
    description: 'Offer the closed chest to the hand.',
    choiceId: 'chest',
    minimumHitWidth: 54,
    minimumHitHeight: 54,
  }),
  Object.freeze({
    id: 'midnight-tour:island',
    label: 'ISLAND',
    description: 'Turn the boat toward the small island.',
    choiceId: 'visit',
    minimumHitWidth: 96,
    minimumHitHeight: 78,
  }),
]);

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
  readonly spec: FocusedInteractionSpec;
  readonly projection: ProjectedBoatBounds;
  readonly anchor: MutableAnchor;
  root: Object3D | null;
}

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
  if (eventId === 'drifting-barrel') return 'BARREL';
  if (eventId === 'drifting-chest') return 'CHEST';
  if (eventId === 'drifting-bottle') return 'BOTTLE';
  return 'FLOWERS';
}

function featuredAnchorDescription(eventId: FeaturedEventId): string {
  if (isDriftingCargoEventId(eventId)) return 'Floating salvage within reach.';
  if (eventId === 'drifting-bottle') return 'A sealed bottle taps the hull.';
  return 'Pale blooms pass in the dark water.';
}

function featuredAnchorChoice(eventId: FeaturedEventId): string | null {
  if (isDriftingCargoEventId(eventId)) return 'retrieve';
  if (eventId === 'drifting-bottle') return 'retrieve';
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
): void {
  const area = anchor.hitArea!;
  area.width = Math.max(minimumWidth, projection.width);
  area.height = Math.max(minimumHeight, projection.height);
  area.depth = projection.depth;
}

export class BoatInteractionProjector {
  private readonly supplyEntries: readonly SupplyProjectionEntry[];
  private readonly fishingCache: BoatObjectBoundsCache | null;
  private readonly repairCache: BoatObjectBoundsCache | null;
  private readonly lanternCache: BoatObjectBoundsCache | null;
  private readonly chestCache: BoatObjectBoundsCache | null;
  private readonly carlitosCache: BoatObjectBoundsCache | null;
  private readonly focusedCaches = new WeakMap<Object3D, BoatObjectBoundsCache | null>();
  private readonly focusedEntries: readonly FocusedProjectionEntry[];
  private readonly featuredEntries: readonly FeaturedProjectionEntry[];
  private readonly fishingProjection = projectionOutput();
  private readonly repairProjection = projectionOutput();
  private readonly lanternProjection = projectionOutput();
  private readonly chestProjection = projectionOutput();
  private readonly carlitosProjection = projectionOutput();
  private readonly eventInteractionProjection = projectionOutput();
  private readonly eventResultProjection = projectionOutput();
  private readonly fishingAnchor: MutableAnchor;
  private readonly repairAnchor: MutableAnchor;
  private readonly lanternAnchor: MutableAnchor;
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
    this.lanternCache = createBoatObjectBoundsCache(roots.lanternRoot);
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
    this.lanternAnchor = {
      id: 'end-day-lantern',
      itemType: null,
      toolId: 'lantern',
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
    this.focusedEntries = FOCUSED_INTERACTION_SPECS.map((spec) => ({
      spec,
      projection: projectionOutput(),
      root: null,
      anchor: {
        id: spec.id,
        label: spec.label,
        description: spec.description,
        tooltip: spec.tooltip,
        eventChoiceId: spec.choiceId,
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

  projectAnchors(width: number, height: number): readonly BoatInteractionAnchor[] {
    if (this.disposed || width <= 0 || height <= 0) return this.emptyAnchors;
    this.scene.updateMatrixWorld(true);
    this.nextAnchors.length = 0;

    for (const entry of this.supplyEntries) {
      const record = entry.record;
      if (record.visibleCopies <= 0) continue;
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
      updateHitArea(entry.anchor, entry.projection, 44, 44);
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
      this.lanternProjection,
      this.roots.lanternRoot,
      this.lanternCache,
      this.camera,
      width,
      height,
    );
    updatePoint(
      this.lanternAnchor,
      this.lanternProjection,
      this.roots.lanternRoot.visible && this.lanternProjection.visible,
    );
    updateHitArea(this.lanternAnchor, this.lanternProjection);
    this.nextAnchors.push(this.lanternAnchor);

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
      const root = this.eventHost.interactionRoot(entry.spec.id);
      entry.root = root;
      if (root === null) continue;
      projectCachedBoatObjectBoundsInto(
        entry.projection,
        root,
        this.focusedCache(root),
        this.camera,
        width,
        height,
      );
      updatePoint(entry.anchor, entry.projection, root.visible && entry.projection.visible);
      updateHitArea(
        entry.anchor,
        entry.projection,
        entry.spec.minimumHitWidth,
        entry.spec.minimumHitHeight,
      );
    }

    if (this.focusedEntries[1]!.root === null) {
      this.nextAnchors.push(this.chestAnchor);
    }
    if (activeFeaturedEntry !== null) {
      this.nextAnchors.push(activeFeaturedEntry.anchor);
    }
    for (const entry of this.focusedEntries) {
      if (entry.root === null) continue;
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
    const root = this.eventHost.interactionRoot(eventId);
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
    this.disposed = true;
    this.nextAnchors.length = 0;
    this.outputAnchors = this.emptyAnchors;
    for (const entry of this.focusedEntries) entry.root = null;
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

  private focusedCache(root: Object3D): BoatObjectBoundsCache | null {
    if (!this.focusedCaches.has(root)) {
      this.focusedCaches.set(root, createBoatObjectBoundsCache(root));
    }
    return this.focusedCaches.get(root) ?? null;
  }

  private sameMembership(): boolean {
    if (this.nextAnchors.length !== this.outputAnchors.length) return false;
    for (let index = 0; index < this.nextAnchors.length; index += 1) {
      if (this.nextAnchors[index] !== this.outputAnchors[index]) return false;
    }
    return true;
  }
}
