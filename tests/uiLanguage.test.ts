// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLanguage, setLanguage } from '../src/i18n/language';
import { uiDynamic } from '../src/i18n/uiDynamicMessages';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { GameUI } from '../src/ui/GameUI';
import { SurvivalUI } from '../src/ui/SurvivalUI';
import { SurvivalJournalView } from '../src/ui/SurvivalJournalView';
import { SurvivalEventView } from '../src/ui/SurvivalEventView';
import { FocusedEventView } from '../src/ui/FocusedEventView';
import { SurvivalFishingView } from '../src/ui/SurvivalFishingView';
import { SurvivalCoverView } from '../src/ui/SurvivalCoverView';

const views: { dispose(): void }[] = [];
const find = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
afterEach(() => {
  views.splice(0).forEach(view => view.dispose());
  setLanguage('en');
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('live gameplay translations', () => {
  it('keeps the scavenging timer, notice timeout and pause focus', () => {
    vi.useFakeTimers();
    const ui = new GameUI(document.body);
    views.push(ui);
    const session = new ScavengeSession([]);
    session.start();
    ui.render(session.snapshot());
    ui.setPaused(true);
    ui.showHandsFullNotice();
    vi.advanceTimersByTime(700);
    const resume = find('[data-resume-button]');
    const timer = find('[data-timer]').textContent;
    setLanguage('pl');
    expect(document.activeElement).toBe(resume);
    expect(resume.textContent).toBe('WZNÓW');
    expect(find('[data-intro-skip]').textContent).toContain('POMIŃ WSTĘP');
    expect(find('[data-hands-full-notice]').textContent).toContain('PEŁNE RĘCE');
    expect(find('[data-timer]').textContent).toBe(timer);
    vi.advanceTimersByTime(1299);
    expect(find('[data-hands-full-notice]').hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(find('[data-hands-full-notice]').hidden).toBe(true);
  });

  it('translates an open journal without changing its page or focus', () => {
    const view = new SurvivalJournalView();
    views.push(view);
    document.body.append(view.root);
    view.root.removeAttribute('inert');
    view.root.setAttribute('aria-hidden', 'false');
    view.show([1, 2, 3].map(day => ({ day, weather: 'calm', actions: [], daytime: null, nighttime: { kind: 'quiet' } })));
    view.previous();
    const pageTurn = vi.fn();
    view.onPage = pageTurn;
    const focus = document.activeElement;
    setLanguage('pl');
    expect(view.pageForTest()).toBe(1);
    expect(document.activeElement).toBe(focus);
    expect(find('[data-journal-page-count]').textContent).toBe('STRONA 2 Z 3');
    expect(find('#journal-day-label').textContent).toBe('DZIEŃ');
    expect(find('[data-journal-night]').textContent).not.toContain('night');
    expect(view.root.getAttribute('aria-label')).toBe('Dziennik przetrwania');
    expect(pageTurn).not.toHaveBeenCalled();
  });

  it('keeps event selection and the pending choice beat', async () => {
    vi.useFakeTimers();
    const view = new SurvivalEventView();
    views.push(view);
    document.body.append(...view.roots);
    await view.showReveal({ id: 'guarded-sleep', danger: 'safe', get revealText() { return getLanguage() === 'en' ? 'Keep watch.' : 'Czuwaj.'; } });
    view.setSelection([{ id: 'watch', label: 'Watch', unavailableReason: null }]);
    const choice = view.choiceButton('watch')!;
    choice.focus();
    let settled = false;
    void view.playChoiceBeat('watch', choice).then(() => { settled = true; });
    vi.advanceTimersByTime(100);
    setLanguage('pl');
    expect(view.choiceButton('watch')).toBe(choice);
    expect(document.activeElement).toBe(choice);
    expect(choice.textContent).toBe('Tak');
    expect(choice.getAttribute('aria-pressed')).toBe('true');
    expect(find('[data-event-title]').textContent).toBe('Pozwolić Carlitosowi czuwać?');
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(140);
    expect(settled).toBe(true);
  });

  it('refreshes focused choices, costs and unavailable reasons on existing buttons', () => {
    const view = new FocusedEventView(document.body);
    views.push(view);
    document.body.append(view.root);
    view.show({ eventId: 'wreckage', target: null, choices: [{ id: 'take', instanceId: null, energyCost: 2,
      get label() { return getLanguage() === 'en' ? 'Take supplies' : 'Zabierz zapasy'; },
      get unavailableReason() { return getLanguage() === 'en' ? 'No energy.' : 'Brak energii.'; },
    }] });
    view.root.removeAttribute('inert');
    const choice = view.choiceButton('take')!;
    choice.focus();
    setLanguage('pl');
    expect(view.choiceButton('take')).toBe(choice);
    expect(document.activeElement).toBe(choice);
    expect(choice.textContent).toContain('Zabierz zapasy');
    expect(choice.getAttribute('aria-description')).toBe('Brak energii.');
    expect(choice.querySelector('.focused-event-view__cost')?.getAttribute('aria-label')).toBe('2 energii');
    expect(find('[data-focused-event-title]').textContent).toBe('Szczątki wraku');
  });

  it('refreshes fishing text without reissuing the cast', () => {
    const view = new SurvivalFishingView(document.body, document.body, () => null);
    views.push(view);
    document.body.append(...view.roots);
    const cast = vi.fn(() => true);
    view.onCast = cast;
    view.setState({ mode: 'aiming', biteTarget: null, get message() { return getLanguage() === 'en' ? 'Cast now.' : 'Zarzuć teraz.'; } });
    view.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    setLanguage('pl');
    expect(find('[data-fishing-message]').textContent).toBe('Zarzuć teraz.');
    view.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(cast).toHaveBeenCalledOnce();
    expect(view.mode()).toBe('aiming');
  });

  it('translates an existing fishing result without resetting its continue action', () => {
    const view = new SurvivalFishingView(document.body, document.body, () => null);
    views.push(view);
    document.body.append(...view.roots);
    view.showResult({ catchTarget: null,
      get caption() { return getLanguage() === 'en' ? 'CATCH' : 'POŁÓW'; },
      get title() { return getLanguage() === 'en' ? 'A fish' : 'Ryba'; },
      get detail() { return getLanguage() === 'en' ? 'Food gained.' : 'Zdobyto jedzenie.'; },
    });
    const continued = vi.fn();
    view.onContinue = continued;
    view.resultRoot.removeAttribute('inert');
    view.resultContinue.focus();
    view.resultContinue.click();
    setLanguage('pl');
    expect(document.activeElement).toBe(view.resultContinue);
    expect(find('[data-fishing-result-title]').textContent).toBe('Ryba');
    expect(find('[data-fishing-result-detail]').textContent).toBe('Zdobyto jedzenie.');
    view.resultContinue.click();
    expect(continued).toHaveBeenCalledOnce();
  });

  it('keeps a reward confirmation pending while translating its text', async () => {
    const view = new SurvivalCoverView();
    views.push(view);
    document.body.append(...view.roots);
    let settled = false;
    void view.showRewardResult({ title: 'DIVE RESULT', reward: null,
      get lines() { return [getLanguage() === 'en' ? 'No supplies.' : 'Brak zapasów.']; },
    }).then(() => { settled = true; });
    view.resultRoot.removeAttribute('inert');
    view.resultClose.focus();
    setLanguage('pl');
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(document.activeElement).toBe(view.resultClose);
    expect(find('[data-dive-result-title]').textContent).toBe('WYNIK NURKOWANIA');
    expect(find('[data-dive-result-lines]').textContent).toBe('Brak zapasów.');
    view.confirmRewardResult();
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it('updates active action reasons and preserves pause menu focus', () => {
    const ui = new SurvivalUI(document.body);
    views.push(ui);
    const session = new SurvivalSession([], { seed: 1 });
    ui.render(session.snapshot(), () => getLanguage() === 'en' ? 'Unavailable now.' : 'Teraz niedostępne.');
    ui.setAnchors([{ id: 'repair', toolId: 'repairTools', itemType: null, action: 'repair', remainingUses: null, x: 10, y: 10, visible: true, depleted: false }]);
    ui.setPaused(true);
    const menu = find<HTMLButtonElement>('[data-pause-menu]');
    menu.focus();
    const action = vi.fn();
    ui.onReturnToMenu = action;
    setLanguage('pl');
    expect(document.activeElement).toBe(menu);
    expect(menu.textContent).toBe('WRÓĆ DO MENU');
    expect(find('[data-anchor-id="repair"]').getAttribute('aria-description')).toContain('Teraz niedostępne.');
    menu.click();
    expect(action).toHaveBeenCalledOnce();
  });

  it('preserves the statistics page, expanded values and summary focus', () => {
    const ui = new SurvivalUI(document.body);
    views.push(ui);
    const session = SurvivalSession.createEndingPreview([], 123, 'rescue');
    const snapshot = session.snapshot();
    ui.render(snapshot, () => null);
    ui.showEnding(snapshot.ending! as Exclude<typeof snapshot.ending, { id: 'dorothy' } | null>);
    find<HTMLButtonElement>('[data-view-statistics]').click();
    find<HTMLDetailsElement>('details').open = true;
    find('summary').focus();
    setLanguage('pl');
    expect(find('[data-ending-statistics]').hidden).toBe(false);
    expect(find<HTMLDetailsElement>('details').open).toBe(true);
    expect(document.activeElement).toBe(find('summary'));
    expect(find('[data-statistics-content]').textContent).toContain('SYGNAŁY RADIOWE');
    expect(find('summary').textContent).toBe('ZOBACZ WARTOŚCI WYKRESU');
  });

  it('removes subscriptions on disposal and uses Polish second forms', () => {
    const view = new SurvivalJournalView();
    const original = view.closeButton.getAttribute('aria-label');
    view.dispose();
    setLanguage('pl');
    expect(view.closeButton.getAttribute('aria-label')).toBe(original);
    expect([1, 2, 5, 12, 22].map(value => uiDynamic('seconds', value))).toEqual([
      '1 SEKUNDA', '2 SEKUNDY', '5 SEKUND', '12 SEKUND', '22 SEKUNDY',
    ]);
  });
});
