import { ITEM_DEFINITIONS, ITEM_IDS, ITEM_LABELS, type ItemId } from '../game/ItemState';
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import type { SinkingState } from '../game/sinking';
import { itemArtwork, uiArtwork } from './uiArtwork';

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const remainder = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export class GameUI {
  onStart: () => void = () => undefined;
  onResume: () => void = () => undefined;
  onReplay: () => void = () => undefined;
  private readonly root: HTMLDivElement;
  private readonly startLayer: HTMLElement;
  private readonly pauseLayer: HTMLElement;
  private readonly failureLayer: HTMLElement;
  private readonly resultLayer: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly sinking: HTMLElement;
  private readonly capacity: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly carriedItems: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultBody: HTMLElement;
  private readonly resultItems: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly replayButton: HTMLButtonElement;
  private readonly pointerLockErrors: HTMLElement[];
  private lastSavedCount = -1;
  private disposed = false;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.innerHTML = `
      <div class="ui-treatment" aria-hidden="true"></div>
      <div class="hud illustrated-hud">
        <div class="objective ink-label"><span class="eyebrow">CAPTAIN'S ORDER</span><strong>LOAD THE LIFEBOAT</strong></div>
        <div class="timer-block pocket-watch">
          ${uiArtwork('watch', 'pocket-watch__art')}
          <span class="eyebrow" data-sinking>SHIP LISTING</span>
          <strong data-timer>02:00</strong>
        </div>
        <div class="capacity ink-label"><span class="eyebrow">IN THE BOAT</span><strong data-capacity aria-label="0 supplies saved">0 SAVED</strong></div>
        <div class="crosshair" aria-hidden="true"></div>
        <div class="prompt brush-label" data-prompt aria-live="polite"></div>
        <div class="carried" data-carried><div class="weight-circles__row" data-carried-items data-carry-weight aria-hidden="true"><span class="weight-circle" data-weight-circle></span><span class="weight-circle" data-weight-circle></span><span class="weight-circle" data-weight-circle></span></div></div>
      </div>
      <section class="screen is-visible start-screen poster-screen" data-start>
        <div class="screen__content">
          <p class="kicker">THE HULL HAS BEEN BREACHED</p>
          <h1>DON'T SLEEP<br>WITH THE<br>FISHES</h1>
          <p class="lead">The ship has two minutes left. Save what you can, then get to the lifeboat.</p>
          <dl class="controls"><div><dt>MOVE</dt><dd>W A S D</dd></div><div><dt>LOOK</dt><dd>MOUSE</dd></div><div><dt>SPRINT</dt><dd>SHIFT</dd></div><div><dt>ACT</dt><dd>LEFT CLICK</dd></div></dl>
          <button type="button" class="primary-action timber-action" data-start-button>BEGIN EVACUATION</button>
          <p class="input-error illustrated-warning" data-pointer-lock-error aria-live="polite">
            ${uiArtwork('warning', 'illustrated-warning__art')}
            <span data-pointer-lock-error-copy></span>
          </p>
          <p class="fine-print">Desktop keyboard and mouse required. Click to enable mouse look.</p>
        </div>
      </section>
      <section class="screen pause-screen poster-screen" data-pause>
        <div class="screen__content">
          <p class="kicker">THE CLOCK IS STILL</p>
          <h2>Back to the deck?</h2>
          <p class="lead">The countdown is stopped while the mouse is released.</p>
          <button type="button" class="primary-action timber-action" data-resume-button>RESUME</button>
          <p class="input-error illustrated-warning" data-pointer-lock-error aria-live="polite">
            ${uiArtwork('warning', 'illustrated-warning__art')}
            <span data-pointer-lock-error-copy></span>
          </p>
        </div>
      </section>
      <section class="screen failure-screen poster-screen" data-failure aria-live="assertive">
        <div class="screen__content">
          ${uiArtwork('warning', 'failure-mark')}
          <p class="kicker">EVACUATION FAILED</p>
          <h2>The ship is going under.</h2>
          <p class="lead">Hold on...</p>
        </div>
      </section>
      <section class="screen result-screen poster-screen" data-result>
        <div class="screen__content">
          <p class="kicker">THE SEA KEEPS SCORE</p>
          <h2 data-result-title></h2>
          <p class="lead" data-result-body></p>
          <p class="result-items" data-result-items></p>
          <button type="button" class="primary-action timber-action" data-replay-button>TRY ANOTHER ROUTE</button>
        </div>
      </section>
    `;
    mount.append(this.root);
    this.startLayer = requireElement(this.root, '[data-start]');
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.failureLayer = requireElement(this.root, '[data-failure]');
    this.resultLayer = requireElement(this.root, '[data-result]');
    this.timer = requireElement(this.root, '[data-timer]');
    this.sinking = requireElement(this.root, '[data-sinking]');
    this.capacity = requireElement(this.root, '[data-capacity]');
    this.prompt = requireElement(this.root, '[data-prompt]');
    this.carriedItems = requireElement(this.root, '[data-carried-items]');
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
    this.renderSavedCount(0);
  }

  hideStart(): void {
    this.startLayer.classList.remove('is-visible');
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

  render(snapshot: ScavengeSnapshot, sinking: SinkingState): void {
    this.timer.textContent = formatCountdown(snapshot.remainingSeconds);
    this.timer.classList.toggle('is-critical', snapshot.remainingSeconds <= 30);
    const severity = sinking.progress >= 0.75
      ? 'critical'
      : sinking.progress >= 0.4
        ? 'danger'
        : 'stable';
    this.root.dataset.sinkingSeverity = severity;
    this.sinking.textContent = {
      stable: 'SHIP LISTING',
      danger: 'DECK TAKING WATER',
      critical: 'FINAL SUBMERSION',
    }[severity];
    this.renderCarry(snapshot);
    this.renderSavedCount(snapshot.savedCount);
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
      `${formatCountdown(elapsedSeconds)} ELAPSED`,
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

  private renderSavedCount(savedCount: number): void {
    if (savedCount === this.lastSavedCount) return;
    this.lastSavedCount = savedCount;
    this.capacity.textContent = `${savedCount} SAVED`;
    this.capacity.setAttribute('aria-label', `${savedCount} supplies saved`);
  }

  private readonly handleStart = (): void => this.onStart();
  private readonly handleResume = (): void => this.onResume();
  private readonly handleReplay = (): void => this.onReplay();
}
