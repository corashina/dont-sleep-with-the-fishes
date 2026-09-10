import { AudioSystem } from '../audio/AudioSystem';
import { MENU_SOUND_IDS, SHIP_SOUND_IDS, SURVIVAL_SOUND_IDS } from '../audio/audioManifest';
import { MenuModelLibrary } from '../menu/MenuModelLibrary';
import { loadMenuSignFont } from '../menu/MenuSigns';
import { MenuSandAssets } from '../menu/MenuSandAssets';
import { loadPhysicsRuntime, type PhysicsRuntime } from '../physics/PhysicsRuntime';
import type { PhysicsMode } from '../physics/PhysicsOptions';
import { PropModelLibrary } from '../world/PropModelLibrary';
import { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import { SkyAssets } from '../world/SkyAssets';
import { LifeboatAssets } from '../world/LifeboatAssets';
import { ShipAssets } from '../world/ShipAssets';
import { EVENT_MODEL_IDS } from '../world/eventModelIds';
import { runCleanupSteps } from '../world/SceneResources';
import { SurvivalContent } from '../survival/SurvivalContent';
import type { MenuAssets, ShipPhaseAssets, SurvivalAssets } from './GamePhase';

export interface ResourceLease<T> {
  readonly assets: T;
  dispose(): void;
}
export type ResourceProgress = (completed: number, total: number) => void;
export interface PhaseResourceSource {
  readonly audio: AudioSystem;
  readonly physicsMode: PhysicsMode;
  acquireMenu(onProgress?: ResourceProgress): Promise<ResourceLease<MenuAssets>>;
  acquireShip(onProgress?: ResourceProgress): Promise<ResourceLease<ShipPhaseAssets>>;
  acquireSurvival(onProgress?: ResourceProgress): Promise<ResourceLease<SurvivalAssets>>;
  dispose(): void;
}
export interface PhaseResourceLoaders {
  loadMenuFont(): Promise<void>;
  loadMenuModels(): Promise<MenuModelLibrary>;
  loadMenuSandAssets(): Promise<MenuSandAssets>;
  loadGameplayModels(): Promise<PropModelLibrary>;
  loadSurvivalContent(): Promise<SurvivalContent>;
  loadShipFurniture(): Promise<ShipFurnitureLibrary>;
  loadSkyAssets(): Promise<SkyAssets>;
  loadLifeboatAssets(): Promise<LifeboatAssets>;
  loadShipAssets(): Promise<ShipAssets>;
  loadPhysicsRuntime(): Promise<PhysicsRuntime>;
}
export const PHASE_RESOURCE_LOADERS: PhaseResourceLoaders = {
  loadMenuFont: loadMenuSignFont,
  loadMenuModels: () => MenuModelLibrary.load(),
  loadMenuSandAssets: () => MenuSandAssets.load(),
  loadGameplayModels: () => PropModelLibrary.load(undefined, EVENT_MODEL_IDS),
  loadSurvivalContent: () => SurvivalContent.load(),
  loadShipFurniture: () => ShipFurnitureLibrary.load(),
  loadSkyAssets: () => SkyAssets.load(),
  loadLifeboatAssets: () => LifeboatAssets.load(),
  loadShipAssets: () => ShipAssets.load(),
  loadPhysicsRuntime,
};

// The game owns resident assets. Phase leases protect pending loads during shutdown.
class AssetSlot<T> {
  private pending: Promise<T> | null = null;
  private references = 0;
  private value: { asset: T } | null = null;
  private disposed = false;
  constructor(private readonly load: () => Promise<T>, private readonly release: (asset: T) => void) {}
  async acquire(): Promise<ResourceLease<T>> {
    if (this.disposed) throw new Error('Asset slot is disposed.');
    this.references += 1;
    const pending = this.pending ??= Promise.resolve().then(this.load);
    let asset: T;
    try { asset = await pending; this.value = { asset }; } catch (error) {
      this.references -= 1;
      if (this.references === 0) this.pending = null;
      throw error;
    }
    let disposed = false;
    return {
      assets: asset,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.references -= 1;
        this.releaseIfUnused();
      },
    };
  }
  dispose(): void {
    this.disposed = true;
    this.releaseIfUnused();
  }
  private releaseIfUnused(): void {
    if (!this.disposed || this.references !== 0 || this.value === null) return;
    const { asset } = this.value;
    this.value = null;
    this.pending = null;
    this.release(asset);
  }
}
function disposableSlot<T extends { dispose(): void }>(load: () => Promise<T>): AssetSlot<T> {
  return new AssetSlot(load, asset => asset.dispose());
}

export class PhaseResources implements PhaseResourceSource {
  private disposed = false;
  private readonly leases = new Set<ResourceLease<unknown>>();
  private readonly menuFont: AssetSlot<void>;
  private readonly menuModels: AssetSlot<MenuModelLibrary>;
  private readonly menuSand: AssetSlot<MenuSandAssets>;
  private readonly gameplayModels: AssetSlot<PropModelLibrary>;
  private readonly survivalContent: AssetSlot<SurvivalContent>;
  private readonly menuAudio: AssetSlot<Awaited<ReturnType<AudioSystem['acquirePhaseAudio']>>>;
  private readonly shipAudio: AssetSlot<Awaited<ReturnType<AudioSystem['acquirePhaseAudio']>>>;
  private readonly survivalAudio: AssetSlot<Awaited<ReturnType<AudioSystem['acquirePhaseAudio']>>>;
  private readonly furniture: AssetSlot<ShipFurnitureLibrary>;
  private readonly sky: AssetSlot<SkyAssets>;
  private readonly lifeboat: AssetSlot<LifeboatAssets>;
  private readonly ship: AssetSlot<ShipAssets>;
  private readonly physics: AssetSlot<PhysicsRuntime | null>;
  constructor(
    loaders: PhaseResourceLoaders,
    readonly audio: AudioSystem,
    readonly physicsMode: PhysicsMode,
    private readonly onProgress?: (completed: number, total: number) => void,
  ) {
    this.menuFont = new AssetSlot(() => loaders.loadMenuFont(), () => undefined);
    this.menuModels = disposableSlot(() => loaders.loadMenuModels());
    this.menuSand = disposableSlot(() => loaders.loadMenuSandAssets());
    this.gameplayModels = disposableSlot(() => loaders.loadGameplayModels());
    this.survivalContent = disposableSlot(() => loaders.loadSurvivalContent());
    this.menuAudio = disposableSlot(() => audio.acquirePhaseAudio(MENU_SOUND_IDS));
    this.shipAudio = disposableSlot(() => audio.acquirePhaseAudio(SHIP_SOUND_IDS));
    this.survivalAudio = disposableSlot(() => audio.acquirePhaseAudio(SURVIVAL_SOUND_IDS));
    this.furniture = disposableSlot(() => loaders.loadShipFurniture());
    this.sky = disposableSlot(() => loaders.loadSkyAssets());
    this.lifeboat = disposableSlot(() => loaders.loadLifeboatAssets());
    this.ship = disposableSlot(() => loaders.loadShipAssets());
    this.physics = new AssetSlot(() => physicsMode === 'off' ? Promise.resolve(null) : loaders.loadPhysicsRuntime(), () => undefined);
  }
  acquireMenu(onProgress?: ResourceProgress): Promise<ResourceLease<MenuAssets>> {
    return this.acquire(async own => {
      const [menuModels, menuSandAssets] = await Promise.all([
        own(this.menuModels.acquire()), own(this.menuSand.acquire()), own(this.menuFont.acquire()),
      ]);
      return { menuModels, menuSandAssets };
    }, this.menuAudio, onProgress);
  }
  acquireShip(onProgress?: ResourceProgress): Promise<ResourceLease<ShipPhaseAssets>> {
    return this.acquire(async own => {
      const [propModels, shipFurniture, skyAssets, shipAssets, physicsRuntime, lifeboatAssets, survivalContent] = await Promise.all([
        own(this.gameplayModels.acquire()), own(this.furniture.acquire()), own(this.sky.acquire()),
        own(this.ship.acquire()), own(this.physics.acquire()), own(this.lifeboat.acquire()),
        own(this.survivalContent.acquire()), own(this.survivalAudio.acquire()),
      ]);
      return { propModels, shipFurniture, skyAssets, shipAssets, physicsRuntime, lifeboatAssets, survivalContent, physicsMode: this.physicsMode };
    }, this.shipAudio, onProgress);
  }
  acquireSurvival(onProgress?: ResourceProgress): Promise<ResourceLease<SurvivalAssets>> {
    return this.acquire(async own => {
      const [propModels, skyAssets, lifeboatAssets, survivalContent] = await Promise.all([
        own(this.gameplayModels.acquire()), own(this.sky.acquire()), own(this.lifeboat.acquire()),
        own(this.survivalContent.acquire()),
      ]);
      return { propModels, skyAssets, lifeboatAssets, survivalContent };
    }, this.survivalAudio, onProgress);
  }
  private async acquire<T>(
    load: (own: <A>(pending: Promise<ResourceLease<A>>) => Promise<A>) => Promise<T>,
    audioSlot: AssetSlot<Awaited<ReturnType<AudioSystem['acquirePhaseAudio']>>>,
    onProgress: ResourceProgress = this.onProgress ?? (() => undefined),
  ): Promise<ResourceLease<T>> {
    if (this.disposed) throw new Error('Phase resources are disposed.');
    const acquired: { dispose(): void }[] = [];
    const pending: Promise<unknown>[] = [];
    let completed = 0;
    const finishResource = (): void => {
      completed += 1;
      if (!this.disposed) onProgress(completed, pending.length);
    };
    const own = <A>(promise: Promise<ResourceLease<A>>): Promise<A> => {
      const tracked = promise.then(lease => {
        acquired.push(lease);
        finishResource();
        return lease.assets;
      });
      pending.push(tracked);
      return tracked;
    };
    let assets: T;
    try {
      const audio = audioSlot.acquire().then(lease => {
        acquired.push(lease);
        finishResource();
      });
      pending.push(audio);
      const assetLoad = load(own);
      onProgress(0, pending.length);
      [assets] = await Promise.all([assetLoad, audio]);
      if (this.disposed) throw new Error('Phase resources were disposed during loading.');
    } catch (error) {
      await Promise.allSettled(pending);
      try { runCleanupSteps(acquired.map(lease => () => lease.dispose())); } catch { /* Keep the load error. */ }
      throw error;
    }
    let disposed = false;
    const lease: ResourceLease<T> = {
      assets,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.leases.delete(lease);
        runCleanupSteps(acquired.map(resource => () => resource.dispose()));
      },
    };
    this.leases.add(lease);
    return lease;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      ...[
        this.menuFont, this.menuModels, this.menuSand, this.gameplayModels, this.survivalContent,
        this.menuAudio, this.shipAudio, this.survivalAudio, this.furniture, this.sky,
        this.lifeboat, this.ship, this.physics,
      ].map(slot => () => slot.dispose()),
      ...[...this.leases].map(lease => () => lease.dispose()),
      () => this.audio.dispose(),
    ]);
  }
}
