// @vitest-environment jsdom
// Importance: 4/5. Protects startup failure handling and ownership.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game, type GameTestOptions } from '../src/Game';
import { launchGame, type LaunchDependencies } from '../src/app/launchGame';
import { AudioSystem } from '../src/audio/AudioSystem';
import type { ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { PhysicsLoadError } from '../src/physics/PhysicsRuntime';
import { BoatWorld } from '../src/survival/BoatWorld';
import { CaptainWhiskersPresentation } from '../src/survival/CaptainWhiskersPresentation';
import {
  EventModelLoadError,
  type EventModelLibrary,
} from '../src/survival/EventModelLibrary';
import { selectFishingCatch } from '../src/survival/fishingCatalog';
import { SurvivalPhase, type SurvivalPhaseTestDependencies } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';
import { ItemModelLoadError, type PropModelLibrary } from '../src/world/PropModelLibrary';
import {
  ShipFurnitureLoadError,
  type ShipFurnitureLibrary,
} from '../src/world/ShipFurnitureLibrary';
import { SkyAssetLoadError, type SkyAssets } from '../src/world/SkyAssets';
import {
  LifeboatAssetLoadError,
  type LifeboatAssets,
} from '../src/world/LifeboatAssets';
import {
  ShipAssetLoadError,
  type ShipAssets,
} from '../src/world/ShipAssets';
import { ShipItemPlacementError } from '../src/world/ShipItemPlacement';
import { createTestLifeboatAssets } from './helpers/lifeboatAssets';
import { testPhysicsRuntime } from './helpers/physics';
import { createTestPropModels } from './helpers/propModels';
import { sequenceRandom } from './helpers/random';
import { createTestShipAssets } from './helpers/shipAssets';
import { createTestShipFurniture } from './helpers/shipFurniture';
import { createTestSkyAssets } from './helpers/skyAssets';

const physicsRuntime = await testPhysicsRuntime();

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, rejectPromise) => {
    resolve = accept;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function connectedMount(): HTMLElement {
  const mount = document.createElement('main');
  document.body.append(mount);
  return mount;
}

function createTestEventModels(): EventModelLibrary {
  return {
    create: vi.fn(),
    animations: vi.fn(() => []),
    dispose: vi.fn(),
  } as unknown as EventModelLibrary;
}

function eventModels(): EventModelLibrary {
  return createTestEventModels();
}

function dependencies(
  loadModels: LaunchDependencies['loadModels'],
  overrides: Partial<LaunchDependencies> = {},
): LaunchDependencies {
  return {
    loadModels,
    loadShipFurniture: () => Promise.resolve(createTestShipFurniture()),
    loadSkyAssets: () => Promise.resolve(createTestSkyAssets()),
    loadLifeboatAssets: () => Promise.resolve(createTestLifeboatAssets()),
    loadShipAssets: () => Promise.resolve(createTestShipAssets()),
    loadEventModels: () => Promise.resolve(eventModels()),
    loadPhysicsRuntime: () => Promise.resolve(physicsRuntime),
    createGame: vi.fn(() => ({ start: vi.fn(), dispose: vi.fn() })),
    ...overrides,
  };
}

describe('launchGame', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the loading state before model preload resolves', async () => {
    const pending = deferred<PropModelLibrary>();
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;

    const handle = launchGame(mount, dependencies(() => pending.promise));

    expect(mount.textContent).toContain('RECOVERING SUPPLIES');
    expect(mount.querySelector('[data-start]')).toBeNull();
    expect(mount.querySelector('.system-screen--loading')).not.toBeNull();
    expect(mount.querySelector('.system-screen h1')?.classList)
      .toContain('ui-role-display');
    handle.cancel();
    pending.resolve(models);
    await handle.completion;
  });

  it('constructs and starts the game only after successful preload', async () => {
    const pending = deferred<PropModelLibrary>();
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const skyAssets = createTestSkyAssets();
    const lifeboatAssets = createTestLifeboatAssets();
    const shipAssets = createTestShipAssets();
    const shipFurniture = createTestShipFurniture();
    const loadedEventModels = eventModels();
    const loadEventModels = vi.fn(() => Promise.resolve(loadedEventModels));
    const game = { start: vi.fn(), dispose: vi.fn() };
    const createGame = vi.fn(() => game);
    const handle = launchGame(mount, dependencies(
      () => pending.promise,
      {
        loadShipFurniture: () => Promise.resolve(shipFurniture),
        loadSkyAssets: () => Promise.resolve(skyAssets),
        loadLifeboatAssets: () => Promise.resolve(lifeboatAssets),
        loadShipAssets: () => Promise.resolve(shipAssets),
        loadEventModels,
        createGame,
      },
    ));

    expect(createGame).not.toHaveBeenCalled();
    expect(game.start).not.toHaveBeenCalled();
    pending.resolve(models);

    await expect(handle.completion).resolves.toBe(game as unknown as Game);
    expect(createGame).toHaveBeenCalledWith(
      mount,
      models,
      shipFurniture,
      skyAssets,
      lifeboatAssets,
      shipAssets,
      loadedEventModels,
      physicsRuntime,
      'enabled',
      expect.any(AudioSystem),
      undefined,
    );
    expect(loadEventModels).toHaveBeenCalledOnce();
    expect(game.start).toHaveBeenCalledOnce();
  });

  it('carries Captain Whiskers through the launched survival lifecycle', async () => {
    const mount = connectedMount();
    const models = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const lifeboatAssets = createTestLifeboatAssets();
    const shipAssets = createTestShipAssets();
    const loadedEventModels = eventModels();
    const savedItems = [
      { instanceId: 'captainWhiskers-1' as ItemInstanceId, type: 'captainWhiskers' },
      { instanceId: 'cannedFood-1' as ItemInstanceId, type: 'cannedFood' },
      { instanceId: 'medicalKit-1' as ItemInstanceId, type: 'medicalKit' },
    ] as const satisfies readonly ItemInstance[];
    const fishRoll = Array.from({ length: 10_000 }, (_, index) => (index + 0.5) / 10_000)
      .find((roll) => (
        selectFishingCatch(2, false, roll, new Set(), 1.01).id
        !== selectFishingCatch(2, false, roll).id
      ));
    if (fishRoll === undefined) throw new Error('Expected a Captain Whiskers fishing boundary.');
    const boostedCatch = selectFishingCatch(2, false, fishRoll, new Set(), 1.01);
    const baseCatch = selectFishingCatch(2, false, fishRoll);
    let session!: SurvivalSession;
    let world!: BoatWorld;
    let ui!: SurvivalUI;
    const disposeCompanion = vi.spyOn(CaptainWhiskersPresentation.prototype, 'dispose');
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(73);
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const createGame = vi.fn((gameMount: HTMLElement) => Game.forTest({
      createScavenge: (_context, onComplete) => ({
        start: () => onComplete({ savedItems, elapsedSeconds: 12 }),
        update: vi.fn(),
        resize: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
      }),
      createSurvival: (context, result, seed, onRestart) => {
        session = new SurvivalSession(result.savedItems, {
          seed,
          random: sequenceRandom([0, 0.49, 0.99, 0, fishRoll]),
          initialCaptainWhiskers: { hunger: 2 },
        });
        world = new BoatWorld(
          context.camera,
          context.propModels,
          context.skyAssets.moonTexture,
          session.snapshot().savedItems,
          context.lifeboatAssets,
          context.shipFurniture,
          context.waterQuality?.get() ?? 'low',
        );
        ui = new SurvivalUI(context.mount);
        const dependencies: SurvivalPhaseTestDependencies = { session, world, ui, onRestart };
        const TestConstructor = SurvivalPhase as unknown as new (
          phaseContext: typeof context,
          phaseSavedItems: readonly ItemInstance[],
          phaseSeed: number,
          elapsedSeconds: number,
          restart: () => void,
          initialEventId: string | undefined,
          testDependencies: SurvivalPhaseTestDependencies,
        ) => SurvivalPhase;
        return new TestConstructor(
          context,
          result.savedItems,
          seed,
          result.elapsedSeconds,
          onRestart,
          undefined,
          dependencies,
        );
      },
    }, {
      mount: gameMount,
      propModels: models,
      shipFurniture,
      skyAssets,
      lifeboatAssets,
      shipAssets,
      eventModels: loadedEventModels,
      physicsRuntime,
      physicsMode: 'off',
      createSeed: () => 7,
      audioSystem: AudioSystem.silent(),
    }));
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadShipFurniture: () => Promise.resolve(shipFurniture),
        loadSkyAssets: () => Promise.resolve(skyAssets),
        loadLifeboatAssets: () => Promise.resolve(lifeboatAssets),
        loadShipAssets: () => Promise.resolve(shipAssets),
        loadEventModels: () => Promise.resolve(loadedEventModels),
        createGame,
      },
    ));

    const game = await handle.completion;
    expect(game).not.toBeNull();
    expect(session.snapshot()).toMatchObject({
      food: 1,
      captainWhiskers: { alive: true, hunger: 2 },
      inventory: {
        'cannedFood-1': { condition: 'usable' },
        'medicalKit-1': { condition: 'usable' },
      },
    });
    expect(session.snapshot().savedItems).not.toContainEqual(
      expect.objectContaining({ type: 'captainWhiskers' }),
    );

    const companionAnchor = world.projectInteractionAnchors(
      window.innerWidth,
      window.innerHeight,
    ).find(({ companionId }) => companionId === 'captainWhiskers');
    expect(companionAnchor).toMatchObject({
      id: 'captain-whiskers',
      visible: true,
      label: 'CAPTAIN WHISKERS',
    });

    const anchorButton = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="captain-whiskers"]',
    );
    expect(anchorButton).not.toBeNull();
    anchorButton!.click();
    const card = mount.querySelector<HTMLElement>('[data-whiskers-card]');
    expect(card).toMatchObject({ hidden: false });
    card!.querySelector<HTMLButtonElement>('[data-action="feedWhiskers"]')!.click();
    expect(session.snapshot()).toMatchObject({
      food: 0,
      captainWhiskers: { hunger: 5 },
    });

    expect(session.perform('endDay')).toMatchObject({ accepted: true, code: 'quiet-night' });
    expect(session.beginDawn()).toMatchObject({ accepted: true, code: 'dawn' });
    expect(session.snapshot().captainWhiskers).toMatchObject({
      hunger: 4,
      unhappiness: 1,
    });

    const fishing = session.beginFishing();
    expect(fishing.accepted).toBe(true);
    if (!fishing.accepted) throw new Error('Expected fishing to start.');
    fishing.attempt.cast({ x: 0, z: -6.4 });
    fishing.attempt.completeCast();
    fishing.attempt.advance(fishing.attempt.snapshot().biteDelaySeconds);
    expect(fishing.attempt.reel()).toMatchObject({
      accepted: true,
      result: { kind: 'catch', catch: { id: boostedCatch.id } },
    });
    expect(boostedCatch.id).not.toBe(baseCatch.id);

    const disposeWorld = vi.spyOn(world, 'dispose');
    const disposeUi = vi.spyOn(ui, 'dispose');
    handle.cancel();
    handle.cancel();

    expect(disposeCompanion).toHaveBeenCalledOnce();
    expect(disposeWorld).toHaveBeenCalledOnce();
    expect(disposeUi).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(73);
  });

  it('loads audio with the other assets and disposes it after construction failure', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const audio = AudioSystem.silent();
    const disposeAudio = vi.spyOn(audio, 'dispose');
    const loadAudio = vi.fn(() => Promise.resolve(audio));
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadAudio,
        createGame: () => {
          throw new Error('construction failed');
        },
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(loadAudio).toHaveBeenCalledOnce();
    expect(disposeAudio).toHaveBeenCalledOnce();
  });

  it('reports an event model failure and disposes every fulfilled sibling', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const furniture = createTestShipFurniture();
    const sky = createTestSkyAssets();
    const lifeboat = createTestLifeboatAssets();
    const ship = createTestShipAssets();
    const disposeFurniture = vi.spyOn(furniture, 'dispose');
    const disposeSky = vi.spyOn(sky, 'dispose');
    const disposeLifeboat = vi.spyOn(lifeboat, 'dispose');
    const disposeShip = vi.spyOn(ship, 'dispose');
    const createGame = vi.fn();
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadShipFurniture: () => Promise.resolve(furniture),
        loadSkyAssets: () => Promise.resolve(sky),
        loadLifeboatAssets: () => Promise.resolve(lifeboat),
        loadShipAssets: () => Promise.resolve(ship),
        loadEventModels: () => Promise.reject(
          new EventModelLoadError('snatcher', 'local GLB missing'),
        ),
        createGame,
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(disposeFurniture).toHaveBeenCalledOnce();
    expect(disposeSky).toHaveBeenCalledOnce();
    expect(disposeLifeboat).toHaveBeenCalledOnce();
    expect(disposeShip).toHaveBeenCalledOnce();
    expect(createGame).not.toHaveBeenCalled();
    expect(mount.textContent).toContain('EVENT MODEL UNAVAILABLE');
    expect(mount.textContent).toContain('Unable to prepare snatcher');
    expect(mount.textContent).toContain('local GLB missing');
  });

  it('waits for models, furniture, sky, lifeboat, ship, and physics before creating the game', async () => {
    const modelLoad = deferred<PropModelLibrary>();
    const furnitureLoad = deferred<ShipFurnitureLibrary>();
    const skyLoad = deferred<SkyAssets>();
    const lifeboatLoad = deferred<LifeboatAssets>();
    const shipLoad = deferred<ReturnType<typeof createTestShipAssets>>();
    const eventModelLoad = deferred<EventModelLibrary>();
    const physicsLoad = deferred<typeof physicsRuntime>();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const lifeboatAssets = createTestLifeboatAssets();
    const shipAssets = createTestShipAssets();
    const loadedEventModels = eventModels();
    const game = { start: vi.fn(), dispose: vi.fn() };
    const createGame = vi.fn(() => game);
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => modelLoad.promise,
      {
        loadShipFurniture: () => furnitureLoad.promise,
        loadSkyAssets: () => skyLoad.promise,
        loadLifeboatAssets: () => lifeboatLoad.promise,
        loadShipAssets: () => shipLoad.promise,
        loadEventModels: () => eventModelLoad.promise,
        loadPhysicsRuntime: () => physicsLoad.promise,
        createGame,
      },
    ));

    modelLoad.resolve(models);
    await Promise.resolve();
    expect(createGame).not.toHaveBeenCalled();

    furnitureLoad.resolve(shipFurniture);
    await Promise.resolve();
    expect(createGame).not.toHaveBeenCalled();

    skyLoad.resolve(skyAssets);
    await Promise.resolve();
    expect(createGame).not.toHaveBeenCalled();

    lifeboatLoad.resolve(lifeboatAssets);
    await Promise.resolve();
    expect(createGame).not.toHaveBeenCalled();

    shipLoad.resolve(shipAssets);
    await Promise.resolve();
    expect(createGame).not.toHaveBeenCalled();

    eventModelLoad.resolve(loadedEventModels);
    await Promise.resolve();
    expect(createGame).not.toHaveBeenCalled();

    physicsLoad.resolve(physicsRuntime);
    await expect(handle.completion).resolves.toBe(game as unknown as Game);
    expect(createGame).toHaveBeenCalledWith(
      mount,
      models,
      shipFurniture,
      skyAssets,
      lifeboatAssets,
      shipAssets,
      loadedEventModels,
      physicsRuntime,
      'enabled',
      expect.any(AudioSystem),
      undefined,
    );
  });

  it('skips Rapier loading entirely when physics is disabled', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const loadPhysicsRuntime = vi.fn(() => Promise.reject(
      new Error('must not be requested'),
    ));
    const game = { start: vi.fn(), dispose: vi.fn() };
    const createGame = vi.fn(() => game);
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { loadPhysicsRuntime, createGame },
    ), 'off');

    await expect(handle.completion).resolves.toBe(game as unknown as Game);
    expect(loadPhysicsRuntime).not.toHaveBeenCalled();
    expect(createGame).toHaveBeenCalledWith(
      mount,
      models,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      null,
      'off',
      expect.any(AudioSystem),
      undefined,
    );
    expect(game.start).toHaveBeenCalledOnce();
  });

  it('reports physics preload failure and disposes fulfilled assets', async () => {
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const eventModels = createTestEventModels();
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadEventModels: () => Promise.resolve(eventModels),
        loadPhysicsRuntime: () => Promise.reject(
          new PhysicsLoadError('WASM unavailable'),
        ),
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(eventModels.dispose).toHaveBeenCalledOnce();
    expect(mount.textContent).toContain('PHYSICS UNAVAILABLE');
    expect(mount.textContent).toContain('Unable to prepare the moving deck');
    expect(mount.textContent).toContain('WASM unavailable');
  });

  it('disposes fulfilled siblings and names a furniture preload failure', async () => {
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const skyAssets = createTestSkyAssets();
    const disposeSky = vi.spyOn(skyAssets, 'dispose');
    const createGame = vi.fn();
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadShipFurniture: () => Promise.reject(
          new ShipFurnitureLoadError('bookcaseOpen', 'local GLB missing'),
        ),
        loadSkyAssets: () => Promise.resolve(skyAssets),
        createGame,
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(disposeSky).toHaveBeenCalledOnce();
    expect(createGame).not.toHaveBeenCalled();
    expect(mount.textContent).toContain('FURNITURE UNAVAILABLE');
    expect(mount.textContent).toContain('bookcaseOpen');
    expect(mount.textContent).toContain('local GLB missing');
  });

  it('selects simultaneous preload failures in models, furniture, then sky order', async () => {
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.reject(new ItemModelLoadError('ductTape', 'models failed')),
      {
        loadShipFurniture: () => Promise.reject(
          new ShipFurnitureLoadError('desk', 'furniture failed'),
        ),
        loadSkyAssets: () => Promise.reject(new SkyAssetLoadError('sky failed')),
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('SUPPLIES UNAVAILABLE');
    expect(mount.textContent).toContain('DUCT TAPE');
    expect(mount.textContent).not.toContain('furniture failed');
    expect(mount.textContent).not.toContain('sky failed');

    const furnitureFirst = launchGame(mount, dependencies(
      () => Promise.resolve({ dispose: vi.fn() } as unknown as PropModelLibrary),
      {
        loadShipFurniture: () => Promise.reject(
          new ShipFurnitureLoadError('desk', 'furniture failed'),
        ),
        loadSkyAssets: () => Promise.reject(new SkyAssetLoadError('sky failed')),
      },
    ));
    await furnitureFirst.completion;
    expect(mount.textContent).toContain('FURNITURE UNAVAILABLE');
    expect(mount.textContent).toContain('furniture failed');
  });

  it('disposes fulfilled models when sky preload fails', async () => {
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const createGame = vi.fn();
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadSkyAssets: () => Promise.reject(
          new SkyAssetLoadError('Moon texture could not be loaded.'),
        ),
        createGame,
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(createGame).not.toHaveBeenCalled();
    expect(mount.textContent).toContain('ATMOSPHERE UNAVAILABLE');
  });

  it('identifies an event model preload failure without diagnosing WebGL', async () => {
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadEventModels: () => Promise.reject(
          new EventModelLoadError('ghost', 'local GLB missing'),
        ),
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(mount.textContent).toContain('EVENT MODEL UNAVAILABLE');
    expect(mount.textContent).toContain('Unable to prepare ghost');
    expect(mount.textContent).toContain('local GLB missing');
    expect(mount.textContent).not.toContain('WEBGL UNAVAILABLE');
  });

  it('disposes fulfilled sky assets when model preload fails', async () => {
    const skyAssets = createTestSkyAssets();
    const skyDispose = vi.spyOn(skyAssets, 'dispose');
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.reject(new ItemModelLoadError('ductTape', 'download failed')),
      { loadSkyAssets: () => Promise.resolve(skyAssets) },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(skyDispose).toHaveBeenCalledOnce();
  });

  it('disposes fulfilled siblings and reports a lifeboat texture failure', async () => {
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const skyAssets = createTestSkyAssets();
    const shipFurniture = createTestShipFurniture();
    const disposeSky = vi.spyOn(skyAssets, 'dispose');
    const disposeFurniture = vi.spyOn(shipFurniture, 'dispose');
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadShipFurniture: () => Promise.resolve(shipFurniture),
        loadSkyAssets: () => Promise.resolve(skyAssets),
        loadLifeboatAssets: () => Promise.reject(
          new LifeboatAssetLoadError('Lifeboat textures could not be loaded.'),
        ),
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(disposeFurniture).toHaveBeenCalledOnce();
    expect(disposeSky).toHaveBeenCalledOnce();
    expect(mount.textContent).toContain('LIFEBOAT UNAVAILABLE');
    expect(mount.textContent).toContain('Unable to prepare the wooden lifeboat');
  });

  it('disposes fulfilled siblings and reports a ship texture failure', async () => {
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const skyAssets = createTestSkyAssets();
    const shipFurniture = createTestShipFurniture();
    const lifeboatAssets = createTestLifeboatAssets();
    const disposeSky = vi.spyOn(skyAssets, 'dispose');
    const disposeFurniture = vi.spyOn(shipFurniture, 'dispose');
    const disposeLifeboat = vi.spyOn(lifeboatAssets, 'dispose');
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadShipFurniture: () => Promise.resolve(shipFurniture),
        loadSkyAssets: () => Promise.resolve(skyAssets),
        loadLifeboatAssets: () => Promise.resolve(lifeboatAssets),
        loadShipAssets: () => Promise.reject(
          new ShipAssetLoadError('Ship textures could not be loaded.'),
        ),
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(models.dispose).toHaveBeenCalledOnce();
    expect(disposeFurniture).toHaveBeenCalledOnce();
    expect(disposeSky).toHaveBeenCalledOnce();
    expect(disposeLifeboat).toHaveBeenCalledOnce();
    expect(mount.textContent).toContain('SHIP UNAVAILABLE');
    expect(mount.textContent).toContain('Unable to prepare Dorothy');
  });

  it('removes the launcher loading surface before constructing the game', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const game = { start: vi.fn(), dispose: vi.fn() };
    let contentAtConstruction = '';
    let childCountAtConstruction = -1;
    const createGame = vi.fn((gameMount: HTMLElement) => {
      contentAtConstruction = gameMount.textContent ?? '';
      childCountAtConstruction = gameMount.childElementCount;
      const ready = document.createElement('p');
      ready.textContent = 'GAME READY';
      gameMount.append(ready);
      return game;
    });

    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame },
    ));

    await expect(handle.completion).resolves.toBe(game as unknown as Game);
    expect(contentAtConstruction).not.toContain('RECOVERING SUPPLIES');
    expect(childCountAtConstruction).toBe(0);
    expect(mount.textContent).toBe('GAME READY');
  });

  it('renders an item-labelled supply failure without creating a game', async () => {
    const mount = connectedMount();
    const createGame = vi.fn();
    const handle = launchGame(mount, dependencies(
      () => Promise.reject(new ItemModelLoadError('ductTape', 'download failed')),
      { createGame },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('SUPPLIES UNAVAILABLE');
    expect(mount.textContent).toContain('Unable to recover DUCT TAPE');
    expect(mount.textContent).toContain('DUCT TAPE');
    expect(mount.textContent).toContain('download failed');
    expect(createGame).not.toHaveBeenCalled();
  });

  it('renders a fixed-equipment failure when the lifeboat rod cannot preload', async () => {
    const mount = connectedMount();
    const createGame = vi.fn();
    const handle = launchGame(mount, dependencies(
      () => Promise.reject(new ItemModelLoadError('fishingRod', 'rod download failed')),
      { createGame },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('EQUIPMENT UNAVAILABLE');
    expect(mount.textContent).toContain('Unable to prepare the lifeboat Fishing Rod');
    expect(mount.textContent).toContain('A required fixed equipment model could not be loaded.');
    expect(mount.textContent).toContain('rod download failed');
    expect(mount.textContent).not.toContain('SUPPLIES UNAVAILABLE');
    expect(mount.textContent).not.toContain('Unable to recover Fishing Rod');
    expect(createGame).not.toHaveBeenCalled();
  });

  it('renders WebGL failure UI when game construction throws', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => { throw new Error('renderer failed'); } },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
    expect(mount.textContent).toContain('renderer failed');
    expect(mount.querySelector('.system-screen--error')).not.toBeNull();
    expect(mount.querySelector('.system-screen .fine-print')?.textContent)
      .toBe('renderer failed');
  });

  it('reports ship placement failures without claiming WebGL is unavailable', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        createGame: () => {
          throw new ShipItemPlacementError('harpoonGun-1');
        },
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('SHIP SETUP FAILED');
    expect(mount.textContent).toContain('Unable to prepare Dorothy');
    expect(mount.textContent).toContain('Unable to place ship item: harpoonGun-1');
    expect(mount.textContent).not.toContain('WEBGL UNAVAILABLE');
  });

  it('disposes unowned models after Game rolls back a failed initial resize', async () => {
    const mount = connectedMount();
    const canvas = document.createElement('canvas');
    const disposeRenderer = vi.fn();
    const disposePhase = vi.fn();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const shipFurniture = createTestShipFurniture();
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose');
    const skyAssets = createTestSkyAssets();
    const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose');
    const renderer = {
      domElement: canvas,
      capabilities: { getMaxAnisotropy: () => 1 },
      setPixelRatio: vi.fn(),
      setSize: vi.fn(() => { throw new Error('initial resize failed'); }),
      render: vi.fn(),
      dispose: disposeRenderer,
    };
    const createGame = (
      gameMount: HTMLElement,
      propModels: PropModelLibrary,
      loadedShipFurniture: ShipFurnitureLibrary,
      loadedSkyAssets: SkyAssets,
      loadedLifeboatAssets: LifeboatAssets,
      loadedShipAssets: ShipAssets,
      loadedEventModels: EventModelLibrary,
      loadedPhysicsRuntime: typeof physicsRuntime,
    ) => Game.forTest({
      createScavenge: () => ({
        start: vi.fn(),
        update: vi.fn(),
        resize: vi.fn(),
        render: vi.fn(),
        dispose: disposePhase,
      }),
      createSurvival: () => { throw new Error('unexpected survival construction'); },
    }, {
      propModels,
      supernaturalEventModels: loadedEventModels,
      shipFurniture: loadedShipFurniture,
      skyAssets: loadedSkyAssets,
      lifeboatAssets: loadedLifeboatAssets,
      shipAssets: loadedShipAssets,
      eventModels: loadedEventModels,
      physicsRuntime: loadedPhysicsRuntime,
      mount: gameMount,
      renderer,
    } as unknown as GameTestOptions);

    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadShipFurniture: () => Promise.resolve(shipFurniture),
        loadSkyAssets: () => Promise.resolve(skyAssets),
        createGame,
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
    expect(mount.textContent).toContain('initial resize failed');
    expect(disposePhase).toHaveBeenCalledOnce();
    expect(disposeRenderer).toHaveBeenCalledOnce();
    expect(disposeModels).toHaveBeenCalledOnce();
    expect(disposeShipFurniture).toHaveBeenCalledOnce();
    expect(disposeSkyAssets).toHaveBeenCalledOnce();
    expect(canvas.parentElement).toBeNull();
  });

  it('renders WebGL failure UI when construction throws an item-model error', async () => {
    const mount = connectedMount();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        createGame: () => {
          throw new ItemModelLoadError('ductTape', 'renderer used an invalid texture');
        },
      },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
    expect(mount.textContent).not.toContain('SUPPLIES UNAVAILABLE');
    expect(disposeModels).toHaveBeenCalledOnce();
  });

  it('renders hostile error text without creating markup', async () => {
    const mount = connectedMount();
    const handle = launchGame(mount, dependencies(
      () => Promise.reject(new ItemModelLoadError(
        'ductTape',
        '<script>globalThis.compromised = true</script> & missing',
      )),
    ));

    await handle.completion;

    expect(mount.querySelector('script')).toBeNull();
    expect(mount.textContent).toContain('<script>globalThis.compromised = true</script> & missing');
    expect(mount.innerHTML).toContain('&lt;script&gt;');
    expect(mount.innerHTML).toContain('&amp; missing');
  });

  it('disposes late models and skips construction after cancellation', async () => {
    const pending = deferred<PropModelLibrary>();
    const mount = connectedMount();
    const dispose = vi.fn();
    const models = { dispose } as unknown as PropModelLibrary;
    const createGame = vi.fn();
    const handle = launchGame(mount, dependencies(() => pending.promise, { createGame }));

    handle.cancel();
    handle.cancel();
    pending.resolve(models);

    await expect(handle.completion).resolves.toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    expect(createGame).not.toHaveBeenCalled();
  });

  it.each([
    ['disconnected', (mount: HTMLElement) => mount.remove()],
    ['replaced', (mount: HTMLElement) => mount.replaceWith(document.createElement('main'))],
  ])('disposes late models and skips construction when the mount is %s', async (_name, detach) => {
    const pending = deferred<PropModelLibrary>();
    const mount = connectedMount();
    const dispose = vi.fn();
    const models = { dispose } as unknown as PropModelLibrary;
    const createGame = vi.fn();
    const handle = launchGame(mount, dependencies(() => pending.promise, { createGame }));

    detach(mount);
    pending.resolve(models);

    await expect(handle.completion).resolves.toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    expect(createGame).not.toHaveBeenCalled();
  });

  it('disposes a started game once when cancelled repeatedly', async () => {
    const mount = connectedMount();
    const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
    const game = { start: vi.fn(), dispose: vi.fn() };
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => game },
    ));
    await handle.completion;

    handle.cancel();
    handle.cancel();

    expect(game.dispose).toHaveBeenCalledOnce();
    expect(models.dispose).not.toHaveBeenCalled();
  });

  it('disposes only the unowned models when construction fails', async () => {
    const mount = connectedMount();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const shipFurniture = createTestShipFurniture();
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose');
    const skyAssets = createTestSkyAssets();
    const disposeSky = vi.spyOn(skyAssets, 'dispose');
    const loadedEventModels = eventModels();
    const disposeEventModels = vi.spyOn(loadedEventModels, 'dispose');
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      {
        loadShipFurniture: () => Promise.resolve(shipFurniture),
        loadSkyAssets: () => Promise.resolve(skyAssets),
        loadEventModels: () => Promise.resolve(loadedEventModels),
        createGame: () => { throw new Error('construction failed'); },
      },
    ));

    await handle.completion;

    expect(disposeModels).toHaveBeenCalledOnce();
    expect(disposeShipFurniture).toHaveBeenCalledOnce();
    expect(disposeSky).toHaveBeenCalledOnce();
    expect(disposeEventModels).toHaveBeenCalledOnce();
  });

  it('disposes the constructed game rather than models when start fails', async () => {
    const mount = connectedMount();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const game = {
      start: vi.fn(() => { throw new Error('start failed'); }),
      dispose: vi.fn(),
    };
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => game },
    ));

    await handle.completion;

    expect(game.dispose).toHaveBeenCalledOnce();
    expect(disposeModels).not.toHaveBeenCalled();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
  });

  it('renders WebGL failure UI when start throws an item-model error', async () => {
    const mount = connectedMount();
    const disposeModels = vi.fn();
    const models = { dispose: disposeModels } as unknown as PropModelLibrary;
    const game = {
      start: vi.fn(() => {
        throw new ItemModelLoadError('ductTape', 'startup used an invalid texture');
      }),
      dispose: vi.fn(),
    };
    const handle = launchGame(mount, dependencies(
      () => Promise.resolve(models),
      { createGame: () => game },
    ));

    await expect(handle.completion).resolves.toBeNull();
    expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
    expect(mount.textContent).not.toContain('SUPPLIES UNAVAILABLE');
    expect(game.dispose).toHaveBeenCalledOnce();
    expect(disposeModels).not.toHaveBeenCalled();
  });
});
