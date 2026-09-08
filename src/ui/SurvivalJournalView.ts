import { uiDynamic } from '../i18n/uiDynamicMessages';
import { onLanguageChange } from '../i18n/language';
import { refreshUiText } from './translatedText';
import { uiText } from '../i18n/uiMessages';
import { formatJournalEntry } from '../survival/journal';
import { journalItemChanges, type JournalItemChange } from '../survival/journalItemChanges';
import { journalSnapshot, type JournalEntry } from '../survival/journalRecords';
import { createElementRequirement } from './dom';
import { runCleanupSteps, throwCleanupFailure } from './UiCleanup';
import { itemThumbnailUrl } from './itemThumbnailManifest';

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
  private readonly nightTitle: HTMLElement;
  private readonly nightWeather: HTMLElement;
  private readonly nightStory: HTMLElement;
  private readonly day: HTMLElement;
  private readonly night: HTMLElement;
  private readonly dayItems: HTMLElement;
  private readonly nightItems: HTMLElement;
  private readonly pageCounts: NodeListOf<HTMLElement>;
  private entries: readonly JournalEntry[] = [];
  private pageIndex = 0;
  private readonly unsubscribeLanguage: () => void;
  private refreshLanguage(): void {
    refreshUiText(this.root);
    this.renderPage();
  }

  private disposed = false;

  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="survival-overlay journal-overlay" data-journal role="dialog" aria-modal="true" aria-hidden="true" data-ui-aria="journal" aria-label="${uiText('journal')}" inert>
        <div class="journal-book" data-journal-book>
          <div class="journal-book__cover" aria-hidden="true"></div>
          <div class="journal-book__tabs" data-journal-tabs aria-hidden="true"><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i></div>
          <article class="journal-page journal-page--day" aria-labelledby="journal-day-label">
            <p class="journal-page__weather ui-role-context" data-journal-weather></p>
            <h2 id="journal-day-label" class="ui-role-display" data-journal-title tabindex="-1"></h2>
            <div class="journal-page__story ui-role-narrative" data-journal-story>
              <p data-journal-day></p><ul class="journal-items" data-journal-day-items hidden></ul>
            </div>
            <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--previous ui-role-context" data-journal-previous data-ui-aria="previousJournal" aria-label="${uiText('previousJournal')}">&lsaquo;</button>
            <span class="journal-page__folio ui-role-numeral" data-journal-page-count data-ui-text="emptyPages">${uiText('emptyPages')}</span>
          </article>
          <article class="journal-page journal-page--night" aria-labelledby="journal-night-label">
            <button type="button" class="journal-page__close ui-role-context" data-journal-close data-ui-aria="closeJournal" aria-label="${uiText('closeJournal')}">&times;</button>
            <p class="journal-page__weather ui-role-context" data-journal-night-weather></p>
            <h2 id="journal-night-label" class="ui-role-display" data-journal-night-title></h2>
            <div class="journal-page__story ui-role-narrative" data-journal-night-story>
              <p data-journal-night></p><ul class="journal-items" data-journal-night-items hidden></ul>
            </div>
            <span class="journal-page__folio ui-role-numeral" data-journal-page-count data-ui-text="emptyPages">${uiText('emptyPages')}</span>
            <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--next ui-role-context" data-journal-next data-ui-aria="nextJournal" aria-label="${uiText('nextJournal')}">&rsaquo;</button>
          </article>
        </div>
      </section>`;
    this.root = template.content.firstElementChild as HTMLElement;
    this.title = requireElement(this.root, '[data-journal-title]');
    this.weather = requireElement(this.root, '[data-journal-weather]');
    this.story = requireElement(this.root, '[data-journal-story]');
    this.nightTitle = requireElement(this.root, '[data-journal-night-title]');
    this.nightWeather = requireElement(this.root, '[data-journal-night-weather]');
    this.nightStory = requireElement(this.root, '[data-journal-night-story]');
    this.day = requireElement(this.root, '[data-journal-day]');
    this.night = requireElement(this.root, '[data-journal-night]');
    this.dayItems = requireElement(this.root, '[data-journal-day-items]');
    this.nightItems = requireElement(this.root, '[data-journal-night-items]');
    this.pageCounts = this.root.querySelectorAll<HTMLElement>('[data-journal-page-count]');
    this.previousButton = requireElement(this.root, '[data-journal-previous]');
    this.nextButton = requireElement(this.root, '[data-journal-next]');
    this.closeButton = requireElement(this.root, '[data-journal-close]');
    this.root.addEventListener('click', this.handleClick);
    this.unsubscribeLanguage = onLanguageChange(() => this.refreshLanguage());
    this.refreshLanguage();
  }

  show(entries: readonly JournalEntry[]): void {
    if (this.disposed) return;
    this.entries = journalSnapshot(entries);
    this.pageIndex = Math.max(0, this.entries.length - 1);
    this.renderPage();
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
    this.unsubscribeLanguage();
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
      this.title.textContent = uiText('emptyJournal');
      this.title.dataset.empty = 'true';
      this.weather.textContent = '';
      this.nightWeather.textContent = '';
      this.nightTitle.textContent = '';
      this.story.hidden = true;
      this.nightStory.hidden = true;
      this.day.textContent = '';
      this.night.textContent = '';
      this.renderItems(this.dayItems, []);
      this.renderItems(this.nightItems, []);
    } else {
      const page = formatJournalEntry(entry);
      this.title.textContent = page.heading;
      this.nightTitle.textContent = page.nightHeading;
      delete this.title.dataset.empty;
      this.weather.textContent = page.weather;
      this.nightWeather.textContent = page.nightWeather;
      this.story.hidden = false;
      this.nightStory.hidden = false;
      this.day.textContent = page.daytime;
      this.night.textContent = page.nighttime;
      const changes = journalItemChanges(entry);
      this.renderItems(this.dayItems, changes.day);
      this.renderItems(this.nightItems, changes.night);
    }
    const pageCount = entry === undefined ? uiText('emptyPages')
      : uiDynamic('page', this.pageIndex + 1, this.entries.length);
    this.pageCounts.forEach((counter) => { counter.textContent = pageCount; });
    this.previousButton.disabled = this.pageIndex <= 0;
    this.nextButton.disabled = this.entries.length === 0
      || this.pageIndex >= this.entries.length - 1;
  }

  private renderItems(container: HTMLElement, changes: readonly JournalItemChange[]): void {
    container.hidden = changes.length === 0;
    container.replaceChildren(...changes.map((change) => {
      const item = document.createElement('li');
      item.className = 'journal-item';
      item.dataset.itemType = change.itemId;
      item.dataset.itemChange = change.kind;
      item.title = change.label;
      const art = document.createElement('span');
      art.className = 'weight-circle journal-item__art';
      art.setAttribute('role', 'img');
      art.setAttribute('aria-label', change.label);
      const thumbnail = document.createElement('img');
      thumbnail.className = 'weight-circle__thumbnail';
      thumbnail.src = itemThumbnailUrl(change.itemId);
      thumbnail.alt = '';
      thumbnail.decoding = 'async';
      thumbnail.draggable = false;
      art.append(thumbnail);
      const badge = document.createElement('span');
      badge.className = 'journal-item__status ui-role-numeral';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = change.kind === 'gain' ? '+' : change.kind === 'repair' ? '✓' : '−';
      item.append(art, badge);
      return item;
    }));
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
