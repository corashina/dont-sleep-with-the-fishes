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

it('refreshes pointer-lock help with an open guide and stops updating after disposal', () => {
  menu = new MenuUI(document.body);
  menu.showPointerLockError();
  menu.openGuide();
  setLanguage('es-AR');
  expect(document.querySelector('[data-menu-pointer-lock-error]')?.textContent).toContain('Hacé clic');
  setLanguage('pl');
  expect(document.querySelector('[data-menu-pointer-lock-error]')?.textContent).toContain('przechwycenie kursora');
  const section = document.querySelector('[data-menu-guide-section]')!;
  const before = section.textContent;
  menu.dispose();
  setLanguage('en');
  expect(section.textContent).toBe(before);
});
