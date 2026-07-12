// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The app tsconfig omits Node types; Vitest still runs with this built-in.
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
  it('defines the illustrated global and scavenging presentation contracts', () => {
    expect(mainStyles).toContain('--ink-bone: #f2ead7');
    expect(mainStyles).toContain('.ui-treatment::after');
    expect(mainStyles).toContain('.pocket-watch__art');
    expect(mainStyles).toContain('.timber-action::before');
    expect(mainStyles).toContain('.poster-screen');
    expect(mainStyles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps the critical watch timer at least 3:1 against its gold face', () => {
    expect(mainStyles).toMatch(/\.pocket-watch \[data-timer\]\.is-critical\s*\{[^}]*color:\s*var\(--ink-red\);/s);
    const criticalColor = mainStyles.match(/--ink-red:\s*(#[0-9a-f]{6})/i)?.[1];
    const watchGold = mainStyles.match(/\.pocket-watch__art\s*\{[^}]*color:\s*(#[0-9a-f]{6})/is)?.[1];
    expect(criticalColor).toBeDefined();
    expect(watchGold).toBeDefined();
    if (!criticalColor || !watchGold) return;

    const luminance = (hex: string): number => {
      const channels = hex.slice(1).match(/.{2}/g)!
        .map((channel) => Number.parseInt(channel, 16) / 255)
        .map((channel) => channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    };
    const foreground = luminance(criticalColor);
    const background = luminance(watchGold);
    const ratio = (Math.max(foreground, background) + 0.05)
      / (Math.min(foreground, background) + 0.05);

    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it('does not brighten or move disabled timber actions on hover', () => {
    expect(mainStyles).toMatch(/\.timber-action:not\(:disabled\):not\(\[aria-disabled="true"\]\):hover\s*\{[^}]*filter:\s*brightness\(1\.14\);[^}]*transform:\s*translateY\(-2px\) rotate\(-\.25deg\);/s);
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

  it('renders carry weight, items, and save feedback without slot markers', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 2,
      carriedItems: [
        { instanceId: 'cannedFood-1', type: 'cannedFood' },
        { instanceId: 'ductTape-1', type: 'ductTape' },
      ],
    }), getSinkingState(0, 120));
    ui.showFeedback('SAVED — CANNED FOOD');

    expect(mount.querySelector('[data-carry-weight]')?.textContent).toBe('2 / 3');
    expect(mount.querySelector('[data-carried-items]')?.textContent).toContain('CANNED FOOD · 1');
    expect(mount.querySelector('[data-feedback]')?.textContent).toBe('SAVED — CANNED FOOD');
    expect(mount.querySelector('.slot')).toBeNull();
    expect(mount.querySelector('[data-carried-items]')?.classList).toContain('carried-list');
    expect(mount.querySelectorAll('.carried-row')).toHaveLength(2);
    expect(mainStyles).toMatch(/\.carried-list\s*\{[^}]*display:\s*grid[^}]*gap:/s);
    expect(mainStyles).toMatch(/\.carried-row\s*\{[^}]*display:\s*block/s);
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

    expect(mount.querySelector('[data-result-items]')?.textContent).toContain('SAVED — CANNED FOOD');
  });

  it('versions repeated feedback so identical saves remain observable', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    ui.showFeedback('SAVED — CANNED FOOD');
    ui.showFeedback('SAVED — CANNED FOOD');

    expect(mount.querySelector<HTMLElement>('[data-feedback]')?.dataset.version).toBe('1');
  });

  it('reports saved supplies without a five-slot limit', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    ui.showFailureResult(snapshot({ status: 'failure', savedCount: 6 }));

    expect(mount.querySelector('[data-result-items]')?.textContent).toContain('6 SUPPLIES SAVED');
    expect(mount.querySelector('[data-result-items]')?.textContent).not.toContain('/ 5');
  });

  it('does not rewrite an unchanged live-region prompt', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const prompt = mount.querySelector('[data-prompt]')!;
    ui.setPrompt('E â€” PICK UP FLARE GUN');
    const observer = new MutationObserver(vi.fn());
    observer.observe(prompt, { childList: true });

    ui.setPrompt('E â€” PICK UP FLARE GUN');

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('surfaces pointer-lock rejection on start and pause layers', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);

    ui.showPointerLockError();

    const errors = [...mount.querySelectorAll('[data-pointer-lock-error]')];
    expect(errors).toHaveLength(2);
    errors.forEach((error) => {
      expect(error.textContent).toContain('Mouse look was blocked');
      expect(error.classList).toContain('is-visible');
    });
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

  it('renders the illustrated scavenging hierarchy without losing state hooks', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    expect(mount.querySelector('.hud')?.classList).toContain('illustrated-hud');
    expect(mount.querySelector('[data-ui-artwork="watch"]')).not.toBeNull();
    expect(mount.querySelector('.timer-block')?.classList).toContain('pocket-watch');
    expect(mount.querySelector('[data-timer]')?.textContent).toBe('02:00');
    expect(mount.querySelector('[data-capacity]')).not.toBeNull();
    expect(mount.querySelector('[data-carry-weight]')).not.toBeNull();
    expect(mount.querySelector('[data-prompt]')).not.toBeNull();
    expect(mount.querySelector('[data-feedback]')).not.toBeNull();
    expect(mount.querySelector('[data-start]')?.classList).toContain('poster-screen');
    expect(mount.querySelector('[data-start-button]')?.classList).toContain('timber-action');
    expect(mount.querySelector('[data-ui-artwork="warning"]')).not.toBeNull();

    ui.dispose();
  });
});
