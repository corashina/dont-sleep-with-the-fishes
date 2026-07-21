import { Game } from '../Game';
import { ITEM_DEFINITIONS } from '../game/ItemState';
import {
  ItemModelLoadError,
  PropModelLibrary,
} from '../world/PropModelLibrary';
import {
  ShipFurnitureLibrary,
  ShipFurnitureLoadError,
} from '../world/ShipFurnitureLibrary';
import { SkyAssetLoadError, SkyAssets } from '../world/SkyAssets';

export interface LaunchHandle {
  readonly completion: Promise<Game | null>;
  cancel(): void;
}

export interface LaunchDependencies {
  loadModels(): Promise<PropModelLibrary>;
  loadShipFurniture(): Promise<ShipFurnitureLibrary>;
  loadSkyAssets(): Promise<SkyAssets>;
  createGame(
    mount: HTMLElement,
    models: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    skyAssets: SkyAssets,
  ): Pick<Game, 'start' | 'dispose'>;
}

const PRODUCTION_DEPENDENCIES: LaunchDependencies = {
  loadModels: () => PropModelLibrary.load(),
  loadShipFurniture: () => ShipFurnitureLibrary.load(),
  loadSkyAssets: () => SkyAssets.load(),
  createGame: (mount, models, shipFurniture, skyAssets) => (
    new Game(mount, models, shipFurniture, skyAssets)
  ),
};

interface LoadedGameAssets {
  models: PropModelLibrary;
  shipFurniture: ShipFurnitureLibrary;
  skyAssets: SkyAssets;
}

async function loadGameAssets(
  dependencies: LaunchDependencies,
): Promise<LoadedGameAssets> {
  const [models, shipFurniture, skyAssets] = await Promise.allSettled([
    dependencies.loadModels(),
    dependencies.loadShipFurniture(),
    dependencies.loadSkyAssets(),
  ]);
  const results = [models, shipFurniture, skyAssets] as const;
  const firstFailure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (firstFailure) {
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      try {
        result.value.dispose();
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
  ) {
    throw new Error('Asset preload settled without a result');
  }
  return {
    models: models.value,
    shipFurniture: shipFurniture.value,
    skyAssets: skyAssets.value,
  };
}

function disposeGameAssets(assets: LoadedGameAssets): void {
  try {
    assets.models.dispose();
  } finally {
    try {
      assets.shipFurniture.dispose();
    } finally {
      assets.skyAssets.dispose();
    }
  }
}

function screen(
  kicker: string,
  title: string,
  lead: string,
  detail?: string,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen is-visible pause-screen';

  const kickerElement = document.createElement('p');
  kickerElement.className = 'kicker';
  kickerElement.textContent = kicker;
  section.append(kickerElement);

  const heading = document.createElement('h1');
  heading.textContent = title;
  section.append(heading);

  const leadElement = document.createElement('p');
  leadElement.className = 'lead';
  leadElement.textContent = lead;
  section.append(leadElement);

  if (detail !== undefined) {
    const detailElement = document.createElement('p');
    detailElement.className = 'fine-print';
    detailElement.textContent = detail;
    section.append(detailElement);
  }

  return section;
}

function renderLoading(mount: HTMLElement): HTMLElement {
  const loading = screen(
    'RECOVERING SUPPLIES',
    'Preparing the ship',
    'Loading the equipment you will need to survive.',
  );
  mount.replaceChildren(loading);
  return loading;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown WebGL initialization error';
}

function renderWebGlFailure(mount: HTMLElement, error: unknown): void {
  mount.replaceChildren(screen(
    'WEBGL UNAVAILABLE',
    'Unable to launch',
    'This demo needs WebGL 2 in a current desktop browser.',
    errorMessage(error),
  ));
}

function renderPreloadFailure(mount: HTMLElement, error: unknown): void {
  if (error instanceof ItemModelLoadError) {
    const itemLabel = error.itemId === 'fishingRod'
      ? 'Fishing Rod'
      : ITEM_DEFINITIONS[error.itemId].label;
    mount.replaceChildren(screen(
      'SUPPLIES UNAVAILABLE',
      `Unable to recover ${itemLabel}`,
      'A required item model could not be loaded.',
      error.message,
    ));
    return;
  }

  if (error instanceof SkyAssetLoadError) {
    mount.replaceChildren(screen(
      'ATMOSPHERE UNAVAILABLE',
      'Unable to prepare the sky',
      'A required local sky texture could not be loaded.',
      error.message,
    ));
    return;
  }

  if (error instanceof ShipFurnitureLoadError) {
    mount.replaceChildren(screen(
      'FURNITURE UNAVAILABLE',
      `Unable to prepare ${error.modelId}`,
      'A required local ship furniture model could not be loaded.',
      error.message,
    ));
    return;
  }

  renderWebGlFailure(mount, error);
}

export function launchGame(
  mount: HTMLElement,
  dependencies: LaunchDependencies = PRODUCTION_DEPENDENCIES,
): LaunchHandle {
  let cancelled = false;
  let game: Pick<Game, 'start' | 'dispose'> | null = null;
  let unownedAssets: LoadedGameAssets | null = null;
  const disposeCurrentOwnership = (): void => {
    if (game !== null) {
      game.dispose();
      game = null;
      return;
    }
    if (unownedAssets !== null) {
      disposeGameAssets(unownedAssets);
      unownedAssets = null;
    }
  };

  const loading = renderLoading(mount);

  const completion = (async (): Promise<Game | null> => {
    try {
      unownedAssets = await loadGameAssets(dependencies);
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

      if (!cancelled && mount.isConnected) renderWebGlFailure(mount, error);
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
