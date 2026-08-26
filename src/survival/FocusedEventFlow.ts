import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { SurvivalUI } from '../ui/SurvivalUI';
import type {
  FocusedEventChoiceSelection,
  FocusedEventChoiceView,
} from '../ui/SurvivalUiViewModel';
import type { BoatWorld } from './BoatWorld';
import type { ItemInstanceId } from '../game/ItemState';
import type { InspectableEventId } from './eventCatalog';
import type { EventResponseId } from './survivalTypes';

export type FocusedEventWorldPort = Pick<
  BoatWorld,
  | 'enterFocusedEventView'
  | 'exitFocusedEventView'
  | 'projectEventInteractionBounds'
>;

export type FocusedEventUiPort = Pick<
  SurvivalUI,
  | 'setEventSelection'
  | 'showFocusedEvent'
  | 'hideFocusedEvent'
  | 'updateFocusedEventTarget'
  | 'playEventChoiceBeat'
  | 'restoreCommandFocus'
>;

export type FocusedEventAudioPort = Pick<SurvivalAudio, 'confirm'>;

export type FocusedEventChoiceResolution =
  | { readonly accepted: false }
  | {
      readonly accepted: true;
      readonly playAnimation: () => Promise<void>;
      readonly afterAnimation: () => Promise<void>;
      readonly beforeReturn: () => Promise<void>;
      readonly afterReturn: () => Promise<void>;
      readonly clearEvent: () => void;
      readonly renderSnapshot: () => boolean;
      readonly presentTerminal: () => void;
    };

export interface FocusedEventFlowDependencies {
  readonly world: FocusedEventWorldPort;
  readonly ui: FocusedEventUiPort;
  readonly audio: FocusedEventAudioPort;
  readonly setBusy: (busy: boolean) => void;
  readonly setEventResolutionActive: (active: boolean) => void;
  readonly isPendingEvent: (eventId: InspectableEventId) => boolean;
  readonly resolveChoice: (
    choice: FocusedEventChoiceSelection,
  ) => FocusedEventChoiceResolution | undefined;
  readonly waitForVisibilityResume: (generation: number) => Promise<boolean>;
  readonly captureLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
}

type FocusedEventFocusState =
  | 'idle'
  | 'entering'
  | 'choosing'
  | 'resolving'
  | 'returning';

const EMPTY_ELIGIBILITY: ReadonlyMap<ItemInstanceId, EventResponseId> = new Map();

export class FocusedEventFlow {
  private activeEventId: InspectableEventId | null = null;
  private choices: readonly FocusedEventChoiceView[] = [];
  private focusState: FocusedEventFocusState = 'idle';
  private viewportWidth = 1;
  private viewportHeight = 1;
  private operationGeneration = 0;
  private disposed = false;

  constructor(private readonly dependencies: FocusedEventFlowDependencies) {}

  async enter(
    eventId: InspectableEventId,
    choices: readonly FocusedEventChoiceView[],
  ): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (
      this.focusState !== 'idle'
      || !this.isCurrent(generation)
      || !this.dependencies.isPendingEvent(eventId)
    ) return;

    const operation = this.beginOperation();
    this.activeEventId = eventId;
    this.choices = [...choices];
    this.focusState = 'entering';
    this.dependencies.setBusy(true);
    try {
      await (this.dependencies.world.enterFocusedEventView?.(eventId) ?? Promise.resolve());
    } catch (error) {
      await this.recoverEntryFailure(eventId, generation, operation);
      throw error;
    }
    if (!this.isCurrentFocus(eventId, 'entering', generation, operation)) return;
    if (!this.dependencies.isPendingEvent(eventId)) return;

    this.focusState = 'choosing';
    this.showFocus();
    this.dependencies.setBusy(false);
  }

  async choose(choice: FocusedEventChoiceSelection): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    const eventId = this.activeEventId;
    if (
      eventId === null
      || this.focusState !== 'choosing'
      || !this.isCurrent(generation)
      || !this.dependencies.isPendingEvent(eventId)
      || !this.isCurrentChoice(choice)
    ) return;

    const operation = this.beginOperation();
    let resolution: FocusedEventChoiceResolution | undefined;
    try {
      this.dependencies.audio.confirm();
      this.focusState = 'resolving';
      this.dependencies.setEventResolutionActive(true);
      this.dependencies.setBusy(true);
      await (this.dependencies.ui.playEventChoiceBeat?.(choice.id) ?? Promise.resolve());
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;

      resolution = this.dependencies.resolveChoice(choice);
      if (
        !this.isCurrentFocus(eventId, 'resolving', generation, operation)
        || resolution === undefined
      ) {
        return;
      }
      if (!resolution.accepted) {
        this.restoreChoice(eventId, generation, operation);
        return;
      }

      this.dependencies.ui.hideFocusedEvent?.();
      await resolution.playAnimation();
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;

      await resolution.afterAnimation();
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
      if (!await this.dependencies.waitForVisibilityResume(generation)) return;
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;

      await resolution.beforeReturn();
      if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
      await this.returnAfterResolution(eventId, resolution, generation, operation);
    } catch (error) {
      if (resolution?.accepted) {
        await this.recoverResolvedChoice(eventId, resolution, generation, operation);
      } else {
        this.recoverUnresolvedChoice(eventId, generation, operation);
      }
      throw error;
    }
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
    try {
      await (this.dependencies.world.exitFocusedEventView?.() ?? Promise.resolve());
    } catch (error) {
      this.recoverBackFailure(eventId, generation, operation);
      throw error;
    }
    if (!this.isCurrentFocus(eventId, 'returning', generation, operation)) return;

    this.activeEventId = null;
    this.choices = [];
    this.focusState = 'idle';
    this.dependencies.ui.hideFocusedEvent?.();
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
    this.dependencies.ui.updateFocusedEventTarget?.(
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
    this.dependencies.ui.hideFocusedEvent?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operationGeneration += 1;
    this.activeEventId = null;
    this.choices = [];
    this.focusState = 'idle';
    this.dependencies.ui.hideFocusedEvent?.();
  }

  private showFocus(): void {
    const eventId = this.activeEventId;
    if (eventId === null || this.focusState !== 'choosing') return;
    this.dependencies.ui.setEventSelection?.(EMPTY_ELIGIBILITY, []);
    this.dependencies.ui.showFocusedEvent?.({
      eventId,
      choices: this.choices,
      target: this.dependencies.world.projectEventInteractionBounds?.(
        eventId,
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null,
    });
  }

  private restoreChoice(
    eventId: InspectableEventId,
    generation: number,
    operation: number,
  ): void {
    if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
    this.dependencies.setEventResolutionActive(false);
    this.focusState = 'choosing';
    this.showFocus();
    this.dependencies.setBusy(false);
  }

  private recoverUnresolvedChoice(
    eventId: InspectableEventId,
    generation: number,
    operation: number,
  ): void {
    if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
    this.focusState = 'choosing';
    this.ignoreSecondary(() => this.dependencies.setEventResolutionActive(false));
    this.ignoreSecondary(() => this.showFocus());
    this.ignoreSecondary(() => this.dependencies.setBusy(false));
  }

  private async recoverEntryFailure(
    eventId: InspectableEventId,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (!this.isCurrentFocus(eventId, 'entering', generation, operation)) return;
    try {
      await (this.dependencies.world.exitFocusedEventView?.() ?? Promise.resolve());
    } catch {
      // The entry error stays primary.
    }
    if (!this.isCurrentFocus(eventId, 'entering', generation, operation)) return;
    this.operationGeneration += 1;
    this.activeEventId = null;
    this.choices = [];
    this.focusState = 'idle';
    this.ignoreSecondary(() => this.dependencies.ui.hideFocusedEvent?.());
    this.ignoreSecondary(() => (
      this.dependencies.ui.setEventSelection?.(EMPTY_ELIGIBILITY, [])
    ));
    this.ignoreSecondary(() => this.dependencies.setBusy(false));
    this.ignoreSecondary(() => this.dependencies.ui.restoreCommandFocus?.());
  }

  private recoverBackFailure(
    eventId: InspectableEventId,
    generation: number,
    operation: number,
  ): void {
    if (!this.isCurrentFocus(eventId, 'returning', generation, operation)) return;
    this.focusState = 'choosing';
    this.ignoreSecondary(() => this.showFocus());
    this.ignoreSecondary(() => this.dependencies.setBusy(false));
  }

  private async recoverResolvedChoice(
    eventId: InspectableEventId,
    resolution: Extract<FocusedEventChoiceResolution, { readonly accepted: true }>,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (!this.isCurrentResolution(eventId, generation, operation)) {
      if (
        this.activeEventId === null
        && this.focusState === 'idle'
        && this.isCurrent(generation)
      ) {
        this.ignoreSecondary(() => this.dependencies.setEventResolutionActive(false));
        this.ignoreSecondary(() => this.dependencies.setBusy(false));
      }
      return;
    }
    this.focusState = 'returning';
    try {
      await (this.dependencies.world.exitFocusedEventView?.() ?? Promise.resolve());
    } catch {
      // Clear the resolved event even when the camera return fails.
    }
    if (!this.isCurrentResolution(eventId, generation, operation)) return;

    this.operationGeneration += 1;
    this.activeEventId = null;
    this.choices = [];
    this.focusState = 'idle';
    this.ignoreSecondary(() => resolution.clearEvent());
    if (!this.isCurrent(generation)) return;
    let terminal = false;
    let rendered = false;
    try {
      terminal = resolution.renderSnapshot();
      rendered = true;
    } catch {
      // The action error stays primary.
    }
    let returned = false;
    try {
      await resolution.afterReturn();
      returned = true;
    } catch {
      // The action error stays primary.
    }
    if (!this.isCurrent(generation)) return;
    this.ignoreSecondary(() => this.dependencies.setEventResolutionActive(false));
    this.ignoreSecondary(() => this.dependencies.setBusy(false));
    if (!rendered || !returned) return;
    if (terminal) this.ignoreSecondary(() => resolution.presentTerminal());
    else this.ignoreSecondary(() => this.dependencies.ui.restoreCommandFocus?.());
  }

  private async returnAfterResolution(
    eventId: InspectableEventId,
    resolution: Extract<FocusedEventChoiceResolution, { readonly accepted: true }>,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (!this.isCurrentFocus(eventId, 'resolving', generation, operation)) return;
    this.focusState = 'returning';
    await (this.dependencies.world.exitFocusedEventView?.() ?? Promise.resolve());
    if (!this.isCurrentFocus(eventId, 'returning', generation, operation)) return;

    this.operationGeneration += 1;
    this.activeEventId = null;
    this.choices = [];
    this.focusState = 'idle';
    let terminal = false;
    try {
      resolution.clearEvent();
      if (!this.isCurrent(generation)) return;
      terminal = resolution.renderSnapshot();
      if (!this.isCurrent(generation)) return;
      await resolution.afterReturn();
      if (!this.isCurrent(generation)) return;
    } finally {
      this.releaseSettledBusy(generation, operation);
    }
    if (terminal) resolution.presentTerminal();
    else this.dependencies.ui.restoreCommandFocus?.();
  }

  private isCurrentChoice(choice: FocusedEventChoiceSelection): boolean {
    return this.choices.some((current) => (
      current.id === choice.id && current.instanceId === choice.instanceId
    ));
  }

  private isCurrentFocus(
    eventId: InspectableEventId,
    state: FocusedEventFocusState,
    generation: number,
    operation: number,
  ): boolean {
    return this.activeEventId === eventId
      && this.focusState === state
      && this.operationGeneration === operation
      && this.isCurrent(generation);
  }

  private isCurrentResolution(
    eventId: InspectableEventId,
    generation: number,
    operation: number,
  ): boolean {
    return this.activeEventId === eventId
      && (this.focusState === 'resolving' || this.focusState === 'returning')
      && this.operationGeneration === operation
      && this.isCurrent(generation);
  }

  private releaseSettledBusy(generation: number, operation: number): void {
    if (
      this.activeEventId !== null
      || this.choices.length !== 0
      || this.focusState !== 'idle'
      || this.operationGeneration !== operation + 1
      || !this.isCurrent(generation)
    ) return;
    this.dependencies.setBusy(false);
  }

  private beginOperation(): number {
    this.operationGeneration += 1;
    return this.operationGeneration;
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed
      && this.dependencies.isLifecycleGenerationCurrent(generation);
  }

  private ignoreSecondary(cleanup: () => void): void {
    try {
      cleanup();
    } catch {
      // A prior action or camera error stays primary.
    }
  }
}
