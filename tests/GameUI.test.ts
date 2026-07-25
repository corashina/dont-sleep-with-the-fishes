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
  it('assigns display, narrative, contextual, and numeral roles explicitly', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    expect(mount.querySelector('[data-start] h1')?.classList)
      .toContain('ui-role-display');
    expect(mount.querySelector('[data-start] .lead')?.classList)
      .toContain('ui-role-narrative');
    expect(mount.querySelector('[data-start] .kicker')?.classList)
      .toContain('ui-role-context');
    expect(mount.querySelector('[data-start] .controls')?.classList)
      .toContain('ui-role-context');
    expect(mount.querySelector('[data-start-button]')?.classList)
      .toContain('ui-role-context');
    expect(mount.querySelector('[data-timer]')?.classList)
      .toContain('ui-role-numeral');
    expect(mount.querySelector('[data-prompt]')?.classList)
      .toContain('ui-role-context');
    expect(mount.querySelector('[data-result-items]')?.classList)
      .toContain('ui-role-numeral');

    ui.dispose();
  });

  it('centers a compact top stack and bottom evacuation action', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const start = mount.querySelector<HTMLElement>('[data-start]')!;
    const top = start.querySelector<HTMLElement>('.start-screen__top');
    const action = start.querySelector<HTMLElement>('.start-screen__action');

    expect(top?.querySelector('.kicker')).not.toBeNull();
    expect(top?.querySelector('h1')).not.toBeNull();
    expect(top?.querySelector('.lead')).not.toBeNull();
    expect(top?.querySelector('.controls')).not.toBeNull();
    expect(action?.querySelector('[data-start-button]')).not.toBeNull();
    expect(action?.querySelector('[data-pointer-lock-error]')).not.toBeNull();
    expect(start.querySelector('.fine-print')).toBeNull();
    expect(start.textContent).not.toContain('Desktop keyboard and mouse required');
    expect(mainStyles).toMatch(/\.start-screen \[data-start-button\]\s*\{[^}]*min-width:\s*310px;[^}]*min-height:\s*74px;/s);
    expect(mainStyles).toMatch(/\.poster-screen\.start-screen\s*\{[^}]*justify-items:\s*center;[^}]*linear-gradient\(180deg,[^}]*transparent 35% 82%[^}]*text-align:\s*center;/s);
    expect(mainStyles).toMatch(/\.start-screen__top\s*\{[^}]*justify-items:\s*center;[^}]*gap:\s*8px;[^}]*width:\s*min\(720px,\s*84vw\);/s);
    expect(mainStyles).toMatch(/\.start-screen__action\s*\{[^}]*justify-items:\s*center;[^}]*width:\s*100%;/s);
    expect(mainStyles).toMatch(/\.start-screen \.controls\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
    ui.dispose();
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
    expect(mount.querySelectorAll('[data-weight-circle] [data-item-artwork="scubaSet"]')).toHaveLength(3);
    expect(mainStyles).toMatch(/\.weight-circles__row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*96px\);[^}]*gap:\s*13px;/s);
    expect(mainStyles).toMatch(/\.weight-circle\s*\{[^}]*width:\s*96px;[^}]*height:\s*96px;[^}]*border-width:\s*5px;/s);
    expect(mainStyles).toMatch(/\.weight-circle__art\s*\{[^}]*width:\s*92%;[^}]*height:\s*92%;/s);

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

  it('contains transformed poster content without a horizontal scrollbar', () => {
    expect(mainStyles).toMatch(
      /\.screen__content\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s,
    );
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
