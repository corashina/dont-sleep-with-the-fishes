import { runCleanupSteps } from '../../src/world/SceneResources';
import { Texture } from 'three';
import { Game, type GameFactories, type GameTestOptions } from '../../src/Game';
import type { PropModelLibrary } from '../../src/world/PropModelLibrary';
import type { MenuModelLibrary } from '../../src/menu/MenuModelLibrary';
import { MenuSandAssets } from '../../src/menu/MenuSandAssets';
import type { ShipFurnitureLibrary } from '../../src/world/ShipFurnitureLibrary';
import type { SkyAssets } from '../../src/world/SkyAssets';
import { LifeboatAssets } from '../../src/world/LifeboatAssets';
import { ShipAssets } from '../../src/world/ShipAssets';
import type { PhysicsRuntime } from '../../src/physics/PhysicsRuntime';
import type { PhysicsMode } from '../../src/physics/PhysicsOptions';
import { AudioSystem } from '../../src/audio/AudioSystem';
import type { PhaseResourceSource } from '../../src/app/PhaseResources';
export interface GameFixtureOptions extends Omit<GameTestOptions, 'resources'> {
  propModels: PropModelLibrary;
  menuModels: MenuModelLibrary;
  menuSandAssets?: MenuSandAssets;
  shipFurniture: ShipFurnitureLibrary;
  skyAssets: SkyAssets;
  lifeboatAssets?: LifeboatAssets;
  shipAssets?: ShipAssets;
  physicsRuntime: PhysicsRuntime | null;
  physicsMode?: PhysicsMode;
  audioSystem?: AudioSystem;
}

export function fixtureResources(options: GameFixtureOptions): PhaseResourceSource {
  const lifeboatAssets = options.lifeboatAssets ?? LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture());
  const shipAssets = options.shipAssets ?? ShipAssets.fromTextures(new Texture(), new Texture(), new Texture());
  const menuSandAssets = options.menuSandAssets ?? MenuSandAssets.fromTexture(new Texture());
  const audio = options.audioSystem ?? AudioSystem.silent();
  const physicsMode = options.physicsMode ?? 'enabled';
  const assets = { ...options, lifeboatAssets, shipAssets, menuSandAssets, physicsMode };
  let disposed = false;
  return {
    audio, physicsMode,
    acquireMenu: async () => ({ assets, dispose: () => undefined }),
    acquireShip: async () => ({ assets, dispose: () => undefined }),
    acquireSurvival: async () => ({ assets, dispose: () => undefined }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      runCleanupSteps([
        () => options.propModels.dispose(), () => options.menuModels.dispose(),
        () => options.shipFurniture.dispose(), () => options.skyAssets.dispose(),
        () => lifeboatAssets.dispose(), () => shipAssets.dispose(),
        () => menuSandAssets.dispose(), () => audio.dispose(),
      ]);
    },
  };
}
export function createTestGame(factories: GameFactories, options: GameFixtureOptions): Game {
  return Game.forTest(factories, { ...options, resources: fixtureResources(options) });
}
export async function flushPhases(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}
