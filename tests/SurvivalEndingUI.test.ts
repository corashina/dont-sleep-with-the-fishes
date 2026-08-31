// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalUI } from '../src/ui/SurvivalUI';

let ui: SurvivalUI | undefined;

afterEach(() => {
  ui?.dispose();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function setup() {
  vi.useFakeTimers();
  ui = new SurvivalUI(document.body);
  return {
    ui,
    root: document.querySelector<HTMLElement>('[data-ending]')!,
    panel: document.querySelector<HTMLElement>('[data-ending] > div')!,
    title: document.querySelector<HTMLElement>('[data-ending-title]')!,
    restart: document.querySelector<HTMLButtonElement>('[data-restart]')!,
    menu: document.querySelector<HTMLButtonElement>('[data-ending-menu]')!,
  };
}

describe('survival ending animation', () => {
  it.each(['death', 'sinking'] as const)('fades %s before showing its popup and menu controls', (id) => {
    const view = setup();
    const restart = vi.fn();
    const menu = vi.fn();
    view.ui.onRestart = restart;
    view.ui.onReturnToMenu = menu;
    const record = id === 'death'
      ? { id, day: 8, savedPickupCount: 4, cause: { kind: 'starvation' as const } }
      : { id, day: 8, savedPickupCount: 4, cause: { eventId: 'tornado' } };

    view.ui.showEnding(record);
    expect(view.panel.hidden).toBe(true);
    expect(document.activeElement).toBe(view.root);
    expect(document.querySelector('[data-boat-anchors]')?.hasAttribute('inert')).toBe(true);
    view.restart.click();
    view.menu.click();
    expect(restart).not.toHaveBeenCalled();
    expect(menu).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1499);
    view.ui.showEnding(record);
    expect(view.panel.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(view.panel.hidden).toBe(false);
    expect(document.activeElement).toBe(view.title);
    expect(view.title.textContent).toBe(id === 'death' ? 'THE SEA OUTLASTED YOU' : 'THE BOAT IS GONE');
    expect(document.querySelector('[data-ending-stats]')?.textContent).toBe('DAY 8');
    view.menu.click();
    view.menu.click();
    view.restart.click();
    expect(menu).toHaveBeenCalledOnce();
    expect(restart).not.toHaveBeenCalled();
    expect(view.menu.disabled).toBe(true);
    expect(view.restart.disabled).toBe(true);
  });

  it('cancels popup work when disposed during the fade', () => {
    const view = setup();
    view.ui.showEnding({ id: 'death', day: 2, savedPickupCount: 1, cause: { kind: 'other' } });
    view.ui.dispose();
    vi.advanceTimersByTime(2000);
    expect(view.panel.hidden).toBe(true);
    expect(document.querySelector('[data-ending]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps keyboard focus out of the popup until the fade ends', () => {
    const view = setup();
    view.ui.showEnding({ id: 'death', day: 2, savedPickupCount: 1, cause: { kind: 'other' } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(view.root);
    vi.advanceTimersByTime(1500);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(view.restart);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(view.menu);
  });

  it('does not steal pause focus when the fade finishes', () => {
    const view = setup();
    view.ui.showEnding({ id: 'sinking', day: 2, savedPickupCount: 1, cause: { eventId: null } });
    view.ui.setPaused(true);
    vi.advanceTimersByTime(1500);
    expect(document.activeElement).toBe(document.querySelector('[data-resume]'));
    expect(view.root.hasAttribute('inert')).toBe(true);
    view.ui.setPaused(false);
    expect(document.activeElement).toBe(view.title);
  });

  it('keeps rescue immediate and prevents a second action after restart', () => {
    const view = setup();
    const restart = vi.fn();
    const menu = vi.fn();
    view.ui.onRestart = restart;
    view.ui.onReturnToMenu = menu;
    view.ui.showEnding({ id: 'rescue', day: 30, savedPickupCount: 4, signalAssisted: false });
    expect(view.panel.hidden).toBe(false);
    expect(document.activeElement).toBe(view.title);
    view.restart.click();
    view.menu.click();
    expect(restart).toHaveBeenCalledOnce();
    expect(menu).not.toHaveBeenCalled();
  });
});
