import { Group, type Object3D, type PerspectiveCamera } from 'three';
import { CheckBackPresentation } from './CheckBackPresentation';
import { DriftingItemPresentation } from './DriftingItemPresentation';
import type { DriftingWater } from './DriftingWaveMotion';
import type { FeaturedEventPresentation } from './FeaturedEventPresentation';
import {
  isEventPresentationRoute,
  type FeaturedEventId,
} from './eventPresentationRoutes';
import { FlowersPresentation } from './FlowersPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import {
  isDriftingItemEventId,
} from './eventCatalog';
import type { EventPresentationKey } from './survivalTypes';
import type { EventPresentationCue } from './eventPresentationCue';

function includesFeaturedEvent(
  onlyEventId: FeaturedEventId | null | undefined,
  eventId: FeaturedEventId,
): boolean {
  return onlyEventId === undefined || onlyEventId === eventId;
}

function createDriftingItems(
  models: SurvivalEventModels,
  target: Object3D,
  onlyEventId: FeaturedEventId | null | undefined,
  water: DriftingWater | undefined,
): DriftingItemPresentation | null {
  const included = onlyEventId === undefined
    || (onlyEventId !== null && isDriftingItemEventId(onlyEventId));
  if (included && water === undefined) {
    throw new Error('Drifting events require the world wave source.');
  }
  if (!included || water === undefined) return null;
  const includeSupplies = includesFeaturedEvent(onlyEventId, 'drifting-supplies');
  return new DriftingItemPresentation({
    barrel: includeSupplies ? models.clone('driftingBarrel') : new Group(),
    chest: includesFeaturedEvent(onlyEventId, 'drifting-chest')
      ? models.clone('mysteryChest')
      : new Group(),
    lifeboat: includeSupplies ? models.clone('emptyLifeboat') : new Group(),
    lifeboatCooler: includeSupplies
      ? models.clone('emptyLifeboatContainer')
      : new Group(),
    shippingContainer: includeSupplies
      ? models.clone('shippingContainer')
      : new Group(),
  }, target, water);
}

export class FeaturedEventPresentations {
  readonly root = new Group();
  private readonly driftingItems: DriftingItemPresentation | null;
  private readonly presentations = new Map<FeaturedEventId, FeaturedEventPresentation>();
  private readonly presentationList: readonly FeaturedEventPresentation[];
  private activeEventId: FeaturedEventId | null = null;
  private disposed = false;

  constructor(
    models: SurvivalEventModels,
    camera: PerspectiveCamera,
    driftingCargoSternTarget: Object3D,
    flowersDeckTarget: Object3D,
    checkBackSternTarget: Object3D,
    emitCue: (cue: EventPresentationCue) => void,
    onlyEventId?: FeaturedEventId | null,
    driftingWater?: DriftingWater,
  ) {
    this.root.name = 'featured-event-presentations';
    this.driftingItems = createDriftingItems(
      models,
      driftingCargoSternTarget,
      onlyEventId,
      driftingWater,
    );
    if (includesFeaturedEvent(onlyEventId, 'check-the-back')) {
      this.presentations.set('check-the-back', new CheckBackPresentation(
        models.clone('checkBackFish'),
        models.clone('checkBackAnglerfish'),
        camera,
        checkBackSternTarget,
        emitCue,
      ));
    }
    if (includesFeaturedEvent(onlyEventId, 'flowers')) {
      this.presentations.set('flowers', new FlowersPresentation(models, flowersDeckTarget));
    }
    this.presentationList = Object.freeze([...this.presentations.values()]);
    this.root.add(
      ...(this.driftingItems === null ? [] : [this.driftingItems.root]),
      ...this.presentationList.map(({ root }) => root),
    );
  }

  stage(
    eventId: string,
    variantSeed?: number,
  ): void {
    if (this.disposed || !isEventPresentationRoute(eventId, 'featured')) return;
    this.clear();
    this.activeEventId = eventId;
    if (isDriftingItemEventId(eventId)) {
      if (this.driftingItems === null) throw new Error(`Featured event is not loaded: ${eventId}`);
      this.driftingItems.stage(eventId, variantSeed);
      return;
    }
    const presentation = this.presentations.get(eventId);
    if (presentation === undefined) throw new Error(`Featured event is not loaded: ${eventId}`);
    if (variantSeed === undefined) {
      presentation.stage();
      return;
    }
    presentation.stage(variantSeed);
  }

  reveal(eventId: string): Promise<void> {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) {
      return Promise.resolve();
    }
    return isDriftingItemEventId(eventId)
      ? this.driftingItems?.reveal() ?? Promise.resolve()
      : this.presentations.get(eventId)?.reveal() ?? Promise.resolve();
  }

  react(eventId: string, key: EventPresentationKey): Promise<void> {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) {
      return Promise.resolve();
    }
    if (isDriftingItemEventId(eventId)) {
      if (this.driftingItems === null) return Promise.resolve();
      return this.driftingItems.retrieve();
    }
    return this.presentations.get(eventId)?.react(key) ?? Promise.resolve();
  }

  interactionRoot(eventId: string): Object3D | null {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) return null;
    if (eventId === 'flowers') return null;
    return isDriftingItemEventId(eventId)
      ? this.driftingItems?.interactionRoot() ?? null
      : this.presentations.get(eventId)?.interactionRoot() ?? null;
  }

  itemAimTarget(eventId: string): Object3D | null {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) {
      return null;
    }
    return isDriftingItemEventId(eventId)
      ? this.driftingItems?.itemAimTarget() ?? null
      : this.presentations.get(eventId)?.itemAimTarget() ?? null;
  }

  resultRoot(eventId: string): Object3D | null {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) return null;
    return isDriftingItemEventId(eventId)
      ? this.driftingItems?.resultRoot() ?? null
      : this.presentations.get(eventId)?.resultRoot() ?? null;
  }

  update(time: number, delta: number): void {
    if (this.disposed) return;
    this.driftingItems?.update(time, delta);
    for (const presentation of this.presentationList) presentation.update(time, delta);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.driftingItems?.settleForVisibilityChange();
    for (const presentation of this.presentationList) presentation.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.driftingItems?.clear();
    for (const presentation of this.presentationList) presentation.clear();
    this.activeEventId = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driftingItems?.dispose();
    for (const presentation of this.presentationList) presentation.dispose();
    this.root.removeFromParent();
  }
}
