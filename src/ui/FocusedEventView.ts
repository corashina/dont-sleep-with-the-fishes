import type { EventResponseId } from '../survival/survivalTypes';
import { createElementRequirement } from './dom';
import type {
  FocusedEventChoiceSelection,
  FocusedEventChoiceView,
  FocusedEventFocusView,
} from './SurvivalUiViewModel';
import { runCleanupSteps, throwCleanupFailure } from './UiCleanup';

const ROUTINE_DIALOG_MARGIN = 20;
const ROUTINE_DIALOG_GAP = 22;
const FOCUSED_EVENT_BOTTOM_RESERVE = 128;
const requireElement = createElementRequirement('focused event view');

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
  private target: FocusedEventFocusView['target'] = null;
  private readonly choicesById = new Map<EventResponseId, FocusedEventChoiceView>();
  private selectedChoiceId: EventResponseId | null = null;
  private busy = false;
  private visible = false;
  private disposed = false;

  constructor(private readonly coordinateRoot: HTMLElement) {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="focused-event-view" data-focused-event-view role="dialog" aria-modal="true" aria-hidden="true" aria-label="Event choices" inert>
        <div class="dive-result__paper focused-event-view__card scuba-popup-paper">
          <nav data-focused-event-choices aria-label="Event choices"></nav>
        </div>
        <button type="button" class="focused-event-view__back" data-focused-event-back aria-label="Return to boat">
          <svg class="focused-event-view__back-icon" data-focused-event-back-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 3h6v10h5l-8 8-8-8h5z" />
          </svg>
        </button>
      </section>`;
    this.root = template.content.firstElementChild as HTMLElement;
    this.card = requireElement(this.root, '.focused-event-view__card');
    this.backButton = requireElement(this.root, '[data-focused-event-back]');
    this.choicesRoot = requireElement(this.root, '[data-focused-event-choices]');
    this.root.addEventListener('click', this.handleClick);
    window.addEventListener('resize', this.handleWindowResize);
  }

  show(view: FocusedEventFocusView): void {
    if (this.disposed) return;
    this.backButton.setAttribute('aria-label', 'Return to boat');
    this.target = view.target === null ? null : Object.freeze({ ...view.target });
    this.choicesById.clear();
    for (const choice of view.choices) this.choicesById.set(choice.id, Object.freeze({ ...choice }));
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
    this.choicesById.clear();
    this.selectedChoiceId = null;
    this.choicesRoot.replaceChildren();
    this.choicesRoot.hidden = false;
    this.target = null;
  }

  updateTarget(target: FocusedEventFocusView['target']): void {
    if (this.disposed || !this.visible) return;
    this.target = target === null ? null : Object.freeze({ ...target });
    this.position();
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
    if (choice !== undefined) this.onChoice({ id: choice.id, instanceId: choice.instanceId });
  }

  initialFocus(): HTMLElement {
    return this.choicesRoot.querySelector<HTMLButtonElement>(
      '[data-event-choice][aria-disabled="false"]',
    ) ?? this.backButton;
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
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
        cost.setAttribute('aria-label', `${energyCost} energy`);
        cost.textContent = '⚡️'.repeat(energyCost);
        main.append(cost);
      }
      button.append(main);
      if (choice.unavailableReason !== null) {
        button.dataset.unavailableReason = choice.unavailableReason;
        button.setAttribute('aria-description', choice.unavailableReason);
        const reason = document.createElement('span');
        reason.className = 'event-choice__reason ui-role-narrative';
        reason.textContent = choice.unavailableReason;
        button.append(reason);
      }
      return button;
    });
    this.choicesRoot.replaceChildren(...choices);
    this.choicesRoot.hidden = false;
    this.syncChoiceState();
  }

  private syncChoiceState(): void {
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
    const target = this.target?.visible === true ? this.target : null;
    if (target === null) {
      const width = Math.min(420, viewportWidth - ROUTINE_DIALOG_MARGIN * 2);
      const maximumHeight = Math.max(1, popupBottom - ROUTINE_DIALOG_MARGIN);
      const height = Math.min(maximumHeight, this.card.getBoundingClientRect().height || 360);
      this.setPosition(width, maximumHeight, (viewportWidth - width) / 2, Math.max(ROUTINE_DIALOG_MARGIN, (popupBottom - height) / 2), 'center', 'fallback');
      return;
    }
    const targetLeft = target.x - target.width / 2;
    const targetRight = target.x + target.width / 2;
    const leftWidth = Math.max(0, targetLeft - ROUTINE_DIALOG_GAP - ROUTINE_DIALOG_MARGIN);
    const rightWidth = Math.max(0, viewportWidth - ROUTINE_DIALOG_MARGIN - targetRight - ROUTINE_DIALOG_GAP);
    const horizontal = [
      { placement: 'left', available: leftWidth, edge: targetLeft - ROUTINE_DIALOG_GAP },
      { placement: 'right', available: rightWidth, edge: targetRight + ROUTINE_DIALOG_GAP },
    ] as const;
    const candidates = horizontal.filter(({ available }) => available >= 240);
    const placement = (candidates.length > 0 ? candidates : horizontal).reduce((best, candidate) => {
      const bestCenter = best.placement === 'left' ? best.edge - Math.min(420, best.available) / 2 : best.edge + Math.min(420, best.available) / 2;
      const candidateCenter = candidate.placement === 'left' ? candidate.edge - Math.min(420, candidate.available) / 2 : candidate.edge + Math.min(420, candidate.available) / 2;
      return Math.abs(candidateCenter - viewportWidth / 2) < Math.abs(bestCenter - viewportWidth / 2) ? candidate : best;
    });
    const width = Math.max(1, Math.min(420, placement.available));
    const maximumHeight = Math.max(1, popupBottom - ROUTINE_DIALOG_MARGIN);
    const height = Math.min(maximumHeight, this.card.getBoundingClientRect().height || 360);
    const x = placement.placement === 'left' ? placement.edge - width : placement.edge;
    const y = Math.min(popupBottom - height, Math.max(ROUTINE_DIALOG_MARGIN, target.y - height / 2));
    this.setPosition(width, maximumHeight, x, y, placement.placement, 'projected');
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
    if (target.closest('[data-focused-event-back]') !== null) this.onBack();
  };

  private readonly handleWindowResize = (): void => {
    if (!this.disposed && this.visible) this.position();
  };
}
