import { onLanguageChange } from '../i18n/language';
import { mobileUiText } from '../i18n/mobileUiMessages';
import { flowText } from '../i18n/flowMessages';
import { prefersTouchControls } from '../browser/deviceCapabilities';
import { refreshUiText } from './translatedText';
import { uiText } from '../i18n/uiMessages';
import { uiDynamic } from '../i18n/uiDynamicMessages';
import { ITEM_LABELS, type ItemId } from '../game/ItemState';
import { itemThumbnailUrl } from './itemThumbnailManifest';
import type { ProjectedBoatBounds } from '../survival/BoatInteraction';
import { createElementRequirement } from './dom';
import {
  runCleanupSteps,
  settleAfterCleanup,
  throwCleanupFailure,
} from './UiCleanup';
import { returnArrowArtwork } from './uiArtwork';

const FISHING_FADE_MS = 180;
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

  onTouchInterrupt: () => void = () => undefined;
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
  private readonly biteLabel: HTMLElement;
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
  private readonly pointerStarts = new Map<number, { x: number; y: number; cast: boolean; button: Element | null }>();
  private pointerCastTime = 0;
  private pointerCastX = 0;
  private pointerCastY = 0;
  private pointerCastTarget: EventTarget | null = null;
  private seenTouch = false;
  private paused = false;
  private announcementVersion = 0;
  private pendingFade: PendingFade | null = null;
  private continueIssued = false;
  private readonly unsubscribeLanguage: () => void;
  private refreshLanguage(): void {
    refreshUiText(...this.roots);
    this.biteLabel.textContent = mobileUiText('reel');
    if (this.currentState !== null) this.applyStateMessage(this.currentState);
    if (this.currentResult !== null) this.renderResult(this.currentResult);
  }

  private disposed = false;

  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="fishing-layer" data-fishing role="region" data-ui-aria="fishingInteraction" aria-label="${uiText('fishingInteraction')}" aria-hidden="true" inert tabindex="-1">
        <div class="survival-announcer" data-fishing-live aria-live="polite" aria-atomic="true"></div>
        <p class="fishing-instruction ui-role-context" data-fishing-message hidden></p>
        <button type="button" class="fishing-bite-target" data-fishing-bite data-ui-aria="biteReel" aria-label="${uiText('biteReel')}" hidden><span data-mobile-reel>${mobileUiText('reel')}</span></button>
        <button type="button" class="fishing-view-exit ui-role-context" data-fishing-view-exit data-ui-aria="returnBoatView" aria-label="${uiText('returnBoatView')}" hidden>
          ${returnArrowArtwork('fishing-view-exit__arrow')}
        </button>
      </section>
      <div class="fishing-fade" data-fishing-fade aria-hidden="true"></div>
      <section class="dive-result" data-fishing-result role="dialog" aria-modal="true" aria-hidden="true" data-ui-aria="fishingResult" aria-label="${uiText('fishingResult')}" inert>
        <div class="dive-result__paper fishing-result-card scuba-popup-paper">
          <header class="popup-header">
            <button type="button" class="popup-header__close" data-fishing-result-close data-ui-aria="closeFishing" aria-label="${uiText('closeFishing')}"></button>
            <h2 class="dive-result__title scuba-popup-title ui-role-display" data-ui-text="fishingResult">${uiText('fishingResult')}</h2>
          </header>
          <div class="dive-result__rewards fishing-result-items" data-fishing-result-items></div>
          <p class="dive-result__lines ui-role-numeral" data-fishing-result-message hidden></p>
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
    this.biteLabel = requireElement(this.biteButton, '[data-mobile-reel]');
    this.exitButton = requireElement(this.interactionRoot, '[data-fishing-view-exit]');
    this.resultItems = requireElement(this.resultRoot, '[data-fishing-result-items]');
    this.resultMessage = requireElement(this.resultRoot, '[data-fishing-result-message]');
    this.resultClose = requireElement(this.resultRoot, '[data-fishing-result-close]');
    this.interactionRoot.addEventListener('click', this.handleInteractionClick);
    this.interactionRoot.addEventListener('pointerdown', this.handlePointerDown);
    this.interactionRoot.addEventListener('pointerup', this.handlePointerUp);
    this.interactionRoot.addEventListener('pointercancel', this.handlePointerCancel);
    this.interactionRoot.addEventListener('lostpointercapture', this.handlePointerCancel);
    this.resultRoot.addEventListener('click', this.handleResultClick);
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

    if (modeChanged) this.resetModeInput(state.mode);

    this.currentMode = state.mode;
    this.interactionRoot.dataset.mode = state.mode;
    if (messageChanged || modeChanged) this.applyStateMessage(state);
    if (targetChanged || modeChanged) this.renderTarget(state.biteTarget);

    if (state.mode === 'hidden') this.onInteractionHide();
    else this.onInteractionShow();
    return true;
  }

  private resetModeInput(mode: FishingUiMode): void {
    this.castIssued = false;
    this.reelIssued = false;
    if (mode === 'hidden' || mode === 'result') this.clearTouchInput();
    else {
      // Keep ownership until release, but do not cast from a previous mode's touch.
      for (const start of this.pointerStarts.values()) {
        start.cast = false;
        start.button = null;
      }
      this.pointerCastTime = 0;
      this.pointerCastTarget = null;
    }
  }

  clearTouchInput(): void {
    this.pointerStarts.clear();
    this.pointerCastTime = 0;
    this.pointerCastTarget = null;
  }

  private applyStateMessage(state: FishingUiState): void {
    this.message = state.message;
    const touch = this.seenTouch || prefersTouchControls();
    this.visibleMessage.textContent = touch && state.mode === 'aiming'
      ? state.message === flowText('netCast') ? mobileUiText('netCast') : mobileUiText('cast')
      : state.message;
    this.visibleMessage.hidden = state.mode === 'hidden'
      || state.mode === 'result'
      || state.message.length === 0;
    this.live.setAttribute('aria-live', state.mode === 'bite' ? 'assertive' : 'polite');
    if (state.mode === 'hidden') this.cancelAnnouncement();
    else this.publishAnnouncement(this.visibleMessage.textContent ?? '');
  }

  setPaused(paused: boolean): void {
    if (this.disposed) return;
    this.paused = paused;
    if (paused) this.clearTouchInput();
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
    this.onResultShow();
  }

  hideResult(): void {
    if (this.disposed) return;
    this.currentResult = null;
    this.onResultHide();
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
      entry.setAttribute('aria-label', quantity === 1 ? name : `${name}: ${amount}`);
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
      const copy = document.createElement('span');
      copy.className = 'dive-result__reward-copy';
      const label = document.createElement('strong');
      label.className = 'dive-result__reward-name ui-role-context';
      label.textContent = name;
      label.setAttribute('aria-hidden', 'true');
      copy.append(label);
      if (quantity !== 1) {
        const count = document.createElement('span');
        count.className = 'dive-result__reward-quantity ui-role-numeral';
        count.textContent = amount;
        count.setAttribute('aria-hidden', 'true');
        copy.append(count);
      }
      entry.append(art, copy);
      return entry;
    }));
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
      () => this.interactionRoot.removeEventListener('pointerdown', this.handlePointerDown),
      () => this.interactionRoot.removeEventListener('pointerup', this.handlePointerUp),
      () => this.interactionRoot.removeEventListener('pointercancel', this.handlePointerCancel),
      () => this.interactionRoot.removeEventListener('lostpointercapture', this.handlePointerCancel),
      () => this.resultRoot.removeEventListener('click', this.handleResultClick),
    ]));
  }

  resetCallbacksForDispose(): void {
    this.onTouchInterrupt = () => undefined;
    this.clearTouchInput();
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
    const width = Math.max(48, Math.round(this.target.width));
    const height = Math.max(48, Math.round(this.target.height));
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
      const bounds = this.interactionRoot.getBoundingClientRect();
      accepted = this.onCast({ x: clientX - bounds.left, y: clientY - bounds.top });
    }
    if (!accepted) this.castIssued = false;
  }

  private issueReel(): void {
    if (this.currentMode !== 'bite' || this.reelIssued || this.paused) return;
    this.reelIssued = true;
    if (!this.onReel()) this.reelIssued = false;
  }

  private readonly handleInteractionClick = (event: MouseEvent): void => {
    if (this.disposed || !this.canUseInteraction()) return;
    const target = event.target;
    if (!(target instanceof Element) || this.ignoreGeneratedPointerClick(event)) return;
    if (target.closest('[data-fishing-view-exit]') !== null) {
      this.onExit();
      return;
    }
    if (target.closest('[data-fishing-bite]') !== null) {
      this.issueReel();
      return;
    }
    this.issueCast(event.clientX, event.clientY);
  };

  private ignoreGeneratedPointerClick(event: MouseEvent): boolean {
    const source = event as MouseEvent & {
      pointerType?: string;
      sourceCapabilities?: { firesTouchEvents?: boolean };
    };
    if (source.pointerType === 'touch' || source.sourceCapabilities?.firesTouchEvents === true) return true;
    if (this.pointerCastTime === 0
      || Date.now() - this.pointerCastTime >= 700
      || event.target !== this.pointerCastTarget
      || Math.hypot(event.clientX - this.pointerCastX, event.clientY - this.pointerCastY) >= 30) return false;
    this.pointerCastTime = 0;
    this.pointerCastTarget = null;
    return true;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerStarts.delete(event.pointerId);
    if (this.disposed || this.paused || !this.canUseInteraction()
      || this.currentMode === 'hidden' || this.currentMode === 'result') return;
    this.pointerCastTime = 0;
    this.pointerCastTarget = null;
    this.pointerStarts.set(event.pointerId, {
      x: event.clientX, y: event.clientY,
      cast: this.currentMode === 'aiming' && event.target === this.interactionRoot,
      button: event.target instanceof Element ? event.target.closest('button') : null,
    });
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || !this.pointerStarts.has(event.pointerId)) return;
    this.clearTouchInput();
    this.onTouchInterrupt();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerStarts.get(event.pointerId);
    this.pointerStarts.delete(event.pointerId);
    this.recordPointerClick(event);
    const target = event.target;
    if (this.disposed || this.paused || !this.canUseInteraction()
      || start === undefined
      || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
    if (this.issuePointerButton(event, start.button)) return;
    if (target !== this.interactionRoot || this.currentMode !== 'aiming' || !start.cast) return;
    if (event.pointerType === 'touch') {
      this.seenTouch = true;
      if (this.currentState !== null) this.applyStateMessage(this.currentState);
    }
    this.issueCast(event.clientX, event.clientY);
  };

  private recordPointerClick(event: PointerEvent): void {
    if (event.pointerType !== 'touch' && event.target !== this.interactionRoot) return;
    this.pointerCastTime = Date.now();
    this.pointerCastX = event.clientX;
    this.pointerCastY = event.clientY;
    this.pointerCastTarget = event.target;
  }

  private issuePointerButton(event: PointerEvent, button: Element | null): boolean {
    if (event.pointerType !== 'touch' || button === null
      || !(event.target instanceof Element) || event.target.closest('button') !== button) return false;
    if (button === this.biteButton) this.issueReel();
    else if (button === this.exitButton) this.onExit();
    return true;
  }

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
}
