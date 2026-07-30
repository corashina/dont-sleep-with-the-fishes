import { Group, type Object3D, type PerspectiveCamera } from 'three';
import type { ProjectedBoatBounds } from './BoatInteraction';
import { CheckBackPresentation } from './CheckBackPresentation';
import { DriftingBottlePresentation } from './DriftingBottlePresentation';
import { DriftingLootPresentation } from './DriftingLootPresentation';
import {
  isFeaturedEventId,
  type FeaturedEventId,
  type FeaturedEventPresentation,
} from './FeaturedEventPresentation';
import { FlowersPresentation } from './FlowersPresentation';
import { MysteryChestPresentation } from './MysteryChestPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import type {
  DriftingLootVariant,
  EventPresentationKey,
} from './survivalTypes';

export class FeaturedEventPresentations {
  readonly root = new Group();
  private readonly driftingLoot: DriftingLootPresentation;
  private readonly presentations: Readonly<Record<
    Exclude<FeaturedEventId, 'drifting-loot'>,
    FeaturedEventPresentation
  >>;
  private readonly presentationList: readonly FeaturedEventPresentation[];
  private activeEventId: FeaturedEventId | null = null;
  private disposed = false;

  constructor(
    models: SurvivalEventModels,
    cameraRig: Group,
    deckTarget: Object3D,
  ) {
    this.root.name = 'featured-event-presentations';
    this.driftingLoot = new DriftingLootPresentation({
      barrel: models.clone('driftingLootBarrel'),
      crate: models.clone('driftingLootCrate'),
    }, deckTarget);
    this.presentations = {
      'drifting-bottle': new DriftingBottlePresentation(
        models.clone('driftingBottle'),
        deckTarget,
      ),
      'check-the-back': new CheckBackPresentation(
        models.clone('checkBackFish'),
        cameraRig,
      ),
      'mystery-chest': new MysteryChestPresentation(
        models.clone('mysteryChest'),
        deckTarget,
        cameraRig,
      ),
      flowers: new FlowersPresentation(models, deckTarget),
    };
    this.presentationList = Object.freeze(Object.values(this.presentations));
    this.root.add(
      this.driftingLoot.root,
      ...this.presentationList.map(({ root }) => root),
    );
  }

  stage(eventId: string, variant: DriftingLootVariant | null): void {
    if (this.disposed || !isFeaturedEventId(eventId)) return;
    this.clear();
    this.activeEventId = eventId;
    if (eventId === 'drifting-loot') {
      if (variant === null) throw new Error('Drifting loot requires a variant.');
      this.driftingLoot.stage(variant);
      return;
    }
    this.presentations[eventId].stage();
  }

  reveal(eventId: string): Promise<void> {
    if (this.disposed || this.activeEventId !== eventId || !isFeaturedEventId(eventId)) {
      return Promise.resolve();
    }
    return eventId === 'drifting-loot'
      ? this.driftingLoot.reveal()
      : this.presentations[eventId].reveal();
  }

  react(eventId: string, key: EventPresentationKey): Promise<void> {
    if (this.disposed || this.activeEventId !== eventId || !isFeaturedEventId(eventId)) {
      return Promise.resolve();
    }
    if (eventId === 'drifting-loot') {
      return key === 'drifting-loot.drift'
        ? this.driftingLoot.recede()
        : this.driftingLoot.retrieve();
    }
    return this.presentations[eventId].react(key);
  }

  interactionRoot(eventId: string): Object3D | null {
    if (this.disposed || this.activeEventId !== eventId || !isFeaturedEventId(eventId)) return null;
    return eventId === 'drifting-loot'
      ? this.driftingLoot.interactionRoot()
      : this.presentations[eventId].interactionRoot();
  }

  resultRoot(eventId: string): Object3D | null {
    if (this.disposed || this.activeEventId !== eventId || !isFeaturedEventId(eventId)) return null;
    return eventId === 'drifting-loot'
      ? this.driftingLoot.resultRoot()
      : this.presentations[eventId].resultRoot();
  }

  projectHeldDriftingLoot(
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    return this.disposed
      ? null
      : this.driftingLoot.projectHeld(camera, width, height);
  }

  update(time: number, delta: number): void {
    if (this.disposed) return;
    this.driftingLoot.update(time, delta);
    for (const presentation of this.presentationList) presentation.update(time, delta);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.driftingLoot.settleForVisibilityChange();
    for (const presentation of this.presentationList) presentation.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.driftingLoot.clear();
    for (const presentation of this.presentationList) presentation.clear();
    this.activeEventId = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driftingLoot.dispose();
    for (const presentation of this.presentationList) presentation.dispose();
    this.root.removeFromParent();
  }
}
