// @vitest-environment jsdom
// Importance: 10/10. Protects journal copy, pages, input, focus, and cleanup.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalEntry } from '../src/survival/journalRecords';
import { SurvivalJournalView } from '../src/ui/SurvivalJournalView';

const activeViews: SurvivalJournalView[] = [];

afterEach(() => {
  activeViews.splice(0).forEach((view) => view.dispose());
  document.body.innerHTML = '';
});

function entry(day: number): JournalEntry {
  return {
    day,
    weather: day === 1 ? 'calm' : 'overcast',
    actions: [],
    daytime: {
      phase: 'day',
      eventId: `day-${day}`,
      title: 'Passing Wreck',
      prompt: 'A wreck drifts past.',
      attemptedChoiceId: 'search',
      choiceLabel: 'Search',
      attemptedItemId: null,
      outcomeCode: 'event-resolved',
      outcomeMessage: `Day ${day} supplies came aboard.`,
      inventoryMutations: [{ kind: 'gain', instanceIds: ['bucket-1'] }],
    },
    nighttime: {
      kind: 'event',
      event: {
        phase: 'night',
        eventId: `night-${day}`,
        title: 'Quiet Night',
        prompt: 'The sea settles.',
        attemptedChoiceId: null,
        choiceLabel: 'Endure',
        attemptedItemId: null,
        outcomeCode: 'event-resolved',
        outcomeMessage: `Night ${day} passed.`,
        inventoryMutations: [],
      },
    },
  };
}

function createView(): SurvivalJournalView {
  const view = new SurvivalJournalView();
  document.body.append(view.root);
  activeViews.push(view);
  return view;
}

function activate(view: SurvivalJournalView): void {
  view.root.classList.add('is-visible');
  view.root.removeAttribute('inert');
  view.root.setAttribute('aria-hidden', 'false');
}

describe('SurvivalJournalView', () => {
  it('owns the exact journal root, book, page order, and access markup', () => {
    const view = createView();

    expect(view.root.className).toBe('survival-overlay journal-overlay');
    expect(view.root.getAttribute('role')).toBe('dialog');
    expect(view.root.getAttribute('aria-modal')).toBe('true');
    expect(view.root.getAttribute('aria-label')).toBe('Survival journal');
    expect(view.title.tabIndex).toBe(-1);
    expect(view.root.querySelectorAll('[data-journal-ring]')).toHaveLength(3);
    expect(view.root.querySelectorAll('[data-journal-tab]')).toHaveLength(4);
    expect([...view.root.querySelectorAll('.journal-page__story section h3')]
      .map(({ textContent }) => textContent)).toEqual(['DAY', 'NIGHT']);
    expect(view.root.querySelector('[data-journal-close]')?.textContent).toBe('×');
  });

  it('opens the newest page and uses the established formatted copy', () => {
    const view = createView();
    view.show([entry(1), entry(2)]);

    expect(view.pageForTest()).toBe(1);
    expect(view.title.textContent).toBe('DAY 2');
    expect(view.root.querySelector('[data-journal-weather]')?.textContent).toBe('OVERCAST');
    expect(view.root.querySelector('[data-journal-day]')?.textContent)
      .toBe('During the day, I encountered passing wreck. I chose “Search”. Day 2 supplies came aboard. The bucket was brought aboard.');
    expect(view.root.querySelector('[data-journal-night]')?.textContent)
      .toBe('That night, I encountered quiet night. I chose “Endure”. Night 2 passed.');
    expect(view.root.querySelector('[data-journal-page-count]')?.textContent).toBe('PAGE 2 OF 2');
  });

  it('keeps the empty journal copy, hidden story, folio, and bounds', () => {
    const view = createView();
    view.show([]);

    expect(view.pageForTest()).toBe(0);
    expect(view.title.textContent)
      .toBe('The journal is still waiting for its first completed day.');
    expect(view.title.dataset.empty).toBe('true');
    expect(view.root.querySelector<HTMLElement>('[data-journal-story]')?.hidden).toBe(true);
    expect(view.root.querySelector('[data-journal-day]')?.textContent).toBe('');
    expect(view.root.querySelector('[data-journal-night]')?.textContent).toBe('');
    expect(view.root.querySelector('[data-journal-page-count]')?.textContent).toBe('PAGE 0 OF 0');
    expect(view.previousButton.disabled).toBe(true);
    expect(view.nextButton.disabled).toBe(true);
  });

  it('uses a deep immutable snapshot instead of later source changes', () => {
    const view = createView();
    const source = entry(1);
    view.show([source, entry(2)]);
    const sourceEvent = source.daytime;
    if (sourceEvent === null || 'kind' in sourceEvent) throw new Error('Expected an event.');

    (sourceEvent as { outcomeMessage: string }).outcomeMessage = 'Changed.';
    (sourceEvent.inventoryMutations[0]!.instanceIds as string[])[0] = 'compass-1';
    view.previous();

    expect(view.root.querySelector('[data-journal-day]')?.textContent)
      .toContain('Day 1 supplies came aboard. The bucket was brought aboard.');
    expect(view.root.querySelector('[data-journal-day]')?.textContent).not.toContain('Changed.');
  });

  it('emits page changes only for real moves and before rendering', () => {
    const view = createView();
    view.show([entry(1), entry(2)]);
    const folio = view.root.querySelector('[data-journal-page-count]')!;
    const observed: string[] = [];
    view.onPage = () => observed.push(folio.textContent ?? '');

    view.next();
    view.previous();
    view.previous();

    expect(observed).toEqual(['PAGE 2 OF 2']);
    expect(view.pageForTest()).toBe(0);
    expect(folio.textContent).toBe('PAGE 1 OF 2');
  });

  it('moves within page bounds and keeps focus on an available arrow', () => {
    const view = createView();
    activate(view);
    view.show([entry(1), entry(2), entry(3)]);

    view.previous();
    expect(view.pageForTest()).toBe(1);
    expect(document.activeElement).toBe(view.previousButton);
    view.previous();
    expect(view.pageForTest()).toBe(0);
    expect(view.previousButton.disabled).toBe(true);
    expect(document.activeElement).toBe(view.nextButton);
    view.next();
    view.next();
    expect(view.nextButton.disabled).toBe(true);
    expect(document.activeElement).toBe(view.previousButton);
  });

  it('owns previous, next, close, and backdrop clicks while the book stays open', () => {
    const view = createView();
    const close = vi.fn();
    const page = vi.fn();
    view.onClose = close;
    view.onPage = page;
    view.show([entry(1), entry(2)]);
    activate(view);

    view.previousButton.click();
    view.nextButton.click();
    view.root.querySelector<HTMLElement>('[data-journal-book]')!.click();
    expect(page).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();

    view.root.click();
    view.closeButton.click();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('ignores synthetic clicks while inert or hidden', () => {
    const view = createView();
    const close = vi.fn();
    const page = vi.fn();
    view.onClose = close;
    view.onPage = page;
    view.show([entry(1), entry(2)]);

    view.previousButton.click();
    view.closeButton.click();
    view.root.click();
    expect(view.pageForTest()).toBe(1);
    expect(page).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();

    activate(view);
    view.root.hidden = true;
    view.previousButton.click();
    view.closeButton.click();
    expect(page).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('removes its root listener and resets callbacks once', () => {
    const view = createView();
    const close = vi.fn();
    const page = vi.fn();
    view.onClose = close;
    view.onPage = page;
    view.show([entry(1), entry(2)]);
    activate(view);

    view.dispose();
    view.dispose();
    view.previousButton.click();
    view.closeButton.click();
    expect(close).not.toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['Error', new Error('journal listener cleanup failed')],
  ] as const)('preserves a %s listener failure and still resets callbacks', (_label, firstError) => {
    const view = createView();
    const close = vi.fn();
    const page = vi.fn();
    view.onClose = close;
    view.onPage = page;
    const remove = vi.spyOn(view.root, 'removeEventListener')
      .mockImplementationOnce(() => { throw firstError; });
    let thrown: unknown = Symbol('not thrown');

    try {
      view.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(firstError);
    expect(remove).toHaveBeenCalledWith('click', expect.any(Function));
    view.onClose();
    view.onPage();
    expect(close).not.toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();
    expect(() => view.dispose()).not.toThrow();
  });
});
