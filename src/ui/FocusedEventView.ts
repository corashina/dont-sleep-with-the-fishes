import { uiDynamic } from '../i18n/uiDynamicMessages';
import { onLanguageChange } from '../i18n/language';
import { refreshUiText } from './translatedText';
import { uiText } from '../i18n/uiMessages';
import type { EventResponseId } from '../survival/survivalTypes';
import type { InspectableEventId } from '../survival/eventCatalog';
import { createElementRequirement } from './dom';
import type {
  FocusedEventChoiceSelection,
  FocusedEventChoiceView,
  FocusedEventFocusView,
} from './SurvivalUiViewModel';
import { runCleanupSteps, throwCleanupFailure } from './UiCleanup';
import { returnArrowArtwork } from './uiArtwork';

const ROUTINE_DIALOG_MARGIN = 20;
const FOCUSED_EVENT_BOTTOM_RESERVE = 128;
const requireElement = createElementRequirement('focused event view');
const FOCUSED_EVENT_TITLES: Readonly<Record<InspectableEventId, string>> = Object.freeze({
  get 'drifting-supplies'() { return uiText('suppliesTitle'); },
  get 'drifting-chest'() { return uiText('chestTitle'); },
});

export class FocusedEventView {
  readonly root: HTMLElement;
  readonly card: HTMLElement;
  readonly backButton: HTMLButtonElement;

  onChoice: (choice: FocusedEventChoiceSelection) => void = () => undefined;
  onBack: () => void = () => undefined;
  onShow: () => void = () => undefined;
  onHide: () => void = () => undefined;
  canUse: () => boolean = () => true;

  private readonly choicesRoot: HTMLElement;
  private readonly title: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private currentEventId: InspectableEventId | null = null;
  private readonly choicesById = new Map<EventResponseId, FocusedEventChoiceView>();
  private selectedChoiceId: EventResponseId | null = null;
  private busy = false;
  private visible = false;
  private readonly unsubscribeLanguage: () => void;
  private refreshLanguage(): void {
    refreshUiText(this.root);
    if (this.currentEventId !== null) {
      this.title.textContent = FOCUSED_EVENT_TITLES[this.currentEventId];
    }
    for (const choice of this.choicesById.values()) {
      const button = this.choiceButton(choice.id);
      if (!button) continue;
      const main = button.querySelector('.focused-event-view__choice-main');
      if (main?.firstChild) main.firstChild.textContent = choice.label;
      const cost = button.querySelector('.focused-event-view__cost');
      if (cost) cost.setAttribute('aria-label', uiDynamic('energyCount', choice.energyCost ?? 0));
      if (choice.unavailableReason !== null) {
        button.dataset.unavailableReason = choice.unavailableReason;
        button.setAttribute('aria-description', choice.unavailableReason);
      }
    }
  }

  private disposed = false;

  constructor(private readonly coordinateRoot: HTMLElement) {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="focused-event-view" data-focused-event-view role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="focused-event-title" inert>
        <div class="dive-result__paper focused-event-view__card scuba-popup-paper">
          <header class="popup-header">
            <button type="button" class="popup-header__close" data-focused-event-close data-ui-aria="returnBoat" aria-label="${uiText('returnBoat')}"></button>
            <h2 class="dive-result__title scuba-popup-title ui-role-display" id="focused-event-title" data-focused-event-title></h2>
          </header>
          <nav data-focused-event-choices data-ui-aria="eventChoices" aria-label="${uiText('eventChoices')}"></nav>
        </div>
        <button type="button" class="focused-event-view__back" data-focused-event-back data-ui-aria="returnBoat" aria-label="${uiText('returnBoat')}">
          ${returnArrowArtwork('focused-event-view__back-icon')}
        </button>
      </section>`;
    this.root = template.content.firstElementChild as HTMLElement;
    this.card = requireElement(this.root, '.focused-event-view__card');
    this.backButton = requireElement(this.root, '[data-focused-event-back]');
    this.closeButton = requireElement(this.root, '[data-focused-event-close]');
    this.title = requireElement(this.root, '[data-focused-event-title]');
    this.choicesRoot = requireElement(this.root, '[data-focused-event-choices]');
    this.root.addEventListener('click', this.handleClick);
    window.addEventListener('resize', this.handleWindowResize);
    this.unsubscribeLanguage = onLanguageChange(() => this.refreshLanguage());
    this.refreshLanguage();
  }

  show(view: FocusedEventFocusView): void {
    if (this.disposed) return;
    this.currentEventId = view.eventId;
    this.backButton.setAttribute('aria-label', uiText('returnBoat'));
    this.title.textContent = FOCUSED_EVENT_TITLES[view.eventId];
    this.choicesById.clear();
    for (const choice of view.choices) this.choicesById.set(choice.id, choice);
    this.selectedChoiceId = null;
    this.renderChoices();
    this.position();
    this.visible = true;
    this.onShow();
  }

  hide(): void {
    if (this.disposed) return;
    this.onHide();
    this.visible = false;
    this.currentEventId = null;
    this.choicesById.clear();
    this.selectedChoiceId = null;
    this.title.textContent = '';
    this.choicesRoot.replaceChildren();
    this.choicesRoot.hidden = false;
  }

  updateTarget(target: FocusedEventFocusView['target']): void {
    void target;
  }

  setBusy(busy: boolean): void {
    if (this.disposed || this.busy === busy) return;
    this.busy = busy;
    this.syncChoiceState();
  }

  setSelectedChoice(choiceId: EventResponseId): void {
    if (this.disposed || this.choiceButton(choiceId) === null) return;
    this.selectedChoiceId = choiceId;
    this.syncChoiceState();
  }

  choiceButton(choiceId: EventResponseId): HTMLButtonElement | null {
    return [...this.choicesRoot.querySelectorAll<HTMLButtonElement>('[data-event-choice]')]
      .find((button) => button.dataset.eventChoice === choiceId) ?? null;
  }

  containsChoice(target: EventTarget | null): boolean {
    return target instanceof Node && this.choicesRoot.contains(target);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (
      this.disposed
      || !this.visible
      || (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar')
    ) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const button = target.closest<HTMLButtonElement>('[data-event-choice]');
    if (button === null || !this.choicesRoot.contains(button)) return false;
    event.preventDefault();
    this.activateChoice(button);
    return true;
  }

  activateChoice(button: HTMLButtonElement): void {
    if (
      this.disposed
      || !this.visible
      || !this.canUse()
      || !this.choicesRoot.contains(button)
      || this.busy
      || this.selectedChoiceId !== null
      || button.getAttribute('aria-disabled') === 'true'
    ) return;
    const choiceId = button.dataset.eventChoice as EventResponseId | undefined;
    const choice = choiceId === undefined ? undefined : this.choicesById.get(choiceId);
    if (choice === undefined) return;
    this.visible = false;
    // Keep the choice buttons until the flow has settled its press beat.
    this.onHide();
    this.onChoice({ id: choice.id, instanceId: choice.instanceId });
  }

  initialFocus(): HTMLElement {
    return this.choicesRoot.querySelector<HTMLButtonElement>(
      '[data-event-choice][aria-disabled="false"]',
    ) ?? this.backButton;
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    this.unsubscribeLanguage();
    return true;
  }

  removeListenersForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => this.root.removeEventListener('click', this.handleClick),
      () => window.removeEventListener('resize', this.handleWindowResize),
    ]));
  }

  resetCallbacksForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => { this.onChoice = () => undefined; },
      () => { this.onBack = () => undefined; },
      () => { this.onShow = () => undefined; },
      () => { this.onHide = () => undefined; },
      () => { this.canUse = () => false; },
    ]));
  }

  dispose(): void {
    if (!this.beginDispose()) return;
    throwCleanupFailure(runCleanupSteps([
      () => this.removeListenersForDispose(),
      () => this.resetCallbacksForDispose(),
    ]));
  }

  private renderChoices(): void {
    const choices = [...this.choicesById.values()].map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-choice ui-role-context';
      button.dataset.eventChoice = choice.id;
      button.dataset.eventState = 'idle';
      button.setAttribute('aria-pressed', 'false');
      const main = document.createElement('span');
      main.className = 'focused-event-view__choice-main';
      main.append(document.createTextNode(choice.label));
      const energyCost = choice.energyCost ?? 0;
      if (energyCost > 0) {
        const cost = document.createElement('span');
        cost.className = 'focused-event-view__cost';
        cost.setAttribute('aria-label', uiDynamic('energyCount', energyCost));
        cost.textContent = '⚡️'.repeat(energyCost);
        main.append(cost);
      }
      button.append(main);
      if (choice.unavailableReason !== null) {
        button.dataset.unavailableReason = choice.unavailableReason;
        button.setAttribute('aria-description', choice.unavailableReason);
      }
      return button;
    });
    this.choicesRoot.replaceChildren(...choices);
    this.choicesRoot.hidden = false;
    this.syncChoiceState();
  }

  private syncChoiceState(): void {
    this.closeButton.disabled = this.busy || this.selectedChoiceId !== null;
    this.choicesRoot.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach((button) => {
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

  private position(): void {
    const rootBounds = this.coordinateRoot.getBoundingClientRect();
    const viewportWidth = Math.max(1, rootBounds.width || this.coordinateRoot.clientWidth || window.innerWidth);
    const viewportHeight = Math.max(1, rootBounds.height || this.coordinateRoot.clientHeight || window.innerHeight);
    const popupBottom = Math.max(ROUTINE_DIALOG_MARGIN, viewportHeight - FOCUSED_EVENT_BOTTOM_RESERVE);
    const width = Math.max(1, Math.min(420, viewportWidth - ROUTINE_DIALOG_MARGIN * 2));
    const maximumHeight = Math.max(1, popupBottom - ROUTINE_DIALOG_MARGIN);
    const height = Math.min(maximumHeight, this.card.getBoundingClientRect().height || 360);
    const x = (viewportWidth - width) / 2;
    const y = Math.max(ROUTINE_DIALOG_MARGIN, (popupBottom - height) / 2);
    this.setPosition(width, maximumHeight, x, y, 'center', 'centered');
  }

  private setPosition(width: number, maximumHeight: number, x: number, y: number, placement: string, anchorState: string): void {
    this.root.style.setProperty('--focused-event-width', `${Math.round(width)}px`);
    this.root.style.setProperty('--focused-event-max-height', `${Math.round(maximumHeight)}px`);
    this.root.style.setProperty('--focused-event-x', `${Math.round(x)}px`);
    this.root.style.setProperty('--focused-event-y', `${Math.round(y)}px`);
    this.root.dataset.placement = placement;
    this.root.dataset.anchorState = anchorState;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.disposed || !this.visible || !this.canUse()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const choice = target.closest<HTMLButtonElement>('[data-event-choice]');
    if (choice !== null && this.choicesRoot.contains(choice)) {
      this.activateChoice(choice);
      return;
    }
    if (target.closest('[data-focused-event-close]') !== null) {
      if (!this.closeButton.disabled) this.onBack();
      return;
    }
    if (target.closest('[data-focused-event-back]') !== null) this.onBack();
  };

  private readonly handleWindowResize = (): void => {
    if (!this.disposed && this.visible) this.position();
  };
}
