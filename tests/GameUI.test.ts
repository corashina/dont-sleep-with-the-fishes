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
