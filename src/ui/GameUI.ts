import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import type { ScavengeEndingStage } from '../game/scavengeEnding';
import { SCAVENGE_DURATION_SECONDS } from '../game/scavengeRules';
import type { SinkingState } from '../game/sinking';
import { formatDuration } from './formatDuration';
import { itemArtwork, uiArtwork } from './uiArtwork';

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export type ScavengePresentation = 'title' | 'playing';

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
  private readonly startLayer: HTMLElement;
  private readonly pauseLayer: HTMLElement;
  private readonly endingLayer: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly itemTooltip: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly pickupPointer: HTMLElement;
  private readonly carriedItems: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly endingAction: HTMLButtonElement;
  private readonly pointerLockErrors: HTMLElement[];
  private disposed = false;
  private replayHandled = false;
  private endingStage: ScavengeEndingStage = 'playing';

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
          <div class="timer-block pocket-watch">
            ${uiArtwork('watch', 'pocket-watch__art')}
            <strong class="ui-role-numeral" data-timer>${formatDuration(SCAVENGE_DURATION_SECONDS)}</strong>
          </div>
        </div>
      </div>
      <section class="screen is-visible start-screen poster-screen" data-start>
        <div class="screen__content">
          <div class="start-screen__top">
            <h1 class="ui-role-display">DON'T SLEEP<br>WITH THE<br>FISHES</h1>
            <dl class="controls ui-role-context" aria-label="Controls">
              <div>
                <dt>MOVE</dt>
                <dd class="control-keys control-keys--move"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dd>
              </div>
              <div>
                <dt>LOOK</dt>
                <dd class="control-keys"><kbd>MOUSE</kbd></dd>
              </div>
              <div>
                <dt>SPRINT</dt>
                <dd class="control-keys"><kbd>SHIFT</kbd></dd>
              </div>
              <div>
                <dt>ACT</dt>
                <dd class="control-keys"><kbd>LEFT CLICK</kbd></dd>
              </div>
            </dl>
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
    this.startLayer = requireElement(this.root, '[data-start]');
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.endingLayer = requireElement(this.root, '[data-ending]');
    this.timer = requireElement(this.root, '[data-timer]');
    this.prompt = requireElement(this.root, '[data-prompt]');
    this.itemTooltip = requireElement(this.root, '[data-item-tooltip]');
    this.crosshair = requireElement(this.root, '[data-crosshair]');
    this.pickupPointer = requireElement(this.root, '[data-pickup-pointer]');
    this.carriedItems = requireElement(this.root, '[data-carried-items]');
    this.startButton = requireElement(this.root, '[data-start-button]');
    this.resumeButton = requireElement(this.root, '[data-resume-button]');
    this.endingAction = requireElement(this.root, '[data-ending-action]');
    this.pointerLockErrors = [...this.root.querySelectorAll<HTMLElement>('[data-pointer-lock-error]')];
    this.startButton.addEventListener('click', this.handleStart);
    this.resumeButton.addEventListener('click', this.handleResume);
    this.endingAction.addEventListener('click', this.handleReplay);
    this.setPresentation('title');
  }

  hideStart(): void {
    this.startLayer.classList.remove('is-visible');
  }

  setPresentation(presentation: ScavengePresentation): void {
    this.root.dataset.presentation = presentation;
    this.hud.hidden = presentation === 'title';
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
    this.timer.textContent = formatDuration(snapshot.remainingSeconds);
    this.timer.classList.toggle('is-critical', snapshot.remainingSeconds <= 30);
    this.renderCarry(snapshot);
  }

  renderEnding(stage: ScavengeEndingStage, blackout: number): void {
    const visible = stage === 'endingHold' || stage === 'menuReady';
    const revealAction = stage === 'menuReady';
    this.root.style.setProperty('--scavenge-ending-blackout', String(Math.min(1, Math.max(0, blackout))));
    this.hud.hidden = stage !== 'playing' || this.root.dataset.presentation === 'title';
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
    this.resumeButton.removeEventListener('click', this.handleResume);
    this.endingAction.removeEventListener('click', this.handleReplay);
    this.onStart = () => undefined;
    this.onResume = () => undefined;
    this.onReplay = () => undefined;
    this.root.remove();
  }

  private renderCarry(snapshot: ScavengeSnapshot): void {
    const filled = snapshot.carriedItems.flatMap(({ type }) => (
      Array.from({ length: ITEM_DEFINITIONS[type].weight }, () => type)
    )).slice(0, 3);
    const slots: Array<ItemId | null> = [...filled];
    while (slots.length < 3) slots.push(null);

    this.carriedItems.replaceChildren(...slots.map((type) => {
      const circle = document.createElement('span');
      circle.className = 'weight-circle';
      circle.dataset.weightCircle = '';
      if (type !== null) {
        circle.classList.add('is-filled');
        circle.dataset.itemType = type;
        circle.innerHTML = itemArtwork(type, 'weight-circle__art');
      }
      return circle;
    }));
  }

  private readonly handleStart = (): void => this.onStart();
  private readonly handleResume = (): void => this.onResume();
  private readonly handleReplay = (): void => {
    if (this.replayHandled) return;
    this.replayHandled = true;
    this.onReplay();
  };
}
