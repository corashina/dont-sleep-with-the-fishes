// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { MenuUI } from '../src/menu/MenuUI';

describe('MenuUI how-to-play journal', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('opens on the scavenging page and shows no control list', () => {
    const ui = new MenuUI(document.body);
    const open = document.querySelector<HTMLButtonElement>('[data-menu-guide-open]')!;
    open.click();

    const dialog = document.querySelector<HTMLElement>('[data-menu-guide]')!;
    expect(dialog.getAttribute('aria-hidden')).toBe('false');
    expect(document.querySelector('[data-menu-guide-title]')?.textContent)
      .toBe('SCAVENGE DOROTHY');
    expect(document.querySelector('[data-menu-guide-page-count]')?.textContent)
      .toBe('PAGE 1 OF 4');
    expect(document.querySelector<HTMLImageElement>('[data-menu-guide-image]')?.src)
      .toContain('/images/how-to-play/scavenging.png');
    expect(dialog.querySelector('.controls')).toBeNull();

    ui.dispose();
  });

  it('moves through all four pages with buttons and arrow keys', () => {
    const ui = new MenuUI(document.body);
    document.querySelector<HTMLButtonElement>('[data-menu-guide-open]')!.click();
    const dialog = document.querySelector<HTMLElement>('[data-menu-guide]')!;
    const next = document.querySelector<HTMLButtonElement>('[data-menu-guide-next]')!;
    const previous = document.querySelector<HTMLButtonElement>('[data-menu-guide-previous]')!;

    expect(previous.disabled).toBe(true);
    next.click();
    expect(document.querySelector('[data-menu-guide-title]')?.textContent)
      .toBe('SURVIVE THE DAY');

    dialog.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'End',
      bubbles: true,
    }));
    expect(document.querySelector('[data-menu-guide-title]')?.textContent)
      .toBe('FACE THE NIGHT');
    expect(next.disabled).toBe(true);

    dialog.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
    }));
    expect(document.querySelector('[data-menu-guide-title]')?.textContent)
      .toBe('FISH FOR FOOD');

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
});
