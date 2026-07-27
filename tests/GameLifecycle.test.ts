// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
  Group,
  PerspectiveCamera,
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { GamePhase, PhaseContext } from '../src/app/GamePhase';
import { Game } from '../src/Game';
import { ScavengeSession } from '../src/game/ScavengeSession';
import type { ItemInstance } from '../src/game/ItemState';
import { getSinkingState } from '../src/game/sinking';
import { InteractionSystem } from '../src/interaction/InteractionSystem';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { ScavengePhysics } from '../src/physics/ScavengePhysics';
import {
  ScavengePhase,
  TITLE_CAMERA_POSITION,
  TITLE_CAMERA_TARGET,
} from '../src/phases/ScavengePhase';
import type { ScavengeVisualState, SceneRenderer } from '../src/rendering/SceneRenderer';
import { World } from '../src/world/World';
import { createTestPropModels } from './helpers/propModels';
import { testPhysicsRuntime } from './helpers/physics';
import { createTestShipFurniture } from './helpers/shipFurniture';
import { createTestSkyAssets } from './helpers/skyAssets';

const physicsRuntime = await testPhysicsRuntime();

vi.mock('../src/world/ShipItemPlacement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/world/ShipItemPlacement')>();
  const { Euler, Vector3 } = await import('three');
  return {
    ...actual,
    assignShipItems: (instances: readonly ItemInstance[]) => new Map(instances.map(
      (instance, index) => [instance.instanceId, {
        surfaceId: `lifecycle-surface-${index}`,
        physicalSlotId: `lifecycle-slot-${index}`,
        furnitureId: 'lifecycle-fixture',
        position: new Vector3(index, 1, 0),
        rotation: new Euler(),
        scale: 1,
        usedFallbackSurface: false,
      }],
    )),
  };
});

function gamePhase(): GamePhase {
  return {
    start: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function createUpdateHarness(
  session: ScavengeSession,
  input = { pointerLocked: true, consumeLook: vi.fn() },
): {
  phase: ScavengePhase;
  input: { pointerLocked: boolean; consumeLook: ReturnType<typeof vi.fn> };
  updateWorld: ReturnType<typeof vi.fn>;
} {
  const updateWorld = vi.fn();
  const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
  Object.assign(phase, {
    disposed: false,
    elapsed: 0,
    worldTime: 1,
    presentation: 'playing',
    session,
    input,
    world: { update: updateWorld },
    player: { update: vi.fn() },
    ui: {
      render: vi.fn(),
      setPrompt: vi.fn(),
      showFailureSequence: vi.fn(),
      showFailureResult: vi.fn(),
    },
    visualState: {
      kind: 'scavenge',
      elapsedSeconds: 0,
      sinkingProgress: 0,
    },
    context: {
      camera: new PerspectiveCamera(),
    },
    contextAction: { type: 'none', prompt: '' },
    terminalPresentation: { phase: 'playing', remainingSeconds: 0 },
    completionReported: false,
    updateInteraction: vi.fn(),
    updateFlight: vi.fn(),
  });
  return { phase, input, updateWorld };
}

describe('ScavengePhase lifecycle integration', () => {
  it('keeps an animated title world while the session and sinking clock stay idle', () => {
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const context = {
      mount: document.createElement('main'),
      camera,
      renderer: { domElement: document.createElement('canvas') },
      propModels,
      shipFurniture,
      skyAssets,
      physicsRuntime,
      maxTextureAnisotropy: 1,
    } as unknown as PhaseContext;
    const phase = new ScavengePhase(context, vi.fn(), vi.fn());
    const internals = phase as unknown as {
      session: ScavengeSession;
      world: World;
    };
    const updateWorld = vi.spyOn(internals.world, 'update');
    const expectedDirection = new Vector3(...TITLE_CAMERA_TARGET)
      .sub(new Vector3(...TITLE_CAMERA_POSITION))
      .normalize();

    expect(TITLE_CAMERA_POSITION).toEqual([33, 11.5, -4]);
    expect(TITLE_CAMERA_TARGET).toEqual([0, 5.5, 2]);
    expect(camera.position).toEqual(new Vector3(...TITLE_CAMERA_POSITION));
    expect(camera.getWorldDirection(new Vector3()).distanceTo(expectedDirection)).toBeLessThan(1e-10);

    phase.update(0.25, 0.25);

    expect(internals.session.snapshot()).toMatchObject({
      status: 'idle',
      remainingSeconds: 120,
    });
    expect(updateWorld).toHaveBeenCalledWith(
      0.25,
      0.25,
      expect.objectContaining({ progress: 0 }),
      camera.position,
      false,
    );
    expect(camera.position).toEqual(new Vector3(...TITLE_CAMERA_POSITION));
    phase.dispose();
    propModels.dispose();
    shipFurniture.dispose();
    skyAssets.dispose();
  });

  it('places the player camera before revealing play and starting the session', () => {
    const order: string[] = [];
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      presentation: 'title',
      player: { placeCamera: () => order.push('camera') },
      session: {
        snapshot: () => ({ status: 'idle' }),
        start: () => order.push('session'),
      },
      ui: {
        setPresentation: (presentation: string) => order.push(`ui:${presentation}`),
        clearPointerLockError: () => order.push('clear-error'),
        hideStart: () => order.push('hide-title'),
      },
    });

    (phase as unknown as { handlePointerLockChange(locked: boolean): void })
      .handlePointerLockChange(true);

    expect(order).toEqual([
      'camera',
      'ui:playing',
      'clear-error',
      'hide-title',
      'session',
    ]);
  });

  it('advances the visual clock during active play and freezes it while inactive', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase, input, updateWorld } = createUpdateHarness(session);

    phase.update(0.25, 0.25);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1.25,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      true,
    );

    input.pointerLocked = false;
    phase.update(0.5, 0.25);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1.25,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      false,
    );
  });

  it('disables physics while the document is hidden', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase, updateWorld } = createUpdateHarness(session);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    try {
      phase.update(0.25, 0.25);

      expect(updateWorld).toHaveBeenLastCalledWith(
        1,
        0.25,
        expect.anything(),
        expect.any(Vector3),
        false,
      );
    } finally {
      hidden.mockRestore();
    }
  });

  it('disables physics for an explicitly paused session', () => {
    const session = new ScavengeSession();
    session.start();
    session.pause();
    const { phase, updateWorld } = createUpdateHarness(session);

    phase.update(0.25, 0.25);

    expect(session.snapshot().status).toBe('paused');
    expect(updateWorld).toHaveBeenLastCalledWith(
      1,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      false,
    );
  });

  it('disables physics when the session becomes terminal during tick', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase, input, updateWorld } = createUpdateHarness(session);
    const originalTick = session.tick.bind(session);
    vi.spyOn(session, 'tick').mockImplementation((deltaSeconds) => {
      originalTick(deltaSeconds);
      input.pointerLocked = false;
    });

    phase.update(120, 120);

    expect(session.snapshot().status).toBe('failure');
    expect(updateWorld).toHaveBeenLastCalledWith(
      121,
      120,
      expect.anything(),
      expect.any(Vector3),
      false,
    );
  });

  it('constructs fresh physics state when the game restarts scavenging', () => {
    const phases: ScavengePhase[] = [];
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const game = Game.forTest({
      createScavenge: (context, onComplete, onRestart) => {
        const phase = new ScavengePhase(context, onComplete, onRestart);
        phases.push(phase);
        return phase;
      },
      createSurvival: () => gamePhase(),
    }, { propModels, shipFurniture, skyAssets, physicsRuntime });

    try {
      const firstWorld = (phases[0] as unknown as { world: World }).world;
      const firstPhysics = (firstWorld as unknown as {
        scavengePhysics: ScavengePhysics;
      }).scavengePhysics;
      const initialPose = {
        translation: { ...firstPhysics.barrelPose.translation },
        rotation: { ...firstPhysics.barrelPose.rotation },
      };
      const initialPosition = firstWorld.physicsBarrel.position.clone();
      for (let step = 1; step <= 30; step += 1) {
        firstWorld.update(
          step / 60,
          1 / 60,
          getSinkingState(30, 120),
          new Vector3(),
          true,
        );
      }
      expect(firstWorld.physicsBarrel.position.distanceTo(initialPosition)).toBeGreaterThan(1e-3);

      game.restart();

      const secondWorld = (phases[1] as unknown as { world: World }).world;
      const secondPhysics = (secondWorld as unknown as {
        scavengePhysics: ScavengePhysics;
      }).scavengePhysics;
      expect(secondWorld).not.toBe(firstWorld);
      expect(secondPhysics).not.toBe(firstPhysics);
      expect(secondWorld.physicsBarrel).not.toBe(firstWorld.physicsBarrel);
      expect(firstWorld.physicsBarrel.parent).toBeNull();
      expect(secondWorld.physicsBarrel.parent).not.toBeNull();
      expect(secondPhysics.barrelPose).toEqual(initialPose);
    } finally {
      game.dispose();
    }
  });

  it('renders scavenging through sceneRenderer with current sinking progress', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const render = vi.fn();
    const visualState: ScavengeVisualState = {
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0,
    };
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      disposed: false,
      scene,
      elapsed: 90,
      visualState,
      context: {
        camera,
        sceneRenderer: { render, resize: vi.fn(), dispose: vi.fn() },
      },
    });

    (phase as unknown as { syncVisualState(state: ReturnType<typeof getSinkingState>): void })
      .syncVisualState(getSinkingState(90, 120));
    phase.render();

    expect(render).toHaveBeenCalledWith(scene, camera, {
      kind: 'scavenge',
      elapsedSeconds: 90,
      sinkingProgress: 0.75,
    });
  });

  it('shares one scene renderer across phases and resizes it with the capped pixel ratio', () => {
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
    };
    const contexts: PhaseContext[] = [];
    let complete!: (result: { savedItems: readonly []; elapsedSeconds: number }) => void;
    const game = Game.forTest({
      createScavenge: (context, onComplete) => {
        contexts.push(context);
        complete = onComplete;
        return gamePhase();
      },
      createSurvival: (context) => {
        contexts.push(context);
        return gamePhase();
      },
    }, { propModels, shipFurniture, skyAssets, physicsRuntime, sceneRenderer });

    complete({ savedItems: [], elapsedSeconds: 2 });

    expect(contexts.map(({ sceneRenderer: value }) => value))
      .toEqual([sceneRenderer, sceneRenderer]);
    expect(sceneRenderer.resize).toHaveBeenCalledWith(
      window.innerWidth,
      window.innerHeight,
      Math.min(window.devicePixelRatio, 2),
    );
    game.dispose();
    expect(sceneRenderer.dispose).toHaveBeenCalledOnce();
  });

  it('uses one long-range camera without changing its near view', () => {
    const received: PhaseContext[] = [];
    const game = Game.forTest({
      createScavenge: (context) => {
        received.push(context);
        return gamePhase();
      },
      createSurvival: () => gamePhase(),
    }, {
      propModels: createTestPropModels(),
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
    });

    expect(received[0]!.camera).toMatchObject({
      fov: 65,
      near: 0.08,
      far: 1000,
    });
    game.dispose();
  });

  it('continues renderer cleanup when scene-renderer disposal fails', () => {
    const calls: string[] = [];
    const failure = new Error('scene renderer disposal failed');
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const renderer = {
      domElement: document.createElement('canvas'),
      capabilities: { getMaxAnisotropy: () => 1 },
      setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(),
      dispose: vi.fn(() => calls.push('renderer')),
    } as unknown as WebGLRenderer;
    vi.spyOn(renderer.domElement, 'remove').mockImplementation(() => calls.push('canvas'));
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(), resize: vi.fn(),
      dispose: vi.fn(() => { calls.push('sceneRenderer'); throw failure; }),
    };
    const game = Game.forTest({
      createScavenge: () => gamePhase(), createSurvival: () => gamePhase(),
    }, {
      propModels,
      shipFurniture,
      skyAssets,
      physicsRuntime,
      renderer,
      sceneRenderer,
    });

    expect(() => game.dispose()).toThrow(failure);
    expect(calls).toEqual(['sceneRenderer', 'renderer', 'canvas']);
  });

  it('shares one asset context across phase completion and restart', () => {
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const disposePropModels = vi.spyOn(propModels, 'dispose');
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose');
    const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose');
    const scavengeModels: unknown[] = [];
    const survivalModels: unknown[] = [];
    const scavengeSkyAssets: unknown[] = [];
    const survivalSkyAssets: unknown[] = [];
    const scavengeFurniture: unknown[] = [];
    const survivalFurniture: unknown[] = [];
    const scavengePhysics: unknown[] = [];
    const survivalPhysics: unknown[] = [];
    let complete!: (result: { savedItems: readonly []; elapsedSeconds: number }) => void;
    const game = Game.forTest({
      createScavenge: (context, onComplete) => {
        scavengeModels.push(context.propModels);
        scavengeSkyAssets.push(context.skyAssets);
        scavengeFurniture.push(context.shipFurniture);
        scavengePhysics.push(context.physicsRuntime);
        complete = onComplete;
        return gamePhase();
      },
      createSurvival: (context) => {
        survivalModels.push(context.propModels);
        survivalSkyAssets.push(context.skyAssets);
        survivalFurniture.push(context.shipFurniture);
        survivalPhysics.push(context.physicsRuntime);
        return gamePhase();
      },
    }, { propModels, shipFurniture, skyAssets, physicsRuntime });

    game.start();
    complete({ savedItems: [], elapsedSeconds: 3 });
    game.restart();

    expect(scavengeModels).toHaveLength(2);
    expect(scavengeModels[0]).toBe(propModels);
    expect(scavengeModels[1]).toBe(propModels);
    expect(survivalModels).toHaveLength(1);
    expect(survivalModels[0]).toBe(propModels);
    expect(scavengeSkyAssets).toEqual([skyAssets, skyAssets]);
    expect(survivalSkyAssets).toEqual([skyAssets]);
    expect(scavengeFurniture).toEqual([shipFurniture, shipFurniture]);
    expect(survivalFurniture).toEqual([shipFurniture]);
    expect(scavengePhysics).toEqual([physicsRuntime, physicsRuntime]);
    expect(survivalPhysics).toEqual([physicsRuntime]);
    expect(disposePropModels).not.toHaveBeenCalled();
    expect(disposeShipFurniture).not.toHaveBeenCalled();
    expect(disposeSkyAssets).not.toHaveBeenCalled();
    game.dispose();
    expect(disposePropModels).toHaveBeenCalledOnce();
    expect(disposeShipFurniture).toHaveBeenCalledOnce();
    expect(disposeSkyAssets).toHaveBeenCalledOnce();
  });

  it('disposes the active phase before shared furniture and sky assets exactly once', () => {
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const disposePhase = vi.fn();
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose');
    const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose');
    const game = Game.forTest({
      createScavenge: () => ({ ...gamePhase(), dispose: disposePhase }),
      createSurvival: () => gamePhase(),
    }, { propModels, shipFurniture, skyAssets, physicsRuntime });

    game.dispose();
    game.dispose();

    expect(disposePhase).toHaveBeenCalledOnce();
    expect(disposeShipFurniture).toHaveBeenCalledOnce();
    expect(disposeSkyAssets).toHaveBeenCalledOnce();
    expect(disposePhase.mock.invocationCallOrder[0])
      .toBeLessThan(disposeShipFurniture.mock.invocationCallOrder[0]!);
    expect(disposeShipFurniture.mock.invocationCallOrder[0])
      .toBeLessThan(disposeSkyAssets.mock.invocationCallOrder[0]!);
  });

  it('continues owned cleanup and preserves a throwing phase disposal error', () => {
    const calls: string[] = [];
    const phaseError = new Error('phase disposal failed');
    const laterModelError = new Error('model disposal also failed');
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const disposePhase = vi.fn(() => {
      calls.push('phase');
      throw phaseError;
    });
    const disposePropModels = vi.spyOn(propModels, 'dispose').mockImplementation(() => {
      calls.push('models');
      throw laterModelError;
    });
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose').mockImplementation(() => {
      calls.push('furniture');
    });
    const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose').mockImplementation(() => {
      calls.push('sky');
    });
    const renderer = {
      domElement: document.createElement('canvas'),
      capabilities: { getMaxAnisotropy: () => 1 },
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(() => calls.push('renderer')),
    } as unknown as WebGLRenderer;
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(), resize: vi.fn(),
      dispose: vi.fn(() => calls.push('sceneRenderer')),
    };
    const removeCanvas = vi.spyOn(renderer.domElement, 'remove').mockImplementation(() => {
      calls.push('canvas');
    });
    const game = Game.forTest({
      createScavenge: () => ({ ...gamePhase(), dispose: disposePhase }),
      createSurvival: () => gamePhase(),
    }, {
      propModels,
      shipFurniture,
      skyAssets,
      physicsRuntime,
      renderer,
      sceneRenderer,
    });
    const performanceStats = (game as unknown as {
      performanceStats: { dispose(): void };
    }).performanceStats;
    const disposePerformanceStats = vi.spyOn(performanceStats, 'dispose')
      .mockImplementation(() => calls.push('performance'));

    let thrown: unknown;
    try {
      game.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(phaseError);
    expect(calls).toEqual([
      'phase',
      'performance',
      'models',
      'furniture',
      'sky',
      'sceneRenderer',
      'renderer',
      'canvas',
    ]);
    expect(disposePhase).toHaveBeenCalledOnce();
    expect(disposePerformanceStats).toHaveBeenCalledOnce();
    expect(disposePropModels).toHaveBeenCalledOnce();
    expect(disposeShipFurniture).toHaveBeenCalledOnce();
    expect(disposeSkyAssets).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(removeCanvas).toHaveBeenCalledOnce();
    expect(() => game.dispose()).not.toThrow();
  });

  it('continues sky, renderer, and canvas cleanup after model disposal throws', () => {
    const calls: string[] = [];
    const modelError = new Error('model disposal failed');
    const laterSkyError = new Error('sky disposal also failed');
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const disposePhase = vi.fn(() => calls.push('phase'));
    const disposePropModels = vi.spyOn(propModels, 'dispose').mockImplementation(() => {
      calls.push('models');
      throw modelError;
    });
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose').mockImplementation(() => {
      calls.push('furniture');
    });
    const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose').mockImplementation(() => {
      calls.push('sky');
      throw laterSkyError;
    });
    const renderer = {
      domElement: document.createElement('canvas'),
      capabilities: { getMaxAnisotropy: () => 1 },
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(() => calls.push('renderer')),
    } as unknown as WebGLRenderer;
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(), resize: vi.fn(),
      dispose: vi.fn(() => calls.push('sceneRenderer')),
    };
    const removeCanvas = vi.spyOn(renderer.domElement, 'remove').mockImplementation(() => {
      calls.push('canvas');
    });
    const game = Game.forTest({
      createScavenge: () => ({ ...gamePhase(), dispose: disposePhase }),
      createSurvival: () => gamePhase(),
    }, {
      propModels,
      shipFurniture,
      skyAssets,
      physicsRuntime,
      renderer,
      sceneRenderer,
    });
    const performanceStats = (game as unknown as {
      performanceStats: { dispose(): void };
    }).performanceStats;
    const disposePerformanceStats = vi.spyOn(performanceStats, 'dispose')
      .mockImplementation(() => calls.push('performance'));

    let thrown: unknown;
    try {
      game.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(modelError);
    expect(calls).toEqual([
      'phase',
      'performance',
      'models',
      'furniture',
      'sky',
      'sceneRenderer',
      'renderer',
      'canvas',
    ]);
    expect(disposePhase).toHaveBeenCalledOnce();
    expect(disposePerformanceStats).toHaveBeenCalledOnce();
    expect(disposePropModels).toHaveBeenCalledOnce();
    expect(disposeShipFurniture).toHaveBeenCalledOnce();
    expect(disposeSkyAssets).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(removeCanvas).toHaveBeenCalledOnce();
    expect(() => game.dispose()).not.toThrow();
  });

  it('binds all real world instances to interaction and excludes an unavailable prop', () => {
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const context = {
      mount: document.createElement('main'),
      camera: new PerspectiveCamera(70, 1, 0.1, 100),
      renderer: { domElement: document.createElement('canvas') },
      propModels,
      shipFurniture,
      skyAssets,
      physicsRuntime,
      maxTextureAnisotropy: 1,
    } as unknown as PhaseContext;
    const phase = new ScavengePhase(context, vi.fn(), vi.fn());
    const internals = phase as unknown as {
      interaction: InteractionSystem;
      session: ScavengeSession;
      updateInteraction: () => void;
      world: World;
    };
    const updateInteraction = vi.spyOn(internals.interaction, 'update').mockReturnValue({
      target: 'none',
      targetItem: null,
    });
    internals.session.start();

    internals.updateInteraction();

    const firstItems = updateInteraction.mock.calls[0]![0];
    const depositTarget = updateInteraction.mock.calls[0]![2];
    const firstInstances = updateInteraction.mock.calls[0]![3];
    const cannedFood = internals.world.itemObjects.get('cannedFood-1')!;
    expect(internals.world.itemObjects.size).toBe(20);
    expect(internals.world.itemObjects.has('energyBar-1')).toBe(false);
    expect(firstItems).toHaveLength(20);
    expect(firstItems).toContain(cannedFood);
    expect(depositTarget).toBe(internals.world.boatDepositTarget);
    expect(firstInstances.size).toBe(20);
    expect(firstInstances.get('cannedFood-1')).toEqual({
      instanceId: 'cannedFood-1',
      type: 'cannedFood',
    });

    expect(internals.session.pickUp('cannedFood-1')).toBe(true);
    internals.updateInteraction();

    const nextItems = updateInteraction.mock.calls[1]![0];
    const nextInstances = updateInteraction.mock.calls[1]![3];
    expect(nextItems).toHaveLength(19);
    expect(nextItems).not.toContain(cannedFood);
    expect(nextInstances.has('cannedFood-1')).toBe(false);
    phase.dispose();
    propModels.dispose();
    skyAssets.dispose();
  });

  it('exits an owned lock and tears down only phase-owned resources once', () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const exitPointerLock = vi.fn();
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: exitPointerLock,
    });
    const resetCarry = vi.fn();
    const disposeInput = vi.fn();
    const disposeInteraction = vi.fn();
    const disposeWorld = vi.fn();
    const disposeUI = vi.fn();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      disposed: false,
      input: { pointerLocked: true, dispose: disposeInput },
      carry: { reset: resetCarry },
      interaction: { dispose: disposeInteraction },
      world: { dispose: disposeWorld },
      ui: { dispose: disposeUI },
      onPointerLockChange: vi.fn(),
      onVisibilityChange: vi.fn(),
    });

    phase.dispose();
    phase.dispose();

    expect(exitPointerLock).toHaveBeenCalledOnce();
    expect(resetCarry).toHaveBeenCalledOnce();
    expect(disposeInput).toHaveBeenCalledOnce();
    expect(disposeInteraction).toHaveBeenCalledOnce();
    expect(disposeWorld).toHaveBeenCalledOnce();
    expect(disposeUI).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
    expect(removeEventListener).toHaveBeenCalledWith('pointerlockchange', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeEventListener.mockRestore();
  });

  it('does not mutate world item state when a stale flight callback is rejected by the session', () => {
    const session = new ScavengeSession();
    session.start();
    session.pickUp('flareGun-1');
    session.pause();
    const loseItem = vi.fn();
    const carryUpdate = vi.fn((
      _delta: number,
      _acceptance: Box3,
      _waterHeight: (x: number, z: number) => number,
      handlers: { onLost: (item: ItemInstance) => void },
    ) => handlers.onLost({ instanceId: 'flareGun-1', type: 'flareGun' }));
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      elapsed: 0,
      session,
      carry: { update: carryUpdate },
      world: {
        lifeboat: new Group(),
        lifeboatAcceptance: new Box3(),
        loseItem,
      },
    });

    (phase as unknown as { updateFlight: (delta: number, scale: number) => void })
      .updateFlight(0.016, 1);

    expect(session.snapshot().carriedItems).toEqual([
      { instanceId: 'flareGun-1', type: 'flareGun' },
    ]);
    expect(loseItem).not.toHaveBeenCalled();
  });

  it('samples thrown items against the visual world time', () => {
    let sampledHeight = Number.NaN;
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      elapsed: 0,
      worldTime: 4.5,
      session: {},
      carry: {
        update: (
          _delta: number,
          _acceptance: Box3,
          waterHeight: (x: number, z: number) => number,
        ) => {
          sampledHeight = waterHeight(2, -3);
        },
      },
      world: {
        lifeboat: new Group(),
        lifeboatAcceptance: new Box3(),
      },
    });

    (phase as unknown as { updateFlight(delta: number, scale: number): void })
      .updateFlight(0.016, 0.75);

    expect(sampledHeight).toBeCloseTo(
      sampleWaveField(DEFAULT_WAVES, 4.5, 2, -3, 0.75).height,
    );
  });

  it('passes the accepted item identity to world save', () => {
    const accepted = { instanceId: 'flareGun-1', type: 'flareGun' } as const;
    const saveCarried = vi.fn().mockReturnValue(accepted);
    const saveItem = vi.fn();
    const carryUpdate = vi.fn((
      _delta: number,
      _acceptance: Box3,
      _waterHeight: (x: number, z: number) => number,
      handlers: { onSaved: (item: ItemInstance) => void },
    ) => handlers.onSaved(accepted));
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      elapsed: 0,
      session: { saveCarried },
      carry: { update: carryUpdate },
      world: {
        lifeboat: new Group(),
        lifeboatAcceptance: new Box3(),
        saveItem,
      },
    });

    (phase as unknown as { updateFlight: (delta: number, scale: number) => void })
      .updateFlight(0.016, 1);

    expect(saveCarried).toHaveBeenCalledOnce();
    expect(saveItem).toHaveBeenCalledWith(accepted);
  });

  it.each([
    ['onLanded', 'dropCarried', 'landItem'],
    ['onLost', 'loseCarried', 'loseItem'],
  ] as const)(
    'routes %s flight results to the matching instance and world',
    (handlerName, sessionMethod, worldMethod) => {
      const instance = { instanceId: 'cannedFood-2', type: 'cannedFood' } as const;
      const sessionResult = vi.fn().mockReturnValue(instance);
      const worldResult = vi.fn();
      const carryUpdate = vi.fn((
        _delta: number,
        _acceptance: Box3,
        _waterHeight: (x: number, z: number) => number,
        handlers: Record<typeof handlerName, (item: ItemInstance) => void>,
      ) => handlers[handlerName](instance));
      const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
      Object.assign(phase, {
        elapsed: 0,
        session: {
          [sessionMethod]: sessionResult,
        },
        carry: { update: carryUpdate },
        world: {
          lifeboat: new Group(),
          lifeboatAcceptance: new Box3(),
          [worldMethod]: worldResult,
        },
      });

      (phase as unknown as { updateFlight: (delta: number, scale: number) => void })
        .updateFlight(0.016, 1);

      expect(sessionResult).toHaveBeenCalledOnce();
      expect(worldResult).toHaveBeenCalledWith(instance.instanceId);
    },
  );

  it('drops an item into world state immediately', () => {
    const instance = { instanceId: 'flashlight-1', type: 'flashlight' } as const;
    const point = new Vector3(2, 2.22, -3);
    const releaseActive = vi.fn().mockReturnValue(instance);
    const dropCarried = vi.fn().mockReturnValue(instance);
    const dropItem = vi.fn();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      session: { dropCarried },
      carry: { releaseActive },
      world: { dropItem },
    });

    (phase as unknown as {
      performAction: (action: {
        type: 'drop';
        item: ItemInstance;
        point: Vector3;
        prompt: string;
      }) => void;
    }).performAction({
      type: 'drop',
      item: instance,
      point,
      prompt: 'LEFT CLICK — DROP FLASHLIGHT',
    });

    expect(releaseActive).toHaveBeenCalledOnce();
    expect(dropCarried).toHaveBeenCalledOnce();
    expect(dropItem).toHaveBeenCalledWith(instance.instanceId, point);
  });

  it('handles capacity rejection without mutating gameplay or world state', () => {
    const session = { pickUp: vi.fn(), evacuate: vi.fn() };
    const carry = { pickUp: vi.fn(), releaseAll: vi.fn(), drop: vi.fn() };
    const world = {
      itemObjects: new Map(),
      saveItem: vi.fn(),
      saveItems: vi.fn(),
      landItem: vi.fn(),
      loseItem: vi.fn(),
    };
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, { session, carry, world });

    (phase as unknown as {
      performAction: (action: {
        type: 'capacityFull';
        prompt: string;
      }) => void;
    }).performAction({
      type: 'capacityFull',
      prompt: 'SCUBA SET WEIGHS 3 — 2 CAPACITY FREE',
    });

    expect(session.pickUp).not.toHaveBeenCalled();
    expect(session.evacuate).not.toHaveBeenCalled();
    expect(carry.pickUp).not.toHaveBeenCalled();
    expect(carry.releaseAll).not.toHaveBeenCalled();
    expect(carry.drop).not.toHaveBeenCalled();
    expect(world.saveItem).not.toHaveBeenCalled();
    expect(world.saveItems).not.toHaveBeenCalled();
    expect(world.landItem).not.toHaveBeenCalled();
    expect(world.loseItem).not.toHaveBeenCalled();
  });

  it('reports pointer-lock rejection through the UI', async () => {
    const showPointerLockError = vi.fn();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      disposed: false,
      input: { requestPointerLock: vi.fn().mockResolvedValue(false) },
      ui: { showPointerLockError },
    });

    await (phase as unknown as { requestPointerLock: () => Promise<void> }).requestPointerLock();

    expect(showPointerLockError).toHaveBeenCalledOnce();
  });
});
