// @vitest-environment jsdom
// Importance: 4/5. Protects start guidance and keyboard access.

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCAVENGE_DURATION_SECONDS } from '../src/game/scavengeRules';
import type { ScavengeSnapshot } from '../src/game/ScavengeSession';
import { GameUI } from '../src/ui/GameUI';

const mainStyles = readFileSync('src/styles/main.css', 'utf8') as string;

afterEach(() => {
  document.body.innerHTML = '';
});

const snapshot: ScavengeSnapshot = {
  status: 'running',
  remainingSeconds: SCAVENGE_DURATION_SECONDS,
  savedCount: 0,
  carriedWeight: 0,
  carriedItems: [],
  items: {},
  carriedItem: null,
};

describe('GameUI How to Play guide', () => {
  it('moves controls from the title into an illustrated corner guide', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const start = mount.querySelector<HTMLElement>('[data-start]')!;
    const opener = start.querySelector<HTMLButtonElement>('[data-how-to-play-open]')!;

    expect(start.querySelector('.controls')).toBeNull();
    expect(opener.textContent).toContain('HOW TO PLAY');
    expect(opener.getAttribute('aria-haspopup')).toBe('dialog');
    expect(opener.querySelector('[data-ui-artwork="howToPlay"]')).not.toBeNull();
    expect(mainStyles).toMatch(/\.start-screen h1\s*\{[^}]*width:\s*max-content/s);
    expect(mainStyles).toMatch(/\.start-screen h1\s*\{[^}]*max-width:\s*none/s);
    expect(mainStyles).toMatch(/\.how-to-play-marker\s*\{[^}]*aspect-ratio:\s*1/s);
    expect(mainStyles).toMatch(/\.how-to-play-marker\s*\{[^}]*border-radius:\s*50%/s);

    opener.click();

    const guide = mount.querySelector<HTMLElement>('[data-how-to-play]')!;
    const close = guide.querySelector<HTMLButtonElement>('[data-how-to-play-close]')!;
    expect(guide.classList).toContain('is-visible');
    expect(guide.getAttribute('aria-hidden')).toBe('false');
    expect(guide.hasAttribute('inert')).toBe(false);
    expect(start.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(close);
    expect(guide.textContent).toContain('SEARCH THE SHIP');
    expect(guide.textContent).toContain('SURVIVE THE SEA');
    expect(guide.querySelectorAll('.how-to-play-controls__grid > div')).toHaveLength(6);

    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(guide.classList).not.toContain('is-visible');
    expect(guide.getAttribute('aria-hidden')).toBe('true');
    expect(start.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);

    opener.click();
    close.click();
    expect(guide.classList).not.toContain('is-visible');
    expect(document.activeElement).toBe(opener);

    ui.dispose();
  });

  it('keeps keyboard focus inside the open guide', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const opener = mount.querySelector<HTMLButtonElement>('[data-how-to-play-open]')!;
    const close = mount.querySelector<HTMLButtonElement>('[data-how-to-play-close]')!;
    opener.click();

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    close.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    ui.dispose();
  });
});

describe('GameUI scavenging clock', () => {
  it('restarts its keyed scale beat when each shown second changes', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const clock = mount.querySelector<HTMLElement>('.pocket-watch')!;
    const status = mount.querySelector<HTMLElement>('[data-scavenge-status]')!;
    const carried = mount.querySelector<HTMLElement>('[data-carried]')!;

    expect([...status.children]).toEqual([carried, clock]);
    expect(mainStyles).toMatch(/\.scavenge-status\s*\{[^}]*display:\s*flex/s);
    expect(mainStyles).toMatch(/\.scavenge-status\s*\{[^}]*align-items:\s*center/s);

    ui.render({ ...snapshot, remainingSeconds: SCAVENGE_DURATION_SECONDS - 0.2 });
    expect(clock.dataset.tick).toBeUndefined();
    ui.render({ ...snapshot, remainingSeconds: SCAVENGE_DURATION_SECONDS - 1 });
    expect(clock.dataset.tick).toBe(String((SCAVENGE_DURATION_SECONDS - 1) % 2));
    ui.render({ ...snapshot, remainingSeconds: SCAVENGE_DURATION_SECONDS - 2 });
    expect(clock.dataset.tick).toBe(String((SCAVENGE_DURATION_SECONDS - 2) % 2));

    expect(mainStyles).toMatch(/--scavenge-clock-size:\s*clamp\(92px, 18vw, 224px\)/);
    expect(mainStyles).toMatch(/@keyframes pocket-watch-tick-even/);
    expect(mainStyles).toMatch(/@keyframes pocket-watch-tick-odd/);
    ui.dispose();
  });
});

describe('GameUI pause menu', () => {
  it('shows only the pause title and controls', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const pause = mount.querySelector<HTMLElement>('[data-pause]')!;

    expect(pause.textContent).toContain('Back to the deck?');
    expect(pause.textContent).not.toContain('THE CLOCK IS STILL');
    expect(pause.textContent).not.toContain('The countdown is stopped');
    expect(pause.querySelector('[data-resume-button]')).not.toBeNull();

    ui.dispose();
  });
});

describe('GameUI ending', () => {
  it('shows only the ending title and control', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const ending = mount.querySelector<HTMLElement>('[data-ending]')!;

    expect(ending.textContent).toContain('SUNK WITH DOROTHY');
    expect(ending.textContent).not.toContain('ENDING I');
    expect(ending.textContent).not.toContain('You stayed aboard');
    expect(ending.querySelector('[data-ending-action]')).not.toBeNull();

    ui.dispose();
  });
});
