import { Group, type Object3D, type PerspectiveCamera } from 'three';
import type { ProjectedBoatBounds } from './BoatInteraction';
import { CheckBackPresentation } from './CheckBackPresentation';
import { DriftingBottlePresentation } from './DriftingBottlePresentation';
import { DriftingCargoPresentation } from './DriftingCargoPresentation';
import type { FeaturedEventPresentation } from './FeaturedEventPresentation';
import {
  isEventPresentationRoute,
  type FeaturedEventId,
} from './eventPresentationRoutes';
import { FlowersPresentation } from './FlowersPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import {
  driftingCargoKindForEvent,
  isDriftingCargoEventId,
  type DriftingCargoEventId,
} from './events';
import type { EventPresentationKey } from './survivalTypes';

export class FeaturedEventPresentations {
  readonly root = new Group();
  private readonly driftingCargo: DriftingCargoPresentation;
  private readonly presentations: Readonly<Record<
    Exclude<FeaturedEventId, DriftingCargoEventId>,
    FeaturedEventPresentation
  >>;
  private readonly presentationList: readonly FeaturedEventPresentation[];
  private activeEventId: FeaturedEventId | null = null;
  private disposed = false;

  constructor(
    models: SurvivalEventModels,
    camera: PerspectiveCamera,
    deckTarget: Object3D,
    checkBackSternTarget: Object3D,
  ) {
    this.root.name = 'featured-event-presentations';
    this.driftingCargo = new DriftingCargoPresentation({
      barrel: models.clone('driftingBarrel'),
      chest: models.clone('mysteryChest'),
    }, deckTarget);
    this.presentations = {
      'drifting-bottle': new DriftingBottlePresentation(
        models.clone('driftingBottle'),
        deckTarget,
      ),
      'check-the-back': new CheckBackPresentation(
        models.clone('checkBackFish'),
        camera,
        checkBackSternTarget,
      ),
      flowers: new FlowersPresentation(models, deckTarget),
    };
    this.presentationList = Object.freeze(Object.values(this.presentations));
    this.root.add(
      this.driftingCargo.root,
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
    if (isDriftingCargoEventId(eventId)) {
      this.driftingCargo.stage(driftingCargoKindForEvent(eventId));
      return;
    }
    if (variantSeed === undefined) {
      this.presentations[eventId].stage();
      return;
    }
    this.presentations[eventId].stage(variantSeed);
  }

  reveal(eventId: string): Promise<void> {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) {
      return Promise.resolve();
    }
    return isDriftingCargoEventId(eventId)
      ? this.driftingCargo.reveal()
      : this.presentations[eventId].reveal();
  }

  react(eventId: string, key: EventPresentationKey): Promise<void> {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) {
      return Promise.resolve();
    }
    if (isDriftingCargoEventId(eventId)) {
      return key === 'drifting-barrel.drift' || key === 'drifting-chest.drift'
        ? this.driftingCargo.recede()
        : this.driftingCargo.retrieve();
    }
    return this.presentations[eventId].react(key);
  }

  interactionRoot(eventId: string): Object3D | null {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) return null;
    if (eventId === 'flowers') return null;
    return isDriftingCargoEventId(eventId)
      ? this.driftingCargo.interactionRoot()
      : this.presentations[eventId].interactionRoot();
  }

  itemAimTarget(eventId: string): Object3D | null {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) {
      return null;
    }
    return isDriftingCargoEventId(eventId)
      ? this.driftingCargo.itemAimTarget()
      : this.presentations[eventId].itemAimTarget();
  }

  resultRoot(eventId: string): Object3D | null {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) return null;
    return isDriftingCargoEventId(eventId)
      ? this.driftingCargo.resultRoot()
      : this.presentations[eventId].resultRoot();
  }

  projectHeldDriftingCargo(
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    return this.disposed
      ? null
      : this.driftingCargo.projectHeld(camera, width, height);
  }

  update(time: number, delta: number): void {
    if (this.disposed) return;
    this.driftingCargo.update(time, delta);
    for (const presentation of this.presentationList) presentation.update(time, delta);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.driftingCargo.settleForVisibilityChange();
    for (const presentation of this.presentationList) presentation.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.driftingCargo.clear();
    for (const presentation of this.presentationList) presentation.clear();
    this.activeEventId = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driftingCargo.dispose();
    for (const presentation of this.presentationList) presentation.dispose();
    this.root.removeFromParent();
  }
}
