import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import type { ScavengeEndingStage } from '../game/scavengeEnding';
import { SCAVENGE_DURATION_SECONDS } from '../game/scavengeRules';
import type { SinkingState } from '../game/sinking';
import { createElementRequirement } from './dom';
import { formatDuration } from './formatDuration';
import { itemThumbnailUrl } from './itemThumbnailManifest';
import { uiArtwork } from './uiArtwork';

const requireElement = createElementRequirement('UI');

export type ScavengePresentation = 'title' | 'intro' | 'playing';

export interface ScavengeItemTooltip {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly placement: 'above' | 'below';
}

export class GameUI {
  onStart: () => void = () => undefined;
  onResume: () => void = () => undefined;
  onReplay: () => void = () => undefined;
  private readonly root: HTMLDivElement;
  private readonly hud: HTMLElement;
  private readonly introSkip: HTMLElement;
  private readonly startLayer: HTMLElement;
  private readonly howToPlayLayer: HTMLElement;
  private readonly pauseLayer: HTMLElement;
  private readonly endingLayer: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly itemTooltip: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly pickupPointer: HTMLElement;
  private readonly carrySlots: readonly HTMLElement[];
  private readonly carryTypes: [ItemId | null, ItemId | null, ItemId | null] =
    [null, null, null];
  private readonly startButton: HTMLButtonElement;
  private readonly howToPlayButton: HTMLButtonElement;
  private readonly howToPlayClose: HTMLButtonElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly endingAction: HTMLButtonElement;
  private readonly pointerLockErrors: HTMLElement[];
  private disposed = false;
  private howToPlayOpen = false;
  private replayHandled = false;
  private endingStage: ScavengeEndingStage = 'playing';
  private renderedTimerSecond = SCAVENGE_DURATION_SECONDS;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.innerHTML = `
      <div class="ui-treatment" aria-hidden="true"></div>
      <div class="hud illustrated-hud ui-role-context" data-hud>
        <div class="crosshair" data-crosshair aria-hidden="true"></div>
        <div class="pickup-pointer" data-pickup-pointer aria-hidden="true">
          <svg class="pickup-pointer__art" viewBox="0 0 40 46" focusable="false">
            <path class="pickup-pointer__hand" d="M14 27V7c0-3 1.7-5 4-5s4 2 4 5v12-8c0-2.5 1.6-4.3 3.8-4.3s3.8 1.8 3.8 4.3v10-6c0-2.4 1.5-4.1 3.5-4.1s3.6 1.7 3.6 4.1v11c0 9.4-6 16-15 16h-2c-6 0-10.3-3.1-13.2-8.2l-5-8.8c-1.2-2.2-.4-4.4 1.7-5.4 2-1 4.1-.2 5.3 1.8z"/>
            <path class="pickup-pointer__cuff" d="M12 38c4 3.5 12.5 4.3 18.5.3l.5 6.2H12.5z"/>
            <path class="pickup-pointer__crease" d="M17.8 10v15m7.9-10v9m7.4-6v7M9 27c3 0 5.8 1.4 7.8 4"/>
          </svg>
        </div>
        <div class="prompt brush-label ui-role-context" data-prompt aria-live="polite"></div>
        <div class="boat-tooltip scavenge-tooltip ui-role-context" data-item-tooltip role="tooltip"></div>
        <div class="carried" data-carried>
          <div class="weight-circles__row" data-carried-items data-carry-weight aria-hidden="true"><span class="weight-circle" data-weight-circle></span><span class="weight-circle" data-weight-circle></span><span class="weight-circle" data-weight-circle></span></div>
        </div>
        <div class="timer-block pocket-watch">
          ${uiArtwork('watch', 'pocket-watch__art')}
          <strong class="ui-role-numeral" data-timer>${formatDuration(SCAVENGE_DURATION_SECONDS)}</strong>
        </div>
      </div>
      <div class="intro-skip brush-label ui-role-context" data-intro-skip hidden>
        <kbd>SPACE</kbd><span aria-hidden="true"> - </span>SKIP INTRO
      </div>
      <section class="screen is-visible start-screen poster-screen" data-start>
        <button type="button" class="how-to-play-marker ui-role-context" data-how-to-play-open
          aria-label="Open How to Play" aria-haspopup="dialog" aria-controls="how-to-play-dialog">
          ${uiArtwork('howToPlay', 'how-to-play-marker__art')}
          <span>HOW TO PLAY</span>
        </button>
        <div class="screen__content">
          <div class="start-screen__top">
            <h1 class="ui-role-display">DON'T SLEEP WITH THE FISHES</h1>
          </div>
          <div class="start-screen__action">
            <button type="button" class="primary-action salvage-action ui-role-context" data-start-button aria-label="Start">
              START
            </button>
            <p class="input-error illustrated-warning ui-role-narrative" data-pointer-lock-error aria-live="polite">
              ${uiArtwork('warning', 'illustrated-warning__art')}
              <span data-pointer-lock-error-copy></span>
            </p>
          </div>
        </div>
      </section>
      <section class="screen how-to-play-screen poster-screen" data-how-to-play
        id="how-to-play-dialog" role="dialog" aria-modal="true" aria-hidden="true"
        aria-labelledby="how-to-play-title" aria-describedby="how-to-play-intro" inert>
        <div class="screen__content how-to-play-board">
          <header class="how-to-play-board__header">
            <p class="kicker ui-role-context">BEFORE THE WATER WINS</p>
            <h2 class="ui-role-display" id="how-to-play-title">HOW TO PLAY</h2>
            <p class="lead ui-role-narrative" id="how-to-play-intro">
              Save supplies from Dorothy. Then survive in the lifeboat until rescue finds you.
            </p>
          </header>
          <div class="how-to-play-route">
            <article class="how-to-play-step">
              <span class="how-to-play-step__number ui-role-numeral" aria-hidden="true">1</span>
              <div>
                <h3 class="ui-role-context">SEARCH THE SHIP</h3>
                <p class="ui-role-narrative">You have two minutes before Dorothy sinks.</p>
                <ul class="ui-role-narrative">
                  <li>Find food, tools, and emergency supplies.</li>
                  <li>Carry up to three weight at one time.</li>
                  <li>Throw supplies into the lifeboat. Only saved items continue.</li>
                  <li>Reach the lifeboat before the ship goes under.</li>
                </ul>
              </div>
            </article>
            <article class="how-to-play-step">
              <span class="how-to-play-step__number ui-role-numeral" aria-hidden="true">2</span>
              <div>
                <h3 class="ui-role-context">SURVIVE THE SEA</h3>
                <p class="ui-role-narrative">Use your supplies and the boat before each night begins.</p>
                <ul class="ui-role-narrative">
                  <li>Protect Health, Food, Energy, and Hull.</li>
                  <li>Click the rod, toolbox, lantern, or saved supplies to act.</li>
                  <li>The lantern ends the day. Night events test your choices.</li>
                  <li>Rescue becomes more likely as the days pass.</li>
                </ul>
              </div>
            </article>
          </div>
          <section class="how-to-play-controls" aria-labelledby="how-to-play-controls-title">
            <h3 class="ui-role-context" id="how-to-play-controls-title">CONTROLS</h3>
            <dl class="controls how-to-play-controls__grid ui-role-context" aria-label="Game controls">
              <div>
                <dt>MOVE</dt>
                <dd class="control-keys control-keys--move"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dd>
              </div>
              <div><dt>LOOK</dt><dd class="control-keys"><kbd>MOUSE</kbd></dd></div>
              <div><dt>SPRINT</dt><dd class="control-keys"><kbd>SHIFT</kbd></dd></div>
              <div><dt>JUMP</dt><dd class="control-keys"><kbd>SPACE</kbd></dd></div>
              <div><dt>USE / TAKE</dt><dd class="control-keys"><kbd>LEFT CLICK</kbd></dd></div>
              <div><dt>PAUSE</dt><dd class="control-keys"><kbd>ESC</kbd></dd></div>
            </dl>
            <p class="how-to-play-note ui-role-narrative">
              In the lifeboat, use the mouse or <kbd>TAB</kbd>. Press <kbd>ENTER</kbd> or <kbd>SPACE</kbd> to choose.
            </p>
          </section>
          <button type="button" class="primary-action salvage-action ui-role-context" data-how-to-play-close>
            BACK TO THE TITLE
          </button>
        </div>
      </section>
      <section class="screen pause-screen poster-screen" data-pause>
        <div class="screen__content">
          <p class="kicker ui-role-context">THE CLOCK IS STILL</p>
          <h2 class="ui-role-display">Back to the deck?</h2>
          <p class="lead ui-role-narrative">The countdown is stopped while the mouse is released.</p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-resume-button aria-label="Resume">
            RESUME
          </button>
          <p class="input-error illustrated-warning ui-role-narrative" data-pointer-lock-error aria-live="polite">
            ${uiArtwork('warning', 'illustrated-warning__art')}
            <span data-pointer-lock-error-copy></span>
          </p>
        </div>
      </section>
      <section class="screen scavenge-ending-screen poster-screen"
        data-ending role="dialog" aria-modal="true" aria-hidden="true" inert>
        <div class="screen__content">
          <p class="kicker ui-role-context">ENDING I</p>
          <h2 class="ui-role-display" data-ending-title tabindex="-1">SUNK WITH DOROTHY</h2>
          <p class="lead ui-role-narrative">You stayed aboard for one trip too many.</p>
          <button type="button" class="primary-action salvage-action ui-role-context"
            data-ending-action hidden>BACK TO MAIN MENU</button>
        </div>
      </section>
    `;
    mount.append(this.root);
    this.hud = requireElement(this.root, '.hud');
    this.introSkip = requireElement(this.root, '[data-intro-skip]');
    this.startLayer = requireElement(this.root, '[data-start]');
    this.howToPlayLayer = requireElement(this.root, '[data-how-to-play]');
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.endingLayer = requireElement(this.root, '[data-ending]');
    this.clock = requireElement(this.root, '.pocket-watch');
    this.timer = requireElement(this.root, '[data-timer]');
    this.prompt = requireElement(this.root, '[data-prompt]');
    this.itemTooltip = requireElement(this.root, '[data-item-tooltip]');
    this.crosshair = requireElement(this.root, '[data-crosshair]');
    this.pickupPointer = requireElement(this.root, '[data-pickup-pointer]');
    this.carrySlots = [...this.root.querySelectorAll<HTMLElement>('[data-weight-circle]')];
    if (this.carrySlots.length !== 3) throw new Error('Carry HUD requires three weight slots');
    this.startButton = requireElement(this.root, '[data-start-button]');
    this.howToPlayButton = requireElement(this.root, '[data-how-to-play-open]');
    this.howToPlayClose = requireElement(this.root, '[data-how-to-play-close]');
    this.resumeButton = requireElement(this.root, '[data-resume-button]');
    this.endingAction = requireElement(this.root, '[data-ending-action]');
    this.pointerLockErrors = [...this.root.querySelectorAll<HTMLElement>('[data-pointer-lock-error]')];
    this.startButton.addEventListener('click', this.handleStart);
    this.howToPlayButton.addEventListener('click', this.handleHowToPlayOpen);
    this.howToPlayClose.addEventListener('click', this.handleHowToPlayClose);
    this.root.addEventListener('keydown', this.handleKeyDown);
    this.resumeButton.addEventListener('click', this.handleResume);
    this.endingAction.addEventListener('click', this.handleReplay);
    this.setPresentation('title');
  }

  hideStart(): void {
    this.setHowToPlayOpen(false, false);
    this.startLayer.classList.remove('is-visible');
  }

  setPresentation(presentation: ScavengePresentation): void {
    this.root.dataset.presentation = presentation;
    this.hud.hidden = presentation !== 'playing';
    this.introSkip.hidden = presentation !== 'intro';
  }

  setPaused(paused: boolean): void {
    this.pauseLayer.classList.toggle('is-visible', paused);
    this.pauseLayer.setAttribute('aria-hidden', String(!paused));
    this.pauseLayer.toggleAttribute('inert', !paused);
    if (paused) this.resumeButton.focus();
  }

  clearPointerLockError(): void {
    this.pointerLockErrors.forEach((element) => {
      requireElement<HTMLElement>(element, '[data-pointer-lock-error-copy]').textContent = '';
      element.classList.remove('is-visible');
    });
  }

  showPointerLockError(): void {
    this.pointerLockErrors.forEach((element) => {
      requireElement<HTMLElement>(element, '[data-pointer-lock-error-copy]').textContent = 'Mouse look was blocked. Click the button and allow pointer lock to continue.';
      element.classList.add('is-visible');
    });
  }

  setPrompt(text: string): void {
    if (this.prompt.textContent === text) return;
    this.prompt.textContent = text;
    this.prompt.classList.toggle('is-visible', text.length > 0);
  }

  setItemTooltip(tooltip: ScavengeItemTooltip | null): void {
    const visible = tooltip !== null && tooltip.text.length > 0;
    if (tooltip !== null) {
      this.setPrompt('');
      if (this.itemTooltip.textContent !== tooltip.text) {
        this.itemTooltip.textContent = tooltip.text;
      }
      this.itemTooltip.style.left = `${tooltip.x}px`;
      this.itemTooltip.style.top = `${tooltip.y}px`;
      this.itemTooltip.dataset.placement = tooltip.placement;
    }
    this.itemTooltip.classList.toggle('is-visible', visible);
  }

  setPickupPointer(visible: boolean): void {
    this.pickupPointer.classList.toggle('is-visible', visible);
    this.crosshair.classList.toggle('is-pickup-hidden', visible);
  }

  render(snapshot: ScavengeSnapshot): void {
    const timerSecond = Math.max(0, Math.ceil(snapshot.remainingSeconds));
    if (timerSecond !== this.renderedTimerSecond) {
      this.renderedTimerSecond = timerSecond;
      this.clock.dataset.tick = String(timerSecond % 2);
    }
    this.timer.textContent = formatDuration(snapshot.remainingSeconds);
    this.timer.classList.toggle('is-critical', snapshot.remainingSeconds <= 30);
    this.renderCarry(snapshot);
  }

  renderEnding(stage: ScavengeEndingStage, blackout: number): void {
    const visible = stage === 'endingHold' || stage === 'menuReady';
    const revealAction = stage === 'menuReady';
    this.root.style.setProperty('--scavenge-ending-blackout', String(Math.min(1, Math.max(0, blackout))));
    this.hud.hidden = stage !== 'playing' || this.root.dataset.presentation !== 'playing';
    if (stage !== 'playing') this.setPaused(false);
    this.endingLayer.classList.toggle('is-visible', visible);
    this.endingLayer.setAttribute('aria-hidden', String(!visible));
    this.endingLayer.toggleAttribute('inert', !visible);
    this.endingAction.hidden = !revealAction;
    if (revealAction && this.endingStage !== 'menuReady') this.endingAction.focus();
    this.endingStage = stage;
  }

  showCompatibilityError(message: string): void {
    this.startLayer.classList.add('is-visible', 'has-compatibility-error');
    requireElement<HTMLElement>(this.startLayer, '.lead').textContent = message;
    requireElement<HTMLButtonElement>(this.startLayer, '[data-start-button]').hidden = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.startButton.removeEventListener('click', this.handleStart);
    this.howToPlayButton.removeEventListener('click', this.handleHowToPlayOpen);
    this.howToPlayClose.removeEventListener('click', this.handleHowToPlayClose);
    this.root.removeEventListener('keydown', this.handleKeyDown);
    this.resumeButton.removeEventListener('click', this.handleResume);
    this.endingAction.removeEventListener('click', this.handleReplay);
    this.onStart = () => undefined;
    this.onResume = () => undefined;
    this.onReplay = () => undefined;
    this.root.remove();
  }

  private renderCarry(snapshot: ScavengeSnapshot): void {
    let slotIndex = 0;
    for (const { type } of snapshot.carriedItems) {
      for (let unit = 0; unit < ITEM_DEFINITIONS[type].weight && slotIndex < 3; unit += 1) {
        this.updateCarrySlot(slotIndex, type);
        slotIndex += 1;
      }
    }
    while (slotIndex < 3) {
      this.updateCarrySlot(slotIndex, null);
      slotIndex += 1;
    }
  }

  private updateCarrySlot(index: number, type: ItemId | null): void {
    if (this.carryTypes[index] === type) return;
    this.carryTypes[index] = type;
    const circle = this.carrySlots[index]!;
    circle.replaceChildren();
    circle.classList.toggle('is-filled', type !== null);
    circle.classList.remove('has-image-error');
    if (type === null) {
      delete circle.dataset.itemType;
      return;
    }
    circle.dataset.itemType = type;
    const image = document.createElement('img');
    image.className = 'weight-circle__thumbnail';
    image.src = itemThumbnailUrl(type);
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('error', () => {
      image.hidden = true;
      circle.classList.add('has-image-error');
    }, { once: true });
    circle.append(image);
  }

  private readonly handleStart = (): void => this.onStart();
  private readonly handleHowToPlayOpen = (): void => this.setHowToPlayOpen(true);
  private readonly handleHowToPlayClose = (): void => this.setHowToPlayOpen(false);
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.howToPlayOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.setHowToPlayOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.howToPlayClose.focus();
    }
  };

  private setHowToPlayOpen(open: boolean, restoreFocus = true): void {
    if (this.disposed || this.howToPlayOpen === open) return;
    this.howToPlayOpen = open;
    this.howToPlayLayer.classList.toggle('is-visible', open);
    this.howToPlayLayer.setAttribute('aria-hidden', String(!open));
    this.howToPlayLayer.toggleAttribute('inert', !open);
    this.startLayer.toggleAttribute('inert', open);
    if (open) this.howToPlayClose.focus();
    else if (restoreFocus) this.howToPlayButton.focus();
  }

  private readonly handleResume = (): void => this.onResume();
  private readonly handleReplay = (): void => {
    if (this.replayHandled) return;
    this.replayHandled = true;
    this.onReplay();
  };
}
