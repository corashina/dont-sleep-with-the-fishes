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
  it('defines the illustrated global and scavenging presentation contracts', () => {
    expect(mainStyles).toContain('--ink-bone: #f2ead7');
    expect(mainStyles).toContain('.ui-treatment::after');
    expect(mainStyles).toContain('.pocket-watch__art');
    expect(mainStyles).toContain('.timber-action::before');
    expect(mainStyles).toContain('.poster-screen');
    expect(mainStyles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('centers every scavenging poster screen and its vignette', () => {
    expect(mainStyles).toMatch(/\.screen\s*\{[^}]*align-content:\s*safe center;[^}]*justify-items:\s*center;[^}]*overflow:\s*hidden;[^}]*text-align:\s*center;/s);
    expect(mainStyles).toMatch(/\.screen__content\s*\{[^}]*align-content:\s*safe center;[^}]*justify-items:\s*center;[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/s);
    expect(mainStyles).toMatch(/\.poster-screen\s*\{[^}]*background:\s*radial-gradient\(circle at 50% 50%/s);
  });

  it('wraps every scavenging screen in one bounded content region', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    for (const selector of ['[data-start]', '[data-pause]', '[data-failure]', '[data-result]']) {
      const screen = mount.querySelector<HTMLElement>(selector)!;
      expect(screen.children).toHaveLength(1);
      expect(screen.firstElementChild?.classList).toContain('screen__content');
    }

    ui.dispose();
  });

  it('keeps scavenging screens centered at narrow viewport widths', () => {
    expect(mainStyles).not.toMatch(/\.screen\s*\{[^}]*align-content:\s*end;/s);
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

  it('guards every illustrated action hover and active selector from disabled states', () => {
    const interactiveSelectors = [...mainStyles.matchAll(/([^{}]+)\{/g)]
      .flatMap((match) => match[1]!.split(',').map((selector) => selector.trim()))
      .filter((selector) => /:(?:hover|active)$/.test(selector))
      .filter((selector) => [
        '.timber-action',
        '.primary-action',
        '.event-item',
        '.secondary-action',
      ].some((className) => selector.includes(className)));

    expect(interactiveSelectors).toEqual([
      '.timber-action:not(:disabled):not([aria-disabled="true"]):hover',
      '.timber-action:not(:disabled):not([aria-disabled="true"]):active',
      '.primary-action:not(:disabled):not([aria-disabled="true"]):hover',
      '.primary-action:not(:disabled):not([aria-disabled="true"]):active',
      '.event-item:not(:disabled):not([aria-disabled="true"]):hover',
      '.secondary-action:not(:disabled):not([aria-disabled="true"]):hover',
      '.event-item:not(:disabled):not([aria-disabled="true"]):active',
      '.secondary-action:not(:disabled):not([aria-disabled="true"]):active',
      '.survival-ui .primary-action:not(:disabled):not([aria-disabled="true"]):hover',
      '.survival-ui .primary-action:not(:disabled):not([aria-disabled="true"]):active',
    ]);
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

  it('defines the original-style top-center circle layout at desktop and narrow widths', () => {
    expect(mainStyles).toMatch(/\.carried\s*\{[^}]*top:\s*16px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s);
    expect(mainStyles).toMatch(/\.weight-circles__row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*70px\);[^}]*gap:\s*10px;/s);
    expect(mainStyles).toMatch(/\.weight-circle\s*\{[^}]*border-radius:\s*50%;[^}]*overflow:\s*hidden;/s);
    expect(mainStyles).toMatch(/@media \(max-width:\s*820px\)\s*\{[^}]*\.weight-circles__row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*54px\);/s);
  });

  it('exposes sinking danger and critical severity at the presentation thresholds', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const root = mount.querySelector<HTMLElement>('.game-ui')!;
    const sinkingLabel = mount.querySelector<HTMLElement>('[data-sinking]')!;

    ui.render(snapshot(), getSinkingState(0, 120));
    expect(root.dataset.sinkingSeverity).toBe('stable');
    expect(sinkingLabel.textContent).toBe('SHIP LISTING');

    ui.render(snapshot(), getSinkingState(47.99, 120));
    expect(root.dataset.sinkingSeverity).toBe('stable');
    expect(sinkingLabel.textContent).toBe('SHIP LISTING');

    ui.render(snapshot(), getSinkingState(48, 120));
    expect(root.dataset.sinkingSeverity).toBe('danger');
    expect(sinkingLabel.textContent).toBe('DECK TAKING WATER');

    ui.render(snapshot(), getSinkingState(90, 120));
    expect(root.dataset.sinkingSeverity).toBe('critical');
    expect(sinkingLabel.textContent).toBe('FINAL SUBMERSION');
  });

  it('defines red-ink danger and transform-opacity-only critical sinking treatments', () => {
    expect(mainStyles).toMatch(/\.game-ui\[data-sinking-severity="danger"\] \[data-sinking\]\s*\{[^}]*color:\s*var\(--ink-red-bright\);[^}]*text-shadow:/s);
    expect(mainStyles).toMatch(/\.game-ui\[data-sinking-severity="critical"\] \.ui-treatment::before\s*\{[^}]*background:\s*radial-gradient\([^}]*animation:\s*critical-vignette/s);
    expect(mainStyles).toMatch(/@keyframes critical-vignette\s*\{\s*50%\s*\{\s*opacity:\s*[^;]+;\s*transform:\s*[^;]+;\s*\}\s*\}/s);
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

  it('renders the illustrated scavenging hierarchy without losing state hooks', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    expect(mount.querySelector('.hud')?.classList).toContain('illustrated-hud');
    expect(mount.querySelector('[data-ui-artwork="watch"]')).not.toBeNull();
    expect(mount.querySelector('.timer-block')?.classList).toContain('pocket-watch');
    expect(mount.querySelector('[data-timer]')?.textContent).toBe('02:00');
    expect(mount.querySelector('[data-capacity]')).not.toBeNull();
    expect(mount.querySelectorAll('[data-weight-circle]')).toHaveLength(3);
    expect(mount.querySelector('[data-carried-items]')?.getAttribute('aria-hidden')).toBe('true');
    expect(mount.querySelector('[data-prompt]')).not.toBeNull();
    expect(mount.querySelector('[data-feedback]')).not.toBeNull();
    expect(mount.querySelector('[data-start]')?.classList).toContain('poster-screen');
    expect(mount.querySelector('.controls')?.textContent).toContain('ACTLEFT CLICK');
    expect(mount.querySelector('[data-start-button]')?.classList).toContain('timber-action');
    expect(mount.querySelector('[data-ui-artwork="warning"]')).not.toBeNull();

    ui.dispose();
  });
});
