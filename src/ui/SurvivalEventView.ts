import { uiDynamic } from '../i18n/uiDynamicMessages';
import { onLanguageChange } from '../i18n/language';
import { refreshUiText } from './translatedText';
import { uiText } from '../i18n/uiMessages';
import type { ItemInstanceId } from '../game/ItemState';
import type {
  EventResponseId,
  SurvivalEventDefinition,
} from '../survival/survivalTypes';
import { createElementRequirement } from './dom';
import type { EventContextChoice } from './SurvivalUiViewModel';
import {
  runCleanupSteps,
  settleAfterCleanup,
  throwCleanupFailure,
} from './UiCleanup';

const EVENT_CHOICE_BEAT_MS = 240;
const requireElement = createElementRequirement('survival event view');

interface PendingWork {
  readonly finish: () => void;
}

export class SurvivalEventView {
  readonly sleepMask: HTMLElement;
  readonly caption: HTMLElement;
  readonly roots: readonly [HTMLElement, HTMLElement];

  onChoice: (choiceId: EventResponseId) => void = () => undefined;
  onAnnouncement: () => void = () => undefined;

  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly risk: HTMLElement;
  private readonly choices: HTMLElement;
  private readonly lastValues = new Map<string, string>();
  private selectedChoiceId: EventResponseId | null = null;
  private currentEvent: Pick<SurvivalEventDefinition, 'id' | 'revealText' | 'danger'> | null = null;
  private currentChoices: readonly EventContextChoice[] = [];
  private active = false;
  private busy = false;
  private modalOpen = false;
  private pendingChoiceBeat: PendingWork | null = null;
  private readonly unsubscribeLanguage: () => void;
  private refreshLanguage(): void {
    refreshUiText(...this.roots);
    if (this.caption.dataset.eventId === 'check-the-back') this.updateText('title', this.title, uiText('checkBack'));
    if (this.caption.dataset.eventId === 'guarded-sleep') this.updateText('title', this.title, uiText('watchCarlitos'));
    if (this.currentEvent !== null) { this.detail.textContent = this.currentEvent.revealText; this.risk.textContent = uiDynamic(this.currentEvent.danger); }
    for (const choice of this.currentChoices) {
      const button = this.choiceButton(choice.id);
      if (!button) continue;
      const label = this.caption.dataset.eventId === 'guarded-sleep' && choice.id === 'watch' ? uiText('yes') : choice.label;
      if (button.firstChild?.nodeType === Node.TEXT_NODE) button.firstChild.textContent = label;
      const reason = button.querySelector('.event-choice__reason');
      if (reason && choice.unavailableReason !== null) { reason.textContent = choice.unavailableReason; button.dataset.unavailableReason = choice.unavailableReason; button.setAttribute('aria-description', choice.unavailableReason); }
    }
  }

  private disposed = false;

  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="event-sleep-mask" data-event-sleep-mask aria-hidden="true">
        <i></i><i></i><i></i>
      </div>
      <section class="event-caption" data-event-caption aria-hidden="true" aria-live="polite">
        <h2 class="ui-role-display" data-event-title hidden></h2>
        <p class="event-caption__detail ui-role-narrative" data-event-detail hidden></p>
        <p class="event-caption__risk ui-role-context" data-event-risk hidden></p>
        <nav class="event-choices" data-event-choices data-ui-aria="eventChoices" aria-label="${uiText('eventChoices')}" hidden></nav>
      </section>`;
    const roots = [...template.content.children] as HTMLElement[];
    this.sleepMask = roots[0]!;
    this.caption = roots[1]!;
    this.roots = [this.sleepMask, this.caption];
    this.title = requireElement(this.caption, '[data-event-title]');
    this.detail = requireElement(this.caption, '[data-event-detail]');
    this.risk = requireElement(this.caption, '[data-event-risk]');
    this.choices = requireElement(this.caption, '[data-event-choices]');
    this.caption.addEventListener('click', this.handleClick);
    this.unsubscribeLanguage = onLanguageChange(() => this.refreshLanguage());
    this.refreshLanguage();
  }

  begin(): void {
    if (this.disposed) return;
    this.active = true;
    this.syncChoiceState();
  }

  showItemAnimationLab(): void {
    if (this.disposed) return;
    this.caption.classList.add('item-animation-dialog');
    this.caption.classList.remove('confirmation-dialog', 'scuba-popup-paper');
    this.updateText('title', this.title, '');
    this.title.hidden = true;
    this.updateText('detail', this.detail, '');
    this.detail.hidden = true;
    this.risk.textContent = '';
    this.risk.hidden = true;
    this.caption.dataset.eventId = 'item-animation-lab';
    delete this.caption.dataset.danger;
    this.active = true;
    this.caption.removeAttribute('aria-label');
    this.caption.classList.remove('is-visible');
    this.caption.setAttribute('aria-hidden', 'true');
    this.syncChoiceState();
  }

  showItemAnimationLabChoices(
    contextualChoices: readonly EventContextChoice[],
  ): void {
    if (this.disposed || this.caption.dataset.eventId !== 'item-animation-lab') return;
    this.setSelection(contextualChoices);
    this.choiceButtonsInOrder().find((button) => button.getAttribute('aria-disabled') !== 'true')?.focus();
  }

  hideItemAnimationLabChoices(): void {
    if (this.disposed || this.caption.dataset.eventId !== 'item-animation-lab') return;
    this.updateText('title', this.title, '');
    this.title.hidden = true;
    this.setSelection([]);
  }

  showReveal(
    event: Pick<SurvivalEventDefinition, 'id' | 'revealText' | 'danger'>,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.currentEvent = event;
    const risk = uiDynamic(event.danger);
    this.updateText('title', this.title, '');
    this.title.hidden = true;
    this.updateText('detail', this.detail, event.revealText);
    this.updateText('risk', this.risk, risk);
    this.detail.hidden = true;
    this.risk.hidden = true;
    this.caption.dataset.eventId = event.id;
    this.caption.dataset.danger = event.danger;
    this.caption.classList.remove('item-animation-dialog');
    const confirmationDialog = event.id === 'check-the-back' || event.id === 'guarded-sleep';
    this.caption.classList.toggle('confirmation-dialog', confirmationDialog);
    this.caption.classList.toggle('scuba-popup-paper', confirmationDialog);
    if (confirmationDialog) {
      this.caption.setAttribute('role', 'dialog');
      this.caption.setAttribute('aria-modal', 'true');
    } else {
      this.caption.removeAttribute('role');
      this.caption.removeAttribute('aria-modal');
    }
    this.active = true;
    this.caption.classList.remove('is-visible');
    this.caption.setAttribute('aria-hidden', 'true');
    this.caption.removeAttribute('aria-label');
    this.syncChoiceState();
    this.onAnnouncement();
    return Promise.resolve();
  }

  announcementText(): string {
    const event = this.currentEvent;
    return event === null
      ? ''
      : uiDynamic('eventAnnouncement', uiDynamic(event.danger), event.revealText);
  }

  hideReveal(): void {
    if (this.disposed) return;
    this.caption.classList.remove('is-visible');
    this.caption.setAttribute('aria-hidden', 'true');
  }

  setSelection(contextualChoices: readonly EventContextChoice[] = []): void {
    if (this.disposed) return;
    this.currentChoices = contextualChoices;
    this.selectedChoiceId = null;
    const checkBack = this.caption.dataset.eventId === 'check-the-back';
    const guardedSleep = this.caption.dataset.eventId === 'guarded-sleep';
    if (checkBack) {
      this.updateText('title', this.title, uiText('checkBack'));
      this.title.hidden = false;
    } else if (guardedSleep) {
      this.updateText('title', this.title, uiText('watchCarlitos'));
      this.title.hidden = false;
    }
    const buttons = contextualChoices
      .filter((choice) => (
        (checkBack || choice.id !== 'sleep') && choice.anchorId === undefined
      ))
      .map((choice) => this.createChoice(
        guardedSleep && choice.id === 'watch'
          ? { ...choice, label: uiText('yes') }
          : choice,
      ));
    this.choices.replaceChildren(...buttons);
    this.choices.hidden = buttons.length === 0;
    const showCaption = this.active && (
      !this.title.hidden
      || !this.detail.hidden
      || !this.risk.hidden
      || buttons.length > 0
    );
    this.caption.classList.toggle('is-visible', showCaption);
    this.caption.setAttribute('aria-hidden', showCaption ? 'false' : 'true');
    this.syncChoiceState();
  }

  setBusy(busy: boolean): void {
    if (this.disposed || this.busy === busy) return;
    this.busy = busy;
    this.syncChoiceState();
  }

  setModalOpen(open: boolean): void {
    if (this.disposed) return;
    this.modalOpen = open;
  }

  playChoiceBeat(
    choiceId: EventResponseId,
    target: HTMLButtonElement | null,
  ): Promise<void> {
    if (
      this.disposed
      || !this.active
      || target === null
      || target.dataset.unavailableReason !== undefined
      || this.selectedChoiceId !== null
    ) return Promise.resolve();
    this.pendingChoiceBeat?.finish();
    this.selectedChoiceId = choiceId;
    this.syncChoiceState();
    return new Promise((resolve) => {
      let finished = false;
      let timer = 0;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => target.removeEventListener('animationend', handleAnimationEnd),
          () => {
            if (this.pendingChoiceBeat?.finish === finish) this.pendingChoiceBeat = null;
          },
        ]);
      };
      const handleAnimationEnd = (event: AnimationEvent): void => {
        if (event.target === target) finish();
      };
      target.addEventListener('animationend', handleAnimationEnd);
      timer = window.setTimeout(finish, EVENT_CHOICE_BEAT_MS);
      this.pendingChoiceBeat = { finish };
    });
  }

  setSleepMask(eventId: string, visible: boolean): void {
    if (this.disposed) return;
    this.sleepMask.classList.toggle('is-visible', eventId === 'ghosts' && visible);
  }

  clear(): void {
    if (this.disposed) return;
    throwCleanupFailure(runCleanupSteps([
      () => this.settleChoiceBeat(),
      () => this.clearSleepMask(),
      () => this.clearPresentationState(),
    ]));
  }

  settleChoiceBeat(): void {
    this.pendingChoiceBeat?.finish();
  }

  clearSleepMask(): void {
    this.sleepMask.classList.remove('is-visible');
  }

  clearPresentationState(): void {
    this.currentEvent = null;
    this.currentChoices = [];
    throwCleanupFailure(runCleanupSteps([
      () => { this.selectedChoiceId = null; },
      () => { this.active = false; },
      () => this.caption.classList.remove('is-visible'),
      () => this.caption.setAttribute('aria-hidden', 'true'),
      () => this.caption.removeAttribute('aria-label'),
      () => this.caption.classList.remove('confirmation-dialog', 'scuba-popup-paper'),
      () => this.caption.removeAttribute('role'),
      () => this.caption.removeAttribute('aria-modal'),
      () => { delete this.caption.dataset.eventId; },
      () => { delete this.caption.dataset.danger; },
      () => this.updateText('title', this.title, ''),
      () => { this.title.hidden = true; },
      () => { this.detail.textContent = ''; },
      () => { this.detail.hidden = true; },
      () => { this.risk.textContent = ''; },
      () => { this.risk.hidden = true; },
      () => this.choices.replaceChildren(),
      () => { this.choices.hidden = true; },
    ]));
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.settleChoiceBeat();
  }

  isActive(): boolean {
    return !this.disposed && this.active;
  }

  selectedChoice(): EventResponseId | null {
    return this.selectedChoiceId;
  }

  choiceButton(choiceId: EventResponseId): HTMLButtonElement | null {
    return [...this.choices.querySelectorAll<HTMLButtonElement>('[data-event-choice]')]
      .find((button) => button.dataset.eventChoice === choiceId) ?? null;
  }

  choiceButtonsInOrder(): readonly HTMLButtonElement[] {
    return [...this.choices.querySelectorAll<HTMLButtonElement>('[data-event-choice]')];
  }

  containsChoice(target: EventTarget | null): boolean {
    return target instanceof Node && this.choices.contains(target);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (
      this.disposed
      || !this.active
      || (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar')
    ) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const button = target.closest<HTMLButtonElement>('[data-event-choice]');
    if (button === null || !this.choices.contains(button)) return false;
    event.preventDefault();
    this.activateChoice(button);
    return true;
  }

  activateChoice(button: HTMLButtonElement): void {
    if (
      this.disposed
      || !this.active
      || this.modalOpen
      || !this.choices.contains(button)
      || this.busy
      || this.selectedChoiceId !== null
      || button.getAttribute('aria-disabled') === 'true'
    ) return;
    const choiceId = button.dataset.eventChoice as EventResponseId | undefined;
    if (choiceId !== undefined) this.onChoice(choiceId);
  }

  dispose(): void {
    if (!this.beginDispose()) return;
    const result = runCleanupSteps([
      () => this.clearChoicesForDispose(),
      () => this.settleChoiceBeat(),
      () => this.removeListenersForDispose(),
      () => this.resetCallbacksForDispose(),
    ]);
    throwCleanupFailure(result);
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    this.unsubscribeLanguage();
    this.selectedChoiceId = null;
    this.active = false;
    return true;
  }

  clearChoicesForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => this.choices.replaceChildren(),
      () => { this.choices.hidden = true; },
    ]));
  }

  removeListenersForDispose(): void {
    this.caption.removeEventListener('click', this.handleClick);
  }

  resetCallbacksForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => { this.onChoice = () => undefined; },
      () => { this.onAnnouncement = () => undefined; },
    ]));
  }

  private createChoice(choice: EventContextChoice): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'event-choice ui-role-context';
    button.dataset.eventChoice = choice.id;
    button.dataset.eventState = 'idle';
    button.setAttribute('aria-pressed', 'false');
    button.textContent = choice.label;
    if (choice.unavailableReason !== null) {
      button.dataset.unavailableReason = choice.unavailableReason;
      button.setAttribute('aria-description', choice.unavailableReason);
      const reason = document.createElement('span');
      reason.className = 'event-choice__reason ui-role-narrative';
      reason.textContent = choice.unavailableReason;
      button.append(reason);
    }
    return button;
  }

  private syncChoiceState(): void {
    this.choices.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach((button) => {
      const unavailable = button.dataset.unavailableReason !== undefined;
      const selected = button.dataset.eventChoice === this.selectedChoiceId;
      button.dataset.eventState = selected ? 'selected' : 'idle';
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = false;
      button.setAttribute(
        'aria-disabled',
        unavailable || this.busy || this.selectedChoiceId !== null ? 'true' : 'false',
      );
    });
  }

  private updateText(key: string, element: HTMLElement, value: string): void {
    if (this.lastValues.get(key) === value) return;
    this.lastValues.set(key, value);
    element.textContent = value;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-event-choice]');
    if (button !== null) this.activateChoice(button);
  };
}
