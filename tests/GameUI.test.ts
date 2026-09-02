// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { GameUI } from '../src/ui/GameUI';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('GameUI', () => {
  it('shows the boat notice briefly after a blocked pickup', () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const session = new ScavengeSession([
      { instanceId: 'cannedFood-1', type: 'cannedFood' },
      { instanceId: 'cannedFood-2', type: 'cannedFood' },
      { instanceId: 'cannedFood-3', type: 'cannedFood' },
    ]);
    const notice = mount.querySelector<HTMLElement>('[data-hands-full-notice]')!;
    expect(notice.classList).not.toContain('brush-label');
    expect(notice.classList).toContain('ui-role-display');
    session.start();

    session.pickUp('cannedFood-1');
    session.pickUp('cannedFood-2');
    session.pickUp('cannedFood-3');
    ui.render(session.snapshot());
    expect(notice.hidden).toBe(true);

    ui.showHandsFullNotice();
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('HANDS FULL, QUICK TO THE BOAT.');

    vi.advanceTimersByTime(1_999);
    expect(notice.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(notice.hidden).toBe(true);
    ui.dispose();
  });

  it('returns to the menu from pause', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const returnToMenu = vi.fn();
    ui.onReturnToMenu = returnToMenu;
    ui.setPaused(true);

    const button = mount.querySelector<HTMLButtonElement>('[data-return-to-menu]')!;
    expect(button.textContent).toContain('BACK TO MENU');
    expect(button.getAttribute('aria-label')).toBe('Back to menu');
    expect(button.classList).toContain('primary-action');
    expect(button.classList).not.toContain('secondary-action');
    button.click();

    expect(returnToMenu).toHaveBeenCalledOnce();
    ui.dispose();
  });
});
