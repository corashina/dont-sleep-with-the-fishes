// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { MenuUI } from '../src/menu/MenuUI';

describe('MenuUI how-to-play popup', () => {
  afterEach(() => {
    document.body.replaceChildren();
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
    expect(document.querySelector<HTMLImageElement>('[data-menu-guide-image]')?.src)
      .toContain('/images/how-to-play/survival-fishing.png');
    expect(document.querySelector<HTMLImageElement>('[data-menu-guide-image]')?.alt)
      .toBe('Fishing view over the lifeboat bow with the red bobber clearly visible to the right of the rod.');

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
