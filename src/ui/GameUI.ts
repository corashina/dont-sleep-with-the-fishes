import { ITEM_DEFINITIONS, ITEM_IDS, ITEM_LABELS, type ItemId } from '../game/ItemState';
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import type { SinkingState } from '../game/sinking';
import { formatDuration } from './formatDuration';
import { itemThumbnailUrl } from './itemThumbnailManifest';
import { uiArtwork } from './uiArtwork';

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
  private readonly failureLayer: HTMLElement;
  private readonly resultLayer: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly itemTooltip: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly pickupPointer: HTMLElement;
  private readonly carrySlots: readonly HTMLElement[];
  private readonly carryFull: HTMLElement;
  private readonly carryTypes: [ItemId | null, ItemId | null, ItemId | null] =
    [null, null, null];
  private carryWasFull = false;
  private readonly resultTitle: HTMLElement;
  private readonly resultBody: HTMLElement;
  private readonly resultItems: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly replayButton: HTMLButtonElement;
  private readonly pointerLockErrors: HTMLElement[];
  private disposed = false;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.innerHTML = `
      <div class="ui-treatment" aria-hidden="true"></div>
      <div class="hud illustrated-hud ui-role-context">
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
          <p class="carry-full ui-role-context" data-carry-full aria-live="polite"></p>
          <div class="timer-block pocket-watch">
            ${uiArtwork('watch', 'pocket-watch__art')}
            <strong class="ui-role-numeral" data-timer>02:00</strong>
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
      <section class="screen failure-screen poster-screen" data-failure aria-live="assertive">
        <div class="screen__content">
          ${uiArtwork('warning', 'failure-mark')}
          <p class="kicker ui-role-context">EVACUATION FAILED</p>
          <h2 class="ui-role-display">The ship is going under.</h2>
          <p class="lead ui-role-narrative">Hold on...</p>
        </div>
      </section>
      <section class="screen result-screen poster-screen" data-result>
        <div class="screen__content">
          <p class="kicker ui-role-context">THE SEA KEEPS SCORE</p>
          <h2 class="ui-role-display" data-result-title></h2>
          <p class="lead ui-role-narrative" data-result-body></p>
          <p class="result-items ui-role-numeral" data-result-items></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-replay-button aria-label="Try another route">
            TRY ANOTHER ROUTE
          </button>
        </div>
      </section>
    `;
    mount.append(this.root);
    this.hud = requireElement(this.root, '.hud');
    this.startLayer = requireElement(this.root, '[data-start]');
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.failureLayer = requireElement(this.root, '[data-failure]');
    this.resultLayer = requireElement(this.root, '[data-result]');
    this.timer = requireElement(this.root, '[data-timer]');
    this.prompt = requireElement(this.root, '[data-prompt]');
    this.itemTooltip = requireElement(this.root, '[data-item-tooltip]');
    this.crosshair = requireElement(this.root, '[data-crosshair]');
    this.pickupPointer = requireElement(this.root, '[data-pickup-pointer]');
    this.carrySlots = [...this.root.querySelectorAll<HTMLElement>('[data-weight-circle]')];
    if (this.carrySlots.length !== 3) throw new Error('Carry HUD requires three weight slots');
    this.carryFull = requireElement(this.root, '[data-carry-full]');
    this.resultTitle = requireElement(this.root, '[data-result-title]');
    this.resultBody = requireElement(this.root, '[data-result-body]');
    this.resultItems = requireElement(this.root, '[data-result-items]');
    this.startButton = requireElement(this.root, '[data-start-button]');
    this.resumeButton = requireElement(this.root, '[data-resume-button]');
    this.replayButton = requireElement(this.root, '[data-replay-button]');
    this.pointerLockErrors = [...this.root.querySelectorAll<HTMLElement>('[data-pointer-lock-error]')];
    this.startButton.addEventListener('click', this.handleStart);
    this.resumeButton.addEventListener('click', this.handleResume);
    this.replayButton.addEventListener('click', this.handleReplay);
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

  render(snapshot: ScavengeSnapshot, sinking: SinkingState): void {
    this.timer.textContent = formatDuration(snapshot.remainingSeconds);
    this.timer.classList.toggle('is-critical', snapshot.remainingSeconds <= 30);
    const severity = sinking.progress >= 0.75
      ? 'critical'
      : sinking.progress >= 0.4
        ? 'danger'
        : 'stable';
    this.root.dataset.sinkingSeverity = severity;
    this.renderCarry(snapshot);
  }

  showFailureResult(snapshot: ScavengeSnapshot): void {
    this.resultTitle.textContent = 'Taken by the Sea';
    this.resultBody.textContent = 'The deck disappeared before you reached the lifeboat.';
    const savedCounts = Object.values(snapshot.items).reduce<Partial<Record<ItemId, number>>>((counts, item) => {
      if (typeof item !== 'string' && item.status === 'saved') {
        counts[item.type] = (counts[item.type] ?? 0) + 1;
      }
      return counts;
    }, {});
    const savedItems = ITEM_IDS.flatMap((id) => {
      const count = savedCounts[id] ?? 0;
      return count === 0 ? [] : [`${ITEM_LABELS[id]}${count > 1 ? ` x${count}` : ''}`];
    });
    const elapsedSeconds = 120 - snapshot.remainingSeconds;
    this.resultItems.textContent = [
      `${snapshot.savedCount} SUPPLIES SAVED`,
      `SAVED — ${savedItems.length > 0 ? savedItems.join(' · ') : 'NONE'}`,
      `${formatDuration(elapsedSeconds)} ELAPSED`,
    ].join('\n');
    this.pauseLayer.classList.remove('is-visible');
    this.failureLayer.classList.remove('is-visible');
    this.resultLayer.classList.add('is-visible');
  }

  showFailureSequence(): void {
    this.pauseLayer.classList.remove('is-visible');
    this.failureLayer.classList.add('is-visible');
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
    this.replayButton.removeEventListener('click', this.handleReplay);
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

    const isFull = snapshot.carriedWeight === 3;
    if (isFull !== this.carryWasFull) {
      this.carryWasFull = isFull;
      this.carryFull.textContent = isFull ? 'HANDS FULL - RETURN TO THE BOAT' : '';
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
  private readonly handleResume = (): void => this.onResume();
  private readonly handleReplay = (): void => this.onReplay();
}
