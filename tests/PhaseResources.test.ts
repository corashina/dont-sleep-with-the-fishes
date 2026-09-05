// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { PhaseResources, type PhaseResourceLoaders } from '../src/app/PhaseResources';
import { AudioSystem } from '../src/audio/AudioSystem';
function loaders() {
  const asset = () => ({ dispose: vi.fn(), configure: vi.fn() });
  return Object.fromEntries(['loadMenuFont','loadMenuModels','loadMenuSandAssets','loadShipModels','loadSurvivalModels','loadShipFurniture','loadSkyAssets','loadLifeboatAssets','loadShipAssets','loadPhysicsRuntime'].map(key => [key, vi.fn(async () => asset())])) as unknown as PhaseResourceLoaders;
}
describe('phase resource ownership', () => {
  it('loads menu without requesting ship, survival, or physics', async () => {
    const dependencies = loaders();
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const menu = await resources.acquireMenu();
    expect(dependencies.loadMenuModels).toHaveBeenCalledOnce();
    expect(dependencies.loadShipAssets).not.toHaveBeenCalled();
    expect(dependencies.loadPhysicsRuntime).not.toHaveBeenCalled();
    expect(dependencies.loadSurvivalModels).not.toHaveBeenCalled();
    menu.dispose();
    menu.dispose();
    expect(menu.assets.menuModels.dispose).toHaveBeenCalledOnce();
    resources.dispose();
  });
  it('shares dependencies across overlapping ship leases and releases the last owner', async () => {
    const dependencies = loaders();
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const [first, second] = await Promise.all([resources.acquireShip(), resources.acquireShip()]);
    expect(dependencies.loadShipModels).toHaveBeenCalledOnce();
    first.dispose();
    expect(first.assets.propModels.dispose).not.toHaveBeenCalled();
    second.dispose();
    expect(first.assets.propModels.dispose).toHaveBeenCalledOnce();
    resources.dispose();
  });
  it('loads direct survival without ship assets or physics', async () => {
    const dependencies = loaders();
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const survival = await resources.acquireSurvival();
    expect(dependencies.loadShipFurniture).not.toHaveBeenCalled();
    expect(dependencies.loadShipAssets).not.toHaveBeenCalled();
    expect(dependencies.loadPhysicsRuntime).not.toHaveBeenCalled();
    survival.dispose();
    resources.dispose();
  });
  it('releases successful siblings when a required group fails', async () => {
    const dependencies = loaders();
    const failure = new Error('failed ship');
    vi.mocked(dependencies.loadShipAssets).mockRejectedValue(failure);
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    await expect(resources.acquireShip()).rejects.toBe(failure);
    const models = await vi.mocked(dependencies.loadShipModels).mock.results[0]!.value;
    expect(models.dispose).toHaveBeenCalledOnce();
    resources.dispose();
  });
  it('releases late assets after disposal and rejects activation', async () => {
    const dependencies = loaders();
    let resolve!: (value: Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>) => void;
    const asset = { dispose: vi.fn(), configure: vi.fn() };
    vi.mocked(dependencies.loadShipAssets).mockImplementation(() => new Promise(accept => { resolve = accept; }));
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    const pending = resources.acquireShip();
    resources.dispose();
    await Promise.resolve();
    resolve(asset as unknown as Awaited<ReturnType<PhaseResourceLoaders['loadShipAssets']>>);
    await expect(pending).rejects.toThrow('disposed');
    expect(asset.dispose).toHaveBeenCalledOnce();
  });
  it('retries a failed slot with fresh assets after all sibling cleanup', async () => {
    const dependencies = loaders();
    vi.mocked(dependencies.loadShipAssets).mockRejectedValueOnce(new Error('first attempt'));
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    await expect(resources.acquireShip()).rejects.toThrow('first attempt');
    const lease = await resources.acquireShip();
    expect(dependencies.loadShipAssets).toHaveBeenCalledTimes(2);
    expect(dependencies.loadShipModels).toHaveBeenCalledTimes(2);
    lease.dispose(); resources.dispose();
  });

  it('waits for the display font before returning menu assets', async () => {
    const dependencies = loaders();
    let resolve!: () => void;
    const font = new Promise<void>(accept => { resolve = accept; });
    Object.assign(dependencies, { loadMenuFont: vi.fn(() => font) });
    const resources = new PhaseResources(dependencies, AudioSystem.silent(), 'enabled');
    let acquired = false;
    const pending = resources.acquireMenu().then(lease => { acquired = true; return lease; });
    for (let i = 0; i < 16; i += 1) await Promise.resolve();
    expect(acquired).toBe(false);
    resolve();
    (await pending).dispose(); resources.dispose();
  });

});
