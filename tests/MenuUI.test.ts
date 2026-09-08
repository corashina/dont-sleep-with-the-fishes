// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuUI } from '../src/menu/MenuUI';

describe('MenuUI how-to-play popup', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('pairs two screenshots with subtitles and paragraphs on all four pages', () => {
    const ui = new MenuUI(document.body);
    try {
      ui.openGuide();
      const next = document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!;
      const previous = document.querySelector<HTMLButtonElement>('[data-menu-guide-previous]')!;
      const titles = ['Scavenging', 'Survival', 'Day', 'Night'];
      const sectionIds = [['collect', 'evacuate'], ['needs', 'catch'], ['hullRepair', 'drifting'], ['nightEvent', 'nightResponse']];
      expect(previous.disabled).toBe(true);
      titles.forEach((title, index) => {
        expect(document.querySelector('[data-menu-guide-title]')?.textContent).toBe(title);
        expect(document.querySelector('[data-menu-guide-page-count]')?.textContent).toBe(`PAGE ${index + 1} OF 4`);
        const sections = [...document.querySelectorAll('[data-menu-guide-section]')];
        expect(sections).toHaveLength(2);
        expect(sections.map(section => section.getAttribute('data-menu-guide-section'))).toEqual(sectionIds[index]);
        expect(document.querySelectorAll('[data-menu-guide] p')).toHaveLength(2);
        for (const section of sections) {
          const image = section.querySelector('img')!;
          const subtitle = section.querySelector('h3')!;
          expect(image.alt.length).toBeGreaterThan(10);
          expect(subtitle.textContent!.length).toBeGreaterThan(0);
          expect(section.getAttribute('aria-labelledby')).toBe(subtitle.id);
          expect(section.querySelectorAll('p')).toHaveLength(1);
          expect(section.querySelector('p')!.textContent!.trim()).not.toContain('\n');
          if (index === 1 || index === 2) {
            expect(section.querySelector('p')!.textContent!.trim().split(/\s+/).length).toBeLessThanOrEqual(120);
          }
        }
        if (index === 0) expect(document.querySelector('[data-menu-guide] strong')).toBeNull();
        if (index < titles.length - 1) next.click();
      });
      expect(next.disabled).toBe(true);
      expect(document.activeElement).toBe(previous);
    } finally { ui.dispose(); }
  });

  it('supports page boundaries, scroll reset, and reopening at the first page', () => {
    const ui = new MenuUI(document.body);
    try {
      ui.openGuide();
      const dialog = document.querySelector<HTMLElement>('[data-menu-guide]')!;
      const content = document.querySelector<HTMLElement>('[data-menu-guide-sections]')!;
      const key = (value: string) => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
      content.scrollTop = 240;
      key('End');
      expect(dialog.dataset.page).toBe('4');
      expect(content.scrollTop).toBe(0);
      key('ArrowRight');
      expect(dialog.dataset.page).toBe('4');
      key('ArrowLeft');
      expect(dialog.dataset.page).toBe('3');
      key('Home');
      expect(dialog.dataset.page).toBe('1');
      key('ArrowLeft');
      expect(dialog.dataset.page).toBe('1');
      key('End');
      key('Escape');
      ui.openGuide();
      expect(dialog.dataset.page).toBe('1');
      content.scrollTop = 240;
      key('Escape');
      ui.openGuide();
      expect(content.scrollTop).toBe(0);
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
