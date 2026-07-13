// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => ({
  cancel: vi.fn(),
  completion: Promise.resolve(null),
  launchGame: vi.fn(),
}));

vi.mock('../src/app/launchGame', () => ({
  launchGame: doubles.launchGame,
}));

describe('main bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '<main id="app"></main>';
    doubles.launchGame.mockReturnValue({
      cancel: doubles.cancel,
      completion: doubles.completion,
    });
  });

  it('launches into #app and cancels once on pagehide', async () => {
    const mount = document.querySelector<HTMLElement>('#app')!;

    await import('../src/main');
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));

    expect(doubles.launchGame).toHaveBeenCalledOnce();
    expect(doubles.launchGame).toHaveBeenCalledWith(mount);
    expect(doubles.cancel).toHaveBeenCalledOnce();
  });
});
