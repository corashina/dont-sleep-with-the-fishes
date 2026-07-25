import { Game } from '../Game';
import { ITEM_DEFINITIONS } from '../game/ItemState';
import {
  createSystemScreen,
  type SystemScreenDescription,
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

export interface LaunchHandle {
  readonly completion: Promise<Game | null>;
  cancel(): void;
}

export interface LaunchDependencies {
  loadModels(): Promise<PropModelLibrary>;
  loadShipFurniture(): Promise<ShipFurnitureLibrary>;
  loadSkyAssets(): Promise<SkyAssets>;
  loadLifeboatAssets(): Promise<LifeboatAssets>;
  loadShipAssets(): Promise<ShipAssets>;
  createGame(
    mount: HTMLElement,
    models: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    skyAssets: SkyAssets,
    lifeboatAssets: LifeboatAssets,
    shipAssets: ShipAssets,
  ): Pick<Game, 'start' | 'dispose'>;
}

const PRODUCTION_DEPENDENCIES: LaunchDependencies = {
  loadModels: () => PropModelLibrary.load(),
  loadShipFurniture: () => ShipFurnitureLibrary.load(),
  loadSkyAssets: () => SkyAssets.load(),
  loadLifeboatAssets: () => LifeboatAssets.load(),
  loadShipAssets: () => ShipAssets.load(),
  createGame: (
    mount,
    models,
    shipFurniture,
    skyAssets,
    lifeboatAssets,
    shipAssets,
  ) => (
    new Game(mount, models, shipFurniture, skyAssets, lifeboatAssets, shipAssets)
  ),
};

interface LoadedGameAssets {
  models: PropModelLibrary;
  shipFurniture: ShipFurnitureLibrary;
  skyAssets: SkyAssets;
  lifeboatAssets: LifeboatAssets;
  shipAssets: ShipAssets;
}

async function loadGameAssets(
  dependencies: LaunchDependencies,
): Promise<LoadedGameAssets> {
  const [models, shipFurniture, skyAssets, lifeboatAssets, shipAssets] =
    await Promise.allSettled([
      dependencies.loadModels(),
      dependencies.loadShipFurniture(),
      dependencies.loadSkyAssets(),
      dependencies.loadLifeboatAssets(),
      dependencies.loadShipAssets(),
    ]);
  const results = [models, shipFurniture, skyAssets, lifeboatAssets, shipAssets] as const;
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
    || lifeboatAssets.status !== 'fulfilled'
    || shipAssets.status !== 'fulfilled'
  ) {
    throw new Error('Asset preload settled without a result');
  }
  return {
    models: models.value,
    shipFurniture: shipFurniture.value,
    skyAssets: skyAssets.value,
    lifeboatAssets: lifeboatAssets.value,
    shipAssets: shipAssets.value,
  };
}

function disposeGameAssets(assets: LoadedGameAssets): void {
  try {
    assets.models.dispose();
  } finally {
    try {
      assets.shipFurniture.dispose();
    } finally {
      try {
        assets.skyAssets.dispose();
      } finally {
        try {
          assets.lifeboatAssets.dispose();
        } finally {
          assets.shipAssets.dispose();
        }
      }
    }
  }
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

function renderPreloadFailure(mount: HTMLElement, error: unknown): void {
  if (error instanceof ItemModelLoadError) {
    if (error.itemId === 'fishingRod') {
      renderSystemScreen(mount, {
        kind: 'error',
        kicker: 'EQUIPMENT UNAVAILABLE',
        title: 'Unable to prepare the lifeboat Fishing Rod',
        lead: 'A required fixed equipment model could not be loaded.',
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
      lead: 'Required local steel and wood textures could not be loaded.',
      detail: error.message,
    });
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
        unownedAssets.lifeboatAssets,
        unownedAssets.shipAssets,
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
