// @vitest-environment jsdom
// Importance: 8/10 (scaled from 4/5). Protects start guidance and keyboard access.

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

    expect(pause.querySelector('.screen__content')?.classList).toContain('scuba-popup-paper');
    expect(pause.textContent).toContain('Back to the deck?');
    expect(pause.textContent).not.toContain('THE CLOCK IS STILL');
    expect(pause.textContent).not.toContain('The countdown is stopped');
    expect(pause.querySelector('[data-resume-button]')).not.toBeNull();
    expect(mainStyles).toMatch(
      /\.pause-screen \.illustrated-warning:not\(\.is-visible\)\s*\{[^}]*display:\s*none/s,
    );

    ui.dispose();
  });
});

describe('GameUI ending', () => {
  it('shows the Dorothy epilogue and restart action', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    ui.renderEnding('menuReady', 1, {
      id: 'dorothy', day: 0, savedPickupCount: 7,
    });

    expect(mount.querySelector('[data-ending-body]')?.textContent)
      .toBe('Dorothy took you down before the lifeboat cleared her side.');
    expect(mount.querySelector('[data-ending-stats]')?.textContent)
      .toBe('BEFORE DAY 1 · 7 PICKUPS SAVED');
    expect(mount.querySelector('[data-ending-action]')?.textContent)
      .toContain('START FROM THE SHIP');

    ui.dispose();
  });

  it('uses the shared sparse ending panel', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const ending = mount.querySelector<HTMLElement>('[data-ending]')!;

    expect(ending.querySelector('.screen__content')?.classList).toContain('scuba-popup-paper');
    expect(ending.querySelector('[data-ending-title]')).not.toBeNull();
    expect(ending.querySelector('[data-ending-body]')).not.toBeNull();
    expect(ending.querySelector('[data-ending-cause]')).not.toBeNull();
    expect(ending.querySelector('[data-ending-stats]')).not.toBeNull();
    expect(ending.querySelector('[data-ending-action]')).not.toBeNull();

    ui.dispose();
  });

  it('updates ending text only when the Dorothy record changes', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const first = { id: 'dorothy', day: 0, savedPickupCount: 7 } as const;
    const endingBody = mount.querySelector<HTMLElement>('[data-ending-body]')!;

    ui.renderEnding('endingHold', 1, first);
    endingBody.textContent = 'cached';
    ui.renderEnding('menuReady', 1, first);
    expect(endingBody.textContent).toBe('cached');

    ui.renderEnding('menuReady', 1, {
      id: 'dorothy', day: 0, savedPickupCount: 8,
    });
    expect(endingBody.textContent)
      .toBe('Dorothy took you down before the lifeboat cleared her side.');

    ui.dispose();
  });
});
