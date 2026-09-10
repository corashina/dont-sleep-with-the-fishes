// @vitest-environment jsdom
import { describe,it,expect,vi } from 'vitest';
import { PhaseResources,type PhaseResourceLoaders } from '../src/app/PhaseResources';
import { AudioSystem } from '../src/audio/AudioSystem';
import type { AudioBackend } from '../src/audio/AudioBackend';
import { EVENT_ONLY_SOUND_IDS,MENU_SOUND_IDS,SURVIVAL_SOUND_IDS } from '../src/audio/audioManifest';

function loaders(): PhaseResourceLoaders {
  const asset = () => ({ dispose: vi.fn(), configure: vi.fn() });
  const names = [
    'loadMenuModels', 'loadMenuSandAssets', 'loadGameplayModels', 'loadSurvivalContent',
    'loadShipFurniture', 'loadSkyAssets', 'loadLifeboatAssets', 'loadShipAssets', 'loadPhysicsRuntime',
  ];
  return {
    loadMenuFont: vi.fn(async () => undefined),
    ...Object.fromEntries(names.map(key => [key, vi.fn(async () => asset())])),
  } as unknown as PhaseResourceLoaders;
}

function audioBackend() {
  return {
    acquire: vi.fn<AudioBackend['acquire']>().mockResolvedValue(undefined),
    release: vi.fn<AudioBackend['release']>(),
    unlock: vi.fn(async () => undefined),
    play: vi.fn(() => null),
    playSpatialLoop: vi.fn(() => null),
    setListenerPose: vi.fn(),
    setBusGain: vi.fn(),
    setMasterGain: vi.fn(),
    dispose: vi.fn(),
  } satisfies AudioBackend;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 16; index += 1) await Promise.resolve();
}

describe('phase resource ownership', () => {

  it('loads only menu assets and audio before gameplay starts', async () => {
    const dependencies = loaders();
    const backend = audioBackend();
    const resources = new PhaseResources(dependencies, AudioSystem.forTest(backend), 'enabled');
    const menu = await resources.acquireMenu();
    expect(dependencies.loadMenuFont).toHaveBeenCalledOnce();
    expect(dependencies.loadMenuModels).toHaveBeenCalledOnce();
    expect(dependencies.loadMenuSandAssets).toHaveBeenCalledOnce();
    for (const name of [
      'loadGameplayModels', 'loadSurvivalContent', 'loadShipFurniture', 'loadSkyAssets',
      'loadLifeboatAssets', 'loadShipAssets', 'loadPhysicsRuntime',
    ] as const) expect(dependencies[name]).not.toHaveBeenCalled();
    expect(backend.acquire).toHaveBeenCalledExactlyOnceWith(MENU_SOUND_IDS);

    menu.dispose();
    menu.dispose();
    expect(menu.assets.menuModels.dispose).not.toHaveBeenCalled();
    expect(backend.release).not.toHaveBeenCalled();
    resources.dispose();
    expect(menu.assets.menuModels.dispose).toHaveBeenCalledOnce();
    expect(menu.assets.menuSandAssets.dispose).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledExactlyOnceWith(MENU_SOUND_IDS);
  });

  it('retains shared assets across ship, survival, menu, and another survival run', async () => {
    const dependencies = loaders();
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const ship = await resources.acquireShip();
    ship.dispose();
    const survival = await resources.acquireSurvival();
    expect(survival.assets.propModels).toBe(ship.assets.propModels);
    expect(survival.assets.survivalContent).toBe(ship.assets.survivalContent);
    survival.dispose();
    const menu = await resources.acquireMenu();
    menu.dispose();
    const resumed = await resources.acquireSurvival();
    expect(resumed.assets.propModels).toBe(ship.assets.propModels);
    expect(resumed.assets.survivalContent).toBe(ship.assets.survivalContent);
    for (const name of ['loadGameplayModels', 'loadSurvivalContent', 'loadSkyAssets', 'loadLifeboatAssets'] as const) {
      expect(dependencies[name]).toHaveBeenCalledOnce();
    }
    resumed.dispose();
    expect(ship.assets.propModels.dispose).not.toHaveBeenCalled();
    expect(ship.assets.survivalContent.dispose).not.toHaveBeenCalled();
    expect(ship.assets.skyAssets.dispose).not.toHaveBeenCalled();
    expect(ship.assets.lifeboatAssets.dispose).not.toHaveBeenCalled();
    resources.dispose();
    expect(ship.assets.propModels.dispose).toHaveBeenCalledOnce();
    expect(ship.assets.survivalContent.dispose).toHaveBeenCalledOnce();
    expect(ship.assets.skyAssets.dispose).toHaveBeenCalledOnce();
    expect(ship.assets.lifeboatAssets.dispose).toHaveBeenCalledOnce();
  });

  it('shares concurrent ship loads and disposes active and released assets once at shutdown', async () => {
    const dependencies = loaders();
    const backend = audioBackend();
    const resources = new PhaseResources(dependencies, AudioSystem.forTest(backend), 'enabled');
    const [first, second] = await Promise.all([resources.acquireShip(), resources.acquireShip()]);
    expect(dependencies.loadGameplayModels).toHaveBeenCalledOnce();
    expect(first.assets.propModels).toBe(second.assets.propModels);
    first.dispose();
    expect(first.assets.propModels.dispose).not.toHaveBeenCalled();
    resources.dispose();
    resources.dispose();
    first.dispose();
    second.dispose();
    for (const asset of [
      first.assets.propModels, first.assets.shipFurniture, first.assets.skyAssets,
      first.assets.shipAssets, first.assets.lifeboatAssets, first.assets.survivalContent,
    ]) expect(asset.dispose).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledTimes(2);
    expect(backend.dispose).toHaveBeenCalledOnce();
    await expect(resources.acquireShip()).rejects.toThrow('disposed');
  });

  it('loads direct survival without ship assets or physics', async () => {
    const dependencies = loaders();
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const survival = await resources.acquireSurvival();
    expect(dependencies.loadGameplayModels).toHaveBeenCalledOnce();
    expect(dependencies.loadSurvivalContent).toHaveBeenCalledOnce();
    expect(dependencies.loadShipFurniture).not.toHaveBeenCalled();
    expect(dependencies.loadShipAssets).not.toHaveBeenCalled();
    expect(dependencies.loadPhysicsRuntime).not.toHaveBeenCalled();
    survival.dispose();
    resources.dispose();
  });

  it.each(['acquireShip', 'acquireSurvival'] as const)('waits for survival content before %s returns', async acquire => {
    const dependencies = loaders();
    const content = deferred<Awaited<ReturnType<PhaseResourceLoaders['loadSurvivalContent']>>>();
    const asset = await dependencies.loadSurvivalContent();
    vi.mocked(dependencies.loadSurvivalContent).mockClear().mockReturnValue(content.promise);
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const activated = vi.fn();
    const pending = resources[acquire]().then(lease => { activated(); return lease; });
    await flushPromises();
    expect(dependencies.loadSurvivalContent).toHaveBeenCalledOnce();
    expect(activated).not.toHaveBeenCalled();
    content.resolve(asset);
    const lease = await pending;
    expect(lease.assets.survivalContent).toBe(asset);
    expect(activated).toHaveBeenCalledOnce();
    lease.dispose();
    resources.dispose();
  });

  it.each(['acquireShip', 'acquireSurvival'] as const)('waits for all event audio during %s', async acquire => {
    const dependencies = loaders();
    const backend = audioBackend();
    const ready = deferred<void>();
    backend.acquire.mockImplementation(ids => ids.includes('tentacleMovement') ? ready.promise : Promise.resolve());
    const resources = new PhaseResources(dependencies, AudioSystem.forTest(backend), 'enabled');
    const activated = vi.fn();
    const pending = resources[acquire]().then(lease => { activated(); return lease; });
    await flushPromises();
    expect(backend.acquire).toHaveBeenCalledWith(SURVIVAL_SOUND_IDS);
    const sounds = backend.acquire.mock.calls.find(([ids]) => ids.includes('tentacleMovement'))![0];
    expect(sounds).toEqual(expect.arrayContaining([...EVENT_ONLY_SOUND_IDS]));
    expect(activated).not.toHaveBeenCalled();
    ready.resolve();
    (await pending).dispose();
    expect(backend.release).not.toHaveBeenCalled();
    const survival = await resources.acquireSurvival();
    survival.dispose();
    expect(backend.acquire.mock.calls.filter(([ids]) => ids.includes('tentacleMovement'))).toHaveLength(1);
    expect(backend.release).not.toHaveBeenCalled();
    resources.dispose();
    expect(backend.release).toHaveBeenCalledWith(SURVIVAL_SOUND_IDS);
    expect(backend.release.mock.calls.filter(([ids]) => ids.includes('tentacleMovement'))).toHaveLength(1);
  });

  it('keeps successful siblings after failure and retries only the failed slot', async () => {
    const dependencies = loaders();
    const failure = new Error('failed ship');
    vi.mocked(dependencies.loadShipAssets).mockRejectedValueOnce(failure);
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    await expect(resources.acquireShip()).rejects.toBe(failure);
    const models = await vi.mocked(dependencies.loadGameplayModels).mock.results[0]!.value;
    const content = await vi.mocked(dependencies.loadSurvivalContent).mock.results[0]!.value;
    expect(models.dispose).not.toHaveBeenCalled();
    expect(content.dispose).not.toHaveBeenCalled();
    const lease = await resources.acquireShip();
    expect(lease.assets.propModels).toBe(models);
    expect(lease.assets.survivalContent).toBe(content);
    expect(dependencies.loadShipAssets).toHaveBeenCalledTimes(2);
    for (const name of [
      'loadGameplayModels', 'loadSurvivalContent', 'loadShipFurniture', 'loadSkyAssets',
      'loadLifeboatAssets', 'loadPhysicsRuntime',
    ] as const) expect(dependencies[name]).toHaveBeenCalledOnce();
    lease.dispose();
    expect(models.dispose).not.toHaveBeenCalled();
    resources.dispose();
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(content.dispose).toHaveBeenCalledOnce();
  });

  it('releases late assets after shutdown and rejects activation', async () => {
    const dependencies = loaders();
    const ship = deferred<Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>>();
    const asset = await dependencies.loadShipAssets();
    vi.mocked(dependencies.loadShipAssets).mockReturnValue(ship.promise);
    const progress = vi.fn();
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const pending = resources.acquireShip(progress);
    const rejected = expect(pending).rejects.toThrow('disposed');
    await flushPromises();
    resources.dispose();
    const progressCalls = progress.mock.calls.length;
    expect(asset.dispose).not.toHaveBeenCalled();
    ship.resolve(asset);
    await rejected;
    resources.dispose();
    expect(asset.dispose).toHaveBeenCalledOnce();
    const models = await vi.mocked(dependencies.loadGameplayModels).mock.results[0]!.value;
    const content = await vi.mocked(dependencies.loadSurvivalContent).mock.results[0]!.value;
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(content.dispose).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledTimes(progressCalls);
  });

  it('waits for the display font before returning menu assets', async () => {
    const dependencies = loaders();
    const font = deferred<void>();
    vi.mocked(dependencies.loadMenuFont).mockReturnValue(font.promise);
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const acquired = vi.fn();
    const pending = resources.acquireMenu().then(lease => { acquired(); return lease; });
    await flushPromises();
    expect(acquired).not.toHaveBeenCalled();
    font.resolve();
    (await pending).dispose();
    expect(acquired).toHaveBeenCalledOnce();
    resources.dispose();
  });
});
