import { systemText } from '../i18n/systemMessages';
import {
  disposeMenuModelLibrary,
  Game,
  WebGlInitializationError,
} from '../Game';
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
import {
  parseBrowserPlaytest,
  type BrowserPlaytestStartup,
} from './BrowserPlaytest';

export interface LaunchHandle {
  readonly completion: Promise<Game | null>;
  cancel(): void;
}

export interface LaunchEnvironment {
  readonly search: string;
  readonly playtestEnabled: boolean;
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
    browserPlaytest: BrowserPlaytestStartup | null,
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
    browserPlaytest,
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
      browserPlaytest,
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
  ] = await settleGameAssets(dependencies, physicsMode, onProgress);
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
  throwFirstAssetFailure(assetResults, results, menuModels);
  return {
    models: fulfilledValue(models),
    menuModels: fulfilledValue(menuModels),
    menuSandAssets: fulfilledValue(menuSandAssets),
    shipFurniture: fulfilledValue(shipFurniture),
    skyAssets: fulfilledValue(skyAssets),
    lifeboatAssets: fulfilledValue(lifeboatAssets),
    shipAssets: fulfilledValue(shipAssets),
    physicsRuntime: fulfilledValue(physicsRuntime),
    audio: fulfilledValue(audio),
  };
}

async function settleGameAssets(
  dependencies: LaunchDependencies,
  physicsMode: PhysicsMode,
  onProgress: (completed: number, total: number) => void,
) {
  let completed = 0;
  onProgress(completed, GAME_ASSET_LOAD_COUNT);
  const track = <T>(promise: Promise<T>): Promise<T> => promise.finally(() => {
    completed += 1;
    onProgress(completed, GAME_ASSET_LOAD_COUNT);
  });
  const physics = physicsMode === 'off'
    ? Promise.resolve(null)
    : dependencies.loadPhysicsRuntime();
  return Promise.allSettled([
    track(dependencies.loadModels()),
    track(dependencies.loadShipFurniture()),
    track(dependencies.loadSkyAssets()),
    track(dependencies.loadLifeboatAssets()),
    track(dependencies.loadShipAssets()),
    track(physics),
    track(dependencies.loadAudio?.() ?? Promise.resolve(AudioSystem.silent())),
    track(dependencies.loadMenuModels()),
    track(dependencies.loadMenuSandAssets()),
  ] as const);
}

function throwFirstAssetFailure(
  assetResults: readonly PromiseSettledResult<{ dispose?: () => void }>[],
  results: readonly PromiseSettledResult<unknown>[],
  menuModels: PromiseSettledResult<MenuModelLibrary>,
): void {
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure === undefined) return;
  disposeSettledAssets(assetResults, menuModels);
  throw failure.reason;
}

function disposeSettledAssets(
  assetResults: readonly PromiseSettledResult<{ dispose?: () => void }>[],
  menuModels: PromiseSettledResult<MenuModelLibrary>,
): void {
  for (const result of assetResults) {
    if (result.status !== 'fulfilled') continue;
    try {
      if (result === menuModels) {
        if (menuModels.status === 'fulfilled') disposeMenuModelLibrary(menuModels.value);
      } else {
        result.value.dispose?.();
      }
    } catch {
      // Preserve deterministic dependency failure precedence while cleaning every sibling.
    }
  }
}

function fulfilledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'fulfilled') return result.value;
  throw new Error('Asset preload settled without a result');
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
  });
}

function renderWebGlFailure(mount: HTMLElement, error: unknown): void {
  console.error(error);
  renderSystemScreen(mount, {
    kind: 'error',
    kicker: systemText('webgl'),
    title: systemText('launch'),
    lead: systemText('webglLead'),
    detail: systemText('webglGuidance'),
  });
}

function renderRuntimeFailure(mount: HTMLElement, error: unknown): void {
  console.error(error);
  renderSystemScreen(mount, {
    kind: 'error',
    kicker: systemText('gameError'),
    title: systemText('continue'),
    lead: systemText('gameLead'),
    detail: systemText('retryGuidance'),
  });
}

function renderShipPlacementFailure(
  mount: HTMLElement,
  error: ShipItemPlacementError,
): void {
  console.error(error);
  renderSystemScreen(mount, {
    kind: 'error',
    kicker: systemText('shipSetup'),
    title: systemText('dorothy'),
    lead: systemText('placement'),
    detail: systemText('retryGuidance'),
  });
}

function renderGameFailure(mount: HTMLElement, error: unknown): void {
  if (error instanceof ShipItemPlacementError) {
    renderShipPlacementFailure(mount, error);
  } else if (error instanceof WebGlInitializationError) {
    renderWebGlFailure(mount, error);
  } else {
    renderRuntimeFailure(mount, error);
  }
}

function renderPreloadFailure(mount: HTMLElement, error: unknown): void {
  if (error instanceof MenuSandAssetLoadError) {
    renderMenuSandFailure(mount, error);
    return;
  }

  if (error instanceof MenuModelLoadError) {
    renderMenuModelFailure(mount, error);
    return;
  }

  if (error instanceof PhysicsLoadError) {
    renderPreloadError(mount, systemText('physics'), systemText('deck'), systemText('physicsLead'), error);
    return;
  }

  if (error instanceof AudioLoadError) {
    renderPreloadError(mount, systemText('audio'), systemText('soundscape'), systemText('audioLead'), error);
    return;
  }

  if (error instanceof ItemModelLoadError) {
    renderItemModelFailure(mount, error);
    return;
  }

  if (error instanceof SkyAssetLoadError) {
    renderPreloadError(mount, systemText('atmosphere'), systemText('sky'), systemText('skyLead'), error);
    return;
  }

  if (error instanceof ShipFurnitureLoadError) {
    renderPreloadError(mount, systemText('furniture'), systemText('furnitureTitle'), systemText('furnitureLead'), error);
    return;
  }

  if (error instanceof LifeboatAssetLoadError) {
    renderPreloadError(mount, systemText('lifeboat'), systemText('boat'), systemText('woodLead'), error);
    return;
  }

  if (error instanceof ShipAssetLoadError) {
    renderPreloadError(mount, systemText('ship'), systemText('dorothy'), systemText('woodLead'), error);
    return;
  }

  renderRuntimeFailure(mount, error);
}

function renderMenuSandFailure(mount: HTMLElement, error: MenuSandAssetLoadError): void {
  renderPreloadError(mount, systemText('seabed'), systemText('sand'), systemText('sandLead'), error);
}

function renderMenuModelFailure(mount: HTMLElement, error: MenuModelLoadError): void {
  renderPreloadError(mount, systemText('menu'), systemText('menuTitle'), systemText('menuLead'), error);
}

function renderItemModelFailure(mount: HTMLElement, error: ItemModelLoadError): void {
  const equipmentLabel = fixedEquipmentLabel(error.itemId);
  if (
    error.itemId === 'fishingRod'
    || error.itemId === 'hammer'
    || error.itemId === 'pillow'
  ) {
    renderPreloadError(mount, systemText('equipment'), systemText('prepareEquipment', equipmentLabel), systemText('equipmentLead'), error);
    return;
  }
  const lightingLabel = practicalLightLabel(error.itemId);
  if (error.itemId === 'lantern' || error.itemId === 'ceilingLight') {
    renderPreloadError(mount, systemText('lighting'), systemText('prepareLight', lightingLabel), systemText('lightingLead'), error);
    return;
  }
  renderPreloadError(mount, systemText('supplies'), systemText('recover', ITEM_DEFINITIONS[error.itemId].label), systemText('suppliesLead'), error);
}

function fixedEquipmentLabel(itemId: string): string | null {
  if (itemId === 'fishingRod') return systemText('rod');
  if (itemId === 'hammer') return systemText('hammer');
  return itemId === 'pillow' ? systemText('pillow') : null;
}

function practicalLightLabel(itemId: string): string | null {
  if (itemId === 'lantern') return systemText('lantern');
  return itemId === 'ceilingLight' ? systemText('shipLight') : null;
}

function renderPreloadError(
  mount: HTMLElement,
  kicker: string,
  title: string,
  lead: string,
  error: Error,
): void {
  console.error(error);
  renderSystemScreen(mount, { kind: 'error', kicker, title, lead, detail: systemText('retryGuidance') });
}

export function launchGame(
  mount: HTMLElement,
  dependencies: LaunchDependencies = PRODUCTION_DEPENDENCIES,
  physicsMode: PhysicsMode = configuredPhysicsMode(),
  environment: LaunchEnvironment = {
    search: window.location.search,
    playtestEnabled: import.meta.env.DEV || import.meta.env.MODE === 'playtest',
  },
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

  let browserPlaytest: BrowserPlaytestStartup | null;
  try {
    browserPlaytest = parseBrowserPlaytest(
      environment.search,
      environment.playtestEnabled,
    );
  } catch (error) {
    return {
      completion: Promise.resolve(null),
      cancel: () => undefined,
    };
  }

  const loading = renderLoading(mount);

  const launchIsInvalid = (): boolean => cancelled || !mount.isConnected;
  const createAndStartGame = (assets: LoadedGameAssets): Game | null => {
    try {
      loading.remove();
      const createdGame = dependencies.createGame(
        mount,
        assets.models,
        assets.shipFurniture,
        assets.skyAssets,
        assets.lifeboatAssets,
        assets.shipAssets,
        assets.physicsRuntime,
        physicsMode,
        assets.audio,
        assets.menuModels,
        assets.menuSandAssets,
        reportRuntimeError,
        browserPlaytest,
      );
      game = createdGame;
      unownedAssets = null;
      if (launchIsInvalid()) {
        disposeCurrentOwnership();
        return null;
      }
      createdGame.start();
      if (launchIsInvalid()) {
        disposeCurrentOwnership();
        return null;
      }
      return game as Game;
    } catch (error) {
      disposeCurrentOwnership();
      if (!cancelled && mount.isConnected) renderGameFailure(mount, error);
      return null;
    }
  };

  const completion = (async (): Promise<Game | null> => {
    let loadedAssets: LoadedGameAssets;
    try {
      loadedAssets = await loadGameAssets(
        dependencies,
        physicsMode,
        (completed, total) => updateSystemScreenProgress(loading, completed, total),
      );
      unownedAssets = loadedAssets;
    } catch (error) {
      if (!cancelled && mount.isConnected) renderPreloadFailure(mount, error);
      return null;
    }

    if (launchIsInvalid()) {
      disposeCurrentOwnership();
      return null;
    }
    return createAndStartGame(loadedAssets);
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
