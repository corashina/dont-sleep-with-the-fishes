import { onLanguageChange } from '../i18n/language';
import { refreshUiText } from './translatedText';
import { uiText } from '../i18n/uiMessages';
import { createElementRequirement } from './dom';
import type { EndingStatistics } from './EndingStatisticsModel';
import { statisticsGraphMarkup } from './StatisticsGraph';

const requireElement = createElementRequirement('ending statistics');

/** A second page inside the ending dialog; it never resumes the game. */
export class EndingStatisticsView {
  readonly button: HTMLButtonElement;
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  private readonly content: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly unsubscribeLanguage: () => void;
  private refreshLanguage(): void {
    refreshUiText(this.root);
    this.button.textContent = uiText('viewStats');
  }

  private disposed = false;

  constructor(private readonly host: HTMLElement, private readonly endingPanel: HTMLElement) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'primary-action salvage-action ui-role-context';
    this.button.textContent = uiText('viewStats');
    this.button.dataset.viewStatistics = '';
    this.endingPanel.append(this.button);
    this.root = document.createElement('div');
    this.root.className = 'ending-statistics-card';
    this.root.dataset.endingStatistics = '';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="ending-statistics-card__header">
        <p class="ui-role-context" data-ui-text="shipLog">${uiText('shipLog')}</p>
        <h2 class="ui-role-display" tabindex="-1" data-statistics-title data-ui-text="yourJourney">${uiText('yourJourney')}</h2>
      </header>
      <div class="ending-statistics-card__content" data-statistics-content></div>
      <button type="button" class="carlitos-status__action ui-role-context" data-statistics-back data-ui-text="backEnding">${uiText('backEnding')}</button>`;
    this.title = requireElement(this.root, '[data-statistics-title]');
    this.content = requireElement(this.root, '[data-statistics-content]');
    this.back = requireElement(this.root, '[data-statistics-back]');
    this.host.append(this.root);
    this.button.addEventListener('click', this.open);
    this.back.addEventListener('click', this.close);
    this.host.addEventListener('keydown', this.handleKeyDown);
    this.unsubscribeLanguage = onLanguageChange(() => this.refreshLanguage());
    this.refreshLanguage();
  }

  render(statistics: EndingStatistics): void {
    if (this.disposed) return;
    const previousDetails = this.content.querySelector('details');
    const detailsOpen = previousDetails?.open ?? false;
    const summaryFocused = this.content.querySelector('summary') === document.activeElement;
    this.content.innerHTML = `<dl class="ending-statistics-rows">${statistics.rows.map((row) => `
      <div class="ending-statistics-row">
        <dt class="ui-role-context"><span aria-hidden="true">${row.icon}</span>${row.label}</dt>
        <dd class="ui-role-numeral">${row.value}</dd>
      </div>`).join('')}</dl>
      ${statistics.graph === null ? '' : statisticsGraphMarkup(statistics.graph)}`;
    const details = this.content.querySelector('details');
    if (details !== null) details.open = detailsOpen;
    if (summaryFocused) this.content.querySelector('summary')?.focus({ preventScroll: true });
  }

  private readonly open = (): void => {
    if (this.disposed || this.button.disabled || this.button.closest('[hidden], [inert], [aria-hidden="true"]')) return;
    this.endingPanel.hidden = true;
    this.root.hidden = false;
    this.root.scrollTop = 0;
    this.title.focus();
  };

  private readonly close = (): void => {
    if (this.disposed || this.root.hidden || this.host.hasAttribute('inert')) return;
    this.root.hidden = true;
    this.endingPanel.hidden = false;
    this.button.focus();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || this.root.hidden || this.host.hasAttribute('inert')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
    if (event.key !== 'Tab') return;
    const controls = [...this.root.querySelectorAll<HTMLElement>('button, summary')];
    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === this.title)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    // The ending dialog also has a focus trap. This page owns its controls.
    event.stopPropagation();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeLanguage();
    this.button.removeEventListener('click', this.open);
    this.back.removeEventListener('click', this.close);
    this.host.removeEventListener('keydown', this.handleKeyDown);
    this.root.remove();
    this.button.remove();
  }
}
