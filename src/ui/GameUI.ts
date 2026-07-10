import type { ScavengeSnapshot } from '../game/ScavengeSession';
import { gradeForSavedCount } from '../game/scoring';
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
  private readonly resultLayer: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly sinking: HTMLElement;
  private readonly capacity: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly carried: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultBody: HTMLElement;
  private readonly resultItems: HTMLElement;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.innerHTML = `
      <div class="hud" aria-live="polite">
        <div class="objective"><span class="eyebrow">OBJECTIVE</span><strong>LOAD THE LIFEBOAT</strong></div>
        <div class="timer-block"><span class="eyebrow" data-sinking>SHIP LISTING</span><strong data-timer>02:00</strong></div>
        <div class="capacity"><span class="eyebrow">LIFEBOAT</span><div class="slots" data-capacity aria-label="0 of 5 slots filled"></div></div>
        <div class="crosshair" aria-hidden="true"></div>
        <div class="prompt" data-prompt></div>
        <div class="carried" data-carried></div>
      </div>
      <section class="screen is-visible start-screen" data-start>
        <div class="screen-rule"></div>
        <p class="kicker">A THREE.JS SURVIVAL PROTOTYPE</p>
        <h1>LAST BOAT<br>OUT</h1>
        <p class="lead">The ship has two minutes left. Save what you can, then get to the lifeboat.</p>
        <dl class="controls"><div><dt>MOVE</dt><dd>W A S D</dd></div><div><dt>LOOK</dt><dd>MOUSE</dd></div><div><dt>SPRINT</dt><dd>SHIFT</dd></div><div><dt>ACT</dt><dd>E</dd></div></dl>
        <button type="button" class="primary-action" data-start-button>BEGIN EVACUATION</button>
        <p class="fine-print">Desktop keyboard and mouse required. Click to enable mouse look.</p>
      </section>
      <section class="screen pause-screen" data-pause>
        <p class="kicker">EVACUATION PAUSED</p>
        <h2>Back to the deck?</h2>
        <p class="lead">The countdown is stopped while the mouse is released.</p>
        <button type="button" class="primary-action" data-resume-button>RESUME</button>
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
    this.resultLayer = requireElement(this.root, '[data-result]');
    this.timer = requireElement(this.root, '[data-timer]');
    this.sinking = requireElement(this.root, '[data-sinking]');
    this.capacity = requireElement(this.root, '[data-capacity]');
    this.prompt = requireElement(this.root, '[data-prompt]');
    this.carried = requireElement(this.root, '[data-carried]');
    this.resultTitle = requireElement(this.root, '[data-result-title]');
    this.resultBody = requireElement(this.root, '[data-result-body]');
    this.resultItems = requireElement(this.root, '[data-result-items]');
    requireElement<HTMLButtonElement>(this.root, '[data-start-button]').addEventListener('click', () => this.onStart());
    requireElement<HTMLButtonElement>(this.root, '[data-resume-button]').addEventListener('click', () => this.onResume());
    requireElement<HTMLButtonElement>(this.root, '[data-replay-button]').addEventListener('click', () => this.onReplay());
    this.renderSlots(0);
  }

  hideStart(): void {
    this.startLayer.classList.remove('is-visible');
  }

  setPaused(paused: boolean): void {
    this.pauseLayer.classList.toggle('is-visible', paused);
  }

  setPrompt(text: string): void {
    this.prompt.textContent = text;
    this.prompt.classList.toggle('is-visible', text.length > 0);
  }

  render(snapshot: ScavengeSnapshot, sinking: SinkingState): void {
    this.timer.textContent = formatCountdown(snapshot.remainingSeconds);
    this.timer.classList.toggle('is-critical', snapshot.remainingSeconds <= 30);
    this.sinking.textContent = sinking.progress >= 0.75
      ? 'FINAL SUBMERSION'
      : sinking.progress >= 0.4
        ? 'DECK TAKING WATER'
        : 'SHIP LISTING';
    this.carried.textContent = snapshot.carriedItem
      ? `CARRYING — ${snapshot.carriedItem.replace(/([A-Z])/g, ' $1').toUpperCase()}`
      : '';
    this.renderSlots(snapshot.savedCount);
  }

  showResult(snapshot: ScavengeSnapshot): void {
    const grade = gradeForSavedCount(snapshot.savedCount);
    const success = snapshot.status === 'success';
    this.resultTitle.textContent = success ? grade.label : 'Taken by the Sea';
    this.resultBody.textContent = success
      ? grade.description
      : 'The deck disappeared before you reached the lifeboat.';
    this.resultItems.textContent = `${snapshot.savedCount} / 5 SUPPLY SLOTS FILLED`;
    this.pauseLayer.classList.remove('is-visible');
    this.resultLayer.classList.add('is-visible');
  }

  showCompatibilityError(message: string): void {
    this.startLayer.classList.add('is-visible');
    requireElement<HTMLElement>(this.startLayer, '.lead').textContent = message;
    requireElement<HTMLButtonElement>(this.startLayer, '[data-start-button]').hidden = true;
  }

  private renderSlots(savedCount: number): void {
    this.capacity.innerHTML = Array.from(
      { length: 5 },
      (_, index) => `<span class="slot${index < savedCount ? ' is-filled' : ''}"></span>`,
    ).join('');
    this.capacity.setAttribute('aria-label', `${savedCount} of 5 slots filled`);
  }
}
