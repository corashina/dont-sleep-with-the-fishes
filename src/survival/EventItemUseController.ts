import type { Object3D } from 'three';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import {
  type BorrowedSupplyActor,
  type BoatSupplyDisplay,
} from './BoatSupplyDisplay';
import type { EventItemUseAdapter } from './EventItemUseAdapter';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
  eventItemOutcomeDuration,
  eventItemUseDurationForItem,
  isReturningSingleUseContext,
  isDeployedEventItemContext,
  sampleEventItemOutcome,
  sampleEventItemUse,
  WIND_ITEM_FLIGHT_DURATION,
  type EventItemDisposition,
  type EventItemUseContext,
  type EventItemUseSample,
} from './eventItemUseChoreography';
import type { EventOutcomePresentation } from './eventPresentationTypes';

export interface EventItemCatch {
  capture(item: Object3D, itemId: ItemId): void;
  release(): void;
}

export interface EventItemUseRequest {
  readonly eventId: string;
  readonly choiceId: string;
  readonly instanceId: ItemInstanceId;
  readonly itemId: ItemId;
  readonly context: EventItemUseContext;
  readonly aimTarget: Object3D | null;
  readonly landAtTarget?: boolean;
  readonly durationSeconds?: number;
  readonly itemCatch?: EventItemCatch | null;
  readonly onAction?: (cueIndex: number) => void;
}

type ActiveItemUse = {
  readonly request: EventItemUseRequest;
  readonly actor: BorrowedSupplyActor;
  elapsed: number;
  readonly duration: number;
  nextActionCueIndex: number;
  readonly resolve: (played: boolean) => void;
};

type HeldItem = {
  readonly request: EventItemUseRequest;
  readonly actor: BorrowedSupplyActor;
};

type ActiveItemReaction = {
  readonly request: EventItemUseRequest;
  readonly actor: BorrowedSupplyActor;
  readonly disposition: EventItemDisposition;
  readonly retainUntilClear: boolean;
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
};

function dispositionFor(
  request: EventItemUseRequest,
  result: EventOutcomePresentation,
): EventItemDisposition {
  if (
    result.lostInstanceIds.includes(request.instanceId)
    || result.consumedInstanceIds.includes(request.instanceId)
    || request.context === 'throw-target'
  ) return 'depart';
  if (result.brokenInstanceIds.includes(request.instanceId)) return 'broken';
  return 'recover';
}

/** Owns one borrowed item actor from use through its event outcome. */
export class EventItemUseController {
  private readonly sample: EventItemUseSample = createEventItemUseSample();
  private held: HeldItem | null = null;
  private activeUse: ActiveItemUse | null = null;
  private activeReaction: ActiveItemReaction | null = null;
  private disposed = false;

  constructor(
    private readonly supplies: BoatSupplyDisplay,
    private readonly adapter: EventItemUseAdapter,
  ) {}

  play(request: EventItemUseRequest): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.clear('night');
    const actor = this.supplies.borrowEventActor(request.instanceId);
    if (actor === null) return Promise.resolve(false);
    this.held = { request, actor };
    this.adapter.begin(
      actor,
      request.itemId,
      request.aimTarget,
      request.context === 'bucket-helmet'
        || request.context === 'map-leak-patch' || request.context === 'map-cover',
      request.context === 'umbrella-shield' ? 'x' : request.context === 'net-secure' ? 'y' : null,
      request.context === 'bucket-helmet' || request.context === 'knife-stab'
        || request.context === 'swim-ring-wear',
    );
    sampleEventItemUse(request.context, request.itemId, 0, this.sample);
    this.applyRequestSample(request);
    return new Promise((resolve) => {
      this.activeUse = {
        request,
        actor,
        elapsed: 0,
        duration: request.durationSeconds ?? eventItemUseDurationForItem(request.context, request.itemId),
        nextActionCueIndex: 0,
        resolve,
      };
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || this.activeReaction !== null) return Promise.resolve();
    const held = this.held;
    if (held === null) return Promise.resolve();
    const active = this.activeUse;
    this.activeUse = null;
    active?.resolve(true);
    if (held.request.context === 'throw-target') {
      sampleEventItemUse(
        held.request.context,
        held.request.itemId,
        1,
        this.sample,
      );
      this.applyRequestSample(held.request);
      this.release(held.actor, held.request, true);
      this.held = null;
      return Promise.resolve();
    }
    const disposition = dispositionFor(held.request, result);
    if ((held.request.context === 'umbrella-overhead' && disposition !== 'depart')
      || isDeployedEventItemContext(held.request.context)) {
      // Keep deployed items until the event flow clears the scene.
      sampleEventItemUse(held.request.context, held.request.itemId, 1, this.sample);
      this.applyRequestSample(held.request);
      return Promise.resolve();
    }
    return this.startReaction(
      held,
      disposition,
      result.consumedInstanceIds.includes(held.request.instanceId)
        && isReturningSingleUseContext(held.request.context),
    );
  }

  recover(): Promise<void> {
    if (this.disposed || this.activeReaction !== null) return Promise.resolve();
    const held = this.held;
    if (held === null) return Promise.resolve();
    const active = this.activeUse;
    this.activeUse = null;
    active?.resolve(true);
    return this.startReaction(held, 'recover');
  }

  private startReaction(
    held: HeldItem,
    disposition: EventItemDisposition,
    retainUntilClear = false,
  ): Promise<void> {
    sampleEventItemOutcome(
      held.request.context,
      held.request.itemId,
      disposition,
      0,
      this.sample,
    );
    this.applyRequestSample(held.request);
    if (
      held.request.context === 'bucket-helmet'
      || held.request.context === 'swim-ring-wear'
      || held.request.context === 'map-leak-patch'
      || held.request.context === 'umbrella-shield'
    ) return Promise.resolve();
    return new Promise((resolve) => {
      this.activeReaction = {
        request: held.request,
        actor: held.actor,
        disposition,
        retainUntilClear,
        elapsed: 0,
        duration: (held.request.context === 'umbrella-overhead' || held.request.context === 'map-wind')
          && disposition === 'depart'
          ? WIND_ITEM_FLIGHT_DURATION
          : eventItemOutcomeDuration(held.request.itemId, disposition),
        resolve,
      };
    });
  }

  update(delta: number): void {
    if (this.disposed) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    const use = this.activeUse;
    if (use !== null) {
      this.updateUse(use, safeDelta);
      return;
    }

    const reaction = this.activeReaction;
    if (reaction === null) {
      if (this.held !== null) this.applyRequestSample(this.held.request);
      return;
    }
    this.updateReaction(reaction, safeDelta);
  }

  private updateUse(use: ActiveItemUse, safeDelta: number): void {
    use.elapsed = Math.min(use.duration, use.elapsed + safeDelta);
    const progress = use.elapsed / use.duration;
    sampleEventItemUse(use.request.context, use.request.itemId, progress, this.sample);
    this.applyRequestSample(use.request);
    if (progress >= 0.75) use.request.itemCatch?.capture(use.actor.root, use.request.itemId);
    const actionCueProgresses = eventItemActionCueProgresses(use.request.context);
    while (use.request.onAction !== undefined
      && use.nextActionCueIndex < actionCueProgresses.length
      && progress >= actionCueProgresses[use.nextActionCueIndex]!) {
      const cueIndex = use.nextActionCueIndex;
      use.nextActionCueIndex += 1;
      use.request.onAction(cueIndex);
    }
    if (use.elapsed >= use.duration) {
      this.activeUse = null;
      use.resolve(true);
    }
  }

  private updateReaction(reaction: ActiveItemReaction, safeDelta: number): void {
    reaction.elapsed = Math.min(reaction.duration, reaction.elapsed + safeDelta);
    sampleEventItemOutcome(
      reaction.request.context,
      reaction.request.itemId,
      reaction.disposition,
      reaction.elapsed / reaction.duration,
      this.sample,
    );
    this.applyRequestSample(reaction.request);
    if (reaction.elapsed < reaction.duration) return;
    this.activeReaction = null;
    if (reaction.retainUntilClear) {
      // Keep the spent actor at rest until the covered event scene clears.
      this.adapter.clear();
      reaction.resolve();
      return;
    }
    this.release(
      reaction.actor,
      reaction.request,
      reaction.disposition === 'depart',
    );
    this.held = null;
    reaction.resolve();
  }

  settleForVisibilityChange(phase: 'day' | 'night'): void {
    this.clear(phase);
  }

  clear(phase: 'day' | 'night'): void {
    const use = this.activeUse;
    const reaction = this.activeReaction;
    const held = this.held;
    this.activeUse = null;
    this.activeReaction = null;
    this.held = null;
    if (held !== null) this.release(held.actor, held.request, phase === 'night');
    use?.resolve(true);
    reaction?.resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear('night');
    this.disposed = true;
  }

  private applyRequestSample(request: EventItemUseRequest): void {
    if (request.eventId === 'tornado' || request.eventId === 'carlitos') {
      this.sample.cameraYaw = 0;
      this.sample.cameraPitch = 0;
      this.sample.cameraTargetBlend = 0;
      this.sample.fovScale = 1;
    }
    if (request.landAtTarget || (request.itemCatch !== undefined && request.itemCatch !== null)) {
      this.sample.flightTarget = 'event';
      this.sample.ballisticFlight = false;
    }
    this.adapter.apply(this.sample);
  }

  private release(
    actor: BorrowedSupplyActor,
    request: EventItemUseRequest,
    stow: boolean,
  ): void {
    if (stow && request.itemId !== 'bucket') {
      this.supplies.stowEventItemUntilDay(request.instanceId);
    }
    this.adapter.clear();
    request.itemCatch?.release();
    actor.release();
  }
}
