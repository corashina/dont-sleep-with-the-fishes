// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => ({
  constructGame: vi.fn(),
  disposeGame: vi.fn(),
  disposeModels: vi.fn(),
  loadModels: vi.fn(),
  startGame: vi.fn(() => {
    throw new Error('start failed');
  }),
}));

vi.mock('../src/Game', () => ({
  Game: class {
    readonly start = doubles.startGame;
    readonly dispose = doubles.disposeGame;

    constructor() {
      doubles.constructGame();
    }
  },
}));

vi.mock('../src/world/PropModelLibrary', () => ({
  PropModelLibrary: { load: doubles.loadModels },
}));

describe('main bootstrap ownership', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '<main id="app"></main>';
    doubles.constructGame.mockImplementation(() => undefined);
    doubles.loadModels.mockResolvedValue({ dispose: doubles.disposeModels });
  });

  it('disposes the constructed game when start throws', async () => {
    await import('../src/main');

    await vi.waitFor(() => expect(doubles.disposeGame).toHaveBeenCalledOnce());
    expect(doubles.disposeModels).not.toHaveBeenCalled();
  });

  it('disposes only the unowned models when construction throws', async () => {
    doubles.constructGame.mockImplementationOnce(() => {
      throw new Error('construction failed');
    });

    await import('../src/main');

    await vi.waitFor(() => expect(doubles.disposeModels).toHaveBeenCalledOnce());
    expect(doubles.disposeGame).not.toHaveBeenCalled();
  });
});
