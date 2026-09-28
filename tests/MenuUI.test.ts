// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuUI } from '../src/menu/MenuUI';
import { setLanguage } from '../src/i18n/language';

describe('MenuUI how-to-play popup', () => {
  afterEach(() => {
    document.body.replaceChildren();
    delete document.documentElement.dataset.touchControls;
    setLanguage('en');
  });

  it('shows touch instructions in the current language', () => {
    document.documentElement.dataset.touchControls = 'true';
    const ui = new MenuUI(document.body);
    try {
      ui.openGuide();
      const description = document.querySelector<HTMLElement>(
        '[data-menu-guide-section="collect"] [data-menu-guide-description]',
      )!;
      expect(description.textContent).toContain('left stick');
      expect(description.textContent).not.toContain('WASD');
      setLanguage('pl');
      expect(document.querySelector<HTMLElement>(
        '[data-menu-guide-section="collect"] [data-menu-guide-description]',
      )?.textContent).toContain('lewym drążkiem');
    } finally { ui.dispose(); }
  });

  // Importance: 95/100. The guide must name the touch action in each supported language.
  it('describes touch fishing and the Reel button in all three languages', () => {
    document.documentElement.dataset.touchControls = 'true';
    const ui = new MenuUI(document.body);
    try {
      ui.openGuide();
      document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!.click();
      const description = () => document.querySelector<HTMLElement>(
        '[data-menu-guide-section="catch"] [data-menu-guide-description]',
      )?.textContent;
      const image = () => document.querySelector<HTMLImageElement>(
        '[data-menu-guide-section="catch"] img',
      )?.alt;
      expect(description()).toContain('Reel');
      expect(description()).not.toContain('click the bubbles');
      expect(image()).toContain('Reel');
      setLanguage('pl');
      expect(description()).toContain('Zwiń');
      expect(image()).toContain('Zwiń');
      setLanguage('es-AR');
      expect(description()).toContain('Recogé');
      expect(image()).toContain('Recogé');
    } finally { ui.dispose(); }
  });

  it('keeps the scroll region keyboard accessible and traps focus inside the dialog', () => {
    const ui = new MenuUI(document.body);
    try {
      ui.openGuide();
      const dialog = document.querySelector<HTMLElement>('[data-menu-guide]')!;
      const content = document.querySelector<HTMLElement>('[data-menu-guide-sections]')!;
      const close = document.querySelector<HTMLButtonElement>('[data-menu-guide-close]')!;
      const next = document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!;
      expect(content.tabIndex).toBe(0);
      next.focus();
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true }));
      expect(document.activeElement).toBe(close);
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true }));
      expect(document.activeElement).toBe(next);
      content.focus();
      const scroll = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true });
      content.dispatchEvent(scroll);
      expect(scroll.defaultPrevented).toBe(false);
    } finally { ui.dispose(); }
  });
  it('closes with Escape and restores focus to the guide button', () => {
    const ui = new MenuUI(document.body);
    const open = document.querySelector<HTMLButtonElement>('[data-menu-guide-open]')!;
    open.click();

    document.querySelector<HTMLElement>('[data-menu-guide]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(document.querySelector('[data-menu-guide]')?.getAttribute('aria-hidden'))
      .toBe('true');
    expect(document.activeElement).toBe(open);

    ui.dispose();
  });
});

describe('MenuUI pause panel', () => {
  it('opens from the window with only Resume and Settings, then restores focus', () => {
    const ui = new MenuUI(document.body);
    try {
      const start = document.querySelector<HTMLButtonElement>('[data-menu-start]')!;
      start.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const pause = document.querySelector<HTMLElement>('[data-pause]')!;
      const resume = pause.querySelector<HTMLButtonElement>('[data-menu-resume]')!;
      const settings = pause.querySelector<HTMLButtonElement>('[data-open-settings]')!;
      expect([...pause.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual(['Resume', 'Settings']);
      expect(ui.isOverlayOpen).toBe(true);
      expect(document.querySelector('[data-menu]')!.hasAttribute('inert')).toBe(true);
      expect(document.activeElement).toBe(resume);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
      expect(document.activeElement).toBe(settings);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
      expect(document.activeElement).toBe(resume);
      resume.click();
      expect(ui.isOverlayOpen).toBe(false);
      expect(pause.hasAttribute('inert')).toBe(true);
      expect(document.activeElement).toBe(start);
    } finally { ui.dispose(); }
  });

  it('closes the guide first and blocks start and guide actions behind pause', () => {
    const ui = new MenuUI(document.body);
    try {
      const start = vi.fn();
      ui.onStart = start;
      ui.openGuide();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(ui.isOverlayOpen).toBe(false);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      document.querySelector<HTMLButtonElement>('[data-menu-start]')!.click();
      ui.openGuide();
      expect(start).not.toHaveBeenCalled();
      expect(document.querySelector('[data-menu-guide]')!.getAttribute('aria-hidden')).toBe('true');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat: true }));
      expect(ui.isOverlayOpen).toBe(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(ui.isOverlayOpen).toBe(false);
      ui.setTransitioning(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(ui.isOverlayOpen).toBe(false);
    } finally { ui.dispose(); }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('[data-pause]')).toBeNull();
  });
});
