import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import {
  CARLITOS_EVENT_ENERGY_COST,
  carlitosStatus,
  carlitosWellness,
} from './CarlitosState';
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
  isInspectableEventId,
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
  | 'bucketHelmetRain'
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

type SurvivalEventDefinition = NonNullable<ReturnType<typeof survivalEventById>>;
type SurvivalEventChoice = SurvivalEventDefinition['choices'][number];

type CompanionChoiceAvailability = ReturnType<typeof carlitosChoiceAvailability>;
type SessionCompanionAvailability = ReturnType<
  NonNullable<EventSessionPort['companionEventActionAvailability']>
>;

const EVENT_ITEM_CUE_TYPES: ReadonlySet<ItemId> = new Set([
  'shotgun',
  'flashlight',
  'flareGun',
  'anchor',
  'ductTape',
  'map',
  'bucket',
]);

interface FocusedChoiceContext {
  readonly eventId: InspectableEventId;
  readonly choice: FocusedEventChoiceSelection;
  readonly pending: SurvivalSnapshot;
  readonly outcome: ActionOutcome;
  readonly generation: number;
  readonly operation: number;
  readonly wreckage: boolean;
  readonly scubaBroke: boolean;
  readonly skipDriftingAnimation: boolean;
}

interface FocusedChoiceResolutionState {
  terminalSnapshot: SurvivalSnapshot | null;
  returnCovered: boolean;
}

interface EventResolutionContext {
  readonly eventId: string;
  readonly outcome: ActionOutcome;
  readonly eventState: SurvivalState;
  readonly generation: number;
  readonly operation: number;
  readonly choice: EventChoicePresentation;
  readonly physicalResponse: EventPhysicalResponsePresentation | EventChoicePresentation;
  readonly presentation: EventOutcomePresentation;
  readonly focusedResult: boolean;
  readonly revealFromCover: boolean;
}

interface MidnightTourResolutionState {
  recoveryStarted: boolean;
}

interface MidnightTourRecoveryReason {
  readonly rejection?: ActionOutcome;
  readonly invariantError?: Error;
  readonly fatalError?: unknown;
}

const FIXED_CHOICE_ANCHORS: Readonly<Record<string, string>> = {
  'midnight-tour:visit': 'midnight-tour:island',
  'handyman:touch': 'handyman:hand',
  'handyman:chest': 'persistent-chest',
  'flowers:sleep': 'event:flowers',
};

function isTerminal(state: SurvivalState): state is 'rescued' | 'dead' | 'sunk' {
  return TERMINAL_STATES.includes(state);
}

function usesEventItemCues(itemType: ItemId | undefined): itemType is ItemId {
  return itemType !== undefined && EVENT_ITEM_CUE_TYPES.has(itemType);
}

function pendingEventDefinition(snapshot: SurvivalSnapshot): SurvivalEventDefinition | undefined {
  if (snapshot.pendingEventId === null) return undefined;
  if (isTerminal(snapshot.state)) return undefined;
  return survivalEventById(snapshot.pendingEventId);
}

function focusedChoiceAnchorId(eventId: string, choiceId: string): string | null {
  if (eventId === 'wreckage') return null;
  if (choiceId === 'delegate-carlitos') return 'carlitos';
  if (isDriftingItemEventId(eventId) && (choiceId === 'retrieve' || choiceId === 'search')) {
    return `event:${eventId}`;
  }
  return FIXED_CHOICE_ANCHORS[`${eventId}:${choiceId}`] ?? null;
}

function carlitosChoiceAvailability(snapshot: SurvivalSnapshot): {
  readonly visible: boolean;
  readonly unavailableReason: string | null;
} {
  const carlitos = snapshot.carlitos;
  if (carlitos === null) {
    return { visible: false, unavailableReason: 'Carlitos is not aboard.' };
  }
  if (!carlitos.alive) {
    return { visible: false, unavailableReason: 'Carlitos cannot retrieve the loot.' };
  }
  if (carlitos.energy < CARLITOS_EVENT_ENERGY_COST) {
    return {
      visible: true,
      unavailableReason: `Carlitos needs 3 energy; he has ${carlitos.energy}.`,
    };
  }
  if (carlitosWellness(carlitos) >= 4) {
    return { visible: true, unavailableReason: null };
  }
  const status = carlitosStatus(carlitos);
  const label = carlitos.hunger < 4
    ? status.hunger
    : carlitos.sickness > 0
      ? status.health
      : status.happiness;
  return {
    visible: true,
    unavailableReason: `Carlitos is ${label} and cannot retrieve the loot.`,
  };
}

function usableChoiceItemInstanceId(
  choice: SurvivalEventChoice,
  snapshot: SurvivalSnapshot,
): ItemInstanceId | null {
  if (choice.itemId === undefined) return null;
  return Object.values(snapshot.inventory)
    .filter((item) => (
      item !== undefined && item.type === choice.itemId && item.condition === 'usable'
    ))
    .map((item) => item!.instanceId)
    .sort()[0] ?? null;
}

function requirementUnavailableReason(
  requirement: EventChoiceRequirement,
  snapshot: SurvivalSnapshot,
): string {
  const { resource, minimum } = requirement;
  const resourceLabel = resource.replace(/([A-Z])/g, ' $1').toLocaleLowerCase('en-US');
  return `Requires ${minimum} ${resourceLabel}; you have ${snapshot[resource]}.`;
}

function focusedChoiceUnavailableReasons(
  choice: SurvivalEventChoice,
  snapshot: SurvivalSnapshot,
  instanceId: ItemInstanceId | null,
  companionAvailability: CompanionChoiceAvailability,
): string[] {
  const reasons = (choice.requirements ?? [])
    .filter(({ resource, minimum }) => snapshot[resource] < minimum)
    .map((requirement) => requirementUnavailableReason(requirement, snapshot));
  if (choice.itemId !== undefined && instanceId === null) {
    const itemLabel = choice.itemId === 'scubaSet' ? 'scuba gear' : choice.itemId;
    reasons.push(`Requires usable ${itemLabel}.`);
  }
  if (choice.requiredChestState !== undefined
    && choice.requiredChestState !== snapshot.chest.state) {
    reasons.push(
      `Requires a ${choice.requiredChestState} chest; you have ${snapshot.chest.state}.`,
    );
  }
  if (choice.companionAction !== undefined
    && companionAvailability.unavailableReason !== null) {
    reasons.push(companionAvailability.unavailableReason);
  }
  return reasons;
}

function focusedChoiceEnergy(
  choice: SurvivalEventChoice,
): Partial<Pick<FocusedEventChoiceView, 'energyCost' | 'energyOwner'>> {
  if (choice.companionAction !== undefined) {
    return { energyCost: CARLITOS_EVENT_ENERGY_COST, energyOwner: 'carlitos' };
  }
  const playerEnergyCost = choice.requirements?.find(
    ({ resource }) => resource === 'energy',
  )?.minimum;
  if (playerEnergyCost === undefined) return {};
  return { energyCost: playerEnergyCost, energyOwner: 'player' };
}

function focusedChoiceFor(
  event: SurvivalEventDefinition,
  choice: SurvivalEventChoice,
  snapshot: SurvivalSnapshot,
  companionAvailability: CompanionChoiceAvailability,
): FocusedEventChoiceView | null {
  if (choice.companionAction !== undefined
    && !companionAvailability.visible
    && event.id !== 'wreckage') return null;
  const instanceId = usableChoiceItemInstanceId(choice, snapshot);
  const reasons = focusedChoiceUnavailableReasons(
    choice,
    snapshot,
    instanceId,
    companionAvailability,
  );
  const anchorId = focusedChoiceAnchorId(event.id, choice.id);
  return {
    id: choice.id,
    label: choice.label,
    unavailableReason: reasons.length === 0 ? null : reasons.join(' '),
    instanceId,
    ...(anchorId === null ? {} : { anchorId }),
    ...focusedChoiceEnergy(choice),
  };
}

export function focusedChoicesFor(
  event: SurvivalEventDefinition,
  snapshot: SurvivalSnapshot,
): readonly FocusedEventChoiceView[] {
  const companionAvailability = carlitosChoiceAvailability(snapshot);
  return event.choices.flatMap((choice) => {
    const view = focusedChoiceFor(event, choice, snapshot, companionAvailability);
    return view === null ? [] : [view];
  });
}

export class SurvivalEventFlow {
  private presentation: EventPresentationState = 'idle';
  private choiceCheckpointReady = false;
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
    if (isInspectableEventId(this.dependencies.session.snapshot().pendingEventId ?? '')) return;
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
    const pendingEventId = this.dependencies.session.snapshot().pendingEventId;
    if (
      this.eligibility.size !== 0
      && pendingEventId !== 'other-people'
      && pendingEventId !== 'plane'
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
    if (isInspectableEventId(this.dependencies.session.snapshot().pendingEventId ?? '')) return;
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
        focusedChoicesFor(event, snapshot),
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

  isStableChoice(): boolean {
    return this.presentation === 'choosing' && this.choiceCheckpointReady;
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
    if (eventId === null || !isInspectableEventId(eventId)) return undefined;
    const outcome = this.resolveFocusedChoiceOutcome(choice);
    if (outcome === undefined || !this.isCurrent(generation, operation)) return undefined;
    if (!outcome.accepted) {
      this.rejectFocusedChoice(outcome);
      return { accepted: false };
    }
    this.clearFocusedChoiceSelection();
    const context = this.createFocusedChoiceContext(
      eventId,
      choice,
      pending,
      outcome,
      generation,
      operation,
    );
    if (context.skipDriftingAnimation) this.reportMissingDriftingReward(context);
    const state: FocusedChoiceResolutionState = {
      terminalSnapshot: null,
      returnCovered: false,
    };
    return {
      accepted: true,
      playAnimation: () => this.playFocusedChoiceAnimation(context),
      afterAnimation: () => this.afterFocusedChoiceAnimation(context),
      beforeReturn: () => this.coverFocusedChoiceReturn(context, state),
      afterReturn: () => this.finishFocusedChoiceReturn(context, state),
      clearEvent: (reportCleanupErrors) => this.clearFocusedChoiceEvent(
        context,
        reportCleanupErrors,
      ),
      renderSnapshot: () => this.renderFocusedChoiceSnapshot(context, state),
      presentTerminal: () => this.presentFocusedChoiceTerminal(context, state),
    };
  }

  private resolveFocusedChoiceOutcome(
    choice: FocusedEventChoiceSelection,
  ): ActionOutcome | undefined {
    if (choice.instanceId === null) {
      return this.dependencies.session.resolveEvent?.({ kind: 'choice', choiceId: choice.id });
    }
    return this.dependencies.session.resolveEvent?.({
      kind: 'item',
      choiceId: choice.id,
      instanceId: choice.instanceId,
    });
  }

  private rejectFocusedChoice(outcome: ActionOutcome): void {
    this.dependencies.audio.deny();
    this.dependencies.ui.showFeedback?.(outcome);
  }

  private clearFocusedChoiceSelection(): void {
    this.eligibility.clear();
    this.dependencies.world.setEventSelectedItem?.(null);
    this.dependencies.world.setEventEligibleItems?.(null);
    this.dependencies.ui.setEventSelection?.(this.eligibility, []);
  }

  private createFocusedChoiceContext(
    eventId: InspectableEventId,
    choice: FocusedEventChoiceSelection,
    pending: SurvivalSnapshot,
    outcome: ActionOutcome,
    generation: number,
    operation: number,
  ): FocusedChoiceContext {
    const wreckage = eventId === 'wreckage';
    return {
      eventId,
      choice,
      pending,
      outcome,
      generation,
      operation,
      wreckage,
      scubaBroke: this.didFocusedScubaBreak(eventId, choice, pending),
      skipDriftingAnimation: this.shouldSkipDriftingAnimation(eventId, choice, outcome),
    };
  }

  private didFocusedScubaBreak(
    eventId: InspectableEventId,
    choice: FocusedEventChoiceSelection,
    pending: SurvivalSnapshot,
  ): boolean {
    if (eventId !== 'wreckage' || choice.id !== 'dive' || choice.instanceId === null) {
      return false;
    }
    const beforeCondition = pending.inventory[choice.instanceId]?.condition;
    const afterCondition = this.dependencies.session.snapshot().inventory[
      choice.instanceId
    ]?.condition;
    return beforeCondition === 'usable' && afterCondition === 'broken';
  }

  private shouldSkipDriftingAnimation(
    eventId: InspectableEventId,
    choice: FocusedEventChoiceSelection,
    outcome: ActionOutcome,
  ): boolean {
    if (eventId !== 'drifting-supplies' || outcome.rewardSummary !== undefined) return false;
    return choice.id === 'retrieve' || choice.id === 'delegate-carlitos';
  }

  private reportMissingDriftingReward(context: FocusedChoiceContext): void {
    this.dependencies.onInvariantError(new Error(
      `Drifting item ${context.eventId}/${context.choice.id} requires a reward summary.`,
    ));
    this.dependencies.ui.showFeedback?.({
      accepted: false,
      message: 'The recovered salvage could not be identified.',
    });
  }

  private async playFocusedChoiceAnimation(context: FocusedChoiceContext): Promise<void> {
    if (!this.isCurrent(context.generation, context.operation)) return;
    if (context.wreckage) {
      await this.playWreckageChoiceAnimation(context);
      return;
    }
    if (context.skipDriftingAnimation) return;
    if (isDriftingItemEventId(context.eventId)) {
      await this.playDriftingChoiceAnimation(context.eventId, context);
      return;
    }
    await this.playStandardFocusedChoiceAnimation(context);
  }

  private async playWreckageChoiceAnimation(context: FocusedChoiceContext): Promise<void> {
    const { choice, eventId, pending, generation, operation } = context;
    if (choice.id === 'search') return;
    if (choice.id === 'delegate-carlitos' || choice.id === 'leave') {
      await (this.dependencies.world.playEventChoice?.(eventId, choice.id) ?? Promise.resolve());
      return;
    }
    if (choice.id !== 'dive' || choice.instanceId === null) return;
    await this.playEventItemUseWithSound(
      eventId,
      choice.id,
      choice.instanceId,
      pending.inventory[choice.instanceId]?.type,
      generation,
      operation,
    );
    if (this.isCurrent(generation, operation)) this.dependencies.audio.finishDive();
  }

  private async playDriftingChoiceAnimation(
    eventId: DriftingItemEventId,
    context: FocusedChoiceContext,
  ): Promise<void> {
    const { choice } = context;
    if (choice.id === 'retrieve') {
      await (this.dependencies.world.retrieveDriftingItem?.(eventId) ?? Promise.resolve());
      return;
    }
    if (choice.id === 'delegate-carlitos') {
      await (this.dependencies.world.delegateDriftingItem?.(eventId) ?? Promise.resolve());
      return;
    }
    await (this.dependencies.world.recedeDriftingItem?.(eventId) ?? Promise.resolve());
  }

  private async playStandardFocusedChoiceAnimation(
    context: FocusedChoiceContext,
  ): Promise<void> {
    const { choice, eventId, pending, outcome, generation, operation } = context;
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
    const playedChoice = this.focusedChoicePresentation(choice, pending);
    await (this.dependencies.world.playEventChoice?.(eventId, playedChoice) ?? Promise.resolve());
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
    if (this.isCurrent(generation, operation)) this.dependencies.audio.finishEventReaction(eventId);
  }

  private focusedChoicePresentation(
    choice: FocusedEventChoiceSelection,
    pending: SurvivalSnapshot,
  ): EventChoicePresentation {
    const condition = choice.instanceId === null
      ? null
      : pending.inventory[choice.instanceId]?.condition ?? null;
    return { choiceId: choice.id, instanceId: choice.instanceId, condition };
  }

  private async afterFocusedChoiceAnimation(context: FocusedChoiceContext): Promise<void> {
    if (!this.isCurrent(context.generation, context.operation)) return;
    if (!this.shouldShowDriftingReward(context)) return;
    this.dependencies.audio.action('openChest');
    await (this.dependencies.ui.showRewardResult?.({
      title: 'SALVAGE',
      reward: context.outcome.rewardSummary!,
      lines: [],
    }) ?? Promise.resolve());
  }

  private shouldShowDriftingReward(context: FocusedChoiceContext): boolean {
    if (context.eventId !== 'drifting-supplies') return false;
    if (context.outcome.rewardSummary === undefined) return false;
    return context.choice.id === 'retrieve' || context.choice.id === 'delegate-carlitos';
  }

  private async coverFocusedChoiceReturn(
    context: FocusedChoiceContext,
    state: FocusedChoiceResolutionState,
  ): Promise<void> {
    if (!context.wreckage || !this.isCurrent(context.generation, context.operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    state.returnCovered = true;
  }

  private async finishFocusedChoiceReturn(
    context: FocusedChoiceContext,
    state: FocusedChoiceResolutionState,
  ): Promise<void> {
    if (!context.wreckage || !this.isCurrent(context.generation, context.operation)) return;
    if (!await this.ensureFocusedChoiceReturnCovered(context, state)) return;
    if (!await this.dependencies.renderAndSettleCoveredScene(context.generation)) return;
    if (!this.isCurrent(context.generation, context.operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.canShowWreckageReward(context, state)) return;
    await (this.dependencies.ui.showRewardResult?.({
      title: 'WRECKAGE',
      reward: context.outcome.rewardSummary ?? null,
      lines: this.wreckageRewardLines(context),
    }) ?? Promise.resolve());
  }

  private async ensureFocusedChoiceReturnCovered(
    context: FocusedChoiceContext,
    state: FocusedChoiceResolutionState,
  ): Promise<boolean> {
    if (state.returnCovered) return true;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isCurrent(context.generation, context.operation)) return false;
    state.returnCovered = true;
    return true;
  }

  private canShowWreckageReward(
    context: FocusedChoiceContext,
    state: FocusedChoiceResolutionState,
  ): boolean {
    if (!this.isCurrent(context.generation, context.operation)) return false;
    return context.choice.id !== 'leave' && state.terminalSnapshot === null;
  }

  private wreckageRewardLines(context: FocusedChoiceContext): string[] {
    if (context.scubaBroke) return [context.outcome.message, 'Your scuba gear broke.'];
    if (context.outcome.rewardSummary === undefined) return [context.outcome.message];
    return [];
  }

  private clearFocusedChoiceEvent(
    context: FocusedChoiceContext,
    reportCleanupErrors: boolean,
  ): void {
    if (!this.isCurrent(context.generation, context.operation)) return;
    this.clearPresentation(false, reportCleanupErrors);
  }

  private renderFocusedChoiceSnapshot(
    context: FocusedChoiceContext,
    state: FocusedChoiceResolutionState,
  ): boolean {
    if (!this.isCurrent(context.generation, context.operation)) return false;
    const snapshot = this.dependencies.renderSnapshot();
    if (!this.isCurrent(context.generation, context.operation)) return false;
    if (isTerminal(snapshot.state)) state.terminalSnapshot = snapshot;
    return state.terminalSnapshot !== null;
  }

  private presentFocusedChoiceTerminal(
    context: FocusedChoiceContext,
    state: FocusedChoiceResolutionState,
  ): void {
    if (state.terminalSnapshot === null) return;
    if (!this.isCurrent(context.generation, context.operation)) return;
    this.dependencies.presentTerminal(state.terminalSnapshot);
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
    if (!await this.prepareItemChoice(
      eventId,
      choiceId,
      instanceId,
      itemType,
      generation,
      operation,
    )) return;
    const choice: EventChoicePresentation = {
      choiceId,
      instanceId,
      condition: pending.inventory[instanceId]?.condition ?? null,
    };
    if (!await this.playChoiceAndResume(eventId, choice, generation, operation)) return;
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
      this.rejectItemChoice(outcome, generation);
      return;
    }
    await this.completeItemChoice(
      eventId,
      choiceId,
      instanceId,
      pending,
      outcome,
      generation,
      operation,
    );
  }

  private async prepareItemChoice(
    eventId: string,
    choiceId: EventResponseId,
    instanceId: ItemInstanceId,
    itemType: ItemId | undefined,
    generation: number,
    operation: number,
  ): Promise<boolean> {
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
    if (!this.isCurrent(generation, operation)) return false;
    return this.resumeAfterVisibility(generation, operation);
  }

  private async playChoiceAndResume(
    eventId: string,
    choice: EventChoicePresentation,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    await (this.dependencies.world.playEventChoice?.(eventId, choice) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return false;
    return this.resumeAfterVisibility(generation, operation);
  }

  private async resumeAfterVisibility(generation: number, operation: number): Promise<boolean> {
    if (!this.dependencies.isVisibilityBlocked()) return true;
    if (!await this.dependencies.waitForVisibilityResume(generation)) return false;
    return this.isCurrent(generation, operation);
  }

  private rejectItemChoice(outcome: ActionOutcome, generation: number): void {
    this.cancelDeferredPresentationSync(generation);
    this.dependencies.audio.deny();
    this.dependencies.ui.showFeedback?.(outcome);
    this.presentation = 'choosing';
    this.dependencies.world.setEventSelectedItem?.(null);
    this.dependencies.world.setEventEligibleItems?.(new Set(this.eligibility.keys()));
    this.restoreEventSelection();
    this.setBusy(false);
  }

  private async completeItemChoice(
    eventId: string,
    choiceId: EventResponseId,
    instanceId: ItemInstanceId,
    pending: SurvivalSnapshot,
    outcome: ActionOutcome,
    generation: number,
    operation: number,
  ): Promise<void> {
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    if (await this.recoverFocusedResultIfInvalid(
      eventId,
      choiceId,
      outcome,
      pending.state,
      focusedResult,
      generation,
      operation,
    )) return;
    const resolved = this.dependencies.session.snapshot();
    this.finishDeferredChoiceSync(focusedResult, resolved, generation);
    const condition = resolved.inventory[instanceId]?.condition ?? 'lost';
    const resolvedChoice: EventChoicePresentation = { choiceId, instanceId, condition };
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
      pending.state,
      generation,
      operation,
      resolvedChoice,
      response,
      presentation,
      focusedResult,
    );
  }

  private async recoverFocusedResultIfInvalid(
    eventId: string,
    choiceId: string,
    outcome: ActionOutcome,
    eventState: SurvivalState,
    focusedResult: boolean,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    if (!focusedResult) return false;
    const invariantError = this.focusedEventResultError(eventId, choiceId, outcome);
    if (invariantError === null) return false;
    await this.recoverInvalidFocusedEventResult(
      invariantError,
      eventState,
      generation,
      operation,
    );
    return true;
  }

  private finishDeferredChoiceSync(
    focusedResult: boolean,
    resolved: SurvivalSnapshot,
    generation: number,
  ): void {
    if (!focusedResult) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (isTerminal(resolved.state)) this.flushDeferredPresentationSync(resolved, generation);
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
    if (await this.resolveSpecialContextualChoice(eventId, choiceId, generation, operation)) return;
    this.beginContextualChoice(eventId, choiceId);
    const choice: EventChoicePresentation = {
      choiceId,
      instanceId: null,
      condition: null,
    };
    if (!await this.playContextualChoice(eventId, choice, generation, operation)) return;
    this.presentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.dependencies.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isCurrent(generation, operation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.rejectContextualChoice(eventId, outcome, generation);
      return;
    }
    await this.completeContextualChoice(
      eventId,
      choiceId,
      pending,
      outcome,
      choice,
      generation,
      operation,
    );
  }

  private async resolveSpecialContextualChoice(
    eventId: string,
    choiceId: EventResponseId,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    if (eventId === 'midnight-tour' && choiceId === 'visit') {
      await this.resolveMidnightTourVisit(generation, operation);
      return true;
    }
    if (eventId === 'chest-attack' && choiceId === 'attack') {
      await this.resolveChestAttack(generation, operation);
      return true;
    }
    return false;
  }

  private beginContextualChoice(eventId: string, choiceId: EventResponseId): void {
    this.dependencies.ui.setEventSleepMask?.(eventId, choiceId === 'sleep');
    if (choiceId === 'sleep') this.dependencies.audio.sleep();
    else this.dependencies.audio.confirm();
    this.presentation = 'using';
    this.setBusy(true);
  }

  private async playContextualChoice(
    eventId: string,
    choice: EventChoicePresentation,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    const worldChoice = isEventPresentationRoute(eventId, 'focused')
      ? choice
      : choice.choiceId;
    await Promise.all([
      this.dependencies.ui.playEventChoiceBeat?.(choice.choiceId) ?? Promise.resolve(),
      this.dependencies.world.playEventChoice?.(eventId, worldChoice) ?? Promise.resolve(),
    ]);
    if (!this.isCurrent(generation, operation)) return false;
    return this.resumeAfterVisibility(generation, operation);
  }

  private rejectContextualChoice(
    eventId: string,
    outcome: ActionOutcome,
    generation: number,
  ): void {
    this.cancelDeferredPresentationSync(generation);
    this.dependencies.audio.deny();
    this.dependencies.ui.setEventSleepMask?.(eventId, false);
    this.dependencies.ui.showFeedback?.(outcome);
    this.presentation = 'choosing';
    this.restoreEventSelection();
    this.setBusy(false);
  }

  private async completeContextualChoice(
    eventId: string,
    choiceId: EventResponseId,
    pending: SurvivalSnapshot,
    outcome: ActionOutcome,
    choice: EventChoicePresentation,
    generation: number,
    operation: number,
  ): Promise<void> {
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    if (await this.recoverFocusedResultIfInvalid(
      eventId,
      choiceId,
      outcome,
      pending.state,
      focusedResult,
      generation,
      operation,
    )) return;
    const resolved = this.dependencies.session.snapshot();
    this.finishDeferredChoiceSync(focusedResult, resolved, generation);
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
    const state: MidnightTourResolutionState = { recoveryStarted: false };
    const pending = this.dependencies.session.snapshot();
    if (
      pending.pendingEventId !== 'midnight-tour'
      || !this.isCurrent(generation, operation)
    ) return;
    const choice: EventChoicePresentation = {
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    };
    this.dependencies.audio.confirm();
    this.presentation = 'using';
    this.setBusy(true);
    try {
      await this.runMidnightTourVisit(pending, choice, state, generation, operation);
    } catch (error) {
      await this.recoverMidnightTourError(error, state, generation, operation);
    }
  }

  private async runMidnightTourVisit(
    pending: SurvivalSnapshot,
    choice: EventChoicePresentation,
    state: MidnightTourResolutionState,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (!await this.prepareMidnightTourVisit(choice, generation, operation)) return;
    this.presentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.resolveMidnightTourOutcome();
    if (!this.isCurrent(generation, operation)) return;
    await this.processMidnightTourOutcome(
      pending,
      outcome,
      choice,
      state,
      generation,
      operation,
    );
  }

  private async prepareMidnightTourVisit(
    choice: EventChoicePresentation,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    await (this.dependencies.ui.setSleepCoverProfile?.('midnight-tour') ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return false;
    await Promise.all([
      this.dependencies.ui.playEventChoiceBeat?.('visit') ?? Promise.resolve(),
      this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve(),
    ]);
    if (!this.isCurrent(generation, operation)) return false;
    await (this.dependencies.world.playEventChoice?.('midnight-tour', choice)
      ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return false;
    return this.resumeAfterVisibility(generation, operation);
  }

  private resolveMidnightTourOutcome(): ActionOutcome {
    const resultId = this.initialEventResultId;
    this.initialEventResultId = undefined;
    const outcome = this.dependencies.session.resolveEvent?.({
      kind: 'choice',
      choiceId: 'visit',
      ...(resultId === undefined ? {} : { resultId }),
    });
    if (outcome === undefined) {
      throw new Error('Midnight Tour visit did not return an outcome.');
    }
    return outcome;
  }

  private async processMidnightTourOutcome(
    pending: SurvivalSnapshot,
    outcome: ActionOutcome,
    choice: EventChoicePresentation,
    state: MidnightTourResolutionState,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (!outcome.accepted) {
      await this.startMidnightTourRecovery(
        state,
        generation,
        operation,
        { rejection: outcome },
      );
      return;
    }
    const invariantError = this.focusedEventResultError('midnight-tour', 'visit', outcome);
    if (invariantError !== null) {
      await this.startMidnightTourRecovery(
        state,
        generation,
        operation,
        { invariantError },
      );
      return;
    }
    const resolved = this.dependencies.session.snapshot();
    const presentation = deriveEventOutcomePresentation(pending, resolved, outcome, null);
    await this.completeMidnightTourVisit(
      'midnight-tour',
      outcome,
      generation,
      operation,
      choice,
      presentation,
    );
  }

  private async startMidnightTourRecovery(
    state: MidnightTourResolutionState,
    generation: number,
    operation: number,
    reason: MidnightTourRecoveryReason,
  ): Promise<void> {
    state.recoveryStarted = true;
    await this.recoverMidnightTourVisit(generation, operation, reason);
  }

  private async recoverMidnightTourError(
    error: unknown,
    state: MidnightTourResolutionState,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (state.recoveryStarted || !this.isCurrent(generation, operation)) return;
    await this.startMidnightTourRecovery(
      state,
      generation,
      operation,
      { fatalError: error },
    );
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
    this.beginChestAttack();
    if (!await this.playChestAttackChoice(choice, generation, operation)) return;
    this.presentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.dependencies.session.resolveEvent?.({ kind: 'choice', choiceId: 'attack' });
    if (outcome === undefined || !this.isCurrent(generation, operation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.rejectChestAttack(outcome, generation);
      return;
    }
    if (await this.recoverFocusedResultIfInvalid(
      'chest-attack',
      'attack',
      outcome,
      pending.state,
      true,
      generation,
      operation,
    )) return;
    await this.completeChestAttack(generation, operation);
  }

  private beginChestAttack(): void {
    this.presentation = 'using';
    this.setBusy(true);
    this.eligibility.clear();
    this.dependencies.world.setEventEligibleItems?.(new Set());
    this.dependencies.ui.setEventSelection?.(this.eligibility, []);
  }

  private async playChestAttackChoice(
    choice: EventChoicePresentation,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    await (this.dependencies.world.playEventChoice?.('chest-attack', choice)
      ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return false;
    return this.resumeAfterVisibility(generation, operation);
  }

  private rejectChestAttack(outcome: ActionOutcome, generation: number): void {
    this.cancelDeferredPresentationSync(generation);
    this.dependencies.audio.deny();
    this.dependencies.ui.showFeedback?.(outcome);
    this.presentation = 'choosing';
    this.setBusy(false);
  }

  private async completeChestAttack(generation: number, operation: number): Promise<void> {
    if (!await this.prepareChestAttackReturn(generation, operation)) return;
    const snapshot = await this.chestAttackReturnSnapshot(generation, operation);
    if (!this.isCurrent(generation, operation)) return;
    if (!await this.dependencies.renderAndSettleCoveredScene(generation)) return;
    this.flushDeferredPresentationSync(snapshot, generation);
    await this.finishChestAttackReturn(snapshot, generation, operation);
  }

  private async prepareChestAttackReturn(
    generation: number,
    operation: number,
  ): Promise<boolean> {
    this.dependencies.ui.hideEventReveal?.();
    await (this.dependencies.ui.setSleepCoverProfile?.('midnight-attack') ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return false;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return false;
    this.clearPresentation(true);
    await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    return this.isCurrent(generation, operation);
  }

  private async chestAttackReturnSnapshot(
    generation: number,
    operation: number,
  ): Promise<SurvivalSnapshot> {
    const resolved = this.dependencies.session.snapshot();
    return isTerminal(resolved.state)
      ? this.dependencies.renderSnapshot()
      : await this.runDawn(generation, operation);
  }

  private async finishChestAttackReturn(
    snapshot: SurvivalSnapshot,
    generation: number,
    operation: number,
  ): Promise<void> {
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
    if (!await this.playMidnightTourReaction(
      eventId,
      outcome,
      choice,
      presentation,
      generation,
      operation,
    )) return;
    if (!await this.prepareMidnightTourReturn(outcome, generation, operation)) return;
    const snapshot = await this.chestAttackReturnSnapshot(generation, operation);
    if (!this.isCurrent(generation, operation)) return;
    if (!await this.dependencies.renderAndSettleCoveredScene(generation)) return;
    if (!this.isCurrent(generation, operation)) return;
    this.flushDeferredPresentationSync(snapshot, generation);
    await this.finishChestAttackReturn(snapshot, generation, operation);
  }

  private async playMidnightTourReaction(
    eventId: 'midnight-tour',
    outcome: ActionOutcome,
    choice: EventChoicePresentation,
    presentation: EventOutcomePresentation,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    this.setBusy(true);
    this.dependencies.ui.hideEventReveal?.();
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return false;
    if (!await this.resumeAfterVisibility(generation, operation)) return false;
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
    if (!this.isCurrent(generation, operation)) return false;
    this.dependencies.audio.finishEventReaction(eventId);
    return this.resumeAfterVisibility(generation, operation);
  }

  private async prepareMidnightTourReturn(
    outcome: ActionOutcome,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    if (outcome.eventResult?.resultId === 'tour-attack') {
      await (this.dependencies.ui.setSleepCoverProfile?.('midnight-attack') ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return false;
    }
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return false;
    this.dependencies.audio.clearMidnightTour();
    this.clearPresentation(true);
    await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    return this.isCurrent(generation, operation);
  }

  private async recoverMidnightTourVisit(
    generation: number,
    operation: number,
    reason: MidnightTourRecoveryReason,
  ): Promise<void> {
    this.cancelDeferredPresentationSync(generation);
    if (!await this.prepareMidnightTourRecovery(generation, operation)) return;
    this.reportMidnightTourRecovery(reason, generation, operation);
    if (!this.isCurrent(generation, operation)) return;
    this.tryCleanup(() => this.dependencies.ui.restoreCommandFocus?.(), false);
  }

  private async prepareMidnightTourRecovery(
    generation: number,
    operation: number,
  ): Promise<boolean> {
    if (!this.isCurrent(generation, operation)) return false;
    await this.trySetSleepCovered(true);
    if (!this.isCurrent(generation, operation)) return false;
    this.clearPresentation(false, false);
    if (!this.isCurrent(generation, operation)) return false;
    await this.trySetSolidSleepCoverProfile();
    if (!this.isCurrent(generation, operation)) return false;
    this.tryCleanup(() => { this.dependencies.renderSnapshot(); }, false);
    if (!this.isCurrent(generation, operation)) return false;
    await this.tryRenderAndSettleCoveredScene(generation);
    if (!this.isCurrent(generation, operation)) return false;
    await this.trySetSleepCovered(false);
    return this.isCurrent(generation, operation);
  }

  private reportMidnightTourRecovery(
    reason: MidnightTourRecoveryReason,
    generation: number,
    operation: number,
  ): void {
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
  }

  private async trySetSleepCovered(covered: boolean): Promise<void> {
    try {
      await (this.dependencies.ui.setSleepCovered?.(covered) ?? Promise.resolve());
    } catch {
      // Keep the primary error.
    }
  }

  private async trySetSolidSleepCoverProfile(): Promise<void> {
    try {
      await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    } catch {
      // Keep the primary error.
    }
  }

  private async tryRenderAndSettleCoveredScene(generation: number): Promise<void> {
    try {
      await this.dependencies.renderAndSettleCoveredScene(generation);
    } catch {
      // Keep the primary error.
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
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    this.dependencies.audio.confirm();
    const choice: EventChoicePresentation = {
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    };
    if (!await this.playEndureChoice(eventId, choice, generation, operation)) return;
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.dependencies.session.resolveEvent?.({ kind: 'endure' });
    if (outcome === undefined || !this.isCurrent(generation, operation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.rejectEndure(outcome, generation);
      return;
    }
    await this.completeEndure(
      eventId,
      pending,
      outcome,
      choice,
      generation,
      operation,
    );
  }

  private async playEndureChoice(
    eventId: string,
    choice: EventChoicePresentation,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    if (eventId !== 'other-people' && eventId !== 'plane') return true;
    await (this.dependencies.world.playEventChoice?.(eventId, choice) ?? Promise.resolve());
    return this.isCurrent(generation, operation);
  }

  private rejectEndure(outcome: ActionOutcome, generation: number): void {
    this.cancelDeferredPresentationSync(generation);
    this.dependencies.audio.deny();
    this.dependencies.ui.showFeedback?.(outcome);
    this.presentation = 'choosing';
    this.setBusy(false);
  }

  private async completeEndure(
    eventId: string,
    pending: SurvivalSnapshot,
    outcome: ActionOutcome,
    choice: EventChoicePresentation,
    generation: number,
    operation: number,
  ): Promise<void> {
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    if (await this.recoverFocusedResultIfInvalid(
      eventId,
      choice.choiceId,
      outcome,
      pending.state,
      focusedResult,
      generation,
      operation,
    )) return;
    const resolved = this.dependencies.session.snapshot();
    this.finishDeferredChoiceSync(focusedResult, resolved, generation);
    const presentation = deriveEventOutcomePresentation(pending, resolved, outcome, null);
    await this.runEventResolution(
      eventId,
      outcome,
      pending.state,
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
    const context: EventResolutionContext = {
      eventId,
      outcome,
      eventState,
      generation,
      operation,
      choice,
      physicalResponse,
      presentation,
      focusedResult,
      revealFromCover,
    };
    this.beginEventResolution(context);
    await this.playEventResolutionReaction(context);
    if (!this.isCurrent(generation, operation)) return;
    this.dependencies.audio.finishEventReaction(eventId);
    if (!await this.resumeAfterVisibility(generation, operation)) return;
    const terminal = this.dependencies.session.snapshot();
    if (focusedResult && !isTerminal(terminal.state)) {
      this.flushDeferredPresentationSync(terminal, generation);
    }
    if (isTerminal(terminal.state)) {
      await this.completeTerminalEventResolution(context);
      return;
    }
    await this.completeContinuingEventResolution(context, terminal);
  }

  private beginEventResolution(context: EventResolutionContext): void {
    this.setBusy(true);
    this.dependencies.ui.hideEventReveal?.();
    this.dependencies.audio.beginEventReaction(context.eventId, context.outcome);
    this.playEventResolutionDamageCue(context);
  }

  private playEventResolutionDamageCue(context: EventResolutionContext): void {
    if (!isEventPresentationRoute(context.eventId, 'dedicated')) return;
    const hullDamage = (context.presentation.resourceDeltas.hull ?? 0) < 0;
    const healthDamage = (context.presentation.resourceDeltas.health ?? 0) < 0;
    if (!hullDamage && !healthDamage) return;
    this.dependencies.audio.eventAction(context.eventId, 'damage');
  }

  private async playEventResolutionReaction(context: EventResolutionContext): Promise<void> {
    const response = this.eventResolutionResponse(context);
    if (context.revealFromCover) {
      const reaction = this.eventOutcomeReaction(context, response);
      await Promise.all([
        this.eventResolutionCue(context),
        reaction,
        this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve(),
      ]);
      return;
    }
    await Promise.all([
      this.eventResolutionCue(context),
      this.eventOutcomeReaction(context, response),
    ]);
  }

  private eventOutcomeReaction(
    context: EventResolutionContext,
    response: EventPhysicalResponsePresentation | EventChoicePresentation,
  ): Promise<void> {
    return this.dependencies.world.reactToEventOutcome?.(
      context.eventId,
      context.outcome,
      response,
      context.presentation,
    ) ?? Promise.resolve();
  }

  private eventResolutionResponse(
    context: EventResolutionContext,
  ): EventPhysicalResponsePresentation | EventChoicePresentation {
    if (isEventPresentationRoute(context.eventId, 'dedicated')) {
      return context.physicalResponse;
    }
    return context.focusedResult ? context.choice : context.physicalResponse;
  }

  private eventResolutionCue(context: EventResolutionContext): Promise<void> {
    const stationaryHandymanTouch = context.eventId === 'handyman'
      && context.choice.choiceId === 'touch';
    if (stationaryHandymanTouch) return Promise.resolve();
    return this.dependencies.world.play?.(context.outcome.cue) ?? Promise.resolve();
  }

  private async completeTerminalEventResolution(
    context: EventResolutionContext,
  ): Promise<void> {
    if (!await this.holdDedicatedEventOutcome(context)) return;
    if (!await this.coverTerminalEventResolution(context)) return;
    const snapshot = this.dependencies.renderSnapshot();
    if (snapshot.state === 'rescued') this.retainTerminalEventTableau();
    else this.clearPresentation();
    if (!await this.resetResolutionCoverProfile(context)) return;
    this.presentation = 'idle';
    this.presentEventResolutionTerminal(context, snapshot);
  }

  private async holdDedicatedEventOutcome(context: EventResolutionContext): Promise<boolean> {
    if (!isEventPresentationRoute(context.eventId, 'dedicated')) return true;
    await (this.dependencies.ui.holdEventOutcome?.() ?? Promise.resolve());
    return this.isCurrent(context.generation, context.operation);
  }

  private async coverTerminalEventResolution(
    context: EventResolutionContext,
  ): Promise<boolean> {
    if (!context.revealFromCover) return true;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    return this.isCurrent(context.generation, context.operation);
  }

  private async resetResolutionCoverProfile(
    context: EventResolutionContext,
  ): Promise<boolean> {
    if (!context.revealFromCover) return true;
    await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    return this.isCurrent(context.generation, context.operation);
  }

  private presentEventResolutionTerminal(
    context: EventResolutionContext,
    snapshot: SurvivalSnapshot,
  ): void {
    if (context.revealFromCover) {
      this.dependencies.presentTerminal(snapshot, true);
      this.setBusy(false);
      return;
    }
    this.setBusy(false);
    this.dependencies.presentTerminal(snapshot);
  }

  private async completeContinuingEventResolution(
    context: EventResolutionContext,
    terminal: SurvivalSnapshot,
  ): Promise<void> {
    await (this.dependencies.ui.holdEventOutcome?.() ?? Promise.resolve());
    if (!this.isCurrent(context.generation, context.operation)) return;
    if (!this.prepareFollowingNightEvent(context.eventState, terminal)) return;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isCurrent(context.generation, context.operation)) return;
    this.clearPresentation();
    if (!await this.resetResolutionCoverProfile(context)) return;
    if (await this.revealFollowingNightEvent(context, terminal)) return;
    await this.finishContinuingEventResolution(context);
  }

  private prepareFollowingNightEvent(
    eventState: SurvivalState,
    terminal: SurvivalSnapshot,
  ): boolean {
    if (eventState !== 'nightEvent') return true;
    if (terminal.state !== 'nightEvent') return true;
    if (terminal.pendingEventId === null) return true;
    return this.beginEventBundleLoad(terminal.pendingEventId);
  }

  private async revealFollowingNightEvent(
    context: EventResolutionContext,
    terminal: SurvivalSnapshot,
  ): Promise<boolean> {
    if (context.eventState !== 'nightEvent') return false;
    if (terminal.state !== 'nightEvent') return false;
    if (terminal.pendingEventId === null) return false;
    this.preparedEventId = terminal.pendingEventId as SurvivalEventId;
    await this.runPendingEventReveal(
      terminal,
      context.generation,
      context.operation,
      true,
    );
    return true;
  }

  private async finishContinuingEventResolution(context: EventResolutionContext): Promise<void> {
    const snapshot = context.eventState === 'nightEvent'
      ? await this.runDawn(context.generation, context.operation)
      : this.dependencies.renderSnapshot();
    if (!this.isCurrent(context.generation, context.operation)) return;
    if (await this.revealResolutionDawnEvent(context, snapshot)) return;
    if (!this.isCurrent(context.generation, context.operation)) return;
    if (!await this.dependencies.renderAndSettleCoveredScene(context.generation)) return;
    if (!this.isCurrent(context.generation, context.operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(context.generation, context.operation)) return;
    this.presentation = 'idle';
    this.setBusy(false);
    this.dependencies.presentTerminal(snapshot);
    this.dependencies.ui.restoreCommandFocus?.();
  }

  private async revealResolutionDawnEvent(
    context: EventResolutionContext,
    snapshot: SurvivalSnapshot,
  ): Promise<boolean> {
    if (context.eventState !== 'nightEvent') return false;
    return this.revealDawnEvent(snapshot, context.generation, context.operation);
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
      if ((dawn.deltas.hull ?? 0) < 0) {
        this.dependencies.ui.showFeedback?.(dawn);
      }
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
    const event = pendingEventDefinition(snapshot);
    if (event === undefined) return;
    if (!await this.preparePendingEventReveal(
      event,
      generation,
      operation,
      alreadyCovered,
    )) return;
    if (!await this.activatePendingEvent(event, generation, operation)) return;
    this.beginPendingEventAudio(event);
    const current = this.currentPendingEventSnapshot(event.id);
    if (current === null) return;
    this.stagePendingEvent(event, current);
    if (!await this.showEarlyEventReveal(event, generation, operation)) return;
    if (!await this.uncoverPendingEvent(generation, operation)) return;
    this.beginBadSleepReveal(event);
    if (!this.prepareChestAttackWarning(event)) return;
    await this.revealWorldEvent(event, generation, operation);
    if (!this.isCurrent(generation, operation)) return;
    if (!await this.showLateEventReveal(event, generation, operation)) return;
    if (!await this.resumeAfterVisibility(generation, operation)) return;
    await this.finishPendingEventReveal(event, generation, operation);
  }

  private async preparePendingEventReveal(
    event: SurvivalEventDefinition,
    generation: number,
    operation: number,
    alreadyCovered: boolean,
  ): Promise<boolean> {
    this.choiceCheckpointReady = false;
    if (this.preparedEventId !== event.id && !this.beginEventBundleLoad(event.id)) return false;
    this.preparedEventId = null;
    this.presentation = 'transitioning';
    this.eligibility.clear();
    this.setBusy(true);
    if (!alreadyCovered) this.dependencies.ui.beginEventPresentation?.();
    this.dependencies.world.setEventSelectedItem?.(null);
    this.dependencies.world.setEventEligibleItems?.(new Set());
    if (alreadyCovered) return true;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    return this.isCurrent(generation, operation);
  }

  private async activatePendingEvent(
    event: SurvivalEventDefinition,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    const eventId = event.id as SurvivalEventId;
    const activation = this.dependencies.bundles.activate(eventId);
    if (activation !== undefined) await activation;
    return this.isCurrent(generation, operation);
  }

  private currentPendingEventSnapshot(eventId: string): SurvivalSnapshot | null {
    const current = this.dependencies.session.snapshot();
    if (current.pendingEventId !== eventId) return null;
    if (isTerminal(current.state)) return null;
    return current;
  }

  private beginPendingEventAudio(event: SurvivalEventDefinition): void {
    if (event.id !== 'leak') this.dependencies.audio.beginEvent(event.id);
    if (event.id !== 'bad-sleep') this.dependencies.audio.eventReveal(event.id);
  }

  private stagePendingEvent(
    event: SurvivalEventDefinition,
    current: SurvivalSnapshot,
  ): void {
    this.dependencies.setAutomaticWeather(event.id as SurvivalEventId);
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
  }

  private async showEarlyEventReveal(
    event: SurvivalEventDefinition,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    const showEarly = isEventPresentationRoute(event.id, 'dedicated')
      || event.id === 'chest-attack';
    if (!showEarly) return true;
    await (this.dependencies.ui.showEventReveal?.(event) ?? Promise.resolve());
    return this.isCurrent(generation, operation);
  }

  private async uncoverPendingEvent(generation: number, operation: number): Promise<boolean> {
    if (!await this.dependencies.renderAndSettleCoveredScene(generation)) return false;
    if (!this.isCurrent(generation, operation)) return false;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    return this.isCurrent(generation, operation);
  }

  private beginBadSleepReveal(event: SurvivalEventDefinition): void {
    if (event.id === 'bad-sleep') {
      this.dependencies.audio.eventReveal(event.id);
      this.dependencies.ui.setBadSleepCue?.(true);
    }
  }

  private prepareChestAttackWarning(event: SurvivalEventDefinition): boolean {
    if (event.id !== 'chest-attack') return true;
    const warned = this.currentPendingEventSnapshot(event.id);
    if (warned === null) return false;
    this.eligibility = this.eventEligibilityFor(event, warned);
    this.dependencies.world.setEventEligibleItems?.(new Set(this.eligibility.keys()));
    this.sync(warned);
    this.dependencies.ui.setEventSelection?.(this.eligibility, []);
    this.presentation = 'choosing';
    this.setBusy(false);
    return true;
  }

  private async revealWorldEvent(
    event: SurvivalEventDefinition,
    generation: number,
    operation: number,
  ): Promise<void> {
    try {
      await (this.dependencies.world.revealEvent?.(event.id) ?? Promise.resolve());
    } finally {
      if (event.id === 'bad-sleep' && this.isCurrent(generation, operation)) {
        this.dependencies.ui.setBadSleepCue?.(false);
      }
    }
  }

  private async showLateEventReveal(
    event: SurvivalEventDefinition,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    if (event.id === 'leak') this.dependencies.audio.beginEvent(event.id);
    const showLate = !isEventPresentationRoute(event.id, 'dedicated')
      && event.id !== 'chest-attack';
    if (!showLate) return true;
    await (this.dependencies.ui.showEventReveal?.(event) ?? Promise.resolve());
    return this.isCurrent(generation, operation);
  }

  private async finishPendingEventReveal(
    event: SurvivalEventDefinition,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (event.id === 'chest-attack') {
      await this.finishChestAttackReveal(generation, operation);
      return;
    }
    this.finishStandardEventReveal(event);
  }

  private async finishChestAttackReveal(generation: number, operation: number): Promise<void> {
    this.choiceCheckpointReady = this.presentation === 'choosing';
    if (this.choiceCheckpointReady) this.setBusy(false);
    if (this.presentation === 'choosing') await this.resolveChestAttack(generation, operation);
  }

  private finishStandardEventReveal(event: SurvivalEventDefinition): void {
    const revealed = this.currentPendingEventSnapshot(event.id);
    if (revealed === null) return;
    this.eligibility = this.eventEligibilityFor(event, revealed);
    const visibleEligibility = isInspectableEventId(event.id)
      ? new Map<ItemInstanceId, EventResponseId>()
      : this.eligibility;
    this.dependencies.world.setEventEligibleItems?.(new Set(visibleEligibility.keys()));
    this.sync(revealed);
    this.dependencies.ui.setEventSelection?.(
      visibleEligibility,
      isInspectableEventId(event.id) ? [] : this.contextualChoicesFor(event, revealed),
    );
    this.presentation = 'choosing';
    this.choiceCheckpointReady = true;
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
      return this.playEventItemUse(eventId, choiceId, instanceId);
    }
    if (usesEventItemCues(itemType)) {
      return this.playCuedEventItemUse(
        eventId,
        choiceId,
        instanceId,
        itemType,
        generation,
        operation,
      );
    }
    if (itemType === 'umbrella') this.dependencies.audio.eventItem(itemType);
    return this.playEventItemUse(eventId, choiceId, instanceId);
  }

  private playEventItemUse(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
  ): Promise<void> {
    return this.dependencies.world.playEventItemUse?.(
      eventId,
      choiceId,
      instanceId,
    ) ?? Promise.resolve();
  }

  private playCuedEventItemUse(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
    itemType: ItemId,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (itemType === 'anchor') this.dependencies.audio.eventItem(itemType);
    return this.dependencies.world.playEventItemUse?.(
      eventId,
      choiceId,
      instanceId,
      (cueIndex) => this.playEventItemCue(
        eventId,
        itemType,
        cueIndex,
        generation,
        operation,
      ),
    ) ?? Promise.resolve();
  }

  private playEventItemCue(
    eventId: string,
    itemType: ItemId,
    cueIndex: number,
    generation: number,
    operation: number,
  ): void {
    if (!this.isCurrent(generation, operation)) return;
    if (itemType !== 'bucket') {
      this.dependencies.audio.eventItemCue(itemType, cueIndex);
      return;
    }
    if (eventId === 'shower-night') this.dependencies.audio.bucketHelmetRain();
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

  private contextualChoicesFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): EventContextChoice[] {
    return event.choices
      .filter((choice) => choice.itemId === undefined
        && !(event.id === 'chest-attack' && choice.id === 'attack'))
      .flatMap((choice) => {
        const view = this.contextualChoiceFor(event, choice, snapshot);
        return view === null ? [] : [view];
      });
  }

  private contextualChoiceFor(
    event: SurvivalEventDefinition,
    choice: SurvivalEventChoice,
    snapshot: SurvivalSnapshot,
  ): EventContextChoice | null {
    const companionAvailability = choice.companionAction === undefined
      ? undefined
      : this.dependencies.session.companionEventActionAvailability?.(
          choice.companionAction,
        );
    if (this.hideContextualChoice(choice, companionAvailability)) return null;
    const reasons = this.contextualChoiceUnavailableReasons(
      choice,
      snapshot,
      companionAvailability,
    );
    const anchorId = this.contextualEventAnchorId(event.id, choice.id);
    return {
      id: choice.id,
      label: choice.label,
      unavailableReason: reasons.length === 0 ? null : reasons.join(' '),
      ...(anchorId === null ? {} : { anchorId }),
      ...this.contextualChoiceEnergy(choice, companionAvailability),
    };
  }

  private hideContextualChoice(
    choice: SurvivalEventChoice,
    companionAvailability: SessionCompanionAvailability | undefined,
  ): boolean {
    if (choice.companionAction === undefined) return false;
    if (companionAvailability === undefined) return false;
    return companionAvailability.visible !== true;
  }

  private contextualChoiceUnavailableReasons(
    choice: SurvivalEventChoice,
    snapshot: SurvivalSnapshot,
    companionAvailability: SessionCompanionAvailability | undefined,
  ): string[] {
    const reasons = (choice.requirements ?? [])
      .filter(({ resource, minimum }) => snapshot[resource] < minimum)
      .map((requirement) => requirementUnavailableReason(requirement, snapshot));
    if (choice.requiredChestState !== undefined
      && choice.requiredChestState !== snapshot.chest.state) {
      reasons.push(
        `Requires a ${choice.requiredChestState} chest; you have ${snapshot.chest.state}.`,
      );
    }
    const companionReason = companionAvailability?.unavailableReason;
    if (companionReason !== null && companionReason !== undefined) reasons.push(companionReason);
    return reasons;
  }

  private contextualChoiceEnergy(
    choice: SurvivalEventChoice,
    companionAvailability: SessionCompanionAvailability | undefined,
  ): Partial<Pick<EventContextChoice, 'energyCost' | 'energyOwner'>> {
    if (choice.companionAction !== undefined && companionAvailability !== undefined) {
      return { energyCost: companionAvailability.energyCost, energyOwner: 'carlitos' };
    }
    const playerEnergyCost = choice.requirements?.find(
      ({ resource }) => resource === 'energy',
    )?.minimum;
    if (playerEnergyCost === undefined) return {};
    return { energyCost: playerEnergyCost, energyOwner: 'player' };
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
    return focusedChoiceAnchorId(eventId, choiceId);
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
    this.reportInvariantDuringRecovery(error);
    if (!this.isCurrent(generation, operation)) return;
    const resolved = this.snapshotDuringRecovery();
    if (resolved === null) {
      this.releaseBusyDuringRecovery(generation, operation);
      return;
    }
    if (isTerminal(resolved.state)) {
      this.recoverTerminalInvalidFocusedResult(generation, operation);
      return;
    }
    await this.recoverNonTerminalInvalidFocusedResult(eventState, generation, operation);
  }

  private reportInvariantDuringRecovery(error: Error): void {
    try {
      this.dependencies.onInvariantError(error);
    } catch {
      // Keep the invariant as the primary error and continue recovery.
    }
  }

  private snapshotDuringRecovery(): SurvivalSnapshot | null {
    try {
      return this.dependencies.session.snapshot();
    } catch {
      return null;
    }
  }

  private recoverTerminalInvalidFocusedResult(generation: number, operation: number): void {
    const snapshot = this.renderSnapshotDuringRecovery();
    if (!this.isCurrent(generation, operation)) return;
    this.releaseBusyDuringRecovery(generation, operation);
    if (snapshot === null) return;
    try {
      this.dependencies.presentTerminal(snapshot);
    } catch {
      // Keep the invariant as the primary error.
    }
  }

  private renderSnapshotDuringRecovery(): SurvivalSnapshot | null {
    try {
      return this.dependencies.renderSnapshot();
    } catch {
      return null;
    }
  }

  private async recoverNonTerminalInvalidFocusedResult(
    eventState: SurvivalState,
    generation: number,
    operation: number,
  ): Promise<void> {
    await this.trySetSleepCovered(true);
    if (!this.isCurrent(generation, operation)) return;
    const snapshot = await this.invalidFocusedRecoverySnapshot(
      eventState,
      generation,
      operation,
    );
    if (snapshot === null) {
      this.releaseBusyDuringRecovery(generation, operation);
      return;
    }
    if (!this.isCurrent(generation, operation)) return;
    await this.tryRenderAndSettleCoveredScene(generation);
    if (!this.isCurrent(generation, operation)) return;
    await this.trySetSleepCovered(false);
    if (!this.isCurrent(generation, operation)) return;
    this.presentation = 'idle';
    this.releaseBusyDuringRecovery(generation, operation);
    this.presentInvalidFocusedRecovery(snapshot);
  }

  private async invalidFocusedRecoverySnapshot(
    eventState: SurvivalState,
    generation: number,
    operation: number,
  ): Promise<SurvivalSnapshot | null> {
    try {
      return eventState === 'nightEvent'
        ? await this.runDawn(generation, operation)
        : this.dependencies.renderSnapshot();
    } catch {
      try {
        return this.dependencies.session.snapshot();
      } catch {
        return null;
      }
    }
  }

  private presentInvalidFocusedRecovery(snapshot: SurvivalSnapshot): void {
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
    this.choiceCheckpointReady = false;
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
    this.choiceCheckpointReady = false;
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
