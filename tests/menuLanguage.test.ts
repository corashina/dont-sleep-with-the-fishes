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
  next.click();
  next.focus();
  setLanguage('pl');
  expect(document.documentElement.lang).toBe('pl');
  expect(document.querySelector('[data-menu-guide-title]')?.textContent).toBe('Energia');
  expect(document.querySelector('[data-menu-guide-image]')?.getAttribute('src')).toContain('survival-energy-pl.jpg');
  expect(document.querySelector('[data-menu-guide-page-count]')?.textContent).toBe('STRONA 3 Z 6');
  expect(document.querySelector('[data-menu-guide-description]')?.textContent).toContain('Niewykorzystana energia przepada.');
  expect(document.querySelector('[data-menu-pointer-lock-error]')?.textContent).toContain('przechwycenie kursora');
  expect(document.activeElement).toBe(next);
  expect(document.querySelector('[data-menu-guide]')?.getAttribute('aria-hidden')).toBe('false');
  setLanguage('en');
  expect(document.querySelector('[data-menu-guide-title]')?.textContent).toBe('Energy');
  expect(document.querySelector('[data-menu-guide-image]')?.getAttribute('src')).toContain('survival-energy.png');
  expect(document.activeElement).toBe(next);
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
