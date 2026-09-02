import type { BoatInteractionAnchor, ProjectedBoatBounds } from '../survival/BoatInteraction';
import { createElementRequirement } from './dom';
import {
  runCleanupSteps,
  settleAfterCleanup,
  throwCleanupFailure,
} from './UiCleanup';
import { returnArrowArtwork } from './uiArtwork';

const FISHING_FADE_MS = 180;
const ROUTINE_DIALOG_MARGIN = 20;
const ROUTINE_DIALOG_GAP = 22;
const requireElement = createElementRequirement('survival fishing view');

export type FishingUiMode = 'hidden' | 'aiming' | 'waiting' | 'bite' | 'result' | 'ready';

export interface FishingUiState {
  readonly mode: FishingUiMode;
  readonly message: string;
  readonly biteTarget: ProjectedBoatBounds | null;
}

export interface FishingResultView {
  readonly caption: string;
  readonly title: string;
  readonly detail: string;
  readonly catchTarget: ProjectedBoatBounds | null;
}

interface PendingFade {
  readonly finish: () => void;
}

export class SurvivalFishingView {
  readonly interactionRoot: HTMLElement;
  readonly fadeRoot: HTMLElement;
  readonly resultRoot: HTMLElement;
  readonly roots: readonly [HTMLElement, HTMLElement, HTMLElement];
  readonly biteButton: HTMLButtonElement;
  readonly exitButton: HTMLButtonElement;
  readonly resultContinue: HTMLButtonElement;

  onCast: (point: { readonly x: number; readonly y: number } | null) => boolean = () => false;
  onReel: () => boolean = () => false;
  onContinue: () => void = () => undefined;
  onExit: () => void = () => undefined;
  onInteractionShow: () => void = () => undefined;
  onInteractionHide: () => void = () => undefined;
  onResultShow: () => void = () => undefined;
  onResultHide: () => void = () => undefined;
  canUseInteraction: () => boolean = () => true;
  canUseResult: () => boolean = () => true;

  private readonly live: HTMLElement;
  private readonly visibleMessage: HTMLElement;
  private readonly resultCaption: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultDetail: HTMLElement;
  private currentMode: FishingUiMode = 'hidden';
  private message = '';
  private readonly target = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    depth: 0,
    visible: false,
  };
  private hasTarget = false;
  private castIssued = false;
  private reelIssued = false;
  private suppressClick = false;
  private paused = false;
  private announcementVersion = 0;
  private pendingFade: PendingFade | null = null;
  private continueIssued = false;
  private resultTarget: ProjectedBoatBounds | null = null;
  private resultVisible = false;
  private disposed = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly coordinateRoot: HTMLElement,
    private readonly fallbackAnchor: () => BoatInteractionAnchor | null,
  ) {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="fishing-layer" data-fishing role="region" aria-label="Fishing interaction" aria-hidden="true" inert tabindex="-1">
        <div class="survival-announcer" data-fishing-live aria-live="polite" aria-atomic="true"></div>
        <p class="fishing-instruction ui-role-context" data-fishing-message hidden></p>
        <button type="button" class="fishing-bite-target" data-fishing-bite aria-label="BITE - REEL NOW" hidden></button>
        <button type="button" class="fishing-view-exit ui-role-context" data-fishing-view-exit aria-label="Return to boat view" hidden>
          ${returnArrowArtwork('fishing-view-exit__arrow')}
        </button>
      </section>
      <div class="fishing-fade" data-fishing-fade aria-hidden="true"></div>
      <section class="routine-dialog routine-dialog--fishing" data-fishing-result role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="fishing-result-title" inert>
        <div class="routine-dialog__card fishing-result-card scuba-popup-paper">
          <p class="eyebrow ui-role-context" data-fishing-result-caption></p>
          <h2 class="scuba-popup-title ui-role-display" id="fishing-result-title" data-fishing-result-title></h2>
          <p class="fishing-result-detail ui-role-narrative" data-fishing-result-detail></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-fishing-result-continue aria-label="Continue">
            CONTINUE
          </button>
        </div>
      </section>`;
    const roots = [...template.content.children] as HTMLElement[];
    this.interactionRoot = roots[0]!;
    this.fadeRoot = roots[1]!;
    this.resultRoot = roots[2]!;
    this.roots = [this.interactionRoot, this.fadeRoot, this.resultRoot];
    this.live = requireElement(this.interactionRoot, '[data-fishing-live]');
    this.visibleMessage = requireElement(this.interactionRoot, '[data-fishing-message]');
    this.biteButton = requireElement(this.interactionRoot, '[data-fishing-bite]');
    this.exitButton = requireElement(this.interactionRoot, '[data-fishing-view-exit]');
    this.resultCaption = requireElement(this.resultRoot, '[data-fishing-result-caption]');
    this.resultTitle = requireElement(this.resultRoot, '[data-fishing-result-title]');
    this.resultDetail = requireElement(this.resultRoot, '[data-fishing-result-detail]');
    this.resultContinue = requireElement(this.resultRoot, '[data-fishing-result-continue]');
    this.interactionRoot.addEventListener('click', this.handleInteractionClick);
    this.interactionRoot.addEventListener('pointerup', this.handlePointerUp);
    this.resultRoot.addEventListener('click', this.handleResultClick);
    window.addEventListener('resize', this.handleWindowResize);
  }

  mode(): FishingUiMode {
    return this.currentMode;
  }

  setState(state: FishingUiState): boolean {
    if (this.disposed) return false;
    const modeChanged = state.mode !== this.currentMode;
    const messageChanged = state.message !== this.message;
    const targetChanged = !this.sameTarget(state.biteTarget);
    if (!modeChanged && !messageChanged && !targetChanged) return false;

    if (modeChanged) this.resetModeInput();

    this.currentMode = state.mode;
    this.interactionRoot.dataset.mode = state.mode;
    if (messageChanged || modeChanged) this.applyStateMessage(state);
    if (targetChanged || modeChanged) this.renderTarget(state.biteTarget);

    if (state.mode === 'hidden') this.onInteractionHide();
    else this.onInteractionShow();
    return true;
  }

  private resetModeInput(): void {
    this.castIssued = false;
    this.reelIssued = false;
    this.suppressClick = false;
  }

  private applyStateMessage(state: FishingUiState): void {
    this.message = state.message;
    this.visibleMessage.textContent = state.message;
    this.visibleMessage.hidden = state.mode === 'hidden'
      || state.mode === 'ready'
      || state.mode === 'result'
      || state.message.length === 0;
    this.live.setAttribute('aria-live', state.mode === 'bite' ? 'assertive' : 'polite');
    if (state.mode === 'hidden') this.cancelAnnouncement();
    else this.publishAnnouncement(state.message);
  }

  setPaused(paused: boolean): void {
    if (!this.disposed) this.paused = paused;
  }

  updateBiteTarget(target: ProjectedBoatBounds | null): void {
    if (this.disposed || this.currentMode !== 'bite' || this.sameTarget(target)) return;
    this.renderTarget(target);
  }

  setExitVisible(visible: boolean): void {
    if (!this.disposed) this.exitButton.hidden = !visible;
  }

  showResult(view: FishingResultView): void {
    if (this.disposed) return;
    this.continueIssued = false;
    this.resultCaption.textContent = view.caption;
    this.resultTitle.textContent = view.title;
    this.resultDetail.textContent = view.detail;
    this.resultTarget = view.catchTarget === null
      ? null
      : Object.freeze({ ...view.catchTarget });
    this.resultVisible = true;
    this.positionResult();
    this.onResultShow();
  }

  hideResult(): void {
    if (this.disposed) return;
    this.onResultHide();
    this.resultVisible = false;
    this.resultTarget = null;
  }

  refreshResultPlacement(): void {
    if (!this.disposed && this.resultVisible) this.positionResult();
  }

  setFade(covered: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingFade?.finish();
    this.fadeRoot.classList.toggle('is-covered', covered);
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => this.fadeRoot.removeEventListener('transitionend', handleTransitionEnd),
          () => {
            if (this.pendingFade?.finish === finish) this.pendingFade = null;
          },
        ]);
      };
      const handleTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === this.fadeRoot && event.propertyName === 'opacity') finish();
      };
      this.fadeRoot.addEventListener('transitionend', handleTransitionEnd);
      timer = window.setTimeout(finish, FISHING_FADE_MS);
      this.pendingFade = { finish };
    });
  }

  settleForVisibilityChange(): void {
    if (!this.disposed) this.settleFade();
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (
      this.disposed
      || event.repeat
      || this.currentMode === 'ready'
      || (event.target instanceof Node && this.exitButton.contains(event.target))
      || (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar')
    ) return false;
    event.preventDefault();
    if (this.currentMode === 'aiming') this.issueCast();
    else if (this.currentMode === 'bite') this.issueReel();
    return true;
  }

  initialFocus(): HTMLElement {
    if (this.currentMode === 'bite' && !this.biteButton.hidden) return this.biteButton;
    if (this.currentMode === 'ready' && !this.exitButton.hidden) return this.exitButton;
    return this.interactionRoot;
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    return true;
  }

  settleFade(): void {
    this.pendingFade?.finish();
  }

  cancelAnnouncementForDispose(): void {
    this.cancelAnnouncement();
  }

  clearInteractionForDispose(): void {
    this.currentMode = 'hidden';
  }

  removeListenersForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => this.interactionRoot.removeEventListener('click', this.handleInteractionClick),
      () => this.interactionRoot.removeEventListener('pointerup', this.handlePointerUp),
      () => this.resultRoot.removeEventListener('click', this.handleResultClick),
      () => window.removeEventListener('resize', this.handleWindowResize),
    ]));
  }

  resetCallbacksForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => { this.onCast = () => false; },
      () => { this.onReel = () => false; },
      () => { this.onContinue = () => undefined; },
      () => { this.onExit = () => undefined; },
      () => { this.onInteractionShow = () => undefined; },
      () => { this.onInteractionHide = () => undefined; },
      () => { this.onResultShow = () => undefined; },
      () => { this.onResultHide = () => undefined; },
      () => { this.canUseInteraction = () => false; },
      () => { this.canUseResult = () => false; },
    ]));
  }

  dispose(): void {
    if (!this.beginDispose()) return;
    const result = runCleanupSteps([
      () => this.settleFade(),
      () => this.cancelAnnouncementForDispose(),
      () => this.clearInteractionForDispose(),
      () => this.removeListenersForDispose(),
      () => this.resetCallbacksForDispose(),
    ]);
    throwCleanupFailure(result);
  }

  private sameTarget(target: ProjectedBoatBounds | null): boolean {
    if (target === null) return !this.hasTarget;
    if (!this.hasTarget) return false;
    return target.x === this.target.x
      && target.y === this.target.y
      && target.width === this.target.width
      && target.height === this.target.height
      && target.depth === this.target.depth
      && target.visible === this.target.visible;
  }

  private renderTarget(target: ProjectedBoatBounds | null): void {
    this.hasTarget = target !== null;
    if (target !== null) {
      this.target.x = target.x;
      this.target.y = target.y;
      this.target.width = target.width;
      this.target.height = target.height;
      this.target.depth = target.depth;
      this.target.visible = target.visible;
    }
    const visible = this.currentMode === 'bite' && this.hasTarget && this.target.visible;
    this.biteButton.hidden = !visible;
    if (!visible) return;
    const width = Math.max(44, Math.round(this.target.width));
    const height = Math.max(44, Math.round(this.target.height));
    this.biteButton.style.transform = `translate(${Math.round(this.target.x)}px, ${Math.round(this.target.y)}px)`;
    this.biteButton.style.width = `${width}px`;
    this.biteButton.style.height = `${height}px`;
    this.biteButton.style.marginLeft = `${-width / 2}px`;
    this.biteButton.style.marginTop = `${-height / 2}px`;
  }

  private publishAnnouncement(message: string): void {
    const version = ++this.announcementVersion;
    this.live.textContent = '';
    queueMicrotask(() => {
      if (this.disposed || version !== this.announcementVersion) return;
      this.live.textContent = message;
    });
  }

  private cancelAnnouncement(): void {
    this.announcementVersion += 1;
    this.live.textContent = '';
  }

  private issueCast(clientX?: number, clientY?: number): void {
    if (this.currentMode !== 'aiming' || this.castIssued || this.paused) return;
    this.castIssued = true;
    let accepted = false;
    if (clientX === undefined || clientY === undefined) {
      accepted = this.onCast(null);
    } else {
      const bounds = this.mount.getBoundingClientRect();
      accepted = this.onCast({ x: clientX - bounds.left, y: clientY - bounds.top });
    }
    if (!accepted) this.castIssued = false;
  }

  private issueReel(): void {
    if (this.currentMode !== 'bite' || this.reelIssued || this.paused) return;
    this.reelIssued = true;
    if (!this.onReel()) this.reelIssued = false;
  }

  private positionResult(): void {
    const rootBounds = this.coordinateRoot.getBoundingClientRect();
    const viewportWidth = Math.max(
      1,
      rootBounds.width || this.coordinateRoot.clientWidth || window.innerWidth,
    );
    const viewportHeight = Math.max(
      1,
      rootBounds.height || this.coordinateRoot.clientHeight || window.innerHeight,
    );
    const maximumWidth = Math.max(1, viewportWidth - ROUTINE_DIALOG_MARGIN * 2);
    const maximumHeight = Math.max(1, viewportHeight - ROUTINE_DIALOG_MARGIN * 2);
    const cardWidth = Math.min(360, maximumWidth);
    const cardHeight = Math.min(250, maximumHeight);
    const target = this.resultDialogTarget(viewportWidth, viewportHeight);
    const [horizontalPlacement, unclampedX] = this.horizontalDialogPosition(
      target.x, target.width, cardWidth, viewportWidth,
    );
    const [verticalPlacement, unclampedY] = this.verticalDialogPosition(
      target.y, target.height, cardHeight, viewportHeight,
    );
    const x = Math.min(
      viewportWidth - ROUTINE_DIALOG_MARGIN - cardWidth,
      Math.max(ROUTINE_DIALOG_MARGIN, unclampedX),
    );
    const y = Math.min(
      viewportHeight - ROUTINE_DIALOG_MARGIN - cardHeight,
      Math.max(ROUTINE_DIALOG_MARGIN, unclampedY),
    );
    this.resultRoot.style.setProperty('--routine-x', `${Math.round(x)}px`);
    this.resultRoot.style.setProperty('--routine-y', `${Math.round(y)}px`);
    this.resultRoot.style.setProperty('--routine-width', `${Math.round(cardWidth)}px`);
    this.resultRoot.dataset.placement = horizontalPlacement;
    this.resultRoot.dataset.verticalPlacement = verticalPlacement;
    this.resultRoot.dataset.anchorState = target.projected ? 'projected' : 'fallback';
  }

  private resultDialogTarget(viewportWidth: number, viewportHeight: number): {
    readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly projected: boolean;
  } {
    const target = this.resultTarget?.visible === true ? this.resultTarget : this.fallbackAnchor();
    if (target?.visible !== true) return { x: viewportWidth * 0.7, y: viewportHeight * 0.55, width: 0, height: 0, projected: false };
    const hitArea = this.resultTarget?.visible === true
      ? this.resultTarget
      : (target as BoatInteractionAnchor).hitArea ?? { width: 54, height: 54, depth: 0 };
    return { x: target.x, y: target.y, width: hitArea.width, height: hitArea.height, projected: true };
  }

  private horizontalDialogPosition(anchorX: number, hitWidth: number, cardWidth: number, viewportWidth: number): readonly ['left' | 'right', number] {
    const right = anchorX + hitWidth / 2 + ROUTINE_DIALOG_GAP;
    const left = anchorX - hitWidth / 2 - ROUTINE_DIALOG_GAP - cardWidth;
    return right + cardWidth <= viewportWidth - ROUTINE_DIALOG_MARGIN || left < ROUTINE_DIALOG_MARGIN
      ? ['right', right] : ['left', left];
  }

  private verticalDialogPosition(anchorY: number, hitHeight: number, cardHeight: number, viewportHeight: number): readonly ['above' | 'below' | 'center', number] {
    const centered = anchorY - cardHeight / 2;
    if (centered >= ROUTINE_DIALOG_MARGIN && centered + cardHeight <= viewportHeight - ROUTINE_DIALOG_MARGIN) return ['center', centered];
    const below = anchorY + hitHeight / 2 + ROUTINE_DIALOG_GAP;
    if (below + cardHeight <= viewportHeight - ROUTINE_DIALOG_MARGIN) return ['below', below];
    const above = anchorY - hitHeight / 2 - ROUTINE_DIALOG_GAP - cardHeight;
    if (above >= ROUTINE_DIALOG_MARGIN) return ['above', above];
    return anchorY < viewportHeight / 2 ? ['below', below] : ['above', above];
  }

  private readonly handleInteractionClick = (event: MouseEvent): void => {
    if (this.disposed || !this.canUseInteraction()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-fishing-view-exit]') !== null) {
      this.onExit();
      return;
    }
    if (target.closest('[data-fishing-bite]') !== null) {
      this.issueReel();
      return;
    }
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.issueCast(event.clientX, event.clientY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const target = event.target;
    if (
      this.disposed
      || !(target instanceof Element)
      || !this.interactionRoot.contains(target)
      || target.closest('[data-fishing-bite]') !== null
      || target.closest('[data-fishing-view-exit]') !== null
      || !this.canUseInteraction()
      || this.currentMode !== 'aiming'
    ) return;
    this.suppressClick = true;
    this.issueCast(event.clientX, event.clientY);
    queueMicrotask(() => { this.suppressClick = false; });
  };

  private readonly handleResultClick = (event: MouseEvent): void => {
    const target = event.target;
    if (
      this.disposed
      || this.continueIssued
      || !this.canUseResult()
      || !(target instanceof Element)
      || target.closest('[data-fishing-result-continue]') === null
    ) return;
    this.continueIssued = true;
    this.onContinue();
  };

  private readonly handleWindowResize = (): void => {
    this.refreshResultPlacement();
  };
}
