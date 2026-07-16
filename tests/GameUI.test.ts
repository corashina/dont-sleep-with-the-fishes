// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ItemInstance } from '../src/game/ItemState';
import { ScavengeSession, type ScavengeSnapshot } from '../src/game/ScavengeSession';
import { getSinkingState } from '../src/game/sinking';
import { GameUI } from '../src/ui/GameUI';

const mainStyles = readFileSync('src/styles/main.css', 'utf8') as string;

function snapshot(overrides: Partial<ScavengeSnapshot> = {}): ScavengeSnapshot {
  return {
    ...new ScavengeSession().snapshot(),
    status: 'running',
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('GameUI', () => {
  it('keeps the critical watch timer at least 3:1 against its composited backing', () => {
    const criticalToken = mainStyles.match(
      /\.pocket-watch \[data-timer\]\.is-critical\s*\{[^}]*color:\s*var\((--[\w-]+)\);/s,
    )?.[1];
    const timerBacking = mainStyles.match(
      /\.pocket-watch \[data-timer\]\s*\{[^}]*background:\s*(#[0-9a-f]{8});/is,
    )?.[1];
    const watchGold = mainStyles.match(/\.pocket-watch__art\s*\{[^}]*color:\s*(#[0-9a-f]{6})/is)?.[1];
    expect(criticalToken).toBeDefined();
    const criticalColor = criticalToken
      ? mainStyles.match(new RegExp(`${criticalToken}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
      : undefined;
    expect(criticalColor).toBeDefined();
    expect(timerBacking).toBeDefined();
    expect(watchGold).toBeDefined();
    if (!criticalColor || !timerBacking || !watchGold) return;

    const channels = (hex: string): number[] => hex.slice(1).match(/.{2}/g)!
      .map((channel) => Number.parseInt(channel, 16) / 255);
    const luminance = (rgb: number[]): number => {
      const linearChannels = rgb
        .map((channel) => channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linearChannels[0]! + 0.7152 * linearChannels[1]! + 0.0722 * linearChannels[2]!;
    };
    const foreground = luminance(channels(criticalColor));
    const backing = channels(timerBacking);
    const gold = channels(watchGold);
    const backingAlpha = backing[3]!;
    const compositedBacking = backing.slice(0, 3).map(
      (channel, index) => channel * backingAlpha + gold[index]! * (1 - backingAlpha),
    );
    const background = luminance(compositedBacking);
    const ratio = (Math.max(foreground, background) + 0.05)
      / (Math.min(foreground, background) + 0.05);

    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it('stacks the watch below the carry circles and backs the countdown', () => {
    expect(mainStyles).toMatch(
      /\.carried\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*center;/s,
    );
    expect(mainStyles).toMatch(
      /\.pocket-watch\s*\{[^}]*position:\s*relative;[^}]*top:\s*auto;[^}]*right:\s*auto;[^}]*left:\s*auto;/s,
    );
    expect(mainStyles).toMatch(
      /\.pocket-watch \[data-timer\]\s*\{[^}]*background:\s*#090b0ce6;[^}]*color:\s*var\(--ink-bone\);/s,
    );
    expect(mainStyles).not.toMatch(
      /@media \(max-width:\s*980px\)[\s\S]*?\.pocket-watch\s*\{\s*right:\s*82px;/,
    );
  });

  it('keeps the critical countdown centered throughout its jolt animation', () => {
    expect(mainStyles).toMatch(
      /@keyframes watch-jolt\s*\{\s*50%\s*\{\s*transform:\s*translateX\(-50%\)\s+rotate\(-2deg\)\s+scale\(1\.06\);\s*\}\s*\}/s,
    );
  });

  it('shows a distinct failure layer before revealing the result', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);

    ui.showFailureSequence();
    expect(mount.querySelector('[data-failure]')?.classList).toContain('is-visible');
    expect(mount.querySelector('[data-result]')?.classList).not.toContain('is-visible');

    ui.showFailureResult(snapshot({ status: 'failure', remainingSeconds: 0 }));
    expect(mount.querySelector('[data-failure]')?.classList).not.toContain('is-visible');
    expect(mount.querySelector('[data-result]')?.classList).toContain('is-visible');
    expect(mount.querySelector('[data-result-title]')?.textContent).toBe('Taken by the Sea');
  });

  it('starts with three empty visual weight circles and no capacity text', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const indicator = mount.querySelector<HTMLElement>('[data-carried-items]')!;
    const circles = [...indicator.querySelectorAll<HTMLElement>('[data-weight-circle]')];

    expect(circles).toHaveLength(3);
    expect(circles.every((circle) => !circle.classList.contains('is-filled'))).toBe(true);
    expect(indicator.textContent).toBe('');
    expect(indicator.getAttribute('aria-label')).toBeNull();
    expect(indicator.getAttribute('role')).toBeNull();
    expect(indicator.getAttribute('aria-hidden')).toBe('true');
    expect(mount.querySelector('[data-carry-weight]')?.textContent).toBe('');
    ui.dispose();
  });

  it('starts in the title presentation and can reveal the playing HUD', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const root = mount.querySelector<HTMLElement>('.game-ui')!;
    const hud = mount.querySelector<HTMLElement>('.hud')!;

    expect(root.dataset.presentation).toBe('title');
    expect(hud.hidden).toBe(true);

    ui.setPresentation('playing');

    expect(root.dataset.presentation).toBe('playing');
    expect(hud.hidden).toBe(false);
    ui.dispose();
  });

  it('lays out the start screen as a left title column', () => {
    expect(mainStyles).toMatch(
      /\.poster-screen\.start-screen\s*\{[^}]*justify-items:\s*start;[^}]*background:\s*linear-gradient\(90deg,[^;]*\);[^}]*text-align:\s*left;/s,
    );
    expect(mainStyles).toMatch(
      /\.start-screen \.screen__content\s*\{[^}]*width:\s*min\(520px,\s*46vw\);[^}]*justify-items:\s*start;[^}]*text-align:\s*left;/s,
    );
  });

  it('keeps only the carry circles and watch in the top scavenging HUD', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const hud = mount.querySelector<HTMLElement>('.hud')!;
    const carried = hud.querySelector<HTMLElement>('[data-carried]')!;

    expect(hud.querySelector('.objective')).toBeNull();
    expect(hud.querySelector('[data-capacity]')).toBeNull();
    expect(hud.querySelector('[data-sinking]')).toBeNull();
    expect([...carried.children].map((element) => element.className)).toEqual([
      'weight-circles__row',
      'timer-block pocket-watch',
    ]);
    expect(carried.querySelector('[data-ui-artwork="watch"]')).not.toBeNull();
    expect(carried.querySelector('[data-timer]')?.textContent).toBe('02:00');
    ui.dispose();
  });

  it('omits scavenging feedback text beneath the carried-item circles', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    expect(mount.querySelector('[data-feedback]')).toBeNull();
    expect(mount.querySelector('[data-carried-items]')?.textContent).toBe('');
    ui.dispose();
  });

  it('fills one circle for one canned food item', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 1,
      carriedItems: [{ instanceId: 'cannedFood-1', type: 'cannedFood' }],
    }), getSinkingState(0, 120));
    const circles = [...mount.querySelectorAll<HTMLElement>('[data-weight-circle]')];

    expect(circles.map((circle) => circle.dataset.itemType ?? null)).toEqual([
      'cannedFood', null, null,
    ]);
    expect(circles[0]?.querySelector('[data-item-artwork="cannedFood"]')).not.toBeNull();
    expect(mount.querySelectorAll('.weight-circle.is-filled')).toHaveLength(1);
    ui.dispose();
  });

  it('keeps mixed weight-one items in pickup order', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 2,
      carriedItems: [
        { instanceId: 'cannedFood-1', type: 'cannedFood' },
        { instanceId: 'ductTape-1', type: 'ductTape' },
      ],
    }), getSinkingState(0, 120));
    const itemTypes = [...mount.querySelectorAll<HTMLElement>('[data-weight-circle]')]
      .map((circle) => circle.dataset.itemType ?? null);

    expect(itemTypes).toEqual(['cannedFood', 'ductTape', null]);
    ui.dispose();
  });

  it('repeats a medical kit portrait for both weight units', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 2,
      carriedItems: [{ instanceId: 'medicalKit-1', type: 'medicalKit' }],
    }), getSinkingState(0, 120));
    const itemTypes = [...mount.querySelectorAll<HTMLElement>('[data-weight-circle]')]
      .map((circle) => circle.dataset.itemType ?? null);

    expect(itemTypes).toEqual(['medicalKit', 'medicalKit', null]);
    ui.dispose();
  });

  it('fills all three circles with a scuba set and clears them after release', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 3,
      carriedItems: [{ instanceId: 'scubaSet-1', type: 'scubaSet' }],
    }), getSinkingState(0, 120));
    expect([...mount.querySelectorAll<HTMLElement>('[data-weight-circle]')]
      .map((circle) => circle.dataset.itemType)).toEqual([
      'scubaSet', 'scubaSet', 'scubaSet',
    ]);

    ui.render(snapshot({ carriedWeight: 0, carriedItems: [] }), getSinkingState(0, 120));
    expect(mount.querySelectorAll('.weight-circle.is-filled')).toHaveLength(0);
    expect(mount.querySelector('[data-carried-items]')?.textContent).toBe('');
    ui.dispose();
  });

  it('exposes sinking danger and critical severity at the presentation thresholds', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const root = mount.querySelector<HTMLElement>('.game-ui')!;

    ui.render(snapshot(), getSinkingState(0, 120));
    expect(root.dataset.sinkingSeverity).toBe('stable');

    ui.render(snapshot(), getSinkingState(47.99, 120));
    expect(root.dataset.sinkingSeverity).toBe('stable');

    ui.render(snapshot(), getSinkingState(48, 120));
    expect(root.dataset.sinkingSeverity).toBe('danger');

    ui.render(snapshot(), getSinkingState(90, 120));
    expect(root.dataset.sinkingSeverity).toBe('critical');
    ui.dispose();
  });

  it('reports a saved duplicate even when the first instance of its type was not saved', () => {
    const mount = document.createElement('main');
    const instances: ItemInstance[] = [
      { instanceId: 'cannedFood-1', type: 'cannedFood' },
      { instanceId: 'cannedFood-2', type: 'cannedFood' },
    ];
    const session = new ScavengeSession(instances);
    session.start();
    session.pickUp('cannedFood-2');
    session.saveCarried();
    const ui = new GameUI(mount);

    ui.showFailureResult(session.snapshot());

    expect(mount.querySelector('[data-result-items]')?.textContent).toContain('SAVED — FOOD');
  });

  it('reports saved supplies without a five-slot limit', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    ui.showFailureResult(snapshot({ status: 'failure', savedCount: 6 }));

    expect(mount.querySelector('[data-result-items]')?.textContent).toContain('6 SUPPLIES SAVED');
    expect(mount.querySelector('[data-result-items]')?.textContent).not.toContain('/ 5');
  });

  it('groups saved Food and Bait quantities in catalog order', () => {
    const mount = document.createElement('main');
    const session = new ScavengeSession([
      { instanceId: 'baitTin-1', type: 'baitTin' },
      { instanceId: 'cannedFood-1', type: 'cannedFood' },
      { instanceId: 'cannedFood-2', type: 'cannedFood' },
      { instanceId: 'baitTin-2', type: 'baitTin' },
    ]);
    session.start();
    for (const id of ['baitTin-1', 'cannedFood-1', 'cannedFood-2', 'baitTin-2'] as const) {
      session.pickUp(id);
      session.saveCarried();
    }
    const ui = new GameUI(mount);

    ui.showFailureResult(session.snapshot());

    expect(mount.querySelector('[data-result-items]')?.textContent).toContain('FOOD x2 · BAIT x2');
  });

  it('does not rewrite an unchanged live-region prompt', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const prompt = mount.querySelector('[data-prompt]')!;
    ui.setPrompt('LEFT CLICK â€” PICK UP FLARE GUN');
    const observer = new MutationObserver(vi.fn());
    observer.observe(prompt, { childList: true });

    ui.setPrompt('LEFT CLICK â€” PICK UP FLARE GUN');

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('surfaces pointer-lock rejection on start and pause layers', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);

    const errors = [...mount.querySelectorAll<HTMLElement>('[data-pointer-lock-error]')];
    expect(errors).toHaveLength(2);
    errors.forEach((error) => {
      expect(error.classList).toContain('illustrated-warning');
      expect(error.querySelector('[data-ui-artwork="warning"]')?.getAttribute('aria-hidden')).toBe('true');
      expect(error.querySelector('[data-pointer-lock-error-copy]')).not.toBeNull();
    });

    ui.showPointerLockError();

    errors.forEach((error) => {
      expect(error.textContent).toContain('Mouse look was blocked');
      expect(error.classList).toContain('is-visible');
    });

    ui.clearPointerLockError();
    errors.forEach((error) => {
      expect(error.querySelector('[data-pointer-lock-error-copy]')?.textContent).toBe('');
      expect(error.classList).not.toContain('is-visible');
      expect(error.querySelector('[data-ui-artwork="warning"]')?.getAttribute('aria-hidden')).toBe('true');
    });
    expect(mainStyles).toMatch(/\.illustrated-warning\.is-visible\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/s);
  });

  it('presents compatibility failures with warning artwork and preserved error copy', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const message = 'WebGL 2 is required for this voyage.';

    ui.showCompatibilityError(message);

    const startLayer = mount.querySelector<HTMLElement>('[data-start]')!;
    expect(startLayer.classList).toContain('has-compatibility-error');
    expect(startLayer.querySelector('.lead')?.textContent).toBe(message);
    expect(startLayer.querySelector<HTMLButtonElement>('[data-start-button]')?.hidden).toBe(true);
    expect(startLayer.querySelector('[data-pointer-lock-error] [data-ui-artwork="warning"]')).not.toBeNull();
    expect(mainStyles).toMatch(/\.poster-screen\.has-compatibility-error \.illustrated-warning\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/s);
  });

  it('removes button listeners and its DOM root exactly once on dispose', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const start = vi.fn();
    const resume = vi.fn();
    const replay = vi.fn();
    ui.onStart = start;
    ui.onResume = resume;
    ui.onReplay = replay;
    const startButton = mount.querySelector<HTMLButtonElement>('[data-start-button]')!;
    const resumeButton = mount.querySelector<HTMLButtonElement>('[data-resume-button]')!;
    const replayButton = mount.querySelector<HTMLButtonElement>('[data-replay-button]')!;

    startButton.click();
    resumeButton.click();
    replayButton.click();
    expect(start).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledOnce();

    ui.dispose();
    ui.dispose();
    startButton.click();
    resumeButton.click();
    replayButton.click();

    expect(start).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledOnce();
    expect(mount.children).toHaveLength(0);
  });

});
