// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, WebGlInitializationError } from '../src/Game';
import { launchGame, type LaunchDependencies } from '../src/app/launchGame';
import type { GamePhase } from '../src/app/GamePhase';
import { AudioSystem } from '../src/audio/AudioSystem';
import { MenuModelLoadError, type MenuModelLibrary } from '../src/menu/MenuModelLibrary';
import type { MenuSandAssets } from '../src/menu/MenuSandAssets';
import { initializeLanguage } from '../src/i18n/language';
import { flushPhases } from './helpers/game';

function phase(): GamePhase {
  return { start: vi.fn(), update: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount(): HTMLElement {
  const element = document.createElement('main');
  document.body.append(element);
  return element;
}
function dependencies(overrides: Partial<LaunchDependencies> = {}): LaunchDependencies {
  const asset = () => ({ dispose: vi.fn(), configure: vi.fn() });
  const loads = Object.fromEntries([
    'loadMenuFont','loadMenuModels', 'loadMenuSandAssets', 'loadShipModels', 'loadSurvivalModels',
    'loadShipFurniture', 'loadSkyAssets', 'loadLifeboatAssets', 'loadShipAssets', 'loadPhysicsRuntime',
  ].map(key => [key, vi.fn(async () => asset())]));
  return {
    ...loads,
    loadAudio: async () => AudioSystem.silent(),
    createGame: (element, resources, onFatalError, browserPlaytest) => Game.forTest({
      createMenu: () => phase(), createScavenge: () => phase(), createSurvival: () => phase(),
    }, { mount: element, resources, onFatalError, browserPlaytest }),
    ...overrides,
  } as LaunchDependencies;
}
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); initializeLanguage(null); });
describe('phase-based launch', () => {
  it('starts the menu while ship and physics promises remain unrequested', async () => {
    const ship = deferred<Awaited<ReturnType<LaunchDependencies['loadShipAssets']>>>();
    const physics = deferred<Awaited<ReturnType<LaunchDependencies['loadPhysicsRuntime']>>>();
    const deps = dependencies({ loadShipAssets: vi.fn(() => ship.promise), loadPhysicsRuntime: vi.fn(() => physics.promise) });
    const handle = launchGame(mount(), deps);
    const game = await handle.completion;
    expect(game).not.toBeNull();
    expect(deps.loadMenuModels).toHaveBeenCalledOnce();
    expect(deps.loadShipAssets).not.toHaveBeenCalled();
    expect(deps.loadPhysicsRuntime).not.toHaveBeenCalled();
    expect(deps.loadSurvivalModels).not.toHaveBeenCalled();
    handle.cancel();
  });
  it('cleans late menu assets after cancellation', async () => {
    const pending = deferred<MenuModelLibrary>();
    const menu = { dispose: vi.fn() } as unknown as MenuModelLibrary;
    const deps = dependencies({ loadMenuModels: () => pending.promise });
    const handle = launchGame(mount(), deps);
    await flushPhases();
    handle.cancel(); handle.cancel();
    pending.resolve(menu);
    await expect(handle.completion).resolves.toBeNull();
    expect(menu.dispose).toHaveBeenCalledOnce();
  });
  it('cleans loaded audio when cancellation precedes game creation', async () => {
    const pending = deferred<AudioSystem>();
    const audio = AudioSystem.silent();
    const dispose = vi.spyOn(audio, 'dispose');
    const createGame = vi.fn();
    const handle = launchGame(mount(), dependencies({ loadAudio: () => pending.promise, createGame }));
    handle.cancel(); pending.resolve(audio);
    await expect(handle.completion).resolves.toBeNull();
    expect(createGame).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('releases siblings and displays menu loading failure', async () => {
    const error = new MenuModelLoadError('boat', 'download failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sand = { dispose: vi.fn(), configure: vi.fn() } as unknown as MenuSandAssets;
    const element = mount();
    const handle = launchGame(element, dependencies({
      loadMenuModels: async () => { throw error; }, loadMenuSandAssets: async () => sand,
    }));
    await expect(handle.completion).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith(error);
    expect(element.querySelector('.system-screen--error')).not.toBeNull();
    handle.cancel();
  });
  it.each([new Error('constructor failed'), new WebGlInitializationError('webgl')])('reports construction failure and releases the owner', async error => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const audio = AudioSystem.silent();
    const dispose = vi.spyOn(audio, 'dispose');
    const handle = launchGame(mount(), dependencies({
      loadAudio: async () => audio, createGame: () => { throw error; },
    }));
    await expect(handle.completion).resolves.toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('starts a browser playtest directly in survival without menu or ship', async () => {
    const deps = dependencies();
    const handle = launchGame(mount(), deps, 'enabled', {
      search: '?playtest=survival&seed=42&missing=map-1&missing=knife-1', playtestEnabled: true,
    });
    const game = await handle.completion;
    expect(game).not.toBeNull();
    expect(deps.loadSurvivalModels).toHaveBeenCalledOnce();
    expect(deps.loadMenuModels).not.toHaveBeenCalled();
    expect(deps.loadShipAssets).not.toHaveBeenCalled();
    handle.cancel();
  });
  it('does not create a game for a disconnected mount', async () => {
    const createGame = vi.fn();
    const handle = launchGame(document.createElement('main'), dependencies({ createGame }));
    await expect(handle.completion).resolves.toBeNull();
    expect(createGame).not.toHaveBeenCalled();
  });
  it('releases a late menu load when the mount becomes detached', async () => {
    const pending = deferred<MenuModelLibrary>();
    const menu = { dispose: vi.fn() } as unknown as MenuModelLibrary;
    const element = mount();
    const handle = launchGame(element, dependencies({ loadMenuModels: () => pending.promise }));
    await flushPhases(); element.remove(); pending.resolve(menu);
    await expect(handle.completion).resolves.toBeNull();
    expect(menu.dispose).toHaveBeenCalledOnce();
  });
  it('releases game and audio when start throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const dispose = vi.fn();
    const audio = AudioSystem.silent();
    const disposeAudio = vi.spyOn(audio, 'dispose');
    const handle = launchGame(mount(), dependencies({
      loadAudio: async () => audio,
      createGame: () => ({ ready: Promise.resolve(), start: () => { throw new Error('start'); }, dispose }),
    }));
    await expect(handle.completion).resolves.toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    expect(disposeAudio).toHaveBeenCalledOnce();
  });
  it('releases menu assets when phase start fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const menu = { dispose: vi.fn() } as unknown as MenuModelLibrary;
    const ownedPhase = { ...phase(), start: () => { throw new Error('phase start'); } };
    const handle = launchGame(mount(), dependencies({
      loadMenuModels: async () => menu,
      createGame: (element, resources, onFatalError) => Game.forTest({
        createMenu: () => ownedPhase, createScavenge: () => phase(), createSurvival: () => phase(),
      }, { mount: element, resources, onFatalError }),
    }));
    await expect(handle.completion).resolves.toBeNull();
    expect(menu.dispose).toHaveBeenCalledOnce();
    expect(ownedPhase.dispose).toHaveBeenCalledOnce();
  });

});
