import { createRuntimeTestGame } from './helpers/gameRuntime';
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const game = createRuntimeTestGame({
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

async function preparingFixture(route: 'menu' | 'scavenge', preparation: Promise<void>) {
  const pendingPhase = phase(preparation);
  const f = route === 'menu' ? fixture(pendingPhase) : fixture(phase(), pendingPhase);
  f.game.start();
  if (route === 'scavenge') {
    await f.game.ready;
    f.enterShip();
  }
  await flushPhases();
  return { ...f, pendingPhase, releasePhase: route === 'menu' ? f.releaseMenu : f.releaseShip };
}

describe('phase shader preparation', () => {
  // Importance: 95/100. Both initial entry and phase transitions must gate gameplay on GPU readiness.
  it.each(['menu', 'scavenge'] as const)('keeps %s frames and start behind preparation, with loading visible', async route => {
    let frame!: FrameRequestCallback;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { frame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const ready = deferred();
    const f = await preparingFixture(route, ready.promise);
    const pendingPhase = f.pendingPhase;
    expect(f.mount.querySelector('.system-screen--loading')).not.toBeNull();
    expect(f.mount.querySelector('progress')?.position).toBe(-1);
    expect(f.mount.querySelector('.system-loading-status')?.textContent).toBe('Building scene');
    frame(16);
    expect(pendingPhase.prepare).toHaveBeenCalledOnce();
    expect(pendingPhase.start).not.toHaveBeenCalled();
    expect(pendingPhase.update).not.toHaveBeenCalled();
    expect(pendingPhase.render).not.toHaveBeenCalled();
    ready.resolve();
    await flushPhases();
    expect(pendingPhase.start).toHaveBeenCalledOnce();
    expect(f.mount.querySelector('.system-screen--loading')).toBeNull();
    frame(32);
    expect(pendingPhase.render).toHaveBeenCalledOnce();
    f.game.dispose();
  });

  // Importance: 95/100. Failed preparation must release its owner before shutdown and never start gameplay.
  it.each(['menu', 'scavenge'] as const)('releases the %s phase and lease after failed preparation', async route => {
    const ready = deferred();
    const f = await preparingFixture(route, ready.promise);
    const error = new Error('shader failed');
    ready.reject(error);
    await flushPhases();
    expect(f.pendingPhase.start).not.toHaveBeenCalled();
    expect(f.pendingPhase.dispose).toHaveBeenCalledOnce();
    expect(f.releasePhase).toHaveBeenCalledOnce();
    expect(f.onFatalError).toHaveBeenCalledExactlyOnceWith(error);
    expect(f.mount.querySelector('.system-screen--loading')).toBeNull();
    f.game.dispose();
    expect(f.pendingPhase.dispose).toHaveBeenCalledOnce();
    expect(f.releasePhase).toHaveBeenCalledOnce();
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
