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

describe('GameUI ownership', () => {
  it('contains no title or guide ownership', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    expect(mount.querySelector('[data-start]')).toBeNull();
    expect(mount.querySelector('[data-how-to-play]')).toBeNull();
    expect(mount.querySelector('[data-hud]')).not.toBeNull();

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
