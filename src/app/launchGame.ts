import { disposeMenuModelLibrary, Game } from '../Game';
import { ITEM_DEFINITIONS } from '../game/ItemState';
import {
  createSystemScreen,
  type SystemScreenDescription,
  updateSystemScreenProgress,
} from '../ui/SystemScreen';
import {
  ItemModelLoadError,
  PropModelLibrary,
} from '../world/PropModelLibrary';
import {
  ShipFurnitureLibrary,
  ShipFurnitureLoadError,
} from '../world/ShipFurnitureLibrary';
import {
  LifeboatAssetLoadError,
  LifeboatAssets,
} from '../world/LifeboatAssets';
import { SkyAssetLoadError, SkyAssets } from '../world/SkyAssets';
import {
  ShipAssetLoadError,
  ShipAssets,
} from '../world/ShipAssets';
import { ShipItemPlacementError } from '../world/ShipItemPlacement';
import { runCleanupSteps } from '../world/SceneResources';
import {
  loadPhysicsRuntime,
  PhysicsLoadError,
  type PhysicsRuntime,
} from '../physics/PhysicsRuntime';
import {
  configuredPhysicsMode,
  type PhysicsMode,
} from '../physics/PhysicsOptions';
import {
  AudioLoadError,
  AudioSystem,
} from '../audio/AudioSystem';
import {
  MenuModelLibrary,
  MenuModelLoadError,
} from '../menu/MenuModelLibrary';
import {
  MenuSandAssetLoadError,
  MenuSandAssets,
} from '../menu/MenuSandAssets';

export interface LaunchHandle {
  readonly completion: Promise<Game | null>;
  cancel(): void;
}

export interface LaunchDependencies {
  loadModels(): Promise<PropModelLibrary>;
  loadMenuModels(): Promise<MenuModelLibrary>;
  loadMenuSandAssets(): Promise<MenuSandAssets>;
  loadShipFurniture(): Promise<ShipFurnitureLibrary>;
  loadSkyAssets(): Promise<SkyAssets>;
  loadLifeboatAssets(): Promise<LifeboatAssets>;
  loadShipAssets(): Promise<ShipAssets>;
  loadPhysicsRuntime(): Promise<PhysicsRuntime>;
  loadAudio?(): Promise<AudioSystem>;
  createGame(
    mount: HTMLElement,
    models: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    skyAssets: SkyAssets,
    lifeboatAssets: LifeboatAssets,
    shipAssets: ShipAssets,
    physicsRuntime: PhysicsRuntime | null,
    physicsMode: PhysicsMode,
    audio: AudioSystem,
    menuModels: MenuModelLibrary,
    menuSandAssets: MenuSandAssets,
    onFatalError: (error: unknown) => void,
  ): Pick<Game, 'start' | 'dispose'>;
}

const PRODUCTION_DEPENDENCIES: LaunchDependencies = {
  loadModels: () => PropModelLibrary.load(),
  loadMenuModels: () => MenuModelLibrary.load(),
  loadMenuSandAssets: () => MenuSandAssets.load(),
  loadShipFurniture: () => ShipFurnitureLibrary.load(),
  loadSkyAssets: () => SkyAssets.load(),
  loadLifeboatAssets: () => LifeboatAssets.load(),
  loadShipAssets: () => ShipAssets.load(),
  loadPhysicsRuntime,
  loadAudio: () => AudioSystem.load(),
  createGame: (
    mount,
    models,
    shipFurniture,
    skyAssets,
    lifeboatAssets,
    shipAssets,
    physicsRuntime,
    physicsMode,
    audio,
    menuModels,
    menuSandAssets,
    onFatalError,
  ) => (
    new Game(
      mount,
      models,
      shipFurniture,
      skyAssets,
      lifeboatAssets,
      shipAssets,
      menuModels,
      menuSandAssets,
      physicsRuntime,
      physicsMode,
      audio,
      onFatalError,
    )
  ),
};

interface LoadedGameAssets {
  models: PropModelLibrary;
  menuModels: MenuModelLibrary;
  menuSandAssets: MenuSandAssets;
  shipFurniture: ShipFurnitureLibrary;
  skyAssets: SkyAssets;
  lifeboatAssets: LifeboatAssets;
  shipAssets: ShipAssets;
  physicsRuntime: PhysicsRuntime | null;
  audio: AudioSystem;
}

const GAME_ASSET_LOAD_COUNT = 9;

async function loadGameAssets(
  dependencies: LaunchDependencies,
  physicsMode: PhysicsMode,
  onProgress: (completed: number, total: number) => void,
): Promise<LoadedGameAssets> {
  let completed = 0;
  onProgress(completed, GAME_ASSET_LOAD_COUNT);
  const track = <T>(promise: Promise<T>): Promise<T> => promise.finally(() => {
    completed += 1;
    onProgress(completed, GAME_ASSET_LOAD_COUNT);
  });
  const physicsRuntimePromise = physicsMode === 'off'
    ? Promise.resolve(null)
    : dependencies.loadPhysicsRuntime();
  const [
    models,
    shipFurniture,
    skyAssets,
    lifeboatAssets,
    shipAssets,
    physicsRuntime,
    audio,
    menuModels,
    menuSandAssets,
  ] =
    await Promise.allSettled([
      track(dependencies.loadModels()),
      track(dependencies.loadShipFurniture()),
      track(dependencies.loadSkyAssets()),
      track(dependencies.loadLifeboatAssets()),
      track(dependencies.loadShipAssets()),
      track(physicsRuntimePromise),
      track(dependencies.loadAudio?.() ?? Promise.resolve(AudioSystem.silent())),
      track(dependencies.loadMenuModels()),
      track(dependencies.loadMenuSandAssets()),
    ]);
  const assetResults = [
    models,
    shipFurniture,
    skyAssets,
    lifeboatAssets,
    shipAssets,
    audio,
    menuModels,
    menuSandAssets,
  ] as const;
  const results = [...assetResults, physicsRuntime] as const;
  const firstFailure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (firstFailure) {
    for (const result of assetResults) {
      if (result.status !== 'fulfilled') continue;
      try {
        if (result === menuModels) {
          disposeMenuModelLibrary(result.value);
        } else {
          result.value?.dispose();
        }
      } catch {
        // Preserve deterministic dependency failure precedence while cleaning every sibling.
      }
    }
    throw firstFailure.reason;
  }
  if (
    models.status !== 'fulfilled'
    || shipFurniture.status !== 'fulfilled'
    || skyAssets.status !== 'fulfilled'
    || lifeboatAssets.status !== 'fulfilled'
    || shipAssets.status !== 'fulfilled'
    || physicsRuntime.status !== 'fulfilled'
    || audio.status !== 'fulfilled'
    || menuModels.status !== 'fulfilled'
    || menuSandAssets.status !== 'fulfilled'
  ) {
    throw new Error('Asset preload settled without a result');
  }
  return {
    models: models.value,
    menuModels: menuModels.value,
    menuSandAssets: menuSandAssets.value,
    shipFurniture: shipFurniture.value,
    skyAssets: skyAssets.value,
    lifeboatAssets: lifeboatAssets.value,
    shipAssets: shipAssets.value,
    physicsRuntime: physicsRuntime.value,
    audio: audio.value,
  };
}

function disposeGameAssets(assets: LoadedGameAssets): void {
  runCleanupSteps([
    () => assets.models.dispose(),
    () => assets.shipFurniture.dispose(),
    () => assets.skyAssets.dispose(),
    () => assets.lifeboatAssets.dispose(),
    () => assets.shipAssets.dispose(),
    () => assets.audio.dispose(),
    () => disposeMenuModelLibrary(assets.menuModels),
    () => assets.menuSandAssets.dispose(),
  ]);
}

function renderSystemScreen(
  mount: HTMLElement,
  description: SystemScreenDescription,
): HTMLElement {
  const element = createSystemScreen(description);
  mount.replaceChildren(element);
  return element;
}

function renderLoading(mount: HTMLElement): HTMLElement {
  return renderSystemScreen(mount, {
    kind: 'loading',
    kicker: 'RECOVERING SUPPLIES',
    title: 'Preparing the ship',
    lead: 'Loading the equipment you will need to survive.',
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown WebGL initialization error';
}

function renderWebGlFailure(mount: HTMLElement, error: unknown): void {
  renderSystemScreen(mount, {
    kind: 'error',
    kicker: 'WEBGL UNAVAILABLE',
    title: 'Unable to launch',
    lead: 'This demo needs WebGL 2 in a current desktop browser.',
    detail: errorMessage(error),
  });
}

function renderShipPlacementFailure(
  mount: HTMLElement,
  error: ShipItemPlacementError,
): void {
  renderSystemScreen(mount, {
    kind: 'error',
    kicker: 'SHIP SETUP FAILED',
    title: 'Unable to prepare Dorothy',
    lead: 'A supply item could not be placed safely aboard the ship.',
    detail: error.message,
  });
}

function renderGameFailure(mount: HTMLElement, error: unknown): void {
  if (error instanceof ShipItemPlacementError) {
    renderShipPlacementFailure(mount, error);
  } else {
    renderWebGlFailure(mount, error);
  }
}

function renderPreloadFailure(mount: HTMLElement, error: unknown): void {
  if (error instanceof MenuSandAssetLoadError) {
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'SEABED UNAVAILABLE',
      title: 'Unable to prepare the underwater sand',
      lead: 'Required local seabed textures could not be loaded.',
      detail: error.message,
    });
    return;
  }

  if (error instanceof MenuModelLoadError) {
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'MENU MODEL UNAVAILABLE',
      title: 'Unable to prepare ' + error.menuModelId,
      lead: 'A required underwater menu model could not be loaded.',
      detail: error.message,
    });
    return;
  }

  if (error instanceof PhysicsLoadError) {
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'PHYSICS UNAVAILABLE',
      title: 'Unable to prepare the moving deck',
      lead: 'The ship simulation could not be initialized.',
      detail: error.message,
    });
    return;
  }

  if (error instanceof AudioLoadError) {
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'AUDIO UNAVAILABLE',
      title: 'Unable to prepare the soundscape',
      lead: 'A required local audio file could not be loaded.',
      detail: error.message,
    });
    return;
  }

  if (error instanceof ItemModelLoadError) {
    if (error.itemId === 'fishingRod' || error.itemId === 'hammer') {
      const label = error.itemId === 'fishingRod' ? 'Fishing Rod' : 'repair hammer';
      renderSystemScreen(mount, {
        kind: 'error',
        kicker: 'EQUIPMENT UNAVAILABLE',
        title: `Unable to prepare the lifeboat ${label}`,
        lead: 'A required fixed equipment model could not be loaded.',
        detail: error.message,
      });
      return;
    }
    if (error.itemId === 'lantern' || error.itemId === 'ceilingLight') {
      const label = error.itemId === 'lantern' ? 'lifeboat lantern' : 'ship lighting';
      renderSystemScreen(mount, {
        kind: 'error',
        kicker: 'LIGHTING UNAVAILABLE',
        title: `Unable to prepare the ${label}`,
        lead: 'A required practical light model could not be loaded.',
        detail: error.message,
      });
      return;
    }

    const itemLabel = ITEM_DEFINITIONS[error.itemId].label;
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'SUPPLIES UNAVAILABLE',
      title: `Unable to recover ${itemLabel}`,
      lead: 'A required item model could not be loaded.',
      detail: error.message,
    });
    return;
  }

  if (error instanceof SkyAssetLoadError) {
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'ATMOSPHERE UNAVAILABLE',
      title: 'Unable to prepare the sky',
      lead: 'A required local sky texture could not be loaded.',
      detail: error.message,
    });
    return;
  }

  if (error instanceof ShipFurnitureLoadError) {
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'FURNITURE UNAVAILABLE',
      title: `Unable to prepare ${error.modelId}`,
      lead: 'A required local ship furniture model could not be loaded.',
      detail: error.message,
    });
    return;
  }

  if (error instanceof LifeboatAssetLoadError) {
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'LIFEBOAT UNAVAILABLE',
      title: 'Unable to prepare the wooden lifeboat',
      lead: 'Required local wood textures could not be loaded.',
      detail: error.message,
    });
    return;
  }

  if (error instanceof ShipAssetLoadError) {
    renderSystemScreen(mount, {
      kind: 'error',
      kicker: 'SHIP UNAVAILABLE',
      title: 'Unable to prepare Dorothy',
      lead: 'Required local wood textures could not be loaded.',
      detail: error.message,
    });
    return;
  }

  renderWebGlFailure(mount, error);
}

export function launchGame(
  mount: HTMLElement,
  dependencies: LaunchDependencies = PRODUCTION_DEPENDENCIES,
  physicsMode: PhysicsMode = configuredPhysicsMode(),
): LaunchHandle {
  let cancelled = false;
  let game: Pick<Game, 'start' | 'dispose'> | null = null;
  let unownedAssets: LoadedGameAssets | null = null;
  const disposeCurrentOwnership = (): void => {
    if (game !== null) {
      const ownedGame = game;
      game = null;
      ownedGame.dispose();
      return;
    }
    if (unownedAssets !== null) {
      const ownedAssets = unownedAssets;
      unownedAssets = null;
      disposeGameAssets(ownedAssets);
    }
  };
  const reportRuntimeError = (error: unknown): void => {
    if (cancelled) return;
    try {
      disposeCurrentOwnership();
    } catch {
      // Preserve the runtime error that ended the game.
    }
    if (mount.isConnected) renderGameFailure(mount, error);
  };

  const loading = renderLoading(mount);

  const completion = (async (): Promise<Game | null> => {
    try {
      unownedAssets = await loadGameAssets(
        dependencies,
        physicsMode,
        (completed, total) => updateSystemScreenProgress(loading, completed, total),
      );
    } catch (error) {
      if (!cancelled && mount.isConnected) renderPreloadFailure(mount, error);
      return null;
    }

    if (cancelled || !mount.isConnected) {
      disposeCurrentOwnership();
      return null;
    }

    try {
      loading.remove();
      const createdGame = dependencies.createGame(
        mount,
        unownedAssets.models,
        unownedAssets.shipFurniture,
        unownedAssets.skyAssets,
        unownedAssets.lifeboatAssets,
        unownedAssets.shipAssets,
        unownedAssets.physicsRuntime,
        physicsMode,
        unownedAssets.audio,
        unownedAssets.menuModels,
        unownedAssets.menuSandAssets,
        reportRuntimeError,
      );
      game = createdGame;
      unownedAssets = null;

      if (cancelled || !mount.isConnected) {
        disposeCurrentOwnership();
        return null;
      }

      createdGame.start();
      if (cancelled || !mount.isConnected) {
        disposeCurrentOwnership();
        return null;
      }

      return game as Game;
    } catch (error) {
      disposeCurrentOwnership();

      if (!cancelled && mount.isConnected) {
        renderGameFailure(mount, error);
      }
      return null;
    }
  })();

  return {
    completion,
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      disposeCurrentOwnership();
    },
  };
}
