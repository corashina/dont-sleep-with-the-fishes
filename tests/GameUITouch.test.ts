// @vitest-environment jsdom
// Importance: 95/100. The keyboard intro hint must not cover the touch skip target.
import { afterEach, describe, expect, it } from 'vitest';
import { GameUI } from '../src/ui/GameUI';

afterEach(() => document.body.replaceChildren());

describe('GameUI touch instructions', () => {
  it('hides the Space hint for touch and restores it for desktop', () => {
    const ui = new GameUI(document.body);
    const hint = document.querySelector<HTMLElement>('[data-intro-skip]')!;
    ui.setTouchMode(true);
    ui.setPresentation('intro');
    expect(hint.hidden).toBe(true);
    ui.setTouchMode(false);
    expect(hint.hidden).toBe(false);
    ui.dispose();
  });
});
