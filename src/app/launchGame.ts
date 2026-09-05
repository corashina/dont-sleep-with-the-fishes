import { systemText } from '../i18n/systemMessages';
import {
  Game,
  WebGlInitializationError,
} from '../Game';
import { ITEM_DEFINITIONS } from '../game/ItemState';
import {
  createSystemScreen,
  type SystemScreenDescription,
} from '../ui/SystemScreen';
import {
  ItemModelLoadError,
} from '../world/PropModelLibrary';
import {
  ShipFurnitureLoadError,
} from '../world/ShipFurnitureLibrary';
import {
  LifeboatAssetLoadError,
} from '../world/LifeboatAssets';
import { SkyAssetLoadError } from '../world/SkyAssets';
import {
  ShipAssetLoadError,
} from '../world/ShipAssets';
import { ShipItemPlacementError } from '../world/ShipItemPlacement';
import {
  PhysicsLoadError,
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
  MenuModelLoadError,
} from '../menu/MenuModelLibrary';
import {
  MenuSandAssetLoadError,
} from '../menu/MenuSandAssets';
import {
  parseBrowserPlaytest,
  type BrowserPlaytestStartup,
} from './BrowserPlaytest';
import { PhaseResources, PHASE_RESOURCE_LOADERS, type PhaseResourceLoaders, type PhaseResourceSource } from './PhaseResources';

export interface LaunchHandle {
  readonly completion: Promise<Game | null>;
  cancel(): void;
}

export interface LaunchEnvironment {
  readonly search: string;
  readonly playtestEnabled: boolean;
}

export interface LaunchDependencies extends PhaseResourceLoaders {
  loadAudio(): Promise<AudioSystem>;
  createGame(
    mount: HTMLElement,
    resources: PhaseResourceSource,
    onFatalError: (error: unknown) => void,
    browserPlaytest: BrowserPlaytestStartup | null,
  ): Pick<Game, 'start' | 'dispose' | 'ready'>;
}
const PRODUCTION_DEPENDENCIES: LaunchDependencies = {
  ...PHASE_RESOURCE_LOADERS,
  loadAudio: () => AudioSystem.load(),
  createGame: (mount, resources, onFatalError, browserPlaytest) => (
    new Game(mount, resources, onFatalError, browserPlaytest)
  ),
};

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

  renderGameFailure(mount, error);
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
  let game: Pick<Game, 'start' | 'dispose' | 'ready'> | null = null;
  let resources: PhaseResourceSource | null = null;
  const disposeCurrentOwnership = (): void => {
    const ownedGame = game;
    game = null;
    try { ownedGame?.dispose(); } finally { resources?.dispose(); resources = null; }
  };
  const reportRuntimeError = (error: unknown): void => {
    if (cancelled) return;
    try { disposeCurrentOwnership(); } catch { /* Preserve the runtime error. */ }
    if (mount.isConnected) renderPreloadFailure(mount, error);
  };
  let browserPlaytest: BrowserPlaytestStartup | null;
  try {
    browserPlaytest = parseBrowserPlaytest(environment.search, environment.playtestEnabled);
  } catch {
    return { completion: Promise.resolve(null), cancel: () => undefined };
  }
  const loading = renderLoading(mount);
  const invalid = (): boolean => cancelled || !mount.isConnected;
  const completion = (async (): Promise<Game | null> => {
    try {
      const audio = await dependencies.loadAudio();
      resources = new PhaseResources(dependencies, audio, physicsMode);
      if (invalid()) { disposeCurrentOwnership(); return null; }
      game = dependencies.createGame(mount, resources, reportRuntimeError, browserPlaytest);
      loading.remove();
      if (invalid()) { disposeCurrentOwnership(); return null; }
      game.start();
      await game.ready;
      if (invalid()) { disposeCurrentOwnership(); return null; }
      return game as Game | null;
    } catch (error) {
      try { disposeCurrentOwnership(); } catch { /* Preserve the launch error. */ }
      if (!invalid()) renderPreloadFailure(mount, error);
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
