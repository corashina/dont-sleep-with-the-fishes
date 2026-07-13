import { Game } from '../Game';
import { ITEM_DEFINITIONS } from '../game/ItemState';
import {
  ItemModelLoadError,
  PropModelLibrary,
} from '../world/PropModelLibrary';

export interface LaunchHandle {
  readonly completion: Promise<Game | null>;
  cancel(): void;
}

export interface LaunchDependencies {
  loadModels(): Promise<PropModelLibrary>;
  createGame(mount: HTMLElement, models: PropModelLibrary): Pick<Game, 'start' | 'dispose'>;
}

const PRODUCTION_DEPENDENCIES: LaunchDependencies = {
  loadModels: () => PropModelLibrary.load(),
  createGame: (mount, models) => new Game(mount, models),
};

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

function renderLoading(mount: HTMLElement): void {
  mount.replaceChildren(screen(
    'RECOVERING SUPPLIES',
    'Preparing the ship',
    'Loading the equipment you will need to survive.',
  ));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown WebGL initialization error';
}

function renderFailure(mount: HTMLElement, error: unknown): void {
  if (error instanceof ItemModelLoadError) {
    const itemLabel = ITEM_DEFINITIONS[error.itemId].label;
    mount.replaceChildren(screen(
      'SUPPLIES UNAVAILABLE',
      `Unable to recover ${itemLabel}`,
      'A required item model could not be loaded.',
      error.message,
    ));
    return;
  }

  mount.replaceChildren(screen(
    'WEBGL UNAVAILABLE',
    'Unable to launch',
    'This demo needs WebGL 2 in a current desktop browser.',
    errorMessage(error),
  ));
}

export function launchGame(
  mount: HTMLElement,
  dependencies: LaunchDependencies = PRODUCTION_DEPENDENCIES,
): LaunchHandle {
  let cancelled = false;
  let game: Pick<Game, 'start' | 'dispose'> | null = null;
  let unownedModels: PropModelLibrary | null = null;

  renderLoading(mount);

  const completion = (async (): Promise<Game | null> => {
    try {
      unownedModels = await dependencies.loadModels();
      if (cancelled || !mount.isConnected) {
        unownedModels.dispose();
        unownedModels = null;
        return null;
      }

      const createdGame = dependencies.createGame(mount, unownedModels);
      game = createdGame;
      unownedModels = null;

      if (cancelled || !mount.isConnected) {
        if (game !== null) {
          game.dispose();
          game = null;
        }
        return null;
      }

      createdGame.start();
      if (cancelled || !mount.isConnected) {
        if (game !== null) {
          game.dispose();
          game = null;
        }
        return null;
      }

      return game as Game;
    } catch (error) {
      if (game !== null) {
        game.dispose();
        game = null;
      } else if (unownedModels !== null) {
        unownedModels.dispose();
        unownedModels = null;
      }

      if (!cancelled && mount.isConnected) renderFailure(mount, error);
      return null;
    }
  })();

  return {
    completion,
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      if (game !== null) {
        game.dispose();
        game = null;
      } else if (unownedModels !== null) {
        unownedModels.dispose();
        unownedModels = null;
      }
    },
  };
}
