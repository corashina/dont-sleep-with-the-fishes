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
import type { MenuAssets, ShipPhaseAssets, SurvivalAssets } from './GamePhase';

export interface ResourceLease<T> {
  readonly assets: T;
  dispose(): void;
}
export interface PhaseResourceSource {
  readonly audio: AudioSystem;
  readonly physicsMode: PhysicsMode;
  acquireMenu(): Promise<ResourceLease<MenuAssets>>;
  acquireShip(): Promise<ResourceLease<ShipPhaseAssets>>;
  acquireSurvival(): Promise<ResourceLease<SurvivalAssets>>;
  dispose(): void;
}
export interface PhaseResourceLoaders {
  loadMenuFont(): Promise<void>;
  loadMenuModels(): Promise<MenuModelLibrary>;
  loadMenuSandAssets(): Promise<MenuSandAssets>;
  loadShipModels(): Promise<PropModelLibrary>;
  loadSurvivalModels(): Promise<PropModelLibrary>;
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
  loadShipModels: () => PropModelLibrary.load(undefined, ['riggedHand']),
  loadSurvivalModels: () => PropModelLibrary.load(undefined, EVENT_MODEL_IDS.filter(id => id !== 'riggedHand')),
  loadShipFurniture: () => ShipFurnitureLibrary.load(),
  loadSkyAssets: () => SkyAssets.load(),
  loadLifeboatAssets: () => LifeboatAssets.load(),
  loadShipAssets: () => ShipAssets.load(),
  loadPhysicsRuntime,
};

// A slot shares a pending load and keeps its asset until the final phase releases it.
class AssetSlot<T> {
  private pending: Promise<T> | null = null;
  private references = 0;
  constructor(private readonly load: () => Promise<T>, private readonly release: (asset: T) => void) {}
  async acquire(): Promise<ResourceLease<T>> {
    this.references += 1;
    const pending = this.pending ??= Promise.resolve().then(this.load);
    let asset: T;
    try { asset = await pending; } catch (error) {
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
        if (this.references !== 0) return;
        this.pending = null;
        this.release(asset);
      },
    };
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
  private readonly shipModels: AssetSlot<PropModelLibrary>;
  private readonly survivalModels: AssetSlot<PropModelLibrary>;
  private readonly furniture: AssetSlot<ShipFurnitureLibrary>;
  private readonly sky: AssetSlot<SkyAssets>;
  private readonly lifeboat: AssetSlot<LifeboatAssets>;
  private readonly ship: AssetSlot<ShipAssets>;
  private readonly physics: AssetSlot<PhysicsRuntime | null>;
  constructor(loaders: PhaseResourceLoaders, readonly audio: AudioSystem, readonly physicsMode: PhysicsMode) {
    this.menuFont = new AssetSlot(() => loaders.loadMenuFont(), () => undefined);
    this.menuModels = disposableSlot(() => loaders.loadMenuModels());
    this.menuSand = disposableSlot(() => loaders.loadMenuSandAssets());
    this.shipModels = disposableSlot(() => loaders.loadShipModels());
    this.survivalModels = disposableSlot(() => loaders.loadSurvivalModels());
    this.furniture = disposableSlot(() => loaders.loadShipFurniture());
    this.sky = disposableSlot(() => loaders.loadSkyAssets());
    this.lifeboat = disposableSlot(() => loaders.loadLifeboatAssets());
    this.ship = disposableSlot(() => loaders.loadShipAssets());
    this.physics = new AssetSlot(() => physicsMode === 'off' ? Promise.resolve(null) : loaders.loadPhysicsRuntime(), () => undefined);
  }
  acquireMenu(): Promise<ResourceLease<MenuAssets>> {
    return this.acquire(async own => {
      const [menuModels, menuSandAssets] = await Promise.all([
        own(this.menuModels.acquire()), own(this.menuSand.acquire()), own(this.menuFont.acquire()),
      ]);
      return { menuModels, menuSandAssets };
    }, MENU_SOUND_IDS);
  }
  acquireShip(): Promise<ResourceLease<ShipPhaseAssets>> {
    return this.acquire(async own => {
      const [propModels, shipFurniture, skyAssets, shipAssets, physicsRuntime, lifeboatAssets] = await Promise.all([
        own(this.shipModels.acquire()), own(this.furniture.acquire()), own(this.sky.acquire()),
        own(this.ship.acquire()), own(this.physics.acquire()), own(this.lifeboat.acquire()),
      ]);
      return { propModels, shipFurniture, skyAssets, shipAssets, physicsRuntime, lifeboatAssets, physicsMode: this.physicsMode };
    }, SHIP_SOUND_IDS);
  }
  acquireSurvival(): Promise<ResourceLease<SurvivalAssets>> {
    return this.acquire(async own => {
      const [propModels, skyAssets, lifeboatAssets] = await Promise.all([
        own(this.survivalModels.acquire()), own(this.sky.acquire()), own(this.lifeboat.acquire()),
      ]);
      return { propModels, skyAssets, lifeboatAssets };
    }, SURVIVAL_SOUND_IDS);
  }
  private async acquire<T>(
    load: (own: <A>(pending: Promise<ResourceLease<A>>) => Promise<A>) => Promise<T>,
    sounds: Parameters<AudioSystem['acquirePhaseAudio']>[0],
  ): Promise<ResourceLease<T>> {
    if (this.disposed) throw new Error('Phase resources are disposed.');
    const acquired: { dispose(): void }[] = [];
    const pending: Promise<unknown>[] = [];
    const own = <A>(promise: Promise<ResourceLease<A>>): Promise<A> => {
      const tracked = promise.then(lease => { acquired.push(lease); return lease.assets; });
      pending.push(tracked);
      return tracked;
    };
    let assets: T;
    try {
      const audio = this.audio.acquirePhaseAudio(sounds).then(lease => { acquired.push(lease); });
      pending.push(audio);
      [assets] = await Promise.all([load(own), audio]);
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
      ...[...this.leases].map(lease => () => lease.dispose()),
      () => this.audio.dispose(),
    ]);
  }
}
