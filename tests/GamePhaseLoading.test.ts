// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, type GameFactories, type GameTestOptions } from '../src/Game';
import { PhaseResources, type PhaseResourceLoaders } from '../src/app/PhaseResources';
import type { GamePhase } from '../src/app/GamePhase';
import { AudioSystem } from '../src/audio/AudioSystem';
import { flushPhases } from './helpers/game';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { SURVIVAL_SAVE_DATA_KEY, SURVIVAL_SAVE_ENABLED_KEY } from '../src/browser/SurvivalSaveStore';
import { GameUI } from '../src/ui/GameUI';
import { ScavengePhase } from '../src/phases/ScavengePhase';
import { EVENT_TEST_OPTIONS } from '../src/app/EventTest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function asset() { return { dispose: vi.fn(), configure: vi.fn() }; }
function phase(): GamePhase { return { start: vi.fn(), update: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() }; }
function rig(overrides: Partial<GameFactories> = {}, options: Pick<GameTestOptions, 'saveStorage'> = {}) {
  const loaders = Object.fromEntries([
    'loadMenuFont','loadMenuModels','loadMenuSandAssets','loadShipModels','loadSurvivalModels','loadShipFurniture',
    'loadSkyAssets','loadLifeboatAssets','loadShipAssets','loadPhysicsRuntime',
  ].map(key => [key, vi.fn(async () => asset())])) as unknown as PhaseResourceLoaders;
  const resources = new PhaseResources(loaders, AudioSystem.silent(), 'enabled');
  const factories: GameFactories = { createMenu: vi.fn(() => phase()), createScavenge: vi.fn(() => phase()), createSurvival: vi.fn(() => phase()), ...overrides };
  const onFatalError = vi.fn();
  const mount = document.createElement('main');
  document.body.append(mount);
  const game = Game.forTest(factories, { ...options, mount, resources, onFatalError });
  game.start();
  return { game, factories, loaders, onFatalError, mount };
}
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
describe('asynchronous phase activation', () => {
  it('requests ship once for START and keeps shared assets through survival handoff', async () => {
    let start!: () => void;
    let complete!: Parameters<GameFactories['createScavenge']>[1];
    const r = rig({
      createMenu: (_context, next) => { start = next; return phase(); },
      createScavenge: (_context, next) => { complete = next; return phase(); },
    });
    await r.game.ready;
    start(); start();
    await flushPhases();
    expect(r.loaders.loadShipModels).toHaveBeenCalledOnce();
    expect(r.loaders.loadSurvivalModels).not.toHaveBeenCalled();
    complete({ savedItems: [], elapsedSeconds: 3 });
    await flushPhases();
    expect(r.loaders.loadSurvivalModels).toHaveBeenCalledOnce();
    expect(r.loaders.loadSkyAssets).toHaveBeenCalledOnce();
    expect(r.loaders.loadLifeboatAssets).toHaveBeenCalledOnce();
    const models = await vi.mocked(r.loaders.loadShipModels).mock.results[0]!.value;
    expect(models.dispose).toHaveBeenCalledOnce();
    r.game.dispose();
  });
  it.each(['resolve','reject'] as const)('ignores a replaced ship load that later %ss', async outcome => {
    let start!: () => void;
    const r = rig({ createMenu: (_context, next) => { start = next; return phase(); } });
    await r.game.ready;
    const pending = deferred<Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>>();
    const ship = asset();
    vi.mocked(r.loaders.loadShipAssets).mockReturnValue(pending.promise);
    start();
    await flushPhases();
    expect(r.mount.querySelector('.system-screen--loading')).not.toBeNull();
    const event = EVENT_TEST_OPTIONS.find(option => option.phase !== 'ending')!;
    (r.game as unknown as { enterTestEvent(id: string): void }).enterTestEvent(event.id);
    await flushPhases();
    expect(r.factories.createSurvival).toHaveBeenCalledOnce();
    if (outcome === 'resolve') pending.resolve(ship as unknown as Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>);
    else pending.reject(new Error('stale failure'));
    await flushPhases();
    expect(r.factories.createScavenge).not.toHaveBeenCalled();
    expect(r.onFatalError).not.toHaveBeenCalled();
    if (outcome === 'resolve') expect(ship.dispose).toHaveBeenCalledOnce();
    r.game.dispose();
  });
  it('releases a pending ship load once when the game is disposed', async () => {
    let start!: () => void;
    const r = rig({ createMenu: (_context, next) => { start = next; return phase(); } });
    await r.game.ready;
    const pending = deferred<Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>>();
    const ship = asset();
    vi.mocked(r.loaders.loadShipAssets).mockReturnValue(pending.promise);
    start(); await flushPhases();
    r.game.dispose(); r.game.dispose();
    pending.resolve(ship as unknown as Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>);
    await flushPhases();
    expect(ship.dispose).toHaveBeenCalledOnce();
    expect(r.factories.createScavenge).not.toHaveBeenCalled();
    expect(r.onFatalError).not.toHaveBeenCalled();
  });
  it('releases the incoming lease when its phase constructor fails', async () => {
    let start!: () => void;
    const error = new Error('phase constructor');
    const r = rig({
      createMenu: (_context, next) => { start = next; return phase(); },
      createScavenge: () => { throw error; },
    });
    await r.game.ready;
    start(); await flushPhases();
    expect(r.onFatalError).toHaveBeenCalledExactlyOnceWith(error);
    const models = await vi.mocked(r.loaders.loadShipModels).mock.results[0]!.value;
    expect(models.dispose).toHaveBeenCalledOnce();
    r.game.dispose();
    expect(models.dispose).toHaveBeenCalledOnce();
  });
  it('offers the existing resume control when pointer lock is lost during loading', async () => {
    let start!: () => void;
    let locked = true;
    const requestPointerLock = vi.fn(async () => false);
    const r = rig({
      createMenu: (_context, next) => { start = next; return phase(); },
      createScavenge: context => {
        const ui = new GameUI(context.mount);
        ui.setPresentation('intro');
        const scavenge = Object.create(ScavengePhase.prototype) as ScavengePhase;
        const internals = scavenge as unknown as { requestPointerLock(): Promise<void>; unsubscribeLanguage(): void };
        Object.assign(scavenge, {
          context, ui, disposed: false, started: false, phaseStart: 'intro', presentation: 'intro',
          input: { get pointerLocked() { return locked; }, requestPointerLock },
          world: { revealPhysicsObjects: vi.fn() },
          audio: { start: vi.fn(), deny: vi.fn(), setPaused: vi.fn() },
          beginIntro: vi.fn(),
        });
        ui.onResume = () => { void internals.requestPointerLock(); };
        return { ...phase(), start: () => scavenge.start(), dispose: () => { internals.unsubscribeLanguage(); ui.dispose(); } };
      },
    });
    await r.game.ready;
    const pending = deferred<Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>>();
    vi.mocked(r.loaders.loadShipAssets).mockReturnValue(pending.promise);
    start(); await flushPhases();
    locked = false;
    pending.resolve(asset() as unknown as Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>);
    await flushPhases();
    expect(requestPointerLock).toHaveBeenCalledOnce();
    expect(r.mount.querySelector('[data-pointer-lock-error].is-visible')).not.toBeNull();
    r.mount.querySelector<HTMLButtonElement>('[data-resume-button]')!.click();
    await flushPhases();
    expect(requestPointerLock).toHaveBeenCalledTimes(2);
    r.game.dispose();
  });

  it.each(['continue', 'event'] as const)('requests direct survival from %s without ship assets', async route => {
    const checkpoint = {
      scavengeElapsedSeconds: 3,
      session: new SurvivalSession([], { seed: 41 }).exportCheckpoint(),
    };
    const values = new Map([
      [SURVIVAL_SAVE_ENABLED_KEY, 'true'],
      [SURVIVAL_SAVE_DATA_KEY, JSON.stringify(createSurvivalSaveDocument(checkpoint))],
    ]);
    const r = rig({}, { saveStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    } });
    await r.game.ready;
    const director = r.game as unknown as { continueSavedRun(): void; enterTestEvent(id: string): void };
    if (route === 'continue') director.continueSavedRun();
    else director.enterTestEvent(EVENT_TEST_OPTIONS.find(option => option.phase !== 'ending')!.id);
    await flushPhases();
    expect(r.loaders.loadSurvivalModels).toHaveBeenCalledOnce();
    expect(r.loaders.loadShipModels).not.toHaveBeenCalled();
    expect(r.loaders.loadShipAssets).not.toHaveBeenCalled();
    expect(r.loaders.loadShipFurniture).not.toHaveBeenCalled();
    expect(r.loaders.loadPhysicsRuntime).not.toHaveBeenCalled();
    r.game.dispose();
  });

});
