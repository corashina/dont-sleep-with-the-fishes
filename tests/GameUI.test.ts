// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameUI } from '../src/ui/GameUI';

afterEach(() => {
  document.body.replaceChildren();
});

describe('GameUI', () => {
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
    button.click();

    expect(returnToMenu).toHaveBeenCalledOnce();
    ui.dispose();
  });
});
