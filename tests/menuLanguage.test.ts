// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { initializeLanguage, setLanguage, type Language } from '../src/i18n/language';
import { MenuUI } from '../src/menu/MenuUI';

let menu: MenuUI | null = null;
afterEach(() => {
  menu?.dispose();
  menu = null;
  initializeLanguage(null);
  document.body.replaceChildren();
});

it.each<Language>(['pl', 'es-AR'])('translates both sections on every page into %s without moving focus', (language) => {
  menu = new MenuUI(document.body);
  menu.openGuide();
  const next = document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!;
  const previous = document.querySelector<HTMLButtonElement>('[data-menu-guide-previous]')!;
  for (let page = 1; page <= 4; page += 1) {
    setLanguage('en');
    const english = [...document.querySelectorAll('[data-menu-guide-description]')].map(p => p.textContent);
    const englishAlt = [...document.querySelectorAll<HTMLImageElement>('[data-menu-guide-image]')].map(img => img.alt);
    const focused = page < 4 ? next : previous;
    focused.focus();
    setLanguage(language);
    expect(document.documentElement.lang).toBe(language);
    expect(document.activeElement).toBe(focused);
    expect(document.querySelector<HTMLElement>('[data-menu-guide]')!.dataset.page).toBe(String(page));
    expect(document.querySelector('[data-menu-guide-page-count]')!.textContent)
      .toBe(language === 'pl' ? `STRONA ${page} Z 4` : `PÁGINA ${page} DE 4`);
    const descriptions = [...document.querySelectorAll('[data-menu-guide-description]')];
    expect(descriptions).toHaveLength(2);
    descriptions.forEach((paragraph, index) => {
      expect(paragraph.textContent).not.toBe(english[index]);
      expect(paragraph.textContent!.length).toBeGreaterThan(100);
      expect(paragraph.textContent).not.toContain('\n');
    });
    const images = [...document.querySelectorAll<HTMLImageElement>('[data-menu-guide-image]')];
    images.forEach((image, index) => {
      expect(image.alt).not.toBe(englishAlt[index]);
      if (page > 1) expect(image.src).toContain(`-${language}.jpg`);
    });
    if (page < 4) next.click();
  }
});

it.each<Language>(['en', 'pl', 'es-AR'])('ships every screenshot referenced by the %s guide', (language) => {
  setLanguage(language);
  menu = new MenuUI(document.body);
  menu.openGuide();
  const next = document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!;
  for (let page = 1; page <= 4; page += 1) {
    const images = [...document.querySelectorAll<HTMLImageElement>('[data-menu-guide-image]')];
    for (const image of images) {
      const path = image.getAttribute('src')!;
      const asset = path.slice(path.indexOf('images/how-to-play/'));
      expect(existsSync(resolve('public', asset)), `Missing guide screenshot: ${asset}`).toBe(true);
    }
    if (page < 4) next.click();
  }
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