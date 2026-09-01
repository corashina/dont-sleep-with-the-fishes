import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { FishingResultView } from '../ui/SurvivalFishingView';
import type { SurvivalUI } from '../ui/SurvivalUI';
import { runCleanupSteps } from '../world/SceneResources';
import type { BoatWorld } from './BoatWorld';
import { fishingCatchFood } from './fishingCatalog';
import type {
  FishingCastPoint,
  FishingSession,
  FishingTerminalResult,
} from './FishingSession';
import type { SurvivalSession } from './SurvivalSession';
import type { ActionOutcome } from './survivalTypes';

export type FishingSessionPort = Pick<
  SurvivalSession,
  'beginFishing' | 'cancelFishing' | 'finishFishing' | 'snapshot'
>;

export type FishingWorldPort = Pick<
  BoatWorld,
  | 'enterFishingView'
  | 'castFishingAtScreenPoint'
  | 'centeredFishingCast'
  | 'playFishingCast'
  | 'showFishingWaiting'
  | 'showFishingBite'
  | 'projectFishingBite'
  | 'playFishingReel'
  | 'projectFishingCatch'
  | 'playFishingMiss'
  | 'exitFishingView'
  | 'clearFishingPresentation'
>;

export type FishingUiPort = Pick<
  SurvivalUI,
  | 'setFishingState'
  | 'showFishingResult'
  | 'hideFishingResult'
  | 'updateFishingBiteTarget'
  | 'setFishingViewExitVisible'
  | 'setFishingFade'
  | 'restoreCommandFocus'
>;

export type FishingAudioPort = Pick<
  SurvivalAudio,
  'deny' | 'fishingCast' | 'fishingBite' | 'fishingReel' | 'fishingResult'
>;

export interface SurvivalFishingFlowDependencies {
  readonly session: FishingSessionPort;
  readonly world: FishingWorldPort;
  readonly ui: FishingUiPort;
  readonly audio: FishingAudioPort;
  readonly renderSnapshot: () => void;
  readonly setBusy: (busy: boolean) => void;
  readonly isPaused: () => boolean;
  readonly isHidden: () => boolean;
  readonly isLifecycleActive: () => boolean;
  readonly captureLifecycleGeneration: () => number;
  readonly advanceLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
}

type FishingPresentationState =
  | 'idle'
  | 'ready'
  | 'entering'
  | 'aiming'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'settling'
  | 'result'
  | 'returning';

export function formatFishingResult(
  result: FishingTerminalResult,
  outcome: ActionOutcome,
): FishingResultView {
  if (result.kind === 'miss') {
    return {
      caption: 'EMPTY HOOK',
      title: 'IT GOT AWAY',
      detail: 'NO CATCH',
      catchTarget: null,
    };
  }
  if (result.catch.kind === 'junk') {
    return {
      caption: 'DRIFTING JUNK',
      title: result.catch.label.toLocaleUpperCase('en-US'),
      detail: 'NO FOOD',
      catchTarget: null,
    };
  }
  if (result.catch.kind === 'utility') {
    const reward = result.catch.reward;
    const detail = reward.kind === 'bait'
      ? 'BAIT +1'
      : reward.kind === 'item' && reward.condition === 'broken'
        ? 'BROKEN — REPAIR WITH DUCT TAPE'
        : reward.kind === 'item' && reward.itemId === 'ductTape'
          ? 'DUCT TAPE RECOVERED'
          : 'ENERGY BAR RECOVERED';
    return {
      caption: 'UTILITY SALVAGE',
      title: result.catch.label.toLocaleUpperCase('en-US'),
      detail,
      catchTarget: null,
    };
  }
  const bait = outcome.deltas.bait === -1 ? ' - 1 BAIT USED' : '';
  return {
    caption: `${result.catch.size.toLocaleUpperCase('en-US')} CATCH`,
    title: result.catch.label.toLocaleUpperCase('en-US'),
    detail: `+${fishingCatchFood(result.catch)} FOOD${bait}`,
    catchTarget: null,
  };
}

export class SurvivalFishingFlow {
  private activeFishing: FishingSession | null = null;
  private presentation: FishingPresentationState = 'idle';
  private settlementInProgress = false;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private disposed = false;

  constructor(private readonly dependencies: SurvivalFishingFlowDependencies) {}

  async begin(): Promise<void> {
    if (!this.isActive() || (this.presentation !== 'idle' && this.presentation !== 'ready')) return;
    const begun = this.dependencies.session.beginFishing?.();
    if (begun === undefined) return;
    if (!begun.accepted) {
      this.presentDeniedOutcome();
      return;
    }
    const generation = this.advanceGeneration();
    const attempt = begun.attempt;
    this.prepareFishingEntry(attempt);
    await this.finishFishingEntry(attempt, generation);
  }

  private prepareFishingEntry(attempt: FishingSession): void {
    this.activeFishing = attempt;
    this.presentation = 'entering';
    this.settlementInProgress = false;
    this.dependencies.ui.setFishingViewExitVisible?.(false);
    this.dependencies.setBusy(true);
    this.dependencies.renderSnapshot();
    this.dependencies.ui.setFishingState?.({
      mode: 'waiting',
      message: 'CLICK THE WATER TO CAST',
      biteTarget: null,
    });
  }

  private async finishFishingEntry(
    attempt: FishingSession,
    generation: number,
  ): Promise<void> {
    if (!this.isCurrentFishing(attempt, generation)) return;
    await (this.dependencies.world.enterFishingView?.() ?? Promise.resolve());
    if (!this.isCurrentFishing(attempt, generation)) return;
    this.presentation = 'aiming';
    this.dependencies.ui.setFishingState?.({
      mode: 'aiming',
      message: 'CLICK THE WATER TO CAST',
      biteTarget: null,
    });
    this.dependencies.ui.setFishingViewExitVisible?.(true);
  }

  cast(
    clientX: number | null,
    clientY: number | null,
    width: number,
    height: number,
  ): boolean {
    const attempt = this.activeFishing;
    if (!this.canCast(attempt)) return false;

    this.setViewport(width, height);
    const castPoint = this.castPoint(clientX, clientY, width, height);
    if (castPoint === null || !attempt.cast(castPoint).accepted) return false;

    const storedPoint = attempt.snapshot().castPoint;
    if (storedPoint === null) return false;
    this.startCast(attempt, storedPoint);
    return true;
  }

  reel(): boolean {
    const attempt = this.activeFishing;
    const generation = this.dependencies.captureLifecycleGeneration();
    if (!this.canReel(attempt, generation)) return false;
    const current = attempt.snapshot();
    if (current.state === 'resolved' && current.result !== null) {
      return this.settle(attempt, current.result, generation);
    }
    const reel = attempt.reel();
    if (!reel.accepted || reel.result === undefined) return false;
    if (!attempt.completeReel().accepted) return false;
    const result = attempt.snapshot().result;
    if (result === null || result !== reel.result) return false;
    this.dependencies.audio.fishingReel?.();
    return this.settle(attempt, result, generation);
  }

  continueResult(): void {
    const attempt = this.activeFishing;
    const generation = this.dependencies.captureLifecycleGeneration();
    if (
      attempt === null
      || this.presentation !== 'result'
      || !this.isCurrent(generation)
    ) return;
    this.dependencies.ui.hideFishingResult?.();
    this.dependencies.world.clearFishingPresentation?.();
    this.settlementInProgress = false;
    this.presentation = 'ready';
    this.activeFishing = null;
    this.dependencies.setBusy(false);
    this.dependencies.ui.setFishingViewExitVisible?.(true);
    this.dependencies.ui.setFishingState?.({ mode: 'ready', message: '', biteTarget: null });
  }

  exitReadyView(): void {
    if (!this.isActive()) return;
    if (this.presentation === 'aiming') {
      if (!this.cancelAimingAttempt()) return;
    } else if (this.presentation !== 'ready' || this.activeFishing !== null) {
      return;
    }
    this.startReturnFromView();
  }

  update(deltaSeconds: number): void {
    const attempt = this.activeFishing;
    if (!this.canUpdate(attempt, deltaSeconds)) return;

    const current = attempt.view();
    const previousState = current.state;
    attempt.advance(deltaSeconds);
    if (current.castPoint === null) return;
    if (current.state === 'bite') {
      this.updateBite(current.castPoint);
      return;
    }
    if (current.state !== 'missed' || current.result === null) return;
    if (previousState === 'waiting' && this.presentation !== 'bite') {
      this.enterBite(current.castPoint);
    }
    this.settle(
      attempt,
      current.result,
      this.dependencies.captureLifecycleGeneration(),
    );
  }

  resize(width: number, height: number): void {
    if (!this.isActive()) return;
    this.setViewport(width, height);
    this.syncBiteTarget();
  }

  settleForVisibilityChange(): void {
    if (!this.isActive()) return;
    // BoatWorld settles the active visual promise. Its guarded continuation owns logical state.
  }

  hasActiveAttempt(): boolean {
    return this.activeFishing !== null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.activeFishing = null;
    this.presentation = 'idle';
    this.settlementInProgress = false;
    runCleanupSteps([
      () => this.dependencies.ui.hideFishingResult?.(),
      () => this.dependencies.ui.setFishingViewExitVisible?.(false),
    ]);
  }

  private async completeCast(
    attempt: FishingSession,
    point: FishingCastPoint,
    generation: number,
  ): Promise<void> {
    if (!this.isCurrentFishing(attempt, generation)) return;
    await (this.dependencies.world.playFishingCast?.(point) ?? Promise.resolve());
    if (!this.isCurrentFishing(attempt, generation)) return;
    if (!attempt.completeCast().accepted) return;
    const storedPoint = attempt.snapshot().castPoint;
    if (storedPoint === null) return;
    this.presentation = 'waiting';
    this.dependencies.world.showFishingWaiting?.(storedPoint);
    this.dependencies.ui.setFishingState?.({
      mode: 'waiting',
      message: 'WAIT FOR A BITE',
      biteTarget: null,
    });
  }

  private enterBite(point: FishingCastPoint): void {
    if (!this.isActive()) return;
    this.presentation = 'bite';
    this.dependencies.audio.fishingBite?.();
    this.dependencies.world.showFishingBite?.(point);
    this.dependencies.ui.setFishingState?.({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: this.dependencies.world.projectFishingBite?.(
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null,
    });
  }

  private syncBiteTarget(): void {
    if (
      this.activeFishing === null
      || this.presentation !== 'bite'
      || !this.isActive()
    ) return;
    this.dependencies.ui.updateFishingBiteTarget?.(
      this.dependencies.world.projectFishingBite?.(
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null,
    );
  }

  private settle(
    attempt: FishingSession,
    result: FishingTerminalResult,
    generation: number,
  ): boolean {
    if (!this.isCurrentFishing(attempt, generation) || this.settlementInProgress) return false;
    this.settlementInProgress = true;
    this.presentation = 'settling';
    const outcome = this.dependencies.session.finishFishing?.(attempt.snapshot().id, result);
    if (outcome === undefined || !outcome.accepted) {
      this.dependencies.audio.deny?.();
      this.settlementInProgress = false;
      this.presentation = 'bite';
      this.syncBiteTarget();
      return false;
    }
    this.dependencies.renderSnapshot();
    this.presentation = 'settling';
    this.dependencies.ui.setFishingState?.({
      mode: 'waiting',
      message: result.kind === 'catch' ? 'REELING IN' : 'THE LINE WENT SLACK',
      biteTarget: null,
    });
    void this.presentResult(attempt, result, outcome, generation);
    return true;
  }

  private async presentResult(
    attempt: FishingSession,
    result: FishingTerminalResult,
    outcome: ActionOutcome,
    generation: number,
  ): Promise<void> {
    if (!this.isCurrentFishing(attempt, generation)) return;
    this.dependencies.audio.fishingResult?.(result);
    await this.playResultAnimation(result);
    if (!this.isCurrentFishing(attempt, generation)) return;

    this.presentation = 'result';
    this.dependencies.ui.setFishingState?.({ mode: 'result', message: '', biteTarget: null });
    this.showResult(result, outcome);
  }

  private presentDeniedOutcome(): void {
    this.dependencies.audio.deny?.();
  }

  private canCast(attempt: FishingSession | null): attempt is FishingSession {
    return attempt !== null
      && this.presentation === 'aiming'
      && !this.dependencies.isPaused()
      && !this.dependencies.isHidden()
      && this.isActive();
  }

  private castPoint(
    clientX: number | null,
    clientY: number | null,
    width: number,
    height: number,
  ): FishingCastPoint | null {
    if (clientX === null || clientY === null) {
      return this.dependencies.world.centeredFishingCast?.() ?? null;
    }
    return this.dependencies.world.castFishingAtScreenPoint?.(
      clientX,
      clientY,
      width,
      height,
    ) ?? this.dependencies.world.centeredFishingCast?.() ?? null;
  }

  private startCast(attempt: FishingSession, point: FishingCastPoint): void {
    this.dependencies.audio.fishingCast?.();
    const generation = this.dependencies.captureLifecycleGeneration();
    this.dependencies.ui.setFishingViewExitVisible?.(false);
    this.presentation = 'casting';
    void this.completeCast(attempt, point, generation);
  }

  private canReel(attempt: FishingSession | null, generation: number): attempt is FishingSession {
    return attempt !== null
      && this.presentation === 'bite'
      && !this.settlementInProgress
      && !this.dependencies.isPaused()
      && !this.dependencies.isHidden()
      && this.isCurrent(generation);
  }

  private cancelAimingAttempt(): boolean {
    const attempt = this.activeFishing;
    if (attempt === null) return false;
    const outcome = this.dependencies.session.cancelFishing?.(attempt.snapshot().id);
    if (outcome === undefined || !outcome.accepted) {
      return false;
    }
    this.activeFishing = null;
    this.settlementInProgress = false;
    this.dependencies.renderSnapshot();
    this.dependencies.ui.setFishingState?.({ mode: 'hidden', message: '', biteTarget: null });
    return true;
  }

  private startReturnFromView(): void {
    const generation = this.advanceGeneration();
    this.presentation = 'returning';
    this.dependencies.ui.setFishingViewExitVisible?.(false);
    this.dependencies.setBusy(true);
    void this.returnFromView(generation);
  }

  private canUpdate(attempt: FishingSession | null, deltaSeconds: number): attempt is FishingSession {
    return attempt !== null
      && !this.settlementInProgress
      && (this.presentation === 'waiting' || this.presentation === 'bite')
      && !this.dependencies.isPaused()
      && !this.dependencies.isHidden()
      && this.isActive()
      && Number.isFinite(deltaSeconds)
      && deltaSeconds >= 0;
  }

  private updateBite(point: FishingCastPoint): void {
    if (this.presentation !== 'bite') this.enterBite(point);
    else this.syncBiteTarget();
  }

  private playResultAnimation(result: FishingTerminalResult): Promise<void> {
    if (result.kind === 'catch') {
      return this.dependencies.world.playFishingReel?.(result.catch.id) ?? Promise.resolve();
    }
    return this.dependencies.world.playFishingMiss?.() ?? Promise.resolve();
  }

  private showResult(result: FishingTerminalResult, outcome: ActionOutcome): void {
    const view = formatFishingResult(result, outcome);
    const catchTarget = result.kind === 'catch'
      ? this.dependencies.world.projectFishingCatch?.(
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null
      : null;
    this.dependencies.ui.showFishingResult?.({ ...view, catchTarget });
  }

  private async returnFromView(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    await (this.dependencies.world.exitFishingView?.() ?? Promise.resolve());
    if (!this.isCurrent(generation)) return;
    this.presentation = 'idle';
    this.dependencies.ui.setFishingState?.({ mode: 'hidden', message: '', biteTarget: null });
    this.dependencies.setBusy(false);
    this.dependencies.ui.restoreCommandFocus?.();
  }

  private setViewport(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  private isCurrentFishing(attempt: FishingSession, generation: number): boolean {
    return this.activeFishing === attempt && this.isCurrent(generation);
  }

  private advanceGeneration(): number {
    return this.dependencies.advanceLifecycleGeneration();
  }

  private isActive(): boolean {
    return !this.disposed && this.dependencies.isLifecycleActive();
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed
      && this.dependencies.isLifecycleGenerationCurrent(generation);
  }
}
