import { formatJournalEntry } from '../survival/journal';
import { journalSnapshot, type JournalEntry } from '../survival/journalRecords';
import { createElementRequirement } from './dom';
import { runCleanupSteps, throwCleanupFailure } from './UiCleanup';

const requireElement = createElementRequirement('survival journal view');

export class SurvivalJournalView {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly previousButton: HTMLButtonElement;
  readonly nextButton: HTMLButtonElement;
  readonly closeButton: HTMLButtonElement;

  onClose: () => void = () => undefined;
  onPage: () => void = () => undefined;

  private readonly weather: HTMLElement;
  private readonly story: HTMLElement;
  private readonly day: HTMLElement;
  private readonly night: HTMLElement;
  private readonly pageCount: HTMLElement;
  private entries: readonly JournalEntry[] = [];
  private pageIndex = 0;
  private disposed = false;

  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="survival-overlay journal-overlay" data-journal role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival journal" inert>
        <div class="journal-book" data-journal-book>
          <div class="journal-book__cover" aria-hidden="true"></div>
          <div class="journal-book__rings" data-journal-rings aria-hidden="true"><i data-journal-ring></i><i data-journal-ring></i><i data-journal-ring></i></div>
          <div class="journal-book__tabs" data-journal-tabs aria-hidden="true"><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i></div>
          <article class="journal-page">
            <button type="button" class="journal-page__close ui-role-context" data-journal-close aria-label="Close journal">&times;</button>
            <p class="journal-page__weather ui-role-context" data-journal-weather></p>
            <h2 class="ui-role-display" data-journal-title tabindex="-1"></h2>
            <div class="journal-page__story ui-role-narrative" data-journal-story>
              <section aria-labelledby="journal-day-label"><h3 id="journal-day-label">DAY</h3><p data-journal-day></p></section>
              <section aria-labelledby="journal-night-label"><h3 id="journal-night-label">NIGHT</h3><p data-journal-night></p></section>
            </div>
            <nav class="journal-page__navigation ui-role-context" aria-label="Journal pages">
              <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--previous ui-role-context" data-journal-previous aria-label="Previous journal page">&lsaquo;</button>
              <span class="journal-page__folio ui-role-numeral" data-journal-page-count>PAGE 0 OF 0</span>
              <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--next ui-role-context" data-journal-next aria-label="Next journal page">&rsaquo;</button>
            </nav>
          </article>
        </div>
      </section>`;
    this.root = template.content.firstElementChild as HTMLElement;
    this.title = requireElement(this.root, '[data-journal-title]');
    this.weather = requireElement(this.root, '[data-journal-weather]');
    this.story = requireElement(this.root, '[data-journal-story]');
    this.day = requireElement(this.root, '[data-journal-day]');
    this.night = requireElement(this.root, '[data-journal-night]');
    this.pageCount = requireElement(this.root, '[data-journal-page-count]');
    this.previousButton = requireElement(this.root, '[data-journal-previous]');
    this.nextButton = requireElement(this.root, '[data-journal-next]');
    this.closeButton = requireElement(this.root, '[data-journal-close]');
    this.root.addEventListener('click', this.handleClick);
  }

  show(entries: readonly JournalEntry[]): void {
    if (this.disposed) return;
    this.entries = journalSnapshot(entries);
    this.pageIndex = Math.max(0, this.entries.length - 1);
    this.renderPage();
  }

  hide(): void {
    if (this.disposed) return;
  }

  previous(): void {
    if (!this.disposed) this.movePage(-1);
  }

  next(): void {
    if (!this.disposed) this.movePage(1);
  }

  pageForTest(): number {
    return this.pageIndex;
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    return true;
  }

  removeListenersForDispose(): void {
    this.root.removeEventListener('click', this.handleClick);
  }

  resetCallbacksForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => { this.onClose = () => undefined; },
      () => { this.onPage = () => undefined; },
    ]));
  }

  dispose(): void {
    if (!this.beginDispose()) return;
    throwCleanupFailure(runCleanupSteps([
      () => this.removeListenersForDispose(),
      () => this.resetCallbacksForDispose(),
    ]));
  }

  private renderPage(): void {
    const entry = this.entries[this.pageIndex];
    if (entry === undefined) {
      this.title.textContent = 'The journal is still waiting for its first completed day.';
      this.title.dataset.empty = 'true';
      this.weather.textContent = '';
      this.story.hidden = true;
      this.day.textContent = '';
      this.night.textContent = '';
      this.pageCount.textContent = 'PAGE 0 OF 0';
    } else {
      const page = formatJournalEntry(entry);
      this.title.textContent = page.heading;
      delete this.title.dataset.empty;
      this.weather.textContent = page.weather;
      this.story.hidden = false;
      this.day.textContent = page.daytime;
      this.night.textContent = page.nighttime;
      this.pageCount.textContent = `PAGE ${this.pageIndex + 1} OF ${this.entries.length}`;
    }
    this.previousButton.disabled = this.pageIndex <= 0;
    this.nextButton.disabled = this.entries.length === 0
      || this.pageIndex >= this.entries.length - 1;
  }

  private movePage(delta: -1 | 1): void {
    const maximum = Math.max(0, this.entries.length - 1);
    const previousIndex = this.pageIndex;
    this.pageIndex = Math.min(maximum, Math.max(0, this.pageIndex + delta));
    if (this.pageIndex !== previousIndex) this.onPage();
    this.renderPage();
    const requested = delta < 0 ? this.previousButton : this.nextButton;
    const available = delta < 0 ? this.nextButton : this.previousButton;
    (requested.disabled ? available : requested).focus();
  }

  private canUseRoot(): boolean {
    return !this.disposed
      && !this.root.hidden
      && !this.root.hasAttribute('inert')
      && this.root.getAttribute('aria-hidden') !== 'true';
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.canUseRoot()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-journal-book]') === null) {
      this.onClose();
      return;
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (button === null || button.disabled || !this.root.contains(button)) return;
    if (button.hasAttribute('data-journal-previous')) {
      this.previous();
    } else if (button.hasAttribute('data-journal-next')) {
      this.next();
    } else if (button.hasAttribute('data-journal-close')) {
      this.onClose();
    }
  };
}
