import { Group, type Object3D, type PerspectiveCamera } from 'three';
import type { ProjectedBoatBounds } from './BoatInteraction';
import { CheckBackPresentation } from './CheckBackPresentation';
import { DriftingBottlePresentation } from './DriftingBottlePresentation';
import { DriftingLootPresentation } from './DriftingLootPresentation';
import type { FeaturedEventPresentation } from './FeaturedEventPresentation';
import {
  isEventPresentationRoute,
  type FeaturedEventId,
} from './eventPresentationRoutes';
import { FlowersPresentation } from './FlowersPresentation';
import { MysteryChestPresentation } from './MysteryChestPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import type {
  DriftingLootVariant,
  EventPresentationKey,
} from './survivalTypes';

export class FeaturedEventPresentations {
  readonly root = new Group();
  private readonly driftingLoot: DriftingLootPresentation | null;
  private readonly presentations = new Map<FeaturedEventId, FeaturedEventPresentation>();
  private readonly presentationList: readonly FeaturedEventPresentation[];
  private activeEventId: FeaturedEventId | null = null;
  private disposed = false;

  constructor(
    models: SurvivalEventModels,
    camera: PerspectiveCamera,
    deckTarget: Object3D,
    onlyEventId?: FeaturedEventId | null,
  ) {
    this.root.name = 'featured-event-presentations';
    const include = (eventId: FeaturedEventId): boolean => (
      onlyEventId === undefined || onlyEventId === eventId
    );
    this.driftingLoot = include('drifting-loot')
      ? new DriftingLootPresentation({
          barrel: models.clone('driftingLootBarrel'),
          crate: models.clone('driftingLootCrate'),
        }, deckTarget)
      : null;
    if (include('drifting-bottle')) {
      this.presentations.set('drifting-bottle', new DriftingBottlePresentation(
        models.clone('driftingBottle'),
        deckTarget,
      ));
    }
    if (include('check-the-back')) {
      this.presentations.set('check-the-back', new CheckBackPresentation(
        models.clone('checkBackFish'),
        camera,
      ));
    }
    if (include('mystery-chest')) {
      this.presentations.set('mystery-chest', new MysteryChestPresentation(
        models.clone('mysteryChest'),
        deckTarget,
        camera,
      ));
    }
    if (include('flowers')) {
      this.presentations.set('flowers', new FlowersPresentation(models, deckTarget));
    }
    this.presentationList = Object.freeze([...this.presentations.values()]);
    this.root.add(
      ...(this.driftingLoot === null ? [] : [this.driftingLoot.root]),
      ...this.presentationList.map(({ root }) => root),
    );
  }

  stage(
    eventId: string,
    variant: DriftingLootVariant | null,
    variantSeed?: number,
  ): void {
    if (this.disposed || !isEventPresentationRoute(eventId, 'featured')) return;
    this.clear();
    this.activeEventId = eventId;
    if (eventId === 'drifting-loot') {
      if (this.driftingLoot === null) throw new Error(`Featured event is not loaded: ${eventId}`);
      if (variant === null) throw new Error('Drifting loot requires a variant.');
      this.driftingLoot.stage(variant);
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
    return eventId === 'drifting-loot'
      ? this.driftingLoot?.reveal() ?? Promise.resolve()
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
    if (eventId === 'drifting-loot') {
      if (this.driftingLoot === null) return Promise.resolve();
      return key === 'drifting-loot.drift'
        ? this.driftingLoot.recede()
        : this.driftingLoot.retrieve();
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
    return eventId === 'drifting-loot'
      ? this.driftingLoot?.interactionRoot() ?? null
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
    return eventId === 'drifting-loot'
      ? this.driftingLoot?.itemAimTarget() ?? null
      : this.presentations.get(eventId)?.itemAimTarget() ?? null;
  }

  resultRoot(eventId: string): Object3D | null {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) return null;
    return eventId === 'drifting-loot'
      ? this.driftingLoot?.resultRoot() ?? null
      : this.presentations.get(eventId)?.resultRoot() ?? null;
  }

  projectHeldDriftingLoot(
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    return this.disposed
      ? null
      : this.driftingLoot?.projectHeld(camera, width, height) ?? null;
  }

  update(time: number, delta: number): void {
    if (this.disposed) return;
    this.driftingLoot?.update(time, delta);
    for (const presentation of this.presentationList) presentation.update(time, delta);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.driftingLoot?.settleForVisibilityChange();
    for (const presentation of this.presentationList) presentation.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.driftingLoot?.clear();
    for (const presentation of this.presentationList) presentation.clear();
    this.activeEventId = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driftingLoot?.dispose();
    for (const presentation of this.presentationList) presentation.dispose();
    this.root.removeFromParent();
  }
}
