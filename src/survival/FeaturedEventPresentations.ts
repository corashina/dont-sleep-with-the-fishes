import { Group, type Object3D, type PerspectiveCamera } from 'three';
import { CheckBackPresentation } from './CheckBackPresentation';
import { DriftingCargoPresentation } from './DriftingCargoPresentation';
import type { DriftingWater } from './DriftingWaveMotion';
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
} from './eventCatalog';
import type { EventPresentationKey } from './survivalTypes';
import type { EventPresentationCue } from './eventPresentationCue';

export class FeaturedEventPresentations {
  readonly root = new Group();
  private readonly driftingCargo: DriftingCargoPresentation | null;
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
    const include = (eventId: FeaturedEventId): boolean => (
      onlyEventId === undefined || onlyEventId === eventId
    );
    const includeCargo = onlyEventId === undefined
      || (onlyEventId !== null && isDriftingCargoEventId(onlyEventId));
    if (includeCargo && driftingWater === undefined) {
      throw new Error('Drifting events require the world wave source.');
    }
    this.driftingCargo = includeCargo && driftingWater !== undefined
      ? new DriftingCargoPresentation({
          barrel: include('drifting-barrel') ? models.clone('driftingBarrel') : new Group(),
          chest: include('drifting-chest') ? models.clone('mysteryChest') : new Group(),
        }, driftingCargoSternTarget, driftingWater)
      : null;
    if (include('check-the-back')) {
      this.presentations.set('check-the-back', new CheckBackPresentation(
        models.clone('checkBackFish'),
        models.clone('checkBackAnglerfish'),
        camera,
        checkBackSternTarget,
        emitCue,
      ));
    }
    if (include('flowers')) {
      this.presentations.set('flowers', new FlowersPresentation(models, flowersDeckTarget));
    }
    this.presentationList = Object.freeze([...this.presentations.values()]);
    this.root.add(
      ...(this.driftingCargo === null ? [] : [this.driftingCargo.root]),
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
      if (this.driftingCargo === null) throw new Error(`Featured event is not loaded: ${eventId}`);
      this.driftingCargo.stage(driftingCargoKindForEvent(eventId), variantSeed);
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
    return isDriftingCargoEventId(eventId)
      ? this.driftingCargo?.reveal() ?? Promise.resolve()
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
    if (isDriftingCargoEventId(eventId)) {
      if (this.driftingCargo === null) return Promise.resolve();
      return key === 'drifting-barrel.drift' || key === 'drifting-chest.drift'
        ? this.driftingCargo.recede()
        : this.driftingCargo.retrieve();
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
    return isDriftingCargoEventId(eventId)
      ? this.driftingCargo?.interactionRoot() ?? null
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
    return isDriftingCargoEventId(eventId)
      ? this.driftingCargo?.itemAimTarget() ?? null
      : this.presentations.get(eventId)?.itemAimTarget() ?? null;
  }

  resultRoot(eventId: string): Object3D | null {
    if (
      this.disposed
      || this.activeEventId !== eventId
      || !isEventPresentationRoute(eventId, 'featured')
    ) return null;
    return isDriftingCargoEventId(eventId)
      ? this.driftingCargo?.resultRoot() ?? null
      : this.presentations.get(eventId)?.resultRoot() ?? null;
  }

  update(time: number, delta: number): void {
    if (this.disposed) return;
    this.driftingCargo?.update(time, delta);
    for (const presentation of this.presentationList) presentation.update(time, delta);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.driftingCargo?.settleForVisibilityChange();
    for (const presentation of this.presentationList) presentation.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.driftingCargo?.clear();
    for (const presentation of this.presentationList) presentation.clear();
    this.activeEventId = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driftingCargo?.dispose();
    for (const presentation of this.presentationList) presentation.dispose();
    this.root.removeFromParent();
  }
}
