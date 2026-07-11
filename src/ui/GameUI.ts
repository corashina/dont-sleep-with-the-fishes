import { ITEM_DEFINITIONS, ITEM_IDS, ITEM_LABELS } from '../game/ItemState';
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import type { SinkingState } from '../game/sinking';

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
  private readonly carryWeight: HTMLElement;
  private readonly carriedItems: HTMLElement;
  private readonly feedback: HTMLElement;
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
      <div class="hud">
        <div class="objective"><span class="eyebrow">OBJECTIVE</span><strong>LOAD THE LIFEBOAT</strong></div>
        <div class="timer-block"><span class="eyebrow" data-sinking>SHIP LISTING</span><strong data-timer>02:00</strong></div>
        <div class="capacity"><span class="eyebrow">LIFEBOAT</span><strong data-capacity aria-label="0 supplies saved">0 SAVED</strong></div>
        <div class="crosshair" aria-hidden="true"></div>
        <div class="prompt" data-prompt aria-live="polite"></div>
        <div class="carried" data-carried>
          <span class="eyebrow">CARRY WEIGHT</span>
          <strong data-carry-weight>0 / 3</strong>
          <div data-carried-items></div>
          <div class="feedback" data-feedback aria-live="polite"></div>
        </div>
      </div>
      <section class="screen is-visible start-screen" data-start>
        <div class="screen-rule"></div>
        <p class="kicker">A THREE.JS SURVIVAL PROTOTYPE</p>
        <h1>LAST BOAT<br>OUT</h1>
        <p class="lead">The ship has two minutes left. Save what you can, then get to the lifeboat.</p>
        <dl class="controls"><div><dt>MOVE</dt><dd>W A S D</dd></div><div><dt>LOOK</dt><dd>MOUSE</dd></div><div><dt>SPRINT</dt><dd>SHIFT</dd></div><div><dt>ACT</dt><dd>E</dd></div></dl>
        <button type="button" class="primary-action" data-start-button>BEGIN EVACUATION</button>
        <p class="input-error" data-pointer-lock-error aria-live="polite"></p>
        <p class="fine-print">Desktop keyboard and mouse required. Click to enable mouse look.</p>
      </section>
      <section class="screen pause-screen" data-pause>
        <p class="kicker">EVACUATION PAUSED</p>
        <h2>Back to the deck?</h2>
        <p class="lead">The countdown is stopped while the mouse is released.</p>
        <button type="button" class="primary-action" data-resume-button>RESUME</button>
        <p class="input-error" data-pointer-lock-error aria-live="polite"></p>
      </section>
      <section class="screen failure-screen" data-failure aria-live="assertive">
        <p class="kicker">EVACUATION FAILED</p>
        <h2>The ship is going under.</h2>
        <p class="lead">Hold on...</p>
      </section>
      <section class="screen result-screen" data-result>
        <p class="kicker">RUN COMPLETE</p>
        <h2 data-result-title></h2>
        <p class="lead" data-result-body></p>
        <p class="result-items" data-result-items></p>
        <button type="button" class="primary-action" data-replay-button>TRY ANOTHER ROUTE</button>
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
    this.carryWeight = requireElement(this.root, '[data-carry-weight]');
    this.carriedItems = requireElement(this.root, '[data-carried-items]');
    this.feedback = requireElement(this.root, '[data-feedback]');
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
      element.textContent = '';
      element.classList.remove('is-visible');
    });
  }

  showPointerLockError(): void {
    this.pointerLockErrors.forEach((element) => {
      element.textContent = 'Mouse look was blocked. Click the button and allow pointer lock to continue.';
      element.classList.add('is-visible');
    });
  }

  setPrompt(text: string): void {
    if (this.prompt.textContent === text) return;
    this.prompt.textContent = text;
    this.prompt.classList.toggle('is-visible', text.length > 0);
  }

  showFeedback(text: string): void {
    if (this.feedback.textContent === text) {
      this.feedback.dataset.version = String(Number(this.feedback.dataset.version ?? 0) + 1);
    }
    this.feedback.textContent = text;
    this.feedback.classList.toggle('is-visible', text.length > 0);
  }

  render(snapshot: ScavengeSnapshot, sinking: SinkingState): void {
    this.timer.textContent = formatCountdown(snapshot.remainingSeconds);
    this.timer.classList.toggle('is-critical', snapshot.remainingSeconds <= 30);
    this.sinking.textContent = sinking.progress >= 0.75
      ? 'FINAL SUBMERSION'
      : sinking.progress >= 0.4
        ? 'DECK TAKING WATER'
        : 'SHIP LISTING';
    this.renderCarry(snapshot);
    this.renderSavedCount(snapshot.savedCount);
  }

  showFailureResult(snapshot: ScavengeSnapshot): void {
    this.resultTitle.textContent = 'Taken by the Sea';
    this.resultBody.textContent = 'The deck disappeared before you reached the lifeboat.';
    const savedItems = ITEM_IDS
      .filter((id) => snapshot.items[id] === 'saved')
      .map((id) => ITEM_LABELS[id]);
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
    this.startLayer.classList.add('is-visible');
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
    this.carryWeight.textContent = `${snapshot.carriedWeight} / 3`;
    this.carriedItems.replaceChildren(...snapshot.carriedItems.map((item) => {
      const row = document.createElement('span');
      const definition = ITEM_DEFINITIONS[item.type];
      row.textContent = `${definition.label} · ${definition.weight}`;
      return row;
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
