import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type { SurvivalUI } from '../ui/SurvivalUI';
import type {
  EventContextChoice,
  FocusedEventChoiceSelection,
  FocusedEventChoiceView,
} from '../ui/SurvivalUiViewModel';
import type { BoatWorld } from './BoatWorld';
import type {
  FocusedEventChoiceResolution,
  FocusedEventFlow,
} from './FocusedEventFlow';
import type { EventChoicePresentation } from './FocusedEventPresentation';
import {
  isDriftingItemEventId,
  PLANE_CHOICE_WINDOW_SECONDS,
  survivalEventById,
  type DriftingItemEventId,
  type InspectableEventId,
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
  EventChoiceRequirement,
  EventResponseId,
  SurvivalState,
} from './survivalTypes';
import type { SurvivalSnapshot } from './survivalSnapshot';

export type EventSessionPort = Pick<
  SurvivalSession,
  | 'snapshot'
  | 'resolveEvent'
  | 'beginDawn'
  | 'companionEventActionAvailability'
>;

export type EventWorldPort = Pick<
  BoatWorld,
  | 'stageEvent'
  | 'revealEvent'
  | 'playEventItemUse'
  | 'playEventChoice'
  | 'reactToEventOutcome'
  | 'clearEvent'
  | 'setEventEligibleItems'
  | 'setEventSelectedItem'
  | 'syncInventory'
  | 'projectInteractionAnchors'
  | 'retrieveDriftingItem'
  | 'searchDriftingItem'
  | 'delegateDriftingItem'
  | 'recedeDriftingItem'
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
  | 'showRewardResult'
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
  | 'beginDive'
  | 'finishDive'
  | 'cancelDive'
  | 'dawn'
  | 'action'
>;

export type EventFocusedEventPort = Pick<
  FocusedEventFlow,
  'enter' | 'choose' | 'clear' | 'settleForVisibilityChange'
>;

export interface EventBundleManagerLike {
  beginLoad(eventId: SurvivalEventId): Promise<unknown> | undefined;
  activate(eventId: SurvivalEventId): Promise<unknown> | undefined;
  cancelPendingActivation(): void;
  releaseActive(): void;
}

export interface SurvivalEventFlowDependencies {
  readonly session: EventSessionPort;
  readonly world: EventWorldPort;
  readonly ui: EventUiPort;
  readonly audio: EventAudioPort;
  readonly bundles: EventBundleManagerLike;
  readonly focused: EventFocusedEventPort;
  readonly renderSnapshot: () => SurvivalSnapshot;
  readonly renderAndSettleCoveredScene: (generation: number) => Promise<boolean>;
  readonly presentTerminal: (snapshot: SurvivalSnapshot, allowBusy?: boolean) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setAutomaticWeather: (eventId: SurvivalEventId | null) => void;
  readonly isVisibilityBlocked: () => boolean;
  readonly waitForVisibilityResume: (generation: number) => Promise<boolean>;
  readonly getViewportWidth: () => number;
  readonly getViewportHeight: () => number;
  readonly captureLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
  readonly onInvariantError: (error: Error) => void;
  readonly onFatalError: (error: unknown) => void;
  readonly initialEventResultId?: string;
  readonly onDawnSnapshot?: (snapshot: SurvivalSnapshot, generation: number) => void;
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
  private activeFocusedOperation: {
    readonly generation: number;
    readonly operation: number;
  } | null = null;
  private ownsBusyState = false;
  private planeChoiceWindowRemaining: number | null = null;
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
    const operation = this.beginOperation();
    void this.runOwnedOperation(
      generation,
      operation,
      () => this.resolveContextualChoice(choiceId, generation, operation),
    );
  }

  async focusEvent(eventId: InspectableEventId): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (!this.isPendingEvent(eventId) || !this.isLifecycleCurrent(generation)) return;
    const operation = this.beginOperation();
    this.activeFocusedOperation = { generation, operation };
    const snapshot = this.dependencies.session.snapshot();
    const event = survivalEventById(eventId);
    if (event === undefined) return;
    try {
      await this.dependencies.focused.enter(
        eventId,
        this.focusedEventChoicesFor(event, snapshot),
      );
    } catch (error) {
      if (!this.isCurrent(generation, operation)) return;
      try {
        this.dependencies.onFatalError(error);
      } finally {
        this.releaseBusyDuringRecovery(generation, operation);
      }
    }
  }

  beginNightTransition(snapshot: SurvivalSnapshot, opensEvent: boolean): boolean {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (!this.isLifecycleCurrent(generation)) return false;
    const operation = this.beginOperation();
    try {
      this.presentation = opensEvent ? 'transitioning' : 'sleeping';
      this.setBusy(true);
      if (!opensEvent) return true;
      this.dependencies.ui.beginEventPresentation?.();
    } catch (error) {
      if (!this.isCurrent(generation, operation)) return false;
      this.clearPresentation(false, false);
      try {
        this.dependencies.onFatalError(error);
      } finally {
        this.releaseBusyDuringRecovery(generation, operation);
      }
      return false;
    }
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
      this.dependencies.ui.setAnchors?.(
        this.dependencies.world.projectInteractionAnchors?.(
          this.dependencies.getViewportWidth(),
          this.dependencies.getViewportHeight(),
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

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const snapshot = this.dependencies.session.snapshot();
    if (this.presentation !== 'choosing' || snapshot.pendingEventId !== 'plane') {
      this.planeChoiceWindowRemaining = null;
      return;
    }
    if (this.planeChoiceWindowRemaining === null) {
      this.planeChoiceWindowRemaining = PLANE_CHOICE_WINDOW_SECONDS;
    }
    this.planeChoiceWindowRemaining -= Math.max(0, deltaSeconds);
    if (this.planeChoiceWindowRemaining > 0) return;
    this.planeChoiceWindowRemaining = null;
    this.dependencies.ui.setEventSelection?.(new Map(), []);
    this.dependencies.world.setEventEligibleItems?.(new Set());
    this.resolveEndure();
  }

  isPendingEvent(eventId: InspectableEventId): boolean {
    if (this.presentation !== 'choosing' || this.disposed) return false;
    const snapshot = this.dependencies.session.snapshot();
    return snapshot.pendingEventId === eventId && !isTerminal(snapshot.state);
  }

  setFocusedResolutionActive(active: boolean): void {
    const focused = this.activeFocusedOperation;
    if (
      focused === null
      || !this.isCurrent(focused.generation, focused.operation)
    ) return;
    if (active && this.presentation === 'choosing') this.presentation = 'resolving';
    else if (!active && this.presentation === 'resolving') {
      this.presentation = 'choosing';
      this.activeFocusedOperation = null;
    }
  }

  resolveFocusedEventChoice(
    choice: FocusedEventChoiceSelection,
  ): FocusedEventChoiceResolution | undefined {
    const focused = this.activeFocusedOperation;
    if (
      focused === null
      || this.presentation !== 'resolving'
      || !this.isCurrent(focused.generation, focused.operation)
    ) {
      return undefined;
    }
    const { generation, operation } = focused;
    const pending = this.dependencies.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null || !this.isInspectableEvent(eventId)) return undefined;

    const outcome = choice.instanceId === null
      ? this.dependencies.session.resolveEvent?.({ kind: 'choice', choiceId: choice.id })
      : this.dependencies.session.resolveEvent?.({
          kind: 'item', choiceId: choice.id, instanceId: choice.instanceId,
        });
    if (outcome === undefined || !this.isCurrent(generation, operation)) return undefined;
    if (!outcome.accepted) {
      this.dependencies.audio.deny();
      this.dependencies.ui.showFeedback?.(outcome);
      return { accepted: false };
    }

    this.eligibility.clear();
    this.dependencies.world.setEventSelectedItem?.(null);
    this.dependencies.world.setEventEligibleItems?.(null);
    this.dependencies.ui.setEventSelection?.(this.eligibility, []);

    const lifeboatSearch = eventId === 'empty-lifeboat' && choice.id === 'search';
    if (
      eventId === 'drifting-barrel'
      &&
      (choice.id === 'retrieve' || choice.id === 'delegate-carlitos')
      && outcome.rewardSummary === undefined
    ) {
      this.dependencies.onInvariantError(new Error(
        `Drifting item ${eventId}/${choice.id} requires a reward summary.`,
      ));
      this.dependencies.ui.showFeedback?.({
        accepted: false,
        message: 'The recovered salvage could not be identified.',
      });
    }
    if (lifeboatSearch && outcome.rewardSummary === undefined) {
      this.dependencies.onInvariantError(new Error(
        'Empty Lifeboat search requires a reward summary.',
      ));
    }

    let terminalSnapshot: SurvivalSnapshot | null = null;
    return {
      accepted: true,
      playAnimation: async () => {
        if (!this.isCurrent(generation, operation)) return;
        if (isDriftingItemEventId(eventId)) {
          if (choice.id === 'retrieve') {
            await (this.dependencies.world.retrieveDriftingItem?.(eventId) ?? Promise.resolve());
          } else if (choice.id === 'delegate-carlitos') {
            await (this.dependencies.world.delegateDriftingItem?.(eventId) ?? Promise.resolve());
          } else if (choice.id === 'search') {
            await (this.dependencies.world.searchDriftingItem?.(eventId) ?? Promise.resolve());
          } else {
            await (this.dependencies.world.recedeDriftingItem?.(eventId) ?? Promise.resolve());
          }
          return;
        }
        if (choice.instanceId !== null) {
          await this.playEventItemUseWithSound(
            eventId,
            choice.id,
            choice.instanceId,
            pending.inventory[choice.instanceId]?.type,
            generation,
            operation,
          );
        }
        if (!this.isCurrent(generation, operation)) return;
        const playedChoice: EventChoicePresentation = {
          choiceId: choice.id,
          instanceId: choice.instanceId,
          condition: choice.instanceId === null
            ? null
            : pending.inventory[choice.instanceId]?.condition ?? null,
        };
        await (this.dependencies.world.playEventChoice?.(eventId, playedChoice)
          ?? Promise.resolve());
        if (!this.isCurrent(generation, operation)) return;
        const resolved = this.dependencies.session.snapshot();
        const presentation = deriveEventOutcomePresentation(
          pending,
          resolved,
          outcome,
          choice.instanceId,
        );
        this.dependencies.audio.beginEventReaction(eventId, outcome);
        await Promise.all([
          this.dependencies.world.play?.(outcome.cue) ?? Promise.resolve(),
          this.dependencies.world.reactToEventOutcome?.(
            eventId,
            outcome,
            playedChoice,
            presentation,
          ) ?? Promise.resolve(),
        ]);
        if (this.isCurrent(generation, operation)) {
          this.dependencies.audio.finishEventReaction(eventId);
        }
      },
      afterAnimation: async () => {
        if (!this.isCurrent(generation, operation)) return;
        if (
          eventId === 'drifting-barrel'
          && (choice.id === 'retrieve' || choice.id === 'delegate-carlitos')
          && outcome.rewardSummary !== undefined
        ) {
          this.dependencies.audio.action('openChest');
          await (this.dependencies.ui.showRewardResult?.({
            title: 'CHEST REWARD',
            reward: outcome.rewardSummary,
            lines: [],
          }) ?? Promise.resolve());
        }
        if (lifeboatSearch && outcome.rewardSummary !== undefined) {
          await (this.dependencies.ui.showRewardResult?.({
            title: 'LIFEBOAT SUPPLY',
            reward: outcome.rewardSummary,
            lines: [],
          }) ?? Promise.resolve());
        }
      },
      beforeReturn: async () => undefined,
      afterReturn: async () => undefined,
      clearEvent: () => {
        if (this.isCurrent(generation, operation)) this.clearPresentation();
      },
      renderSnapshot: () => {
        if (!this.isCurrent(generation, operation)) return false;
        const snapshot = this.dependencies.renderSnapshot();
        if (!this.isCurrent(generation, operation)) return false;
        if (isTerminal(snapshot.state)) terminalSnapshot = snapshot;
        return terminalSnapshot !== null;
      },
      presentTerminal: () => {
        if (terminalSnapshot !== null && this.isCurrent(generation, operation)) {
          this.dependencies.presentTerminal(terminalSnapshot);
        }
      },
    };
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.dependencies.focused.settleForVisibilityChange();
  }

  clear(preserveDeferredSync = false): void {
    if (this.disposed) return;
    this.operationGeneration += 1;
    this.clearPresentation(preserveDeferredSync, true, true);
  }

  clearAfterFailure(): void {
    if (this.disposed) return;
    this.operationGeneration += 1;
    this.clearPresentation(false, false, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.operationGeneration += 1;
    this.disposed = true;
    this.clearPresentation(false, true, true);
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
    if (eventId !== 'chest-attack') {
      await this.playEventItemUseWithSound(
        eventId,
        choiceId,
        instanceId,
        itemType,
        generation,
        operation,
      );
    }
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

  private releaseBusyDuringRecovery(generation: number, operation: number): void {
    if (!this.isCurrent(generation, operation)) return;
    try {
      this.setBusy(false);
    } catch {
      // Keep the primary recovery error.
    }
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
    if (eventId === 'chest-attack' && choiceId === 'attack') {
      await this.resolveChestAttack(generation, operation);
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
    let recoveryStarted = false;
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
        recoveryStarted = true;
        await this.recoverMidnightTourVisit(generation, operation, { rejection: outcome });
        return;
      }
      const invariantError = this.focusedEventResultError(eventId, 'visit', outcome);
      if (invariantError !== null) {
        recoveryStarted = true;
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
      if (!recoveryStarted && this.isCurrent(generation, operation)) {
        recoveryStarted = true;
        await this.recoverMidnightTourVisit(generation, operation, { fatalError: error });
      }
    }
  }

  private async resolveChestAttack(generation: number, operation: number): Promise<void> {
    if (this.presentation !== 'choosing' || !this.isCurrent(generation, operation)) return;
    const pending = this.dependencies.session.snapshot();
    if (pending.pendingEventId !== 'chest-attack') return;
    const choice: EventChoicePresentation = {
      choiceId: 'attack',
      instanceId: null,
      condition: null,
    };
    this.presentation = 'using';
    this.setBusy(true);
    this.eligibility.clear();
    this.dependencies.world.setEventEligibleItems?.(new Set());
    this.dependencies.ui.setEventSelection?.(this.eligibility, []);
    await (this.dependencies.world.playEventChoice?.('chest-attack', choice) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    if (this.dependencies.isVisibilityBlocked()
      && !await this.dependencies.waitForVisibilityResume(generation)) return;
    if (!this.isCurrent(generation, operation)) return;
    this.presentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.dependencies.session.resolveEvent?.({ kind: 'choice', choiceId: 'attack' });
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
    const invariantError = this.focusedEventResultError('chest-attack', 'attack', outcome);
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        pending.state,
        generation,
        operation,
      );
      return;
    }
    await this.completeChestAttack(generation, operation);
  }

  private async completeChestAttack(generation: number, operation: number): Promise<void> {
    this.dependencies.ui.hideEventReveal?.();
    await (this.dependencies.ui.setSleepCoverProfile?.('midnight-attack') ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    this.clearPresentation(true);
    await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    const resolved = this.dependencies.session.snapshot();
    const snapshot = isTerminal(resolved.state)
      ? this.dependencies.renderSnapshot()
      : await this.runDawn(generation, operation);
    if (!this.isCurrent(generation, operation)) return;
    if (!await this.dependencies.renderAndSettleCoveredScene(generation)) return;
    this.flushDeferredPresentationSync(snapshot, generation);
    if (isTerminal(snapshot.state)) {
      this.dependencies.presentTerminal(snapshot, true);
      this.setBusy(false);
      return;
    }
    if (await this.revealDawnEvent(snapshot, generation, operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    this.presentation = 'idle';
    this.setBusy(false);
    this.dependencies.ui.restoreCommandFocus?.();
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
    if (outcome.eventResult?.resultId === 'tour-attack') {
      await (this.dependencies.ui.setSleepCoverProfile?.('midnight-attack') ?? Promise.resolve());
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
    this.clearPresentation(false, false);
    if (!this.isCurrent(generation, operation)) return;
    try {
      await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    } catch {
      // Continue cleanup.
    }
    if (!this.isCurrent(generation, operation)) return;
    this.tryCleanup(() => { this.dependencies.renderSnapshot(); }, false);
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
      this.releaseBusyDuringRecovery(generation, operation);
    }
    if (!this.isCurrent(generation, operation)) return;
    try {
      this.dependencies.ui.restoreCommandFocus?.();
    } catch {
      // Keep the primary recovery result.
    }
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
    if (eventId === 'other-people' || eventId === 'plane') {
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
    const snapshot = this.dependencies.renderSnapshot();
    this.dependencies.onDawnSnapshot?.(snapshot, generation);
    return snapshot;
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
    const isChestAttack = event.id === 'chest-attack';
    if (isEventPresentationRoute(event.id, 'dedicated') || isChestAttack) {
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
    if (isChestAttack) {
      const warned = this.dependencies.session.snapshot();
      if (warned.pendingEventId !== event.id || isTerminal(warned.state)) return;
      this.eligibility = this.eventEligibilityFor(event, warned);
      this.dependencies.world.setEventEligibleItems?.(new Set(this.eligibility.keys()));
      this.sync(warned);
      this.dependencies.ui.setEventSelection?.(this.eligibility, []);
      this.presentation = 'choosing';
      this.setBusy(false);
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
    if (!isEventPresentationRoute(event.id, 'dedicated') && !isChestAttack) {
      await (this.dependencies.ui.showEventReveal?.(event) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
    }
    if (this.dependencies.isVisibilityBlocked()) {
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrent(generation, operation)) return;
    }
    if (isChestAttack) {
      if (this.presentation === 'choosing') {
        await this.resolveChestAttack(generation, operation);
      }
      return;
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
    generation: number,
    operation: number,
  ): Promise<void> {
    if (eventId === 'wreckage' && itemType === 'scubaSet') {
      this.dependencies.audio.beginDive();
      return this.dependencies.world.playEventItemUse?.(
        eventId,
        choiceId,
        instanceId,
      ) ?? Promise.resolve();
    }
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
        (cueIndex) => {
          if (this.isCurrent(generation, operation)) {
            this.dependencies.audio.eventItemCue(itemType, cueIndex);
          }
        },
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
          && this.meetsRequirements(choice.requirements, snapshot)
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

  private focusedEventChoicesFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): readonly FocusedEventChoiceView[] {
    const contextual = this.contextualChoicesFor(event, snapshot).map((choice) => ({
      ...choice,
      instanceId: null,
    }));
    const eligibility = this.eventEligibilityFor(event, snapshot);
    const itemChoices = Object.values(snapshot.inventory).flatMap((item) => {
      if (item === undefined || item.condition !== 'usable') return [];
      const choiceId = eligibility.get(item.instanceId);
      if (choiceId === undefined) return [];
      const definition = event.choices.find((choice) => choice.id === choiceId);
      if (definition === undefined) return [];
      return [{
        id: definition.id,
        label: definition.label,
        unavailableReason: null,
        instanceId: item.instanceId,
      }];
    });
    return [...contextual, ...itemChoices];
  }

  private isInspectableEvent(eventId: string): eventId is InspectableEventId {
    return isDriftingItemEventId(eventId) || eventId === 'wreckage';
  }

  private contextualChoicesFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): EventContextChoice[] {
    return event.choices
      .filter((choice) => choice.itemId === undefined
        && !(event.id === 'chest-attack' && choice.id === 'attack'))
      .flatMap((choice): EventContextChoice[] => {
        const companionAvailability = choice.companionAction === undefined
          ? undefined
          : this.dependencies.session.companionEventActionAvailability?.(
              choice.companionAction,
            );
        if (
          choice.companionAction !== undefined
          && companionAvailability !== undefined
          && companionAvailability.visible !== true
        ) {
          return [];
        }
        const anchorId = this.contextualEventAnchorId(event.id, choice.id);
        const playerEnergyCost = choice.requirements?.find(
          ({ resource }) => resource === 'energy',
        )?.minimum;
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
          ...(playerEnergyCost === undefined ? {} : {
            energyCost: playerEnergyCost,
            energyOwner: 'player' as const,
          }),
          ...(choice.companionAction !== undefined && companionAvailability !== undefined
            ? {
                energyCost: companionAvailability.energyCost,
                energyOwner: 'carlitos' as const,
              }
            : {}),
        }];
      });
  }

  private meetsRequirements(
    requirements: readonly EventChoiceRequirement[] | undefined,
    snapshot: SurvivalSnapshot,
  ): boolean {
    return requirements?.every(
      ({ resource, minimum }) => snapshot[resource] >= minimum,
    ) ?? true;
  }

  private contextualEventAnchorId(eventId: string, choiceId: string): string | null {
    if (choiceId === 'delegate-carlitos') return 'carlitos';
    if (isDriftingItemEventId(eventId) && (choiceId === 'retrieve' || choiceId === 'search')) {
      return `event:${eventId}`;
    }
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
    this.clearPresentation(false, false);
    try {
      this.dependencies.onInvariantError(error);
    } catch {
      // Keep the invariant as the primary error and continue recovery.
    }
    if (!this.isCurrent(generation, operation)) return;
    let resolved: SurvivalSnapshot;
    try {
      resolved = this.dependencies.session.snapshot();
    } catch {
      this.releaseBusyDuringRecovery(generation, operation);
      return;
    }
    if (isTerminal(resolved.state)) {
      let snapshot: SurvivalSnapshot | null = null;
      try {
        snapshot = this.dependencies.renderSnapshot();
      } catch {
        // Keep the invariant as the primary error.
      }
      if (!this.isCurrent(generation, operation)) return;
      this.releaseBusyDuringRecovery(generation, operation);
      if (snapshot !== null) {
        try {
          this.dependencies.presentTerminal(snapshot);
        } catch {
          // Keep the invariant as the primary error.
        }
      }
      return;
    }
    try {
      await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    } catch {
      // Continue recovery with the invariant as the primary error.
    }
    if (!this.isCurrent(generation, operation)) return;
    let snapshot: SurvivalSnapshot;
    try {
      snapshot = eventState === 'nightEvent'
        ? await this.runDawn(generation, operation)
        : this.dependencies.renderSnapshot();
    } catch {
      try {
        snapshot = this.dependencies.session.snapshot();
      } catch {
        this.releaseBusyDuringRecovery(generation, operation);
        return;
      }
    }
    if (!this.isCurrent(generation, operation)) return;
    try {
      await this.dependencies.renderAndSettleCoveredScene(generation);
    } catch {
      // Continue recovery with the invariant as the primary error.
    }
    if (!this.isCurrent(generation, operation)) return;
    try {
      await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    } catch {
      // Continue recovery with the invariant as the primary error.
    }
    if (!this.isCurrent(generation, operation)) return;
    this.presentation = 'idle';
    this.releaseBusyDuringRecovery(generation, operation);
    try {
      this.dependencies.presentTerminal(snapshot);
      this.dependencies.ui.restoreCommandFocus?.();
    } catch {
      // Keep the invariant as the primary error.
    }
  }

  private retainTerminalEventTableau(): void {
    this.cancelDeferredPresentationSync();
    this.eligibility.clear();
    this.presentation = 'idle';
    this.dependencies.world.setEventSelectedItem?.(null);
    this.dependencies.world.setEventEligibleItems?.(null);
    this.dependencies.ui.clearEventPresentation?.();
  }

  private clearPresentation(
    preserveDeferredSync = false,
    reportCleanupErrors = true,
    cancelPendingActivation = false,
  ): void {
    if (!preserveDeferredSync) this.cancelDeferredPresentationSync();
    this.preparedEventId = null;
    this.activeFocusedOperation = null;
    this.eligibility.clear();
    this.presentation = 'idle';
    const steps: readonly (() => void)[] = [
      () => this.dependencies.focused.clear(),
      () => this.dependencies.audio.clearEvent(),
      () => this.dependencies.world.setEventSelectedItem?.(null),
      () => this.dependencies.world.setEventEligibleItems?.(null),
      () => this.dependencies.world.clearEvent?.(),
      ...(cancelPendingActivation
        ? [() => this.dependencies.bundles.cancelPendingActivation()]
        : []),
      () => this.dependencies.bundles.releaseActive(),
      () => this.dependencies.ui.clearEventPresentation?.(),
      () => this.dependencies.setAutomaticWeather(null),
    ];
    let firstError: unknown;
    let failed = false;
    for (const step of steps) {
      try {
        step();
      } catch (error) {
        if (!failed) {
          firstError = error;
          failed = true;
        }
      }
    }
    if (reportCleanupErrors && failed) {
      this.dependencies.onFatalError(firstError);
    }
  }

  private tryCleanup(step: () => void, reportError = true): void {
    try {
      step();
    } catch (error) {
      if (reportError) this.dependencies.onFatalError(error);
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
