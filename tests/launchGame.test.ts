// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/Game';
import { launchGame, type LaunchDependencies } from '../src/app/launchGame';
import { ItemModelLoadError, type PropModelLibrary } from '../src/world/PropModelLibrary';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function connectedMount(): HTMLElement {
  const mount = document.createElement('main');
  document.body.append(mount);
  return mount;
}

function dependencies(
  loadModels: LaunchDependencies['loadModels'],
  overrides: Partial<LaunchDependencies> = {},
): LaunchDependencies {
  return {
    loadModels,
    createGame: vi.fn(() => ({ start: vi.fn(), dispose: vi.fn() })),
    ...overrides,
  };
}

describe('launchGame', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the loading state before model preload resolves', async () => {
    const pending = deferred<PropModelLibrary>();
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;

    const handle = launchGame(mount, dependencies(() => pending.promise));

    expect(mount.textContent).toContain('RECOVERING SUPPLIES');
    handle.cancel();
    pending.resolve(models);
    await handle.completion;
  });

  it('constructs and starts the game only after successful preload', async () => {
    const pending = deferred<PropModelLibrary>();
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const game = { start: vi.fn(), dispose: vi.fn() };
    const createGame = vi.fn(() => game);
    const handle = launchGame(mount, dependencies(() => pending.promise, { createGame }));

    expect(createGame).not.toHaveBeenCalled();
    expect(game.start).not.toHaveBeenCalled();
    pending.resolve(models);

    await expect(handle.completion).resolves.toBe(game as unknown as Game);
    expect(createGame).toHaveBeenCalledWith(mount, models);
    expect(game.start).toHaveBeenCalledOnce();
  });

  it('removes the launcher loading surface before constructing the game', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const game = { start: vi.fn(), dispose: vi.fn() };
    let contentAtConstruction = '';
    let childCountAtConstruction = -1;
    const createGame = vi.fn((gameMount: HTMLElement) => {
      contentAtConstruction = gameMount.textContent ?? '';
      childCountAtConstruction = gameMount.childElementCount;
      const ready = document.createElement('p');
      ready.textContent = 'GAME READY';
      gameMount.append(ready);
      return game;
    });

    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame },
    ));

    await expect(handle.completion).resolves.toBe(game as unknown as Game);
    expect(contentAtConstruction).not.toContain('RECOVERING SUPPLIES');
    expect(childCountAtConstruction).toBe(0);
    expect(mount.textContent).toBe('GAME READY');
  });

  it('renders an item-labelled supply failure without creating a game', async () => {
    const mount = connectedMount();
    const createGame = vi.fn();
    const handle = launchGame(mount, dependencies(
      () => Promise.reject(new ItemModelLoadError('ductTape', 'download failed')),
      { createGame },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('SUPPLIES UNAVAILABLE');
    expect(mount.textContent).toContain('DUCT TAPE');
    expect(mount.textContent).toContain('download failed');
    expect(createGame).not.toHaveBeenCalled();
  });

  it('renders WebGL failure UI when game construction throws', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => { throw new Error('renderer failed'); } },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
    expect(mount.textContent).toContain('renderer failed');
  });

  it('renders WebGL failure UI when construction throws an item-model error', async () => {
    const mount = connectedMount();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        createGame: () => {
          throw new ItemModelLoadError('ductTape', 'renderer used an invalid texture');
        },
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
    expect(mount.textContent).not.toContain('SUPPLIES UNAVAILABLE');
    expect(disposeModels).toHaveBeenCalledOnce();
  });

  it('renders hostile error text without creating markup', async () => {
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.reject(new ItemModelLoadError(
        'ductTape',
        '<script>globalThis.compromised = true</script> & missing',
      )),
    ));

    await handle.completion;

    expect(mount.querySelector('script')).toBeNull();
    expect(mount.textContent).toContain('<script>globalThis.compromised = true</script> & missing');
    expect(mount.innerHTML).toContain('&lt;script&gt;');
    expect(mount.innerHTML).toContain('&amp; missing');
  });

  it('disposes late models and skips construction after cancellation', async () => {
    const pending = deferred<PropModelLibrary>();
    const mount = connectedMount();
    const dispose = vi.fn();
    const models = { dispose } as unknown as PropModelLibrary;
    const createGame = vi.fn();
    const handle = launchGame(mount, dependencies(() => pending.promise, { createGame }));

    handle.cancel();
    handle.cancel();
    pending.resolve(models);

    await expect(handle.completion).resolves.toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    expect(createGame).not.toHaveBeenCalled();
  });

  it.each([
    ['disconnected', (mount: HTMLElement) => mount.remove()],
    ['replaced', (mount: HTMLElement) => mount.replaceWith(document.createElement('main'))],
  ])('disposes late models and skips construction when the mount is %s', async (_name, detach) => {
    const pending = deferred<PropModelLibrary>();
    const mount = connectedMount();
    const dispose = vi.fn();
    const models = { dispose } as unknown as PropModelLibrary;
    const createGame = vi.fn();
    const handle = launchGame(mount, dependencies(() => pending.promise, { createGame }));

    detach(mount);
    pending.resolve(models);

    await expect(handle.completion).resolves.toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    expect(createGame).not.toHaveBeenCalled();
  });

  it('disposes a started game once when cancelled repeatedly', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const game = { start: vi.fn(), dispose: vi.fn() };
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => game },
    ));
    await handle.completion;

    handle.cancel();
    handle.cancel();

    expect(game.dispose).toHaveBeenCalledOnce();
    expect(models.dispose).not.toHaveBeenCalled();
  });

  it('disposes only the unowned models when construction fails', async () => {
    const mount = connectedMount();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => { throw new Error('construction failed'); } },
    ));

    await handle.completion;

    expect(disposeModels).toHaveBeenCalledOnce();
  });

  it('disposes the constructed game rather than models when start fails', async () => {
    const mount = connectedMount();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const game = {
      start: vi.fn(() => { throw new Error('start failed'); }),
      dispose: vi.fn(),
    };
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => game },
    ));

    await handle.completion;

    expect(game.dispose).toHaveBeenCalledOnce();
    expect(disposeModels).not.toHaveBeenCalled();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
  });

  it('renders WebGL failure UI when start throws an item-model error', async () => {
    const mount = connectedMount();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const game = {
      start: vi.fn(() => {
        throw new ItemModelLoadError('ductTape', 'startup used an invalid texture');
      }),
      dispose: vi.fn(),
    };
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => game },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
    expect(mount.textContent).not.toContain('SUPPLIES UNAVAILABLE');
    expect(game.dispose).toHaveBeenCalledOnce();
    expect(disposeModels).not.toHaveBeenCalled();
  });
});
