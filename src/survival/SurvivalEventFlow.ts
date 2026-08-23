import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type { EventContextChoice, SurvivalUI } from '../ui/SurvivalUI';
import type { BoatWorld } from './BoatWorld';
import type {
  DriftingItemChoiceResolution,
  DriftingItemFlow,
} from './DriftingItemFlow';
import type { EventChoicePresentation } from './FocusedEventPresentation';
import {
  isDriftingItemEventId,
  survivalEventById,
  type DriftingItemEventId,
  type SurvivalEventId,
} from './eventCatalog';
import {
  deriveEventOutcomePresentation,
  deriveEventVariantSeed,
} from './eventPresentationOutcome';
import { isEventPresentationRoute } from './eventPresentationRoutes';
import type { EventOutcomePresentation } from './eventPresentationTypes';
import {
  deriveEventPhysicalResponse,
  type EventPhysicalResponsePresentation,
} from './EventPhysicalResponse';
import type { SurvivalSession } from './SurvivalSession';
import type {
  ActionOutcome,
  EventResponseId,
  SurvivalSnapshot,
  SurvivalState,
} from './survivalTypes';

export type EventSessionPort = Pick<
  SurvivalSession,
  | 'snapshot'
  | 'resolveEvent'
  | 'requestDayEvent'
  | 'beginDawn'
  | 'companionEventActionAvailability'
>;

export type EventWorldPort = Pick<
  BoatWorld,
  | 'stageEvent'
  | 'revealEvent'
  | 'playEventItemUse'
  | 'returnEventItemUse'
  | 'playEventChoice'
  | 'reactToEventOutcome'
  | 'clearEvent'
  | 'setEventEligibleItems'
  | 'setEventSelectedItem'
  | 'syncInventory'
  | 'projectInteractionAnchors'
  | 'play'
>;

export type EventUiPort = Pick<
  SurvivalUI,
  | 'beginEventPresentation'
  | 'showEventReveal'
  | 'hideEventReveal'
  | 'setEventSelection'
  | 'setEventUsing'
  | 'playEventChoiceBeat'
  | 'setEventSleepMask'
  | 'setSleepCovered'
  | 'setSleepCoverProfile'
  | 'setBadSleepCue'
  | 'holdEventOutcome'
  | 'showFeedback'
  | 'clearEventPresentation'
  | 'setAnchors'
  | 'restoreCommandFocus'
>;

export type EventAudioPort = Pick<
  SurvivalAudio,
  | 'beginEvent'
  | 'eventReveal'
  | 'eventItem'
  | 'eventItemCue'
  | 'sleep'
  | 'confirm'
  | 'deny'
  | 'beginEventReaction'
  | 'finishEventReaction'
  | 'eventAction'
  | 'clearMidnightTour'
  | 'clearEvent'
  | 'dawn'
>;

export type EventDriftingItemPort = Pick<
  DriftingItemFlow,
  'enter' | 'choose' | 'clear' | 'settleForVisibilityChange'
>;

export interface EventBundleManagerLike {
  beginLoad(eventId: SurvivalEventId): Promise<unknown> | undefined;
  activate(eventId: SurvivalEventId): Promise<unknown> | undefined;
  releaseActive(): void;
  dispose(): void;
}

export interface SurvivalEventFlowDependencies {
  readonly session: EventSessionPort;
  readonly world: EventWorldPort;
  readonly ui: EventUiPort;
  readonly audio: EventAudioPort;
  readonly bundles: EventBundleManagerLike;
  readonly drifting: EventDriftingItemPort;
  readonly renderSnapshot: () => SurvivalSnapshot;
  readonly renderAndSettleCoveredScene: (generation: number) => Promise<boolean>;
  readonly presentTerminal: (snapshot: SurvivalSnapshot, allowBusy?: boolean) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setAutomaticWeather: (eventId: SurvivalEventId | null) => void;
  readonly isVisibilityBlocked: () => boolean;
  readonly waitForVisibilityResume: (generation: number) => Promise<boolean>;
  readonly getViewport: () => { readonly width: number; readonly height: number };
  readonly captureLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
  readonly onInvariantError: (error: Error) => void;
  readonly onFatalError: (error: unknown) => void;
  readonly initialEventResultId?: string;
}

type EventPresentationState =
  | 'idle'
  | 'sleeping'
  | 'transitioning'
  | 'revealing'
  | 'choosing'
  | 'using'
  | 'resolving';

const TERMINAL_STATES: readonly SurvivalState[] = ['rescued', 'dead', 'sunk'];

function isTerminal(state: SurvivalState): state is 'rescued' | 'dead' | 'sunk' {
  return TERMINAL_STATES.includes(state);
}

export class SurvivalEventFlow {
  private presentation: EventPresentationState = 'idle';
  private eligibility = new Map<ItemInstanceId, EventResponseId>();
  private deferredSync: {
    readonly generation: number;
    readonly before: SurvivalSnapshot;
  } | null = null;
  private presentedInventorySnapshot: SurvivalSnapshot | null = null;
  private preparedEventId: SurvivalEventId | null = null;
  private initialEventResultId: string | undefined;
  private operationGeneration = 0;
  private ownsBusyState = false;
  private disposed = false;

  constructor(private readonly dependencies: SurvivalEventFlowDependencies) {
    this.initialEventResultId = dependencies.initialEventResultId;
  }

  async revealPending(
    snapshot: SurvivalSnapshot,
    alreadyCovered = false,
  ): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (
      snapshot.pendingEventId === null
      || isTerminal(snapshot.state)
      || !this.isLifecycleCurrent(generation)
    ) return;
    const operation = this.beginOperation();
    try {
      await this.runPendingEventReveal(snapshot, generation, operation, alreadyCovered);
    } catch (error) {
      if (this.isCurrent(generation, operation)) this.dependencies.onFatalError(error);
    } finally {
      this.releaseOwnedBusyAfterFailure(generation, operation);
    }
  }

  resolveItem(choiceId: EventResponseId, instanceId: ItemInstanceId): void {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (
      this.presentation !== 'choosing'
      || this.eligibility.get(instanceId) !== choiceId
      || !this.isLifecycleCurrent(generation)
    ) return;
    const operation = this.beginOperation();
    void this.runOwnedOperation(
      generation,
      operation,
      () => this.resolveEventWithItem(choiceId, instanceId, generation, operation),
    );
  }

  resolveEndure(): void {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (this.presentation !== 'choosing' || !this.isLifecycleCurrent(generation)) return;
    if (
      this.eligibility.size !== 0
      && this.dependencies.session.snapshot().pendingEventId !== 'other-people'
    ) return;
    const operation = this.beginOperation();
    void this.runOwnedOperation(
      generation,
      operation,
      () => this.resolveEndureOperation(generation, operation),
    );
  }

  resolveContextual(choiceId: EventResponseId): void {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (this.presentation !== 'choosing' || !this.isLifecycleCurrent(generation)) return;
    const pending = this.dependencies.session.snapshot();
    if (pending.pendingEventId !== null && isDriftingItemEventId(pending.pendingEventId)) {
      void this.dependencies.drifting.choose(choiceId).catch((error) => {
        if (!this.isLifecycleCurrent(generation)) return;
        this.dependencies.onFatalError(error);
        this.setDriftingResolutionActive(false);
        this.setBusy(false);
      });
      return;
    }
    const operation = this.beginOperation();
    void this.runOwnedOperation(
      generation,
      operation,
      () => this.resolveContextualChoice(choiceId, generation, operation),
    );
  }

  async focusDriftingItem(eventId: DriftingItemEventId): Promise<void> {
    if (!this.isPendingEvent(eventId)) return;
    const snapshot = this.dependencies.session.snapshot();
    const event = survivalEventById(eventId);
    if (event === undefined) return;
    try {
      await this.dependencies.drifting.enter(
        eventId,
        this.contextualChoicesFor(event, snapshot),
      );
    } catch (error) {
      if (this.isPendingEvent(eventId)) this.dependencies.onFatalError(error);
    }
  }

  beginNightTransition(snapshot: SurvivalSnapshot, opensEvent: boolean): boolean {
    if (this.disposed) return false;
    this.operationGeneration += 1;
    this.presentation = opensEvent ? 'transitioning' : 'sleeping';
    this.setBusy(true);
    if (!opensEvent) return true;
    this.dependencies.ui.beginEventPresentation?.();
    if (snapshot.pendingEventId === null || !this.beginEventBundleLoad(snapshot.pendingEventId)) {
      this.preparedEventId = null;
      this.presentation = 'idle';
      this.setBusy(false);
      return false;
    }
    this.preparedEventId = snapshot.pendingEventId as SurvivalEventId;
    return true;
  }

  finishQuietNight(): void {
    if (this.disposed) return;
    this.preparedEventId = null;
    this.presentation = 'idle';
    this.setBusy(false);
  }

  async beginDawn(): Promise<SurvivalSnapshot> {
    const generation = this.dependencies.captureLifecycleGeneration();
    const operation = this.beginOperation();
    try {
      return await this.runDawn(generation, operation);
    } catch (error) {
      if (this.isCurrent(generation, operation)) this.dependencies.onFatalError(error);
      return this.dependencies.session.snapshot();
    }
  }

  sync(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    const presentationSnapshot = this.deferredSync?.before ?? snapshot;
    try {
      if (presentationSnapshot !== this.presentedInventorySnapshot) {
        this.presentedInventorySnapshot = presentationSnapshot;
        this.dependencies.world.syncInventory?.(presentationSnapshot);
      }
      const viewport = this.dependencies.getViewport();
      this.dependencies.ui.setAnchors?.(
        this.dependencies.world.projectInteractionAnchors?.(
          viewport.width,
          viewport.height,
        ) ?? [],
      );
    } catch (error) {
      this.dependencies.onFatalError(error);
    }
  }

  presentationSnapshot(snapshot: SurvivalSnapshot): SurvivalSnapshot {
    return this.deferredSync?.before ?? snapshot;
  }

  hasDeferredSync(): boolean {
    return this.deferredSync !== null;
  }

  beginDeferredSync(snapshot: SurvivalSnapshot, generation: number): void {
    this.beginDeferredPresentationSync(snapshot, generation);
  }

  cancelDeferredSync(generation: number): void {
    this.cancelDeferredPresentationSync(generation);
  }

  isIdle(): boolean {
    return this.presentation === 'idle';
  }

  isChoosing(): boolean {
    return this.presentation === 'choosing';
  }

  isPendingEvent(eventId: DriftingItemEventId): boolean {
    if (this.presentation !== 'choosing' || this.disposed) return false;
    const snapshot = this.dependencies.session.snapshot();
    return snapshot.pendingEventId === eventId && !isTerminal(snapshot.state);
  }

  setDriftingResolutionActive(active: boolean): void {
    if (this.disposed) return;
    if (active && this.presentation === 'choosing') this.presentation = 'resolving';
    else if (!active && this.presentation === 'resolving') this.presentation = 'choosing';
  }

  resolveDriftingItemChoice(
    choiceId: EventResponseId,
  ): DriftingItemChoiceResolution | undefined {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (this.presentation !== 'resolving' || !this.isLifecycleCurrent(generation)) {
      return undefined;
    }
    const pending = this.dependencies.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null || !isDriftingItemEventId(eventId)) return undefined;

    const outcome = this.dependencies.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isLifecycleCurrent(generation)) return undefined;
    if (!outcome.accepted) {
      this.dependencies.audio.deny();
      this.dependencies.ui.showFeedback?.(outcome);
      return { accepted: false };
    }

    this.dependencies.renderSnapshot();
    this.eligibility.clear();
    this.dependencies.world.setEventSelectedItem?.(null);
    this.dependencies.world.setEventEligibleItems?.(null);
    this.dependencies.ui.setEventSelection?.(this.eligibility, []);

    let animate = true;
    if (
      (choiceId === 'retrieve' || choiceId === 'delegate-carlitos')
      && outcome.rewardSummary === undefined
    ) {
      this.dependencies.onInvariantError(new Error(
        `Drifting item ${eventId}/${choiceId} requires a reward summary.`,
      ));
      this.dependencies.ui.showFeedback?.({
        accepted: false,
        message: 'The recovered salvage could not be identified.',
      });
      animate = false;
    }

    let terminalSnapshot: SurvivalSnapshot | null = null;
    return {
      accepted: true,
      animate,
      clearEvent: () => {
        if (this.isLifecycleCurrent(generation)) this.clear();
      },
      renderSnapshot: () => {
        if (!this.isLifecycleCurrent(generation)) return false;
        const snapshot = this.dependencies.renderSnapshot();
        if (isTerminal(snapshot.state)) terminalSnapshot = snapshot;
        return terminalSnapshot !== null;
      },
      presentTerminal: () => {
        if (terminalSnapshot !== null && this.isLifecycleCurrent(generation)) {
          this.dependencies.presentTerminal(terminalSnapshot);
        }
      },
    };
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.dependencies.drifting.settleForVisibilityChange();
  }

  clear(preserveDeferredSync = false): void {
    if (this.disposed) return;
    this.operationGeneration += 1;
    this.clearPresentation(preserveDeferredSync);
  }

  dispose(): void {
    if (this.disposed) return;
    this.operationGeneration += 1;
    this.clearPresentation();
    this.disposed = true;
  }

  private async runOwnedOperation(
    generation: number,
    operation: number,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      if (this.isCurrent(generation, operation)) this.dependencies.onFatalError(error);
    } finally {
      this.releaseOwnedBusyAfterFailure(generation, operation);
    }
  }

  private releaseOwnedBusyAfterFailure(generation: number, operation: number): void {
    if (this.ownsBusyState && this.isCurrent(generation, operation)) {
      this.setBusy(false);
    }
  }

  private async resolveEventWithItem(
    choiceId: EventResponseId,
    instanceId: ItemInstanceId,
    generation: number,
    operation: number,
  ): Promise<void> {
    const pending = this.dependencies.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null || !this.isCurrent(generation, operation)) return;
    const itemType = pending.inventory[instanceId]?.type;
    const eventState = pending.state;
    this.presentation = 'using';
    this.setBusy(true);
    this.dependencies.ui.setEventUsing?.(instanceId);
    this.dependencies.world.setEventEligibleItems?.(new Set());
    this.dependencies.world.setEventSelectedItem?.(instanceId);
    await this.playEventItemUseWithSound(eventId, choiceId, instanceId, itemType);
    if (!this.isCurrent(generation, operation)) return;
    if (this.dependencies.isVisibilityBlocked()) {
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrent(generation, operation)) return;
    }
    const choice: EventChoicePresentation = {
      choiceId,
      instanceId,
      condition: pending.inventory[instanceId]?.condition ?? null,
    };
    await (this.dependencies.world.playEventChoice?.(eventId, choice) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    if (this.dependencies.isVisibilityBlocked()) {
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrent(generation, operation)) return;
    }
    this.presentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.dependencies.session.resolveEvent?.({
      kind: 'item',
      choiceId,
      instanceId,
    });
    if (outcome === undefined || !this.isCurrent(generation, operation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.dependencies.audio.deny();
      this.dependencies.ui.showFeedback?.(outcome);
      this.presentation = 'choosing';
      this.dependencies.world.setEventSelectedItem?.(null);
      this.dependencies.world.setEventEligibleItems?.(new Set(this.eligibility.keys()));
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        eventState,
        generation,
        operation,
      );
      return;
    }
    const resolved = this.dependencies.session.snapshot();
    const condition = resolved.inventory[instanceId]?.condition ?? 'lost';
    const resolvedChoice: EventChoicePresentation = { choiceId, instanceId, condition };
    if (!focusedResult) this.cancelDeferredPresentationSync(generation);
    else if (isTerminal(resolved.state)) this.flushDeferredPresentationSync(resolved, generation);
    const response = isEventPresentationRoute(eventId, 'dedicated')
      ? resolvedChoice
      : deriveEventPhysicalResponse(
          choiceId,
          pending.inventory,
          resolved.inventory,
          instanceId,
        );
    const presentation = deriveEventOutcomePresentation(
      pending,
      resolved,
      outcome,
      instanceId,
    );
    await this.runEventResolution(
      eventId,
      outcome,
      eventState,
      generation,
      operation,
      resolvedChoice,
      response,
      presentation,
      focusedResult,
    );
  }

  private async resolveContextualChoice(
    choiceId: EventResponseId,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (!this.isCurrent(generation, operation)) return;
    const pending = this.dependencies.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    if (eventId === 'midnight-tour' && choiceId === 'visit') {
      await this.resolveMidnightTourVisit(generation, operation);
      return;
    }
    this.dependencies.ui.setEventSleepMask?.(eventId, choiceId === 'sleep');
    if (choiceId === 'sleep') this.dependencies.audio.sleep();
    else this.dependencies.audio.confirm();
    this.presentation = 'using';
    this.setBusy(true);
    const choice: EventChoicePresentation = {
      choiceId,
      instanceId: null,
      condition: null,
    };
    await Promise.all([
      this.dependencies.ui.playEventChoiceBeat?.(choiceId) ?? Promise.resolve(),
      this.dependencies.world.playEventChoice?.(
        eventId,
        isEventPresentationRoute(eventId, 'focused') ? choice : choiceId,
      ) ?? Promise.resolve(),
    ]);
    if (!this.isCurrent(generation, operation)) return;
    if (this.dependencies.isVisibilityBlocked()) {
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrent(generation, operation)) return;
    }
    this.presentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.dependencies.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isCurrent(generation, operation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.dependencies.audio.deny();
      this.dependencies.ui.setEventSleepMask?.(eventId, false);
      this.dependencies.ui.showFeedback?.(outcome);
      this.presentation = 'choosing';
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        pending.state,
        generation,
        operation,
      );
      return;
    }
    const resolved = this.dependencies.session.snapshot();
    if (!focusedResult) this.cancelDeferredPresentationSync(generation);
    else if (isTerminal(resolved.state)) this.flushDeferredPresentationSync(resolved, generation);
    const presentation = deriveEventOutcomePresentation(pending, resolved, outcome, null);
    await this.runEventResolution(
      eventId,
      outcome,
      pending.state,
      generation,
      operation,
      choice,
      deriveEventPhysicalResponse(
        choiceId,
        pending.inventory,
        resolved.inventory,
        null,
      ),
      presentation,
      focusedResult,
    );
  }

  private async resolveMidnightTourVisit(
    generation: number,
    operation: number,
  ): Promise<void> {
    const pending = this.dependencies.session.snapshot();
    if (
      pending.pendingEventId !== 'midnight-tour'
      || !this.isCurrent(generation, operation)
    ) return;
    const eventId = 'midnight-tour';
    const choice: EventChoicePresentation = {
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    };
    this.dependencies.audio.confirm();
    this.presentation = 'using';
    this.setBusy(true);
    try {
      await (this.dependencies.ui.setSleepCoverProfile?.('midnight-tour') ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
      await Promise.all([
        this.dependencies.ui.playEventChoiceBeat?.('visit') ?? Promise.resolve(),
        this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve(),
      ]);
      if (!this.isCurrent(generation, operation)) return;
      await (this.dependencies.world.playEventChoice?.(eventId, choice) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
      if (this.dependencies.isVisibilityBlocked()) {
        if (!await this.dependencies.waitForVisibilityResume(generation)) return;
        if (!this.isCurrent(generation, operation)) return;
      }

      this.presentation = 'resolving';
      this.beginDeferredPresentationSync(pending, generation);
      const resultId = this.initialEventResultId;
      this.initialEventResultId = undefined;
      const outcome = this.dependencies.session.resolveEvent?.({
        kind: 'choice',
        choiceId: 'visit',
        ...(resultId === undefined ? {} : { resultId }),
      });
      if (!this.isCurrent(generation, operation)) return;
      if (outcome === undefined) {
        throw new Error('Midnight Tour visit did not return an outcome.');
      }
      if (!outcome.accepted) {
        await this.recoverMidnightTourVisit(generation, operation, { rejection: outcome });
        return;
      }
      const invariantError = this.focusedEventResultError(eventId, 'visit', outcome);
      if (invariantError !== null) {
        await this.recoverMidnightTourVisit(generation, operation, { invariantError });
        return;
      }
      const resolved = this.dependencies.session.snapshot();
      const presentation = deriveEventOutcomePresentation(pending, resolved, outcome, null);
      await this.completeMidnightTourVisit(
        eventId,
        outcome,
        generation,
        operation,
        choice,
        presentation,
      );
    } catch (error) {
      if (this.isCurrent(generation, operation)) {
        await this.recoverMidnightTourVisit(generation, operation, { fatalError: error });
      }
    }
  }

  private async completeMidnightTourVisit(
    eventId: 'midnight-tour',
    outcome: ActionOutcome,
    generation: number,
    operation: number,
    choice: EventChoicePresentation,
    presentation: EventOutcomePresentation,
  ): Promise<void> {
    this.setBusy(true);
    this.dependencies.ui.hideEventReveal?.();
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    if (this.dependencies.isVisibilityBlocked()) {
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrent(generation, operation)) return;
    }
    this.dependencies.audio.beginEventReaction(eventId, outcome);
    await Promise.all([
      this.dependencies.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.dependencies.world.reactToEventOutcome?.(
        eventId,
        outcome,
        choice,
        presentation,
      ) ?? Promise.resolve(),
    ]);
    if (!this.isCurrent(generation, operation)) return;
    this.dependencies.audio.finishEventReaction(eventId);
    if (this.dependencies.isVisibilityBlocked()) {
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrent(generation, operation)) return;
    }
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    this.dependencies.audio.clearMidnightTour();
    this.clearPresentation(true);
    await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    const resolved = this.dependencies.session.snapshot();
    const snapshot = isTerminal(resolved.state)
      ? this.dependencies.renderSnapshot()
      : await this.runDawn(generation, operation);
    if (!this.isCurrent(generation, operation)) return;
    if (!await this.dependencies.renderAndSettleCoveredScene(generation)) return;
    if (!this.isCurrent(generation, operation)) return;
    this.flushDeferredPresentationSync(snapshot, generation);
    if (isTerminal(snapshot.state)) {
      this.dependencies.presentTerminal(snapshot, true);
      this.setBusy(false);
      return;
    }
    if (await this.revealDawnEvent(snapshot, generation, operation)) return;
    if (!this.isCurrent(generation, operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    this.presentation = 'idle';
    this.setBusy(false);
    this.dependencies.ui.restoreCommandFocus?.();
  }

  private async recoverMidnightTourVisit(
    generation: number,
    operation: number,
    reason: {
      readonly rejection?: ActionOutcome;
      readonly invariantError?: Error;
      readonly fatalError?: unknown;
    },
  ): Promise<void> {
    this.cancelDeferredPresentationSync(generation);
    if (!this.isCurrent(generation, operation)) return;
    try {
      await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    } catch {
      // Keep the original error.
    }
    if (!this.isCurrent(generation, operation)) return;
    this.tryCleanup(() => this.clearPresentation());
    if (!this.isCurrent(generation, operation)) return;
    try {
      await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    } catch {
      // Continue cleanup.
    }
    if (!this.isCurrent(generation, operation)) return;
    this.tryCleanup(() => { this.dependencies.renderSnapshot(); });
    if (!this.isCurrent(generation, operation)) return;
    try {
      await this.dependencies.renderAndSettleCoveredScene(generation);
    } catch {
      // Continue cleanup.
    }
    if (!this.isCurrent(generation, operation)) return;
    try {
      await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    } catch {
      // Continue error reporting.
    }
    if (!this.isCurrent(generation, operation)) return;
    try {
      if (reason.rejection !== undefined) {
        this.dependencies.audio.deny();
        this.dependencies.ui.showFeedback?.(reason.rejection);
        this.presentation = 'choosing';
        this.restoreEventSelection();
      } else if (reason.invariantError !== undefined) {
        this.dependencies.onInvariantError(reason.invariantError);
      } else {
        this.dependencies.onFatalError(reason.fatalError);
      }
    } finally {
      if (this.isCurrent(generation, operation)) this.setBusy(false);
    }
    if (this.isCurrent(generation, operation)) this.dependencies.ui.restoreCommandFocus?.();
  }

  private async resolveEndureOperation(
    generation: number,
    operation: number,
  ): Promise<void> {
    if (!this.isCurrent(generation, operation)) return;
    this.presentation = 'resolving';
    this.setBusy(true);
    const pending = this.dependencies.session.snapshot();
    const eventState = pending.state;
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    this.dependencies.audio.confirm();
    const choice: EventChoicePresentation = {
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    };
    if (eventId === 'other-people') {
      await (this.dependencies.world.playEventChoice?.(eventId, choice) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
    }
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.dependencies.session.resolveEvent?.({ kind: 'endure' });
    if (outcome === undefined || !this.isCurrent(generation, operation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.dependencies.audio.deny();
      this.dependencies.ui.showFeedback?.(outcome);
      this.presentation = 'choosing';
      this.setBusy(false);
      return;
    }
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choice.choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        eventState,
        generation,
        operation,
      );
      return;
    }
    const resolved = this.dependencies.session.snapshot();
    if (!focusedResult) this.cancelDeferredPresentationSync(generation);
    else if (isTerminal(resolved.state)) this.flushDeferredPresentationSync(resolved, generation);
    const presentation = deriveEventOutcomePresentation(pending, resolved, outcome, null);
    await this.runEventResolution(
      eventId,
      outcome,
      eventState,
      generation,
      operation,
      choice,
      deriveEventPhysicalResponse(
        'endure',
        pending.inventory,
        resolved.inventory,
        null,
      ),
      presentation,
      focusedResult,
    );
  }

  private async runEventResolution(
    eventId: string,
    outcome: ActionOutcome,
    eventState: SurvivalState,
    generation: number,
    operation: number,
    choice: EventChoicePresentation,
    physicalResponse: EventPhysicalResponsePresentation | EventChoicePresentation,
    presentation: EventOutcomePresentation,
    focusedResult: boolean,
    revealFromCover = false,
  ): Promise<void> {
    const stationaryHandymanTouch = eventId === 'handyman' && choice.choiceId === 'touch';
    this.setBusy(true);
    this.dependencies.ui.hideEventReveal?.();
    this.dependencies.audio.beginEventReaction(eventId, outcome);
    if (
      isEventPresentationRoute(eventId, 'dedicated')
      && ((presentation.resourceDeltas.hull ?? 0) < 0
        || (presentation.resourceDeltas.health ?? 0) < 0)
    ) {
      this.dependencies.audio.eventAction(eventId, 'damage');
    }
    const response = isEventPresentationRoute(eventId, 'dedicated')
      ? physicalResponse
      : focusedResult ? choice : physicalResponse;
    if (revealFromCover) {
      const reaction = this.dependencies.world.reactToEventOutcome?.(
        eventId,
        outcome,
        response,
        presentation,
      ) ?? Promise.resolve();
      await Promise.all([
        stationaryHandymanTouch
          ? Promise.resolve()
          : this.dependencies.world.play?.(outcome.cue) ?? Promise.resolve(),
        reaction,
        this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve(),
      ]);
    } else {
      await Promise.all([
        stationaryHandymanTouch
          ? Promise.resolve()
          : this.dependencies.world.play?.(outcome.cue) ?? Promise.resolve(),
        this.dependencies.world.reactToEventOutcome?.(
          eventId,
          outcome,
          response,
          presentation,
        ) ?? Promise.resolve(),
      ]);
    }
    if (!this.isCurrent(generation, operation)) return;
    this.dependencies.audio.finishEventReaction(eventId);
    if (this.dependencies.isVisibilityBlocked()) {
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrent(generation, operation)) return;
    }
    const terminal = this.dependencies.session.snapshot();
    if (focusedResult && !isTerminal(terminal.state)) {
      this.flushDeferredPresentationSync(terminal, generation);
    }
    const isDedicatedEvent = isEventPresentationRoute(eventId, 'dedicated');
    if (isTerminal(terminal.state)) {
      if (isDedicatedEvent) {
        await (this.dependencies.ui.holdEventOutcome?.() ?? Promise.resolve());
        if (!this.isCurrent(generation, operation)) return;
      }
      if (revealFromCover) {
        await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
        if (!this.isCurrent(generation, operation)) return;
      }
      const snapshot = this.dependencies.renderSnapshot();
      if (snapshot.state === 'rescued') this.retainTerminalEventTableau();
      else this.clearPresentation();
      if (revealFromCover) {
        await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
        if (!this.isCurrent(generation, operation)) return;
      }
      this.presentation = 'idle';
      if (revealFromCover) {
        this.dependencies.presentTerminal(snapshot, true);
        this.setBusy(false);
      } else {
        this.setBusy(false);
        this.dependencies.presentTerminal(snapshot);
      }
      return;
    }

    await (this.dependencies.ui.holdEventOutcome?.() ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    if (
      eventState === 'nightEvent'
      && terminal.state === 'nightEvent'
      && terminal.pendingEventId !== null
      && !this.beginEventBundleLoad(terminal.pendingEventId)
    ) return;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    this.clearPresentation();
    if (revealFromCover) {
      await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
    }
    if (
      eventState === 'nightEvent'
      && terminal.state === 'nightEvent'
      && terminal.pendingEventId !== null
    ) {
      this.preparedEventId = terminal.pendingEventId as SurvivalEventId;
      await this.runPendingEventReveal(terminal, generation, operation, true);
      return;
    }
    const snapshot = eventState === 'nightEvent'
      ? await this.runDawn(generation, operation)
      : this.dependencies.renderSnapshot();
    if (!this.isCurrent(generation, operation)) return;
    if (
      eventState === 'nightEvent'
      && await this.revealDawnEvent(snapshot, generation, operation)
    ) return;
    if (!this.isCurrent(generation, operation)) return;
    if (!await this.dependencies.renderAndSettleCoveredScene(generation)) return;
    if (!this.isCurrent(generation, operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    this.presentation = 'idle';
    this.setBusy(false);
    this.dependencies.presentTerminal(snapshot);
    this.dependencies.ui.restoreCommandFocus?.();
  }

  private async runDawn(
    generation: number,
    operation: number,
  ): Promise<SurvivalSnapshot> {
    if (!this.isCurrent(generation, operation)) return this.dependencies.session.snapshot();
    const dawn = this.dependencies.session.beginDawn?.();
    if (dawn?.accepted) {
      this.dependencies.audio.dawn();
      await (this.dependencies.world.play?.(dawn.cue) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return this.dependencies.session.snapshot();
    }
    return this.dependencies.renderSnapshot();
  }

  private async revealDawnEvent(
    snapshot: SurvivalSnapshot,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    if (snapshot.state !== 'dayEvent' || snapshot.pendingEventId === null) return false;
    this.dependencies.ui.beginEventPresentation?.();
    await this.runPendingEventReveal(snapshot, generation, operation, true);
    return this.isCurrent(generation, operation);
  }

  private async runPendingEventReveal(
    snapshot: SurvivalSnapshot,
    generation: number,
    operation: number,
    alreadyCovered: boolean,
  ): Promise<void> {
    if (!this.isCurrent(generation, operation)) return;
    if (snapshot.pendingEventId === null || isTerminal(snapshot.state)) return;
    const event = survivalEventById(snapshot.pendingEventId);
    if (event === undefined) return;
    if (this.preparedEventId !== event.id && !this.beginEventBundleLoad(event.id)) return;
    this.preparedEventId = null;
    this.presentation = 'transitioning';
    this.eligibility.clear();
    this.setBusy(true);
    if (!alreadyCovered) this.dependencies.ui.beginEventPresentation?.();
    this.dependencies.world.setEventSelectedItem?.(null);
    this.dependencies.world.setEventEligibleItems?.(new Set());
    if (!alreadyCovered) {
      await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
    }
    const eventId = event.id as SurvivalEventId;
    const activation = this.dependencies.bundles.activate(eventId);
    if (activation !== undefined) await activation;
    if (!this.isCurrent(generation, operation)) return;
    if (event.id !== 'leak') this.dependencies.audio.beginEvent(event.id);
    if (event.id !== 'bad-sleep') this.dependencies.audio.eventReveal(event.id);
    const current = this.dependencies.session.snapshot();
    if (current.pendingEventId !== event.id || isTerminal(current.state)) return;
    this.dependencies.setAutomaticWeather(eventId);
    const variantSeed = deriveEventVariantSeed(current.seed, current.day, event.id);
    if (isEventPresentationRoute(event.id, 'dedicated')) {
      this.dependencies.world.stageEvent?.({
        eventId: event.id,
        targetInstanceId: current.pendingEventTargetId,
        variantSeed,
      });
    } else {
      this.dependencies.world.stageEvent?.(event.id, variantSeed);
    }
    this.presentation = 'revealing';
    if (isEventPresentationRoute(event.id, 'dedicated')) {
      await (this.dependencies.ui.showEventReveal?.(event) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
    }
    if (!await this.dependencies.renderAndSettleCoveredScene(generation)) return;
    if (!this.isCurrent(generation, operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    if (event.id === 'bad-sleep') {
      this.dependencies.audio.eventReveal(event.id);
      this.dependencies.ui.setBadSleepCue?.(true);
    }
    try {
      await (this.dependencies.world.revealEvent?.(event.id) ?? Promise.resolve());
    } finally {
      if (event.id === 'bad-sleep' && this.isCurrent(generation, operation)) {
        this.dependencies.ui.setBadSleepCue?.(false);
      }
    }
    if (!this.isCurrent(generation, operation)) return;
    if (event.id === 'leak') this.dependencies.audio.beginEvent(event.id);
    if (!isEventPresentationRoute(event.id, 'dedicated')) {
      await (this.dependencies.ui.showEventReveal?.(event) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
    }
    if (this.dependencies.isVisibilityBlocked()) {
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrent(generation, operation)) return;
    }
    const revealed = this.dependencies.session.snapshot();
    if (revealed.pendingEventId !== event.id || isTerminal(revealed.state)) return;
    this.eligibility = this.eventEligibilityFor(event, revealed);
    this.dependencies.world.setEventEligibleItems?.(new Set(this.eligibility.keys()));
    this.sync(revealed);
    this.dependencies.ui.setEventSelection?.(
      this.eligibility,
      isDriftingItemEventId(event.id) ? [] : this.contextualChoicesFor(event, revealed),
    );
    this.presentation = 'choosing';
    this.setBusy(false);
  }

  private playEventItemUseWithSound(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
    itemType: ItemId | undefined,
  ): Promise<void> {
    if (
      itemType === 'shotgun'
      || itemType === 'flashlight'
      || itemType === 'flareGun'
      || itemType === 'anchor'
      || itemType === 'ductTape'
    ) {
      if (itemType === 'anchor') this.dependencies.audio.eventItem(itemType);
      return this.dependencies.world.playEventItemUse?.(
        eventId,
        choiceId,
        instanceId,
        (cueIndex) => this.dependencies.audio.eventItemCue(itemType, cueIndex),
      ) ?? Promise.resolve();
    }
    if (itemType === 'umbrella') this.dependencies.audio.eventItem(itemType);
    return this.dependencies.world.playEventItemUse?.(
      eventId,
      choiceId,
      instanceId,
    ) ?? Promise.resolve();
  }

  private eventEligibilityFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): Map<ItemInstanceId, EventResponseId> {
    const choiceByItem = new Map(
      event.choices
        .filter((choice) => choice.itemId !== undefined
          && (choice.requiredChestState === undefined
            || choice.requiredChestState === snapshot.chest.state))
        .map((choice) => [choice.itemId!, choice.id] as const),
    );
    const eligibility = new Map<ItemInstanceId, EventResponseId>();
    Object.values(snapshot.inventory).forEach((item) => {
      if (item?.condition !== 'usable') return;
      const choiceId = choiceByItem.get(item.type);
      if (choiceId !== undefined) eligibility.set(item.instanceId, choiceId);
    });
    return eligibility;
  }

  private contextualChoicesFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): EventContextChoice[] {
    return event.choices
      .filter((choice) => choice.itemId === undefined)
      .flatMap((choice): EventContextChoice[] => {
        const companionAvailability = choice.companionAction === undefined
          ? undefined
          : this.dependencies.session.companionEventActionAvailability?.(
              choice.companionAction,
            );
        if (choice.companionAction !== undefined && companionAvailability?.visible !== true) {
          return [];
        }
        const anchorId = this.contextualEventAnchorId(event.id, choice.id);
        const unmet = choice.requirements?.filter(
          ({ resource, minimum }) => snapshot[resource] < minimum,
        ) ?? [];
        const chestUnavailable = choice.requiredChestState !== undefined
          && choice.requiredChestState !== snapshot.chest.state;
        const unavailableReasons = [
          ...unmet.map(({ resource, minimum }) => (
            `Requires ${minimum} ${resource.replace(/([A-Z])/g, ' $1').toLocaleLowerCase('en-US')}; `
            + `you have ${snapshot[resource]}.`
          )),
          ...(chestUnavailable
            ? [`Requires a ${choice.requiredChestState} chest; you have ${snapshot.chest.state}.`]
            : []),
          ...(companionAvailability?.unavailableReason === null
            || companionAvailability?.unavailableReason === undefined
            ? []
            : [companionAvailability.unavailableReason]),
        ];
        return [{
          id: choice.id,
          label: choice.label,
          unavailableReason: unavailableReasons.length === 0
            ? null
            : unavailableReasons.join(' '),
          ...(anchorId === null ? {} : { anchorId }),
          ...(isDriftingItemEventId(event.id) && choice.id === 'retrieve'
            ? {
                energyCost: choice.requirements?.find(
                  ({ resource }) => resource === 'energy',
                )?.minimum ?? 0,
                energyOwner: 'player' as const,
              }
            : {}),
          ...(choice.companionAction !== undefined && companionAvailability !== undefined
            ? {
                energyCost: companionAvailability.energyCost,
                energyOwner: 'carlitos' as const,
              }
            : {}),
        }];
      });
  }

  private contextualEventAnchorId(eventId: string, choiceId: string): string | null {
    if (choiceId === 'delegate-carlitos') return 'carlitos';
    if (isDriftingItemEventId(eventId) && choiceId === 'retrieve') return `event:${eventId}`;
    if (eventId === 'guarded-sleep' && choiceId === 'watch') return 'carlitos';
    if (eventId === 'midnight-tour' && choiceId === 'visit') return 'midnight-tour:island';
    if (eventId === 'handyman' && choiceId === 'touch') return 'handyman:hand';
    if (eventId === 'handyman' && choiceId === 'chest') return 'persistent-chest';
    if (eventId === 'flowers' && choiceId === 'sleep') return 'event:flowers';
    return null;
  }

  private restoreEventSelection(): void {
    const snapshot = this.dependencies.session.snapshot();
    const event = snapshot.pendingEventId === null
      ? undefined
      : survivalEventById(snapshot.pendingEventId);
    this.dependencies.ui.setEventSelection?.(
      this.eligibility,
      event === undefined ? [] : this.contextualChoicesFor(event, snapshot),
    );
  }

  private beginDeferredPresentationSync(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): void {
    if (!this.isLifecycleCurrent(generation)) return;
    this.sync(snapshot);
    this.deferredSync = { generation, before: snapshot };
  }

  private flushDeferredPresentationSync(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): void {
    if (this.deferredSync?.generation !== generation) return;
    this.deferredSync = null;
    this.sync(snapshot);
  }

  private cancelDeferredPresentationSync(generation?: number): void {
    if (
      this.deferredSync === null
      || (generation !== undefined && this.deferredSync.generation !== generation)
    ) return;
    this.deferredSync = null;
  }

  private focusedEventResultError(
    eventId: string,
    choiceId: string,
    outcome: ActionOutcome,
  ): Error | null {
    const result = outcome.eventResult;
    if (result?.eventId === eventId && result.choiceId === choiceId) return null;
    const received = result === undefined ? 'missing' : `${result.eventId}/${result.choiceId}`;
    return new Error(
      `Focused event ${eventId} requires result ${eventId}/${choiceId}; received ${received}.`,
    );
  }

  private async recoverInvalidFocusedEventResult(
    error: Error,
    eventState: SurvivalState,
    generation: number,
    operation: number,
  ): Promise<void> {
    this.cancelDeferredPresentationSync(generation);
    if (!this.isCurrent(generation, operation)) return;
    this.clearPresentation();
    this.dependencies.onInvariantError(error);
    const resolved = this.dependencies.session.snapshot();
    if (isTerminal(resolved.state)) {
      const snapshot = this.dependencies.renderSnapshot();
      this.setBusy(false);
      this.dependencies.presentTerminal(snapshot);
      return;
    }
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    const snapshot = eventState === 'nightEvent'
      ? await this.runDawn(generation, operation)
      : this.dependencies.renderSnapshot();
    if (!this.isCurrent(generation, operation)) return;
    if (!await this.dependencies.renderAndSettleCoveredScene(generation)) return;
    if (!this.isCurrent(generation, operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    this.presentation = 'idle';
    this.setBusy(false);
    this.dependencies.presentTerminal(snapshot);
    this.dependencies.ui.restoreCommandFocus?.();
  }

  private retainTerminalEventTableau(): void {
    this.cancelDeferredPresentationSync();
    this.eligibility.clear();
    this.presentation = 'idle';
    this.dependencies.world.setEventSelectedItem?.(null);
    this.dependencies.world.setEventEligibleItems?.(null);
    this.dependencies.ui.clearEventPresentation?.();
  }

  private clearPresentation(preserveDeferredSync = false): void {
    if (!preserveDeferredSync) this.cancelDeferredPresentationSync();
    this.preparedEventId = null;
    const steps: readonly (() => void)[] = [
      () => this.dependencies.drifting.clear(),
      () => this.dependencies.audio.clearEvent(),
      () => { this.eligibility.clear(); },
      () => { this.presentation = 'idle'; },
      () => this.dependencies.world.setEventSelectedItem?.(null),
      () => this.dependencies.world.setEventEligibleItems?.(null),
      () => this.dependencies.world.clearEvent?.(),
      () => this.dependencies.bundles.releaseActive(),
      () => this.dependencies.ui.clearEventPresentation?.(),
      () => this.dependencies.setAutomaticWeather(null),
    ];
    for (const step of steps) this.tryCleanup(step);
  }

  private tryCleanup(step: () => void): void {
    try {
      step();
    } catch (error) {
      this.dependencies.onFatalError(error);
    }
  }

  private beginEventBundleLoad(eventId: string): boolean {
    try {
      const loading = this.dependencies.bundles.beginLoad(eventId as SurvivalEventId);
      if (loading !== undefined) void loading.catch(() => undefined);
      return true;
    } catch (error) {
      this.dependencies.onFatalError(error);
      return false;
    }
  }

  private setBusy(busy: boolean): void {
    this.ownsBusyState = busy;
    this.dependencies.setBusy(busy);
  }

  private beginOperation(): number {
    this.operationGeneration += 1;
    return this.operationGeneration;
  }

  private isLifecycleCurrent(generation: number): boolean {
    return !this.disposed
      && this.dependencies.isLifecycleGenerationCurrent(generation);
  }

  private isCurrent(generation: number, operation: number): boolean {
    return this.operationGeneration === operation && this.isLifecycleCurrent(generation);
  }
}
