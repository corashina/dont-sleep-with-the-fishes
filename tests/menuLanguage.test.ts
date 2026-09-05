// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { initializeLanguage, setLanguage } from '../src/i18n/language';
import { MenuUI } from '../src/menu/MenuUI';

let menu: MenuUI | null = null;
afterEach(() => {
  menu?.dispose();
  menu = null;
  initializeLanguage(null);
  document.body.replaceChildren();
});

it('changes an open guide and error while keeping its page and keyboard focus', () => {
  menu = new MenuUI(document.body);
  menu.showPointerLockError();
  menu.openGuide();
  const next = document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!;
  next.click();
  next.focus();
  setLanguage('pl');
  expect(document.documentElement.lang).toBe('pl');
  expect(document.querySelector('[data-menu-guide-title]')?.textContent).toBe('Przetrwanie');
  expect(document.querySelector('[data-menu-guide-image]')?.getAttribute('src')).toContain('survival-day-pl.jpg');
  expect(document.querySelector('[data-menu-guide-page-count]')?.textContent).toBe('STRONA 2 Z 4');
  expect(document.querySelectorAll('[data-menu-guide-image]')).toHaveLength(2);
  expect(document.querySelectorAll<HTMLImageElement>('[data-menu-guide-image]')[1]!.alt).toContain('spławik');
  expect(document.querySelector('[data-menu-guide-description]')?.textContent).toContain('Niewykorzystana energia przepada.');
  expect(document.querySelector('[data-menu-pointer-lock-error]')?.textContent).toContain('przechwycenie kursora');
  expect(document.activeElement).toBe(next);
  expect(document.querySelector('[data-menu-guide]')?.getAttribute('aria-hidden')).toBe('false');
  setLanguage('en');
  expect(document.querySelector('[data-menu-guide-title]')?.textContent).toBe('Survival');
  expect(document.querySelector('[data-menu-guide-image]')?.getAttribute('src')).toContain('survival-day.png');
  expect(document.querySelector('[data-menu-guide-description]')?.textContent).toContain('Unused energy does not carry over.');
  expect(document.activeElement).toBe(next);
});

it('translates Day and Night screenshots and descriptions in order', () => {
  menu = new MenuUI(document.body);
  menu.openGuide();
  const next = document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!;
  next.click();
  next.click();
  setLanguage('pl');
  expect(document.querySelector('[data-menu-guide-title]')?.textContent).toBe('Dzień');
  expect(document.querySelectorAll<HTMLImageElement>('[data-menu-guide-image]')[1]!.src)
    .toContain('survival-loot-pl.jpg');
  expect(document.querySelector<HTMLImageElement>('[data-menu-guide-image]')!.src)
    .toContain('survival-repair-pl.jpg');
  expect(document.querySelector('[data-menu-guide-description]')?.textContent).toContain('skrzynkę z narzędziami');
  setLanguage('en');
  expect(document.querySelectorAll<HTMLImageElement>('[data-menu-guide-image]')[1]!.src)
    .toContain('survival-loot.png');
  next.click();
  setLanguage('pl');
  expect(document.querySelectorAll('[data-menu-guide-image]')).toHaveLength(2);
  expect(document.querySelectorAll<HTMLImageElement>('[data-menu-guide-image]')[1]!.src)
    .toContain('survival-night-event-pl.jpg');
  expect(document.querySelector('[data-menu-guide-description]')?.textContent).toContain('świecą na biało');
  setLanguage('en');
  expect(document.querySelectorAll<HTMLImageElement>('[data-menu-guide-image]')[1]!.src)
    .toContain('survival-night-event.png');
});

it('uses the selected language on creation and stops updating a disposed guide', () => {
  setLanguage('pl');
  menu = new MenuUI(document.body);
  const guide = document.querySelector('[data-menu-guide-title]')!;
  expect(guide.textContent).toBe('Zbieranie zapasów');
  menu.dispose();
  setLanguage('en');
  expect(guide.textContent).toBe('Zbieranie zapasów');
});
