import { onLanguageChange } from '../i18n/language';
import { refreshUiText } from './translatedText';
import { uiText } from '../i18n/uiMessages';
import { uiDynamic } from '../i18n/uiDynamicMessages';
import { ITEM_LABELS, type ItemId } from '../game/ItemState';
import { itemThumbnailUrl } from './itemThumbnailManifest';
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

export type FishingUiMode = 'hidden' | 'aiming' | 'waiting' | 'bite' | 'result';

export interface FishingUiState {
  readonly mode: FishingUiMode;
  readonly message: string;
  readonly biteTarget: ProjectedBoatBounds | null;
}

export interface FishingResultView {
  readonly items: readonly {
    readonly itemId: ItemId;
    readonly quantity: number;
    readonly condition: 'usable' | 'broken';
  }[];
  readonly message: string;
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
  readonly resultClose: HTMLButtonElement;

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
  private readonly resultItems: HTMLElement;
  private readonly resultMessage: HTMLElement;
  private currentMode: FishingUiMode = 'hidden';
  private currentState: FishingUiState | null = null;
  private currentResult: FishingResultView | null = null;
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
  private readonly unsubscribeLanguage: () => void;
  private refreshLanguage(): void {
    refreshUiText(...this.roots);
    if (this.currentState !== null) this.applyStateMessage(this.currentState);
    if (this.currentResult !== null) this.renderResult(this.currentResult);
  }

  private disposed = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly coordinateRoot: HTMLElement,
    private readonly fallbackAnchor: () => BoatInteractionAnchor | null,
  ) {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="fishing-layer" data-fishing role="region" data-ui-aria="fishingInteraction" aria-label="${uiText('fishingInteraction')}" aria-hidden="true" inert tabindex="-1">
        <div class="survival-announcer" data-fishing-live aria-live="polite" aria-atomic="true"></div>
        <p class="fishing-instruction ui-role-context" data-fishing-message hidden></p>
        <button type="button" class="fishing-bite-target" data-fishing-bite data-ui-aria="biteReel" aria-label="${uiText('biteReel')}" hidden></button>
        <button type="button" class="fishing-view-exit ui-role-context" data-fishing-view-exit data-ui-aria="returnBoatView" aria-label="${uiText('returnBoatView')}" hidden>
          ${returnArrowArtwork('fishing-view-exit__arrow')}
        </button>
      </section>
      <div class="fishing-fade" data-fishing-fade aria-hidden="true"></div>
      <section class="routine-dialog routine-dialog--fishing" data-fishing-result role="dialog" aria-modal="true" aria-hidden="true" data-ui-aria="fishingResult" aria-label="${uiText('fishingResult')}" inert>
        <div class="routine-dialog__card fishing-result-card scuba-popup-paper">
          <button type="button" class="dive-result__close ui-role-context" data-fishing-result-close data-ui-aria="closeFishing" aria-label="${uiText('closeFishing')}">&times;</button>
          <h2 class="dive-result__title scuba-popup-title ui-role-display" data-ui-text="fishingResult">${uiText('fishingResult')}</h2>
          <div class="dive-result__rewards fishing-result-items" data-fishing-result-items></div>
          <p class="ui-role-context" data-fishing-result-message hidden></p>
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
    this.resultItems = requireElement(this.resultRoot, '[data-fishing-result-items]');
    this.resultMessage = requireElement(this.resultRoot, '[data-fishing-result-message]');
    this.resultClose = requireElement(this.resultRoot, '[data-fishing-result-close]');
    this.interactionRoot.addEventListener('click', this.handleInteractionClick);
    this.interactionRoot.addEventListener('pointerup', this.handlePointerUp);
    this.resultRoot.addEventListener('click', this.handleResultClick);
    window.addEventListener('resize', this.handleWindowResize);
    this.unsubscribeLanguage = onLanguageChange(() => this.refreshLanguage());
    this.refreshLanguage();
  }

  mode(): FishingUiMode {
    return this.currentMode;
  }

  setState(state: FishingUiState): boolean {
    if (this.disposed) return false;
    this.currentState = state;
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
    this.currentResult = view;
    this.continueIssued = false;
    this.renderResult(view);
    this.resultTarget = view.catchTarget === null
      ? null
      : Object.freeze({ ...view.catchTarget });
    this.resultVisible = true;
    this.positionResult();
    this.onResultShow();
  }

  hideResult(): void {
    if (this.disposed) return;
    this.currentResult = null;
    this.onResultHide();
    this.resultVisible = false;
    this.resultTarget = null;
  }

  private renderResult(view: FishingResultView): void {
    this.resultMessage.textContent = view.message;
    this.resultMessage.hidden = view.message.length === 0;
    this.resultItems.hidden = view.items.length === 0;
    this.resultItems.replaceChildren(...view.items.map(({ itemId, quantity, condition }) => {
      const entry = document.createElement('span');
      entry.className = 'dive-result__reward-entry';
      entry.dataset.itemType = itemId;
      const name = condition === 'broken' ? uiDynamic('brokenItem', ITEM_LABELS[itemId]) : ITEM_LABELS[itemId];
      const amount = `${quantity > 0 ? '+' : '−'}${Math.abs(quantity)}`;
      entry.setAttribute('role', 'img');
      entry.setAttribute('aria-label', `${name}: ${amount}`);
      entry.title = name;
      const art = document.createElement('span');
      art.className = 'weight-circle is-filled dive-result__reward';
      art.dataset.itemType = itemId;
      art.setAttribute('aria-hidden', 'true');
      const thumbnail = document.createElement('img');
      thumbnail.className = 'weight-circle__thumbnail';
      thumbnail.src = itemThumbnailUrl(itemId);
      thumbnail.alt = '';
      thumbnail.decoding = 'async';
      thumbnail.draggable = false;
      art.append(thumbnail);
      const count = document.createElement('span');
      count.className = 'dive-result__reward-quantity ui-role-numeral';
      count.textContent = amount;
      count.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      copy.className = 'dive-result__reward-copy';
      const label = document.createElement('strong');
      label.className = 'dive-result__reward-name ui-role-context';
      label.textContent = name;
      label.setAttribute('aria-hidden', 'true');
      copy.append(label, count);
      entry.append(art, copy);
      return entry;
    }));
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
    return this.interactionRoot;
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    this.unsubscribeLanguage();
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
    const cardWidth = Math.min(480, maximumWidth);
    this.resultRoot.style.setProperty('--routine-width', `${Math.round(cardWidth)}px`);
    const card = this.resultItems.parentElement!;
    const cardHeight = Math.min(card.offsetHeight || 360, maximumHeight);
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
      || target.closest('[data-fishing-result-close]') === null
    ) return;
    this.continueIssued = true;
    this.onContinue();
  };

  private readonly handleWindowResize = (): void => {
    this.refreshResultPlacement();
  };
}
