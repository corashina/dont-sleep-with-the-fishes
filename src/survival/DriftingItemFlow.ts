import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { ItemInstanceId } from '../game/ItemState';
import type { EventContextChoice, SurvivalUI } from '../ui/SurvivalUI';
import type { BoatWorld } from './BoatWorld';
import {
  survivalEventById,
  type DriftingItemEventId,
} from './eventCatalog';
import type { EventResponseId } from './survivalTypes';

export type DriftingItemWorldPort = Pick<
  BoatWorld,
  | 'enterDriftingItemView'
  | 'exitDriftingItemView'
  | 'retrieveDriftingItem'
  | 'delegateDriftingItem'
  | 'recedeDriftingItem'
  | 'projectEventInteractionBounds'
>;

export type DriftingItemUiPort = Pick<
  SurvivalUI,
  | 'setEventSelection'
  | 'showDriftingItemFocus'
  | 'hideDriftingItemFocus'
  | 'updateDriftingItemFocusTarget'
  | 'playEventChoiceBeat'
  | 'restoreCommandFocus'
>;

export type DriftingItemAudioPort = Pick<SurvivalAudio, 'confirm'>;

export type DriftingItemChoiceResolution =
  | { readonly accepted: false }
  | {
      readonly accepted: true;
      readonly animate: boolean;
      readonly clearEvent: () => void;
      readonly renderSnapshot: () => boolean;
      readonly presentTerminal: () => void;
    };

export interface DriftingItemFlowDependencies {
  readonly world: DriftingItemWorldPort;
  readonly ui: DriftingItemUiPort;
  readonly audio: DriftingItemAudioPort;
  readonly setBusy: (busy: boolean) => void;
  readonly setEventResolutionActive: (active: boolean) => void;
  readonly isPendingEvent: (eventId: DriftingItemEventId) => boolean;
  readonly resolveChoice: (
    choiceId: EventResponseId,
  ) => DriftingItemChoiceResolution | undefined;
  readonly waitForVisibilityResume: (generation: number) => Promise<boolean>;
  readonly captureLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
}

type DriftingItemFocusState =
  | 'idle'
  | 'entering'
  | 'choosing'
  | 'resolving'
  | 'returning';

const EMPTY_ELIGIBILITY: ReadonlyMap<ItemInstanceId, EventResponseId> = new Map();

export class DriftingItemFlow {
  private activeEventId: DriftingItemEventId | null = null;
  private choices: readonly EventContextChoice[] = [];
  private focusState: DriftingItemFocusState = 'idle';
  private viewportWidth = 1;
  private viewportHeight = 1;
  private operationGeneration = 0;
  private disposed = false;

  constructor(private readonly dependencies: DriftingItemFlowDependencies) {}

  async enter(
    eventId: DriftingItemEventId,
    choices: readonly EventContextChoice[],
  ): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (
      this.focusState !== 'idle'
      || !this.isCurrent(generation)
      || !this.dependencies.isPendingEvent(eventId)
      || survivalEventById(eventId) === undefined
    ) return;

    const operation = this.beginOperation();
    this.activeEventId = eventId;
    this.choices = [...choices];
    this.focusState = 'entering';
    this.dependencies.setBusy(true);
    await (this.dependencies.world.enterDriftingItemView?.(eventId) ?? Promise.resolve());
    if (!this.isCurrentFocus(eventId, 'entering', generation, operation)) return;
    if (!this.dependencies.isPendingEvent(eventId)) return;

    this.focusState = 'choosing';
    this.showFocus();
    this.dependencies.setBusy(false);
  }

  async choose(choiceId: EventResponseId): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    const eventId = this.activeEventId;
    if (
      eventId === null
      || this.focusState !== 'choosing'
      || !this.isCurrent(generation)
      || !this.dependencies.isPendingEvent(eventId)
      || !this.isSupportedChoice(choiceId)
    ) return;

    const operation = this.beginOperation();
    this.dependencies.audio.confirm();
    this.focusState = 'resolving';
    this.dependencies.setEventResolutionActive(true);
    this.dependencies.setBusy(true);
    await (this.dependencies.ui.playEventChoiceBeat?.(choiceId) ?? Promise.resolve());
    if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
    if (!await this.dependencies.waitForVisibilityResume(generation)) return;
    if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;

    const resolution = this.dependencies.resolveChoice(choiceId);
    if (
      !this.isCurrentFocus(eventId, 'resolving', generation, operation)
      || resolution === undefined
    ) {
      return;
    }
    if (!resolution.accepted) {
      this.dependencies.setEventResolutionActive(false);
      this.focusState = 'choosing';
      this.showFocus();
      this.dependencies.setBusy(false);
      return;
    }

    if (resolution.animate) {
      await this.playChoiceAnimation(eventId, choiceId);
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
    }

    await this.returnAfterResolution(eventId, resolution, generation, operation);
  }

  async back(): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    const eventId = this.activeEventId;
    if (
      eventId === null
      || this.focusState !== 'choosing'
      || !this.isCurrent(generation)
    ) return;

    const operation = this.beginOperation();
    this.focusState = 'returning';
    this.dependencies.setBusy(true);
    await (this.dependencies.world.exitDriftingItemView?.() ?? Promise.resolve());
    if (!this.isCurrentFocus(eventId, 'returning', generation, operation)) return;

    this.activeEventId = null;
    this.choices = [];
    this.focusState = 'idle';
    this.dependencies.ui.hideDriftingItemFocus?.();
    this.dependencies.ui.setEventSelection?.(EMPTY_ELIGIBILITY, []);
    this.dependencies.setBusy(false);
    this.dependencies.ui.restoreCommandFocus?.();
  }

  syncTarget(width: number, height: number): void {
    if (
      this.disposed
      || !Number.isFinite(width)
      || !Number.isFinite(height)
      || width <= 0
      || height <= 0
    ) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    if (this.focusState !== 'choosing' || this.activeEventId === null) return;
    this.dependencies.ui.updateDriftingItemFocusTarget?.(
      this.dependencies.world.projectEventInteractionBounds?.(
        this.activeEventId,
        width,
        height,
      ) ?? null,
    );
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    // BoatWorld settles its camera and item promises when document visibility changes.
  }

  clear(): void {
    if (
      this.disposed
      || (
        this.activeEventId === null
        && this.choices.length === 0
        && this.focusState === 'idle'
      )
    ) return;
    this.operationGeneration += 1;
    this.activeEventId = null;
    this.choices = [];
    this.focusState = 'idle';
    this.dependencies.ui.hideDriftingItemFocus?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  private showFocus(): void {
    const eventId = this.activeEventId;
    if (eventId === null || this.focusState !== 'choosing') return;
    const event = survivalEventById(eventId);
    if (event === undefined) return;
    this.dependencies.ui.setEventSelection?.(EMPTY_ELIGIBILITY, []);
    this.dependencies.ui.showDriftingItemFocus?.({
      eventId,
      title: event.title.toLocaleUpperCase('en-US'),
      choices: this.choices,
      target: this.dependencies.world.projectEventInteractionBounds?.(
        eventId,
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null,
    });
  }

  private playChoiceAnimation(
    eventId: DriftingItemEventId,
    choiceId: EventResponseId,
  ): Promise<void> {
    if (choiceId === 'retrieve') {
      return this.dependencies.world.retrieveDriftingItem?.(eventId) ?? Promise.resolve();
    }
    if (choiceId === 'delegate-carlitos') {
      return this.dependencies.world.delegateDriftingItem?.(eventId) ?? Promise.resolve();
    }
    return this.dependencies.world.recedeDriftingItem?.(eventId) ?? Promise.resolve();
  }

  private async returnAfterResolution(
    eventId: DriftingItemEventId,
    resolution: Extract<DriftingItemChoiceResolution, { readonly accepted: true }>,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
    this.focusState = 'returning';
    this.dependencies.setBusy(true);
    await (this.dependencies.world.exitDriftingItemView?.() ?? Promise.resolve());
    if (!this.isCurrentFocus(eventId, 'returning', generation, operation)) return;

    this.clear();
    resolution.clearEvent();
    if (!this.isCurrent(generation)) return;
    const terminal = resolution.renderSnapshot();
    if (!this.isCurrent(generation)) return;
    this.dependencies.setBusy(false);
    if (terminal) resolution.presentTerminal();
    else this.dependencies.ui.restoreCommandFocus?.();
  }

  private isSupportedChoice(choiceId: EventResponseId): boolean {
    return choiceId === 'retrieve'
      || choiceId === 'delegate-carlitos'
      || choiceId === 'sleep';
  }

  private isCurrentFocus(
    eventId: DriftingItemEventId,
    state: DriftingItemFocusState,
    generation: number,
    operation: number,
  ): boolean {
    return this.activeEventId === eventId
      && this.focusState === state
      && this.operationGeneration === operation
      && this.isCurrent(generation);
  }

  private beginOperation(): number {
    this.operationGeneration += 1;
    return this.operationGeneration;
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed
      && this.dependencies.isLifecycleGenerationCurrent(generation);
  }
}
