import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import type { RewardSummary } from '../survival/survivalTypes';
import { createElementRequirement } from './dom';
import { itemThumbnailUrl } from './itemThumbnailManifest';
import type { RewardResultView, SleepCoverProfile } from './SurvivalCoverViewModel';
import {
  runCleanupSteps,
  settleAfterCleanup,
  throwCleanupFailure,
} from './UiCleanup';

const SLEEP_TRANSITION_MS = 2_500;
const SLEEP_HOLD_MS = 450;
const DIVE_TRANSITION_MS = 750;
const DIVE_COVERED_HOLD_MS = 250;
const EVENT_OUTCOME_HOLD_MS = 2_000;
const requireElement = createElementRequirement('survival cover view');

interface PendingWork {
  readonly finish: () => void;
}

function driftingCargoRewardItemId(reward: RewardSummary): ItemId {
  if (reward.kind === 'item') return reward.id;
  if (reward.id === 'food') return 'cannedFood';
  if (reward.id === 'bait') return 'baitTin';
  return 'ductTape';
}

function diveRewardName(reward: RewardSummary): string {
  return ITEM_DEFINITIONS[driftingCargoRewardItemId(reward)].label;
}

export class SurvivalCoverView {
  readonly sleepCover: HTMLElement;
  readonly badSleepCue: HTMLElement;
  readonly resultRoot: HTMLElement;
  readonly resultClose: HTMLButtonElement;
  readonly roots: readonly [HTMLElement, HTMLElement, HTMLElement];

  onResultShow: () => void = () => undefined;
  onResultHide: () => void = () => undefined;
  onResultClose: () => void = () => undefined;

  private readonly resultTitle: HTMLElement;
  private readonly resultRewards: HTMLElement;
  private readonly resultLines: HTMLElement;
  private pendingCoverTransition: PendingWork | null = null;
  private pendingDiveHold: PendingWork | null = null;
  private pendingRewardConfirmation: PendingWork | null = null;
  private pendingCoveredSceneSettle: PendingWork | null = null;
  private pendingSleepHold: PendingWork | null = null;
  private pendingEventOutcomeHold: PendingWork | null = null;
  private rewardThumbnailErrorCleanup: (() => void) | null = null;
  private resultVisible = false;
  private disposed = false;

  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="sleep-cover" data-sleep-cover data-profile="solid" aria-hidden="true"></div>
      <div class="bad-sleep-cue" data-bad-sleep-cue aria-hidden="true">
        <span class="bad-sleep-cue__eye bad-sleep-cue__eye--left">
          <i class="bad-sleep-cue__eyelid bad-sleep-cue__eyelid--top"></i>
          <i class="bad-sleep-cue__eyelid bad-sleep-cue__eyelid--bottom"></i>
        </span>
        <span class="bad-sleep-cue__eye bad-sleep-cue__eye--right">
          <i class="bad-sleep-cue__eyelid bad-sleep-cue__eyelid--top"></i>
          <i class="bad-sleep-cue__eyelid bad-sleep-cue__eyelid--bottom"></i>
        </span>
      </div>
      <section class="dive-result" data-dive-result role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="dive-result-title" inert>
        <div class="dive-result__paper scuba-popup-paper">
          <button type="button" class="dive-result__close ui-role-context" data-dive-result-close aria-label="Close dive result">&times;</button>
          <h2 class="dive-result__title scuba-popup-title ui-role-display" id="dive-result-title" data-dive-result-title></h2>
          <ul class="dive-result__lines ui-role-numeral" data-dive-result-lines></ul>
          <div class="dive-result__rewards" data-dive-result-rewards hidden></div>
        </div>
      </section>`;
    const roots = [...template.content.children] as HTMLElement[];
    this.sleepCover = roots[0]!;
    this.badSleepCue = roots[1]!;
    this.resultRoot = roots[2]!;
    this.roots = [this.sleepCover, this.badSleepCue, this.resultRoot];
    this.resultTitle = requireElement(this.resultRoot, '[data-dive-result-title]');
    this.resultRewards = requireElement(this.resultRoot, '[data-dive-result-rewards]');
    this.resultLines = requireElement(this.resultRoot, '[data-dive-result-lines]');
    this.resultClose = requireElement(this.resultRoot, '[data-dive-result-close]');
    this.resultClose.addEventListener('click', this.handleResultClose);
  }

  setProfile(profile: SleepCoverProfile): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.sleepCover.dataset.profile = profile;
    return Promise.resolve();
  }

  setBadSleepCue(visible: boolean): void {
    if (this.disposed) return;
    this.badSleepCue.classList.toggle('is-visible', visible);
  }

  setCovered(covered: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingCoverTransition?.finish();
    this.sleepCover.classList.toggle('is-covered', covered);
    const delay = this.sleepCover.dataset.profile === 'dive'
      ? DIVE_TRANSITION_MS
      : SLEEP_TRANSITION_MS;
    return new Promise((resolve) => {
      let finished = false;
      let timer = 0;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => this.sleepCover.removeEventListener('transitionend', handleTransitionEnd),
          () => {
            if (this.pendingCoverTransition?.finish === finish) {
              this.pendingCoverTransition = null;
            }
          },
        ]);
      };
      const handleTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === this.sleepCover && event.propertyName === 'opacity') finish();
      };
      this.sleepCover.addEventListener('transitionend', handleTransitionEnd);
      timer = window.setTimeout(finish, delay);
      this.pendingCoverTransition = { finish };
    });
  }

  holdDiveCovered(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingDiveHold?.finish();
    return this.createTimedHold(
      DIVE_COVERED_HOLD_MS,
      (pending) => { this.pendingDiveHold = pending; },
      () => this.pendingDiveHold,
      () => { this.pendingDiveHold = null; },
    );
  }

  showRewardResult(view: RewardResultView): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingRewardConfirmation?.finish();
    this.resultRoot.classList.toggle('is-chest-reward', view.title === 'CHEST REWARD');
    this.resultTitle.textContent = view.title;
    this.resultClose.setAttribute(
      'aria-label',
      view.title === 'CHEST REWARD' ? 'Close chest reward' : 'Close dive result',
    );
    this.renderReward(view.reward);
    this.resultLines.hidden = view.lines.length === 0;
    this.resultLines.replaceChildren(...view.lines.map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }));
    const confirmation = new Promise<void>((resolve) => {
      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        const current = this.pendingRewardConfirmation?.finish === finish;
        settleAfterCleanup(resolve, [
          () => {
            if (current) this.pendingRewardConfirmation = null;
          },
          () => {
            if (current) this.clearRewardResult();
          },
        ]);
      };
      this.pendingRewardConfirmation = { finish };
    });
    this.resultVisible = true;
    this.onResultShow();
    return confirmation;
  }

  confirmRewardResult(): void {
    if (this.disposed) return;
    this.pendingRewardConfirmation?.finish();
  }

  hideRewardResult(): void {
    if (this.disposed) return;
    if (this.pendingRewardConfirmation !== null) {
      this.pendingRewardConfirmation.finish();
      return;
    }
    if (this.resultVisible) this.clearRewardResult();
  }

  settleCoveredScene(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingCoveredSceneSettle?.finish();
    return new Promise((resolve) => {
      let finished = false;
      let frame = 0;
      let completedFrames = 0;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        let current = false;
        settleAfterCleanup(resolve, [
          () => { if (frame !== 0) window.cancelAnimationFrame(frame); },
          () => { current = this.pendingCoveredSceneSettle?.finish === finish; },
          () => { if (current) this.pendingCoveredSceneSettle = null; },
        ]);
      };
      const advance = (): void => {
        frame = 0;
        completedFrames += 1;
        if (completedFrames >= 2) {
          finish();
          return;
        }
        frame = window.requestAnimationFrame(advance);
      };
      frame = window.requestAnimationFrame(advance);
      this.pendingCoveredSceneSettle = { finish };
    });
  }

  holdSleep(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingSleepHold?.finish();
    return this.createTimedHold(
      SLEEP_HOLD_MS,
      (pending) => { this.pendingSleepHold = pending; },
      () => this.pendingSleepHold,
      () => { this.pendingSleepHold = null; },
    );
  }

  holdEventOutcome(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingEventOutcomeHold?.finish();
    return this.createTimedHold(
      EVENT_OUTCOME_HOLD_MS,
      (pending) => { this.pendingEventOutcomeHold = pending; },
      () => this.pendingEventOutcomeHold,
      () => { this.pendingEventOutcomeHold = null; },
    );
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    throwCleanupFailure(runCleanupSteps([
      () => this.settleCoverTransition(),
      () => this.settleDiveHold(),
      () => this.settleRewardConfirmation(),
      () => this.settleCoveredSceneWait(),
      () => this.settleSleepHold(),
      () => this.settleEventOutcomeHold(),
    ]));
  }

  dispose(): void {
    if (!this.beginDispose()) return;
    const result = runCleanupSteps([
      () => this.settleCoverTransition(),
      () => this.settleDiveHold(),
      () => this.settleRewardConfirmation(),
      () => this.settleCoveredSceneWait(),
      () => this.settleSleepHold(),
      () => this.settleEventOutcomeHold(),
      () => this.clearBadSleepCueForCleanup(),
      () => this.removeListenersForDispose(),
      () => this.resetCallbacksForDispose(),
    ]);
    throwCleanupFailure(result);
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    return true;
  }

  clearBadSleepCueForCleanup(): void {
    this.badSleepCue.classList.remove('is-visible');
  }

  settleCoverTransition(): void {
    this.pendingCoverTransition?.finish();
  }

  settleDiveHold(): void {
    this.pendingDiveHold?.finish();
  }

  settleRewardConfirmation(): void {
    this.pendingRewardConfirmation?.finish();
  }

  settleCoveredSceneWait(): void {
    this.pendingCoveredSceneSettle?.finish();
  }

  settleSleepHold(): void {
    this.pendingSleepHold?.finish();
  }

  settleEventOutcomeHold(): void {
    this.pendingEventOutcomeHold?.finish();
  }

  removeListenersForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => this.resultClose.removeEventListener('click', this.handleResultClose),
      () => this.removeRewardThumbnailErrorListener(),
    ]));
  }

  resetCallbacksForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => { this.onResultShow = () => undefined; },
      () => { this.onResultHide = () => undefined; },
      () => { this.onResultClose = () => undefined; },
    ]));
  }

  private clearRewardResult(): void {
    this.resultVisible = false;
    throwCleanupFailure(runCleanupSteps([
      () => this.onResultHide(),
      () => this.resultRoot.classList.remove('is-chest-reward'),
      () => { this.resultTitle.textContent = ''; },
      () => { this.resultRewards.hidden = true; },
      () => this.removeRewardThumbnailErrorListener(),
      () => this.resultRewards.replaceChildren(),
      () => { this.resultLines.hidden = true; },
      () => this.resultLines.replaceChildren(),
    ]));
  }

  private renderReward(reward: RewardSummary | null): void {
    this.removeRewardThumbnailErrorListener();
    this.resultRewards.replaceChildren();
    this.resultRewards.hidden = reward === null;
    if (reward === null) return;
    const itemId = driftingCargoRewardItemId(reward);
    const entry = document.createElement('span');
    entry.className = 'dive-result__reward-entry';
    const circle = document.createElement('span');
    circle.className = 'weight-circle is-filled dive-result__reward';
    circle.dataset.itemType = itemId;
    circle.setAttribute('aria-hidden', 'true');
    const thumbnail = document.createElement('img');
    thumbnail.className = 'weight-circle__thumbnail';
    thumbnail.src = itemThumbnailUrl(itemId);
    thumbnail.alt = '';
    thumbnail.decoding = 'async';
    thumbnail.draggable = false;
    const handleThumbnailError = (): void => {
      thumbnail.hidden = true;
      circle.classList.add('has-image-error');
    };
    thumbnail.addEventListener('error', handleThumbnailError, { once: true });
    this.rewardThumbnailErrorCleanup = () => {
      thumbnail.removeEventListener('error', handleThumbnailError);
    };
    circle.append(thumbnail);
    const copy = document.createElement('span');
    copy.className = 'dive-result__reward-copy';
    const name = document.createElement('strong');
    name.className = 'dive-result__reward-name ui-role-context';
    name.dataset.diveResultRewardName = '';
    name.textContent = diveRewardName(reward);
    const quantity = document.createElement('span');
    quantity.className = 'dive-result__reward-quantity ui-role-numeral';
    quantity.dataset.diveResultRewardQuantity = '';
    quantity.textContent = `×${reward.quantity}`;
    copy.append(name, quantity);
    entry.append(circle, copy);
    this.resultRewards.replaceChildren(entry);
  }

  private removeRewardThumbnailErrorListener(): void {
    const cleanup = this.rewardThumbnailErrorCleanup;
    this.rewardThumbnailErrorCleanup = null;
    cleanup?.();
  }

  private createTimedHold(
    delay: number,
    setPending: (pending: PendingWork) => void,
    getPending: () => PendingWork | null,
    clearPending: () => void,
  ): Promise<void> {
    return new Promise((resolve) => {
      let finished = false;
      let timer = 0;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        let current = false;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => { current = getPending()?.finish === finish; },
          () => { if (current) clearPending(); },
        ]);
      };
      timer = window.setTimeout(finish, delay);
      setPending({ finish });
    });
  }

  private readonly handleResultClose = (): void => {
    if (!this.disposed) this.onResultClose();
  };
}
