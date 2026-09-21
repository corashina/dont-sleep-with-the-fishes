// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLanguage, setLanguage } from '../src/i18n/language';
import { uiDynamic } from '../src/i18n/uiDynamicMessages';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { GameUI } from '../src/ui/GameUI';
import { SurvivalJournalView } from '../src/ui/SurvivalJournalView';
import { SurvivalEventView } from '../src/ui/SurvivalEventView';
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
    setLanguage('es-AR');
    expect(document.activeElement).toBe(resume);
    expect(resume.textContent).toBe('CONTINUAR');
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
    view.show([1, 2, 3].map(day => ({ day, weather: 'calm', nightWeather: 'calm', actions: [], daytime: null, nighttime: { kind: 'quiet' } })));
    view.previous();
    const pageTurn = vi.fn();
    view.onPage = pageTurn;
    const focus = document.activeElement;
    setLanguage('pl');
    expect(view.pageForTest()).toBe(1);
    expect(document.activeElement).toBe(focus);
    expect(find('[data-journal-page-count]').textContent).toBe('STRONA 2 Z 3');
    expect(find('#journal-day-label').textContent).toBe('DZIEŃ 2');
    expect(find('[data-journal-night]').textContent).not.toContain('night');
    expect(view.root.getAttribute('aria-label')).toBe('Dziennik przetrwania');
    expect(pageTurn).not.toHaveBeenCalled();
    setLanguage('es-AR');
    expect(view.pageForTest()).toBe(1);
    expect(document.activeElement).toBe(focus);
    expect(find('[data-journal-page-count]').textContent).toBe('PÁGINA 2 DE 3');
    expect(find('#journal-day-label').textContent).toBe('DÍA 2');
    expect(pageTurn).not.toHaveBeenCalled();
  });

  it('keeps event selection and the pending choice beat', async () => {
    vi.useFakeTimers();
    const view = new SurvivalEventView();
    views.push(view);
    document.body.append(...view.roots);
    await view.showReveal({ id: 'guarded-sleep', danger: 'safe', get revealText() { return getLanguage() === 'en' ? 'Keep watch.' : 'Czuwaj.'; } });
    view.setSelection([
      { id: 'watch', label: 'Watch', unavailableReason: null },
      { id: 'sleep', label: 'Sleep Normally', unavailableReason: null },
    ]);
    const choice = view.choiceButton('watch')!;
    expect(view.choiceButton('sleep')?.textContent).toBe('No');
    choice.focus();
    let settled = false;
    void view.playChoiceBeat('watch', choice).then(() => { settled = true; });
    vi.advanceTimersByTime(100);
    setLanguage('pl');
    expect(view.choiceButton('watch')).toBe(choice);
    expect(document.activeElement).toBe(choice);
    expect(choice.textContent).toBe('Tak');
    expect(view.choiceButton('sleep')?.textContent).toBe('Nie');
    expect(choice.getAttribute('aria-pressed')).toBe('true');
    expect(find('[data-event-title]').textContent).toBe('Pozwolić Carlitosowi czuwać?');
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(140);
    expect(settled).toBe(true);
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
    expect(find('[data-dive-result-title]').textContent).toBe('ODZYSKANE ZAPASY');
    expect(find('[data-dive-result-lines]').textContent).toBe('Brak zapasów.');
    view.confirmRewardResult();
    await Promise.resolve();
    expect(settled).toBe(true);
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
