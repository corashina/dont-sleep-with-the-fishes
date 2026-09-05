// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuUI } from '../src/menu/MenuUI';

describe('MenuUI how-to-play popup', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('moves through all six pages with buttons and arrow keys', () => {
    const ui = new MenuUI(document.body);
    document.querySelector<HTMLButtonElement>('[data-menu-guide-open]')!.click();
    const dialog = document.querySelector<HTMLElement>('[data-menu-guide]')!;
    const next = document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!;
    const previous = document.querySelector<HTMLButtonElement>('[data-menu-guide-previous]')!;
    const titles = ['Scavenging', 'Survival', 'Energy', 'Fishing', 'Night', 'Items'];

    expect(previous.disabled).toBe(true);
    titles.forEach((title, index) => {
      expect(document.querySelector('[data-menu-guide-title]')?.textContent).toBe(title);
      expect(document.querySelector('[data-menu-guide-page-count]')?.textContent)
        .toBe(`PAGE ${index + 1} OF 6`);
      if (index < titles.length - 1) next.click();
    });
    expect(document.querySelector('[data-menu-guide-page-count]')?.textContent)
      .toBe('PAGE 6 OF 6');
    expect(next.disabled).toBe(true);

    dialog.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
    }));
    expect(document.querySelector('[data-menu-guide-title]')?.textContent)
      .toBe('Night');
    expect(document.querySelector<HTMLImageElement>('[data-menu-guide-image]')?.src)
      .toContain('/images/how-to-play/survival-night.png');
    expect(document.querySelector<HTMLImageElement>('[data-menu-guide-image]')?.alt)
      .toBe('The lifeboat at night as an uncertain event begins.');

    ui.dispose();
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

  it('closes when the backdrop is pressed but stays open for panel presses', () => {
    const ui = new MenuUI(document.body);
    const open = document.querySelector<HTMLButtonElement>('[data-menu-guide-open]')!;
    const dialog = document.querySelector<HTMLElement>('[data-menu-guide]')!;
    const panel = document.querySelector<HTMLElement>('.how-to-play-popup')!;

    open.click();
    panel.click();
    expect(dialog.getAttribute('aria-hidden')).toBe('false');

    dialog.click();
    expect(dialog.getAttribute('aria-hidden')).toBe('true');
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
