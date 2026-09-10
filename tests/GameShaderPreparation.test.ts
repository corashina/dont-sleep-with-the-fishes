// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game';
import type { GamePhase, MenuAssets, ShipPhaseAssets, SurvivalAssets } from '../src/app/GamePhase';
import { AudioSystem } from '../src/audio/AudioSystem';
import { flushPhases } from './helpers/game';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function phase(preparation?: Promise<void>): GamePhase {
  return {
    prepare: preparation === undefined ? undefined : vi.fn(() => preparation),
    start: vi.fn(), update: vi.fn(), render: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
  };
}

function fixture(menu: GamePhase, ship = phase()) {
  const mount = document.createElement('main');
  const releaseMenu = vi.fn();
  const releaseShip = vi.fn();
  const disposeResources = vi.fn();
  const onFatalError = vi.fn();
  let enterShip!: () => void;
  const createShip = vi.fn(() => ship);
  const configure = vi.fn();
  const game = Game.forTest({
    createMenu: (_context, complete) => { enterShip = complete; return menu; },
    createScavenge: createShip,
    createSurvival: () => phase(),
  }, {
    mount, onFatalError,
    resources: {
      audio: AudioSystem.silent(), physicsMode: 'off',
      acquireMenu: async () => ({ assets: { menuSandAssets: { configure } } as unknown as MenuAssets, dispose: releaseMenu }),
      acquireShip: async () => ({ assets: { shipAssets: { configure }, lifeboatAssets: { configure } } as unknown as ShipPhaseAssets, dispose: releaseShip }),
      acquireSurvival: async () => ({ assets: {} as SurvivalAssets, dispose: vi.fn() }),
      dispose: disposeResources,
    },
  });
  return { game, mount, enterShip: () => enterShip(), createShip, releaseMenu, releaseShip, disposeResources, onFatalError };
}

afterEach(() => vi.unstubAllGlobals());

describe('phase shader preparation', () => {
  it('keeps frames and phase start behind preparation, with loading visible', async () => {
    let frame!: FrameRequestCallback;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { frame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const ready = deferred();
    const menu = phase(ready.promise);
    const f = fixture(menu);
    f.game.start();
    await flushPhases();
    expect(f.mount.querySelector('.system-screen--loading')).not.toBeNull();
    expect(f.mount.querySelector('progress')?.hasAttribute('value')).toBe(false);
    frame(16);
    expect(menu.start).not.toHaveBeenCalled();
    expect(menu.update).not.toHaveBeenCalled();
    expect(menu.render).not.toHaveBeenCalled();
    ready.resolve();
    await f.game.ready;
    expect(menu.start).toHaveBeenCalledOnce();
    expect(f.mount.querySelector('.system-screen--loading')).toBeNull();
    frame(32);
    expect(menu.render).toHaveBeenCalledOnce();
    f.game.dispose();
  });

  it('releases the phase and lease after failed preparation', async () => {
    const ready = deferred();
    const menu = phase(ready.promise);
    const f = fixture(menu);
    await flushPhases();
    const error = new Error('shader failed');
    ready.reject(error);
    await f.game.ready;
    expect(menu.dispose).toHaveBeenCalledOnce();
    expect(f.releaseMenu).toHaveBeenCalledOnce();
    expect(f.onFatalError).toHaveBeenCalledWith(error);
    expect(f.mount.querySelector('.system-screen--loading')).toBeNull();
    f.game.dispose();
  });

  it('waits before disposing materials and shared rendering resources', async () => {
    const ready = deferred();
    const menu = phase(ready.promise);
    const f = fixture(menu);
    await flushPhases();
    f.game.dispose();
    expect(f.mount.querySelector('.system-screen--loading')).toBeNull();
    expect(menu.dispose).not.toHaveBeenCalled();
    expect(f.disposeResources).not.toHaveBeenCalled();
    ready.resolve();
    await f.game.ready;
    expect(menu.start).not.toHaveBeenCalled();
    expect(menu.dispose).toHaveBeenCalledOnce();
    expect(f.releaseMenu).toHaveBeenCalledOnce();
    expect(f.disposeResources).toHaveBeenCalledOnce();
  });

  it('serializes replacement and never activates stale preparation', async () => {
    const ready = deferred();
    const menu = phase(ready.promise);
    const ship = phase();
    const f = fixture(menu, ship);
    await flushPhases();
    f.enterShip();
    await flushPhases();
    expect(f.createShip).not.toHaveBeenCalled();
    expect(menu.dispose).not.toHaveBeenCalled();
    ready.resolve();
    await f.game.ready;
    await flushPhases();
    expect(menu.start).not.toHaveBeenCalled();
    expect(menu.dispose).toHaveBeenCalledOnce();
    expect(f.createShip).toHaveBeenCalledOnce();
    expect(f.mount.querySelector('.system-screen--loading')).toBeNull();
    f.game.dispose();
  });
});
