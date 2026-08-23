import type { ProjectedBoatBounds } from '../survival/BoatInteraction';
import type { DriftingItemEventId } from '../survival/eventCatalog';
import type { EventResponseId } from '../survival/survivalTypes';
import { createElementRequirement } from './dom';
import type { EventContextChoice } from './SurvivalUiViewModel';
import { runCleanupSteps, throwCleanupFailure } from './UiCleanup';

const ROUTINE_DIALOG_MARGIN = 20;
const ROUTINE_DIALOG_GAP = 22;
const DRIFTING_FOCUS_BOTTOM_RESERVE = 128;
const requireElement = createElementRequirement('drifting item view');

export interface DriftingItemFocusView {
  readonly eventId: DriftingItemEventId;
  readonly title: string;
  readonly choices: readonly EventContextChoice[];
  readonly target: ProjectedBoatBounds | null;
}

export class DriftingItemView {
  readonly root: HTMLElement;
  readonly card: HTMLElement;
  readonly backButton: HTMLButtonElement;
  readonly title: HTMLElement;

  onChoice: (choiceId: EventResponseId) => void = () => undefined;
  onBack: () => void = () => undefined;
  onShow: () => void = () => undefined;
  onHide: () => void = () => undefined;
  canUse: () => boolean = () => true;

  private readonly choicesRoot: HTMLElement;
  private target: ProjectedBoatBounds | null = null;
  private choicesView: readonly EventContextChoice[] = [];
  private selectedChoiceId: EventResponseId | null = null;
  private busy = false;
  private visible = false;
  private disposed = false;

  constructor(private readonly coordinateRoot: HTMLElement) {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="drifting-item-focus" data-drifting-item-focus role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="drifting-item-focus-title" inert>
        <div class="dive-result__paper drifting-item-focus__card scuba-popup-paper">
          <h2 class="dive-result__title scuba-popup-title ui-role-display" id="drifting-item-focus-title" data-drifting-item-title></h2>
          <nav data-drifting-item-choices aria-label="Pickup choices"></nav>
        </div>
        <button type="button" class="drifting-item-focus__back" data-drifting-item-back aria-label="Return to boat">
          <svg class="drifting-item-focus__back-icon" data-drifting-item-back-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 3h6v10h5l-8 8-8-8h5z" />
          </svg>
        </button>
      </section>`;
    this.root = template.content.firstElementChild as HTMLElement;
    this.card = requireElement(this.root, '.drifting-item-focus__card');
    this.backButton = requireElement(this.root, '[data-drifting-item-back]');
    this.title = requireElement(this.root, '[data-drifting-item-title]');
    this.choicesRoot = requireElement(this.root, '[data-drifting-item-choices]');
    this.root.addEventListener('click', this.handleClick);
    window.addEventListener('resize', this.handleWindowResize);
  }

  show(view: DriftingItemFocusView): void {
    if (this.disposed) return;
    this.backButton.setAttribute('aria-label', 'Return to boat');
    this.title.textContent = view.title;
    this.target = view.target === null ? null : Object.freeze({ ...view.target });
    this.choicesView = view.choices.map((choice) => Object.freeze({ ...choice }));
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
    this.choicesView = [];
    this.selectedChoiceId = null;
    this.choicesRoot.replaceChildren();
    this.choicesRoot.hidden = false;
    this.title.textContent = '';
    this.target = null;
  }

  updateTarget(target: ProjectedBoatBounds | null): void {
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
    if (choiceId !== undefined) this.onChoice(choiceId);
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
    this.root.removeEventListener('click', this.handleClick);
    window.removeEventListener('resize', this.handleWindowResize);
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
    const result = runCleanupSteps([
      () => this.removeListenersForDispose(),
      () => this.resetCallbacksForDispose(),
    ]);
    throwCleanupFailure(result);
  }

  private renderChoices(): void {
    const choices = this.choicesView.map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-choice ui-role-context';
      button.dataset.eventChoice = choice.id;
      button.dataset.eventState = 'idle';
      button.setAttribute('aria-pressed', 'false');
      const main = document.createElement('span');
      main.className = 'drifting-item-focus__choice-main';
      main.append(document.createTextNode(choice.label));
      const energyCost = choice.energyCost ?? 0;
      if (energyCost > 0) {
        const cost = document.createElement('span');
        cost.className = 'drifting-item-focus__cost';
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
    const viewportWidth = Math.max(
      1,
      rootBounds.width || this.coordinateRoot.clientWidth || window.innerWidth,
    );
    const viewportHeight = Math.max(
      1,
      rootBounds.height || this.coordinateRoot.clientHeight || window.innerHeight,
    );
    const margin = ROUTINE_DIALOG_MARGIN;
    const gap = ROUTINE_DIALOG_GAP;
    const popupBottom = Math.max(margin, viewportHeight - DRIFTING_FOCUS_BOTTOM_RESERVE);
    const target = this.target?.visible === true ? this.target : null;

    if (target === null) {
      const width = Math.min(420, viewportWidth - margin * 2);
      this.root.style.setProperty('--drifting-width', `${Math.round(width)}px`);
      this.root.style.setProperty(
        '--drifting-max-height',
        `${Math.round(Math.max(1, popupBottom - margin))}px`,
      );
      const height = Math.min(
        Math.max(1, popupBottom - margin),
        this.card.getBoundingClientRect().height || 360,
      );
      this.root.style.setProperty(
        '--drifting-x',
        `${Math.round((viewportWidth - width) / 2)}px`,
      );
      this.root.style.setProperty(
        '--drifting-y',
        `${Math.round(Math.max(margin, (popupBottom - height) / 2))}px`,
      );
      this.root.dataset.placement = 'center';
      this.root.dataset.anchorState = 'fallback';
      return;
    }

    const targetLeft = target.x - target.width / 2;
    const targetRight = target.x + target.width / 2;
    const leftWidth = Math.max(0, targetLeft - gap - margin);
    const rightWidth = Math.max(0, viewportWidth - margin - targetRight - gap);
    const preferredWidth = 420;
    const minimumWidth = 240;
    const horizontal = [
      { placement: 'left', available: leftWidth, edge: targetLeft - gap },
      { placement: 'right', available: rightWidth, edge: targetRight + gap },
    ] as const;
    const usable = horizontal.filter(({ available }) => available >= minimumWidth);
    const candidates = usable.length > 0 ? usable : horizontal;
    const placement = candidates.reduce((best, candidate) => {
      const bestWidth = Math.min(preferredWidth, best.available);
      const candidateWidth = Math.min(preferredWidth, candidate.available);
      const bestCenter = best.placement === 'left'
        ? best.edge - bestWidth / 2
        : best.edge + bestWidth / 2;
      const candidateCenter = candidate.placement === 'left'
        ? candidate.edge - candidateWidth / 2
        : candidate.edge + candidateWidth / 2;
      const bestDistance = Math.abs(bestCenter - viewportWidth / 2);
      const candidateDistance = Math.abs(candidateCenter - viewportWidth / 2);
      return candidateDistance < bestDistance ? candidate : best;
    });
    const width = Math.max(1, Math.min(preferredWidth, placement.available));
    const maximumHeight = Math.max(1, popupBottom - margin);
    this.root.style.setProperty('--drifting-width', `${Math.round(width)}px`);
    this.root.style.setProperty(
      '--drifting-max-height',
      `${Math.round(maximumHeight)}px`,
    );
    const cardHeight = Math.min(
      maximumHeight,
      this.card.getBoundingClientRect().height || 360,
    );
    const x = placement.placement === 'left' ? placement.edge - width : placement.edge;
    const y = Math.min(
      popupBottom - cardHeight,
      Math.max(margin, target.y - cardHeight / 2),
    );
    this.root.style.setProperty('--drifting-x', `${Math.round(x)}px`);
    this.root.style.setProperty('--drifting-y', `${Math.round(y)}px`);
    this.root.dataset.placement = placement.placement;
    this.root.dataset.anchorState = 'projected';
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
    if (target.closest('[data-drifting-item-back]') !== null) this.onBack();
  };

  private readonly handleWindowResize = (): void => {
    if (!this.disposed && this.visible) this.position();
  };
}
