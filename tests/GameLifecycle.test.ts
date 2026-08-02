// @vitest-environment jsdom
// Importance: 5/5. Protects full game lifecycle integration.

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
import type { ScavengeAudio } from '../src/audio/ScavengeAudio';
import { AudioSystem } from '../src/audio/AudioSystem';
import { Game } from '../src/Game';
import { ScavengeSession, type ScavengeResult } from '../src/game/ScavengeSession';
import {
  createScavengeCinematicFrame,
  createScavengeEndingState,
  ENDING_HOLD_SECONDS,
  SINKING_CINEMATIC_SECONDS,
} from '../src/game/scavengeEnding';
import { createScavengeIntroFrame } from '../src/game/scavengeIntro';
import { SCAVENGE_DURATION_SECONDS } from '../src/game/scavengeRules';
import { ITEM_IDS, type ItemInstance } from '../src/game/ItemState';
import { createScavengeItemInstances } from '../src/game/scavengeCatalog';
import { getSinkingState } from '../src/game/sinking';
import { InteractionSystem } from '../src/interaction/InteractionSystem';
import type { ContextAction } from '../src/interaction/InteractionSystem';
import { ScavengePhysics } from '../src/physics/ScavengePhysics';
import { PlayerController } from '../src/player/PlayerController';
import {
  ScavengePhase,
  TITLE_CAMERA_POSITION,
  TITLE_CAMERA_TARGET,
} from '../src/phases/ScavengePhase';
import type { ScavengeVisualState, SceneRenderer } from '../src/rendering/SceneRenderer';
import type { PostProcessingControls } from '../src/rendering/postProcessingControls';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import type { PresentationWeatherId } from '../src/weather/presentationWeather';
import { World } from '../src/world/World';
import { createTestPropModels } from './helpers/propModels';
import { testPhysicsRuntime } from './helpers/physics';
import { createTestShipFurniture } from './helpers/shipFurniture';
import { createTestSkyAssets } from './helpers/skyAssets';

const physicsRuntime = await testPhysicsRuntime();

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

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

function eventModels(): EventModelLibrary {
  return { dispose: vi.fn() } as unknown as EventModelLibrary;
}

function scavengeAudioStub(): ScavengeAudio {
  return {
    start: vi.fn(),
    beginRun: vi.fn(),
    update: vi.fn(),
    itemHandled: vi.fn(),
    deny: vi.fn(),
    setPaused: vi.fn(),
    sink: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ScavengeAudio;
}

function scavengeHandsStub() {
  return {
    update: vi.fn(),
    playGesture: vi.fn(),
    hideAndReset: vi.fn(),
    dispose: vi.fn(),
  };
}

function postProcessingSceneRenderer(): SceneRenderer {
  const postProcessingControls: PostProcessingControls = {
    getState: vi.fn(() => ({
      ambientOcclusionAvailable: true,
      ambientOcclusionMode: 'composite' as const,
      ambientOcclusionIntensity: 1,
      ambientOcclusionRadius: 0.5,
    })),
    setAmbientOcclusionMode: vi.fn(),
    setNumeric: vi.fn(),
  };
  return {
    postProcessingControls,
    render: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
}

function createUpdateHarness(
  session: ScavengeSession,
  input = {
    pointerLocked: true,
    consumeLook: vi.fn(),
    clearLook: vi.fn(),
    sprinting: false,
  },
): {
  phase: ScavengePhase;
  input: {
    pointerLocked: boolean;
    consumeLook: ReturnType<typeof vi.fn>;
    clearLook: ReturnType<typeof vi.fn>;
    sprinting: boolean;
  };
  hands: ReturnType<typeof scavengeHandsStub>;
  updateWorld: ReturnType<typeof vi.fn>;
  attachPhysicsBarrelsToShip: ReturnType<typeof vi.fn>;
} {
  const updateWorld = vi.fn();
  const attachPhysicsBarrelsToShip = vi.fn();
  const hands = scavengeHandsStub();
  const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
  Object.assign(phase, {
    disposed: false,
    elapsed: 0,
    worldTime: 1,
    presentation: 'playing',
    pausedIntroExitCarry: false,
    audio: scavengeAudioStub(),
    session,
    input,
    hands,
    world: {
      update: updateWorld,
      attachPhysicsBarrelsToShip,
      evacuationBounds: { minX: 8.55, maxX: 9.25, minZ: -0.35, maxZ: 0.35 },
    },
    player: {
      update: vi.fn(),
      placeCamera: vi.fn(),
      localPosition: new Vector3(8.9, 0, 0),
    },
    ui: {
      render: vi.fn(),
      renderEnding: vi.fn(),
      setPrompt: vi.fn(),
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
    ending: createScavengeEndingState(),
    endingStarted: false,
    cinematicFrame: createScavengeCinematicFrame(),
    cinematicCameraTarget: new Vector3(),
    completionReported: false,
    onComplete: vi.fn(),
    updateInteraction: vi.fn(),
    updateFlight: vi.fn(),
  });
  return { phase, input, hands, updateWorld, attachPhysicsBarrelsToShip };
}

function introHarness(elapsed = 0) {
  const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
  let sessionStatus: 'idle' | 'running' | 'paused' = 'idle';
  const sessionStart = vi.fn(() => { sessionStatus = 'running'; });
  const sessionPause = vi.fn(() => {
    if (sessionStatus === 'running') sessionStatus = 'paused';
  });
  const sessionResume = vi.fn(() => {
    if (sessionStatus === 'paused') sessionStatus = 'running';
  });
  const sessionTick = vi.fn();
  const beginRun = vi.fn();
  const crash = vi.fn();
  const triggerCrash = vi.fn();
  const setAudioPaused = vi.fn();
  const setUiPaused = vi.fn();
  const consumeJump = vi.fn();
  const consumeLook = vi.fn();
  const clearLook = vi.fn();
  const updateWorld = vi.fn();
  const playerUpdate = vi.fn();
  const setScriptedPose = vi.fn();
  const placeCamera = vi.fn();
  const hands = scavengeHandsStub();
  const updateInteraction = vi.fn();
  const updateFlight = vi.fn();
  const anchors = {
    seatedPosition: [0.69, 13.74, 0.48],
    standingPosition: [0.73, 14.29, 0.14],
    ladderApproachPosition: [0.73, 14.29, -0.54],
    ladderTopPosition: [0, 14.29, -0.54],
    ladderBottomPosition: [0, 3.72, -0.54],
    exitPosition: [0, 3.72, -1.3],
  } as const;
  const introFrame = createScavengeIntroFrame();
  Object.assign(phase, {
    disposed: false,
    elapsed: 0,
    worldTime: 1,
    presentation: 'intro',
    introElapsed: elapsed,
    introPaused: false,
    pausedIntroExitCarry: false,
    introCrashHandled: false,
    introFrame,
    introPose: {
      position: introFrame.cameraPosition,
      yaw: Math.PI,
      pitch: 0,
      floorEyeY: 0,
    },
    world: {
      scavengeIntroAnchors: anchors,
      setScavengeIntroImpact: vi.fn(),
      triggerScavengeIntroCrash: triggerCrash,
      update: updateWorld,
      evacuationBounds: { minX: 8.55, maxX: 9.25, minZ: -0.35, maxZ: 0.35 },
    },
    input: {
      pointerLocked: true,
      consumeLook,
      clearLook,
      consumeJump,
      sprinting: false,
    },
    hands,
    player: {
      setScriptedPose,
      placeCamera,
      update: playerUpdate,
      localPosition: new Vector3(),
    },
    audio: { beginRun, crash, setPaused: setAudioPaused, update: vi.fn() },
    ui: {
      setPresentation: vi.fn(),
      setPaused: setUiPaused,
      clearPointerLockError: vi.fn(),
      render: vi.fn(),
      renderEnding: vi.fn(),
      setPrompt: vi.fn(),
    },
    session: {
      start: sessionStart,
      pause: sessionPause,
      resume: sessionResume,
      tick: sessionTick,
      snapshot: () => ({
        status: sessionStatus,
        remainingSeconds: SCAVENGE_DURATION_SECONDS,
      }),
    },
    visualState: {
      kind: 'scavenge',
      elapsedSeconds: 0,
      sinkingProgress: 0,
    },
    context: { camera: new PerspectiveCamera() },
    contextAction: { type: 'none', prompt: '' },
    ending: createScavengeEndingState(),
    endingStarted: false,
    cinematicFrame: createScavengeCinematicFrame(),
    cinematicCameraTarget: new Vector3(),
    completionReported: false,
    onComplete: vi.fn(),
    updateInteraction,
    updateFlight,
  });
  return {
    phase,
    sessionStart,
    sessionPause,
    sessionResume,
    sessionTick,
    sessionSnapshot: () => sessionStatus,
    beginRun,
    crash,
    triggerCrash,
    setAudioPaused,
    setUiPaused,
    consumeJump,
    consumeLook,
    clearLook,
    updateWorld,
    playerUpdate,
    setScriptedPose,
    placeCamera,
    updateInteraction,
    updateFlight,
  };
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
      audio: AudioSystem.silent(),
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
      remainingSeconds: SCAVENGE_DURATION_SECONDS,
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
    context.audio.dispose();
    propModels.dispose();
    shipFurniture.dispose();
    skyAssets.dispose();
  });

  it('begins the intro before revealing play or starting the session', () => {
    const order: string[] = [];
    const sessionStart = vi.fn();
    const introFrame = createScavengeIntroFrame();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      presentation: 'title',
      introElapsed: 0,
      introPaused: false,
      introFrame,
      introPose: {
        position: introFrame.cameraPosition,
        yaw: Math.PI,
        pitch: 0,
        floorEyeY: 0,
      },
      audio: { setPaused: () => order.push('audio:resume') },
      input: { consumeJump: () => order.push('jump') },
      world: {
        scavengeIntroAnchors: {
          seatedPosition: [0.69, 13.74, 0.48],
          standingPosition: [0.73, 14.29, 0.14],
          ladderApproachPosition: [0.73, 14.29, -0.54],
          ladderTopPosition: [0, 14.29, -0.54],
          ladderBottomPosition: [0, 3.72, -0.54],
          exitPosition: [0, 3.72, -1.3],
        },
        setScavengeIntroImpact: vi.fn(),
      },
      player: {
        setScriptedPose: () => order.push('scripted-pose'),
        placeCamera: () => order.push('camera'),
      },
      session: {
        snapshot: () => ({ status: 'idle' }),
        start: sessionStart,
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
      'jump',
      'ui:intro',
      'clear-error',
      'hide-title',
      'audio:resume',
      'scripted-pose',
      'camera',
    ]);
    expect(sessionStart).not.toHaveBeenCalled();
  });

  it('keeps the session idle before twelve seconds', () => {
    const { phase, sessionStart, sessionTick } = introHarness(2);
    (phase as unknown as { updateIntro(delta: number): void }).updateIntro(3);
    expect(sessionStart).not.toHaveBeenCalled();
    expect(sessionTick).not.toHaveBeenCalled();
  });

  it('fires the crash once across a large delta', () => {
    const { phase, crash, triggerCrash } = introHarness(5.9);
    const updateIntro = (phase as unknown as { updateIntro(delta: number): void }).updateIntro;
    updateIntro.call(phase, 2);
    updateIntro.call(phase, 0.2);
    expect(crash).toHaveBeenCalledOnce();
    expect(triggerCrash).toHaveBeenCalledOnce();
  });

  it('completes naturally, clears queued jump, and starts once', () => {
    const {
      phase, sessionStart, beginRun, consumeJump, setScriptedPose,
    } = introHarness(11.9);
    const updateIntro = (phase as unknown as { updateIntro(delta: number): void }).updateIntro;
    updateIntro.call(phase, 0.2);
    updateIntro.call(phase, 0.2);
    expect(sessionStart).toHaveBeenCalledOnce();
    expect(beginRun).toHaveBeenCalledOnce();
    expect(consumeJump).toHaveBeenCalledOnce();
    expect(setScriptedPose).toHaveBeenCalledWith(expect.objectContaining({ yaw: 0 }));
  });

  it('skips with Space, clears queued jump, and does not play the missed crash', () => {
    const {
      phase, sessionStart, beginRun, crash, consumeJump, updateWorld,
    } = introHarness(2);
    const event = new KeyboardEvent('keydown', {
      code: 'Space', key: ' ', cancelable: true,
    });
    (phase as unknown as { handleKeyDown(event: KeyboardEvent): void }).handleKeyDown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(sessionStart).toHaveBeenCalledOnce();
    expect(beginRun).toHaveBeenCalledOnce();
    expect(crash).not.toHaveBeenCalled();
    expect(consumeJump).toHaveBeenCalledOnce();

    phase.update(2.25, 0.25);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1.25,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      true,
    );
  });

  it('freezes paused intro effects and places the camera after the world update', () => {
    const { phase, updateWorld } = introHarness(6.2);
    const internals = phase as unknown as {
      introElapsed: number;
      introPaused: boolean;
      worldTime: number;
      input: { pointerLocked: boolean };
      player: { placeCamera: ReturnType<typeof vi.fn> };
    };
    const order: string[] = [];
    internals.introPaused = true;
    internals.input.pointerLocked = false;
    updateWorld.mockImplementation(() => order.push('world'));
    internals.player.placeCamera.mockImplementation(() => order.push('camera'));

    phase.update(20, 20);

    expect(internals.introElapsed).toBe(6.2);
    expect(internals.worldTime).toBe(1);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1,
      0,
      expect.anything(),
      expect.any(Vector3),
      false,
    );
    expect(order).toEqual(['world', 'camera']);

    internals.input.pointerLocked = true;
    (phase as unknown as { handlePointerLockChange(locked: boolean): void })
      .handlePointerLockChange(true);
    phase.update(20.25, 0.25);

    expect(internals.introElapsed).toBeCloseTo(6.45);
    expect(internals.worldTime).toBeCloseTo(1.25);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1.25,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      false,
    );
  });

  it('places the intro camera after the world update on natural completion', () => {
    const { phase, updateWorld, sessionStart, consumeLook, clearLook } = introHarness(11.9);
    const player = (phase as unknown as {
      player: { placeCamera: ReturnType<typeof vi.fn> };
    }).player;
    const order: string[] = [];
    updateWorld.mockImplementation(() => order.push('world'));
    player.placeCamera.mockImplementation(() => order.push('camera'));

    phase.update(12.1, 0.2);

    expect(sessionStart).toHaveBeenCalledOnce();
    expect(order.at(-2)).toBe('world');
    expect(order.at(-1)).toBe('camera');
    expect(clearLook).toHaveBeenCalledOnce();
    expect(consumeLook).not.toHaveBeenCalled();
    expect((phase as unknown as { pausedIntroExitCarry: boolean }).pausedIntroExitCarry)
      .toBe(false);
  });

  it('pauses and resumes across pointer-lock loss', () => {
    const { phase } = introHarness(4);
    const handle = (phase as unknown as {
      handlePointerLockChange(locked: boolean): void;
    }).handlePointerLockChange;
    handle.call(phase, false);
    expect((phase as unknown as { introPaused: boolean }).introPaused).toBe(true);
    handle.call(phase, true);
    expect((phase as unknown as { introPaused: boolean }).introPaused).toBe(false);
    expect((phase as unknown as { introElapsed: number }).introElapsed).toBe(4);
  });

  it('carries a paused intro exit pose through updates until pointer lock resumes', () => {
    const {
      phase,
      sessionStart,
      sessionPause,
      sessionResume,
      sessionSnapshot,
      setAudioPaused,
      setUiPaused,
      updateWorld,
      placeCamera,
      playerUpdate,
    } = introHarness(4);
    const internals = phase as unknown as {
      input: { pointerLocked: boolean };
      worldTime: number;
      introElapsed: number;
      pausedIntroExitCarry: boolean;
    };
    const handlePointerLockChange = (phase as unknown as {
      handlePointerLockChange(locked: boolean): void;
    }).handlePointerLockChange;

    internals.input.pointerLocked = false;
    handlePointerLockChange.call(phase, false);
    (phase as unknown as { handleKeyDown(event: KeyboardEvent): void }).handleKeyDown(
      new KeyboardEvent('keydown', { code: 'Space', cancelable: true }),
    );

    expect(sessionStart).toHaveBeenCalledOnce();
    expect(sessionPause).toHaveBeenCalledOnce();
    expect(sessionSnapshot()).toBe('paused');
    expect((phase as unknown as { introPaused: boolean }).introPaused).toBe(false);
    expect(internals.pausedIntroExitCarry).toBe(true);

    updateWorld.mockClear();
    placeCamera.mockClear();
    const order: string[] = [];
    updateWorld.mockImplementation(() => order.push('world'));
    placeCamera.mockImplementation(() => order.push('camera'));
    phase.update(20, 20);
    phase.update(50, 30);

    expect(internals.introElapsed).toBe(4);
    expect(internals.worldTime).toBe(1);
    expect(updateWorld).toHaveBeenCalledTimes(2);
    expect(updateWorld).toHaveBeenNthCalledWith(
      1,
      1,
      0,
      expect.anything(),
      expect.any(Vector3),
      false,
    );
    expect(updateWorld).toHaveBeenNthCalledWith(
      2,
      1,
      0,
      expect.anything(),
      expect.any(Vector3),
      false,
    );
    expect(order).toEqual(['world', 'camera', 'world', 'camera']);

    internals.input.pointerLocked = true;
    handlePointerLockChange.call(phase, true);

    expect(sessionResume).toHaveBeenCalledOnce();
    expect(sessionSnapshot()).toBe('running');
    expect(internals.pausedIntroExitCarry).toBe(false);
    expect(setUiPaused).toHaveBeenLastCalledWith(false);
    expect(setAudioPaused).toHaveBeenLastCalledWith(false);

    phase.update(50.25, 0.25);
    expect(sessionStart).toHaveBeenCalledOnce();
    expect(playerUpdate).toHaveBeenCalledOnce();
    expect(internals.worldTime).toBe(1.25);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1.25,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      true,
    );
  });

  it('preserves post-crash effect and camera state through paused skip carry', () => {
    const {
      phase,
      crash,
      triggerCrash,
      sessionStart,
      sessionPause,
      sessionResume,
      sessionTick,
      updateWorld,
    } = introHarness(6.1);
    const internals = phase as unknown as {
      context: { camera: PerspectiveCamera };
      input: {
        pointerLocked: boolean;
        movement: { x: number; z: number };
        sprinting: boolean;
        consumeLook: ReturnType<typeof vi.fn>;
      };
      player: PlayerController;
      worldTime: number;
      introElapsed: number;
      pausedIntroExitCarry: boolean;
    };
    const ship = new Group();
    const player = new PlayerController(
      internals.context.camera,
      ship,
      new Vector3(0, 3.72, -1.3),
      [],
      {
        safe: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
        fall: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      },
      vi.fn(),
    );
    internals.player = player;
    Object.assign(internals.input, {
      movement: { x: 0, z: 0 },
      sprinting: false,
    });
    internals.input.consumeLook.mockReturnValue({ x: 0, y: 0 });

    let effectStarted = false;
    let effectAge = 0;
    triggerCrash.mockImplementation(() => { effectStarted = true; });
    updateWorld.mockImplementation((_time, deltaSeconds: number) => {
      if (effectStarted) effectAge += deltaSeconds;
      ship.position.x += deltaSeconds * 0.5;
      ship.rotation.y += deltaSeconds * 0.1;
      ship.updateMatrixWorld(true);
    });

    phase.update(6.3, 0.2);

    expect(internals.introElapsed).toBeCloseTo(6.3);
    expect(crash).toHaveBeenCalledOnce();
    expect(triggerCrash).toHaveBeenCalledOnce();
    expect(effectAge).toBeCloseTo(0.2);

    internals.input.pointerLocked = false;
    (phase as unknown as { handlePointerLockChange(locked: boolean): void })
      .handlePointerLockChange(false);
    (phase as unknown as { handleKeyDown(event: KeyboardEvent): void }).handleKeyDown(
      new KeyboardEvent('keydown', { code: 'Space', cancelable: true }),
    );

    const heldEffectAge = effectAge;
    const heldShipPosition = ship.position.clone();
    const heldShipQuaternion = ship.quaternion.clone();
    const heldCameraPosition = internals.context.camera.position.clone();
    const heldCameraQuaternion = internals.context.camera.quaternion.clone();
    const heldWorldTime = internals.worldTime;

    phase.update(26.1, 20);
    phase.update(56.1, 30);
    phase.update(106.1, 50);

    expect(sessionStart).toHaveBeenCalledOnce();
    expect(sessionPause).toHaveBeenCalledOnce();
    expect(effectAge).toBe(heldEffectAge);
    expect(ship.position.toArray()).toEqual(heldShipPosition.toArray());
    expect(ship.quaternion.toArray()).toEqual(heldShipQuaternion.toArray());
    expect(internals.context.camera.position.toArray()).toEqual(heldCameraPosition.toArray());
    expect(internals.context.camera.quaternion.toArray())
      .toEqual(heldCameraQuaternion.toArray());
    expect(internals.worldTime).toBe(heldWorldTime);
    expect(internals.pausedIntroExitCarry).toBe(true);
    expect(crash).toHaveBeenCalledOnce();
    expect(triggerCrash).toHaveBeenCalledOnce();

    internals.input.pointerLocked = true;
    (phase as unknown as { handlePointerLockChange(locked: boolean): void })
      .handlePointerLockChange(true);
    phase.update(106.1, 0);

    expect(sessionResume).toHaveBeenCalledOnce();
    expect(internals.pausedIntroExitCarry).toBe(false);
    expect(effectAge).toBe(heldEffectAge);
    expect(ship.position.toArray()).toEqual(heldShipPosition.toArray());
    expect(ship.quaternion.toArray()).toEqual(heldShipQuaternion.toArray());
    expect(internals.context.camera.position.toArray()).toEqual(heldCameraPosition.toArray());
    expect(internals.context.camera.quaternion.toArray())
      .toEqual(heldCameraQuaternion.toArray());
    expect(crash).toHaveBeenCalledOnce();
    expect(triggerCrash).toHaveBeenCalledOnce();

    phase.update(106.35, 0.25);

    const expectedCameraPosition = ship.localToWorld(player.localPosition.clone());
    expect(sessionStart).toHaveBeenCalledOnce();
    expect(sessionTick).toHaveBeenLastCalledWith(0.25, false);
    expect(effectAge).toBeCloseTo(heldEffectAge + 0.25);
    expect(internals.context.camera.position.distanceTo(expectedCameraPosition)).toBeLessThan(1e-10);
    expect(crash).toHaveBeenCalledOnce();
    expect(triggerCrash).toHaveBeenCalledOnce();
  });

  it('carries a hidden intro skip until visible pointer-lock resume', () => {
    const {
      phase,
      crash,
      triggerCrash,
      sessionSnapshot,
      sessionResume,
      updateWorld,
    } = introHarness(6.1);
    const internals = phase as unknown as {
      input: { pointerLocked: boolean };
      pausedIntroExitCarry: boolean;
      worldTime: number;
    };
    phase.update(6.3, 0.2);
    expect(crash).toHaveBeenCalledOnce();
    expect(triggerCrash).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    try {
      (phase as unknown as { handleVisibilityChange(): void }).handleVisibilityChange();
      internals.input.pointerLocked = false;
      (phase as unknown as { handleKeyDown(event: KeyboardEvent): void }).handleKeyDown(
        new KeyboardEvent('keydown', { code: 'Space', cancelable: true }),
      );
      phase.update(40, 40);

      expect(sessionSnapshot()).toBe('paused');
      expect(internals.pausedIntroExitCarry).toBe(true);
      expect(internals.worldTime).toBeCloseTo(1.2);
      expect(updateWorld).toHaveBeenLastCalledWith(
        1.2,
        0,
        expect.anything(),
        expect.any(Vector3),
        false,
      );
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    }

    internals.input.pointerLocked = true;
    (phase as unknown as { handlePointerLockChange(locked: boolean): void })
      .handlePointerLockChange(true);
    expect(sessionResume).toHaveBeenCalledOnce();
    expect(internals.pausedIntroExitCarry).toBe(false);
    expect(crash).toHaveBeenCalledOnce();
    expect(triggerCrash).toHaveBeenCalledOnce();
  });

  it('pauses when the page becomes hidden', () => {
    const { phase } = introHarness(4);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    try {
      (phase as unknown as { handleVisibilityChange(): void }).handleVisibilityChange();
      expect((phase as unknown as { introPaused: boolean }).introPaused).toBe(true);
      expect((phase as unknown as { introElapsed: number }).introElapsed).toBe(4);
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    }
  });

  it('does not pause when pointer lock is released for the AO overlay', () => {
    const pause = vi.fn();
    const setPaused = vi.fn();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      overlayActive: true,
      session: {
        snapshot: () => ({ status: 'running' }),
        pause,
      },
      ui: { setPaused },
    });

    (phase as unknown as { handlePointerLockChange(locked: boolean): void })
      .handlePointerLockChange(false);

    expect(pause).not.toHaveBeenCalled();
    expect(setPaused).not.toHaveBeenCalled();
  });

  it('continues simulation without player controls while the AO overlay is open', () => {
    const updateWorld = vi.fn();
    const updatePlayer = vi.fn();
    const input = {
      pointerLocked: true,
      consumeLook: vi.fn(),
      clearLook: vi.fn(),
      sprinting: false,
    };
    const tick = vi.fn();
    const updatePassivePlayer = vi.fn();
    const updateFlight = vi.fn();
    const hands = scavengeHandsStub();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      disposed: false,
      elapsed: 0,
      worldTime: 1,
      presentation: 'playing',
      audio: scavengeAudioStub(),
      session: {
        snapshot: () => ({ status: 'running', remainingSeconds: SCAVENGE_DURATION_SECONDS }),
        tick,
      },
      input,
      hands,
      world: {
        update: updateWorld,
        evacuationBounds: { minX: 8.55, maxX: 9.25, minZ: -0.35, maxZ: 0.35 },
      },
      player: {
        update: updatePlayer,
        updatePassive: updatePassivePlayer,
        placeCamera: vi.fn(),
        localPosition: new Vector3(8.9, 0, 0),
      },
      ui: { render: vi.fn(), renderEnding: vi.fn(), setPrompt: vi.fn() },
      visualState: {
        kind: 'scavenge',
        elapsedSeconds: 0,
        sinkingProgress: 0,
      },
      context: {
        camera: new PerspectiveCamera(),
      },
      contextAction: { type: 'none', prompt: '' },
      ending: createScavengeEndingState(),
      endingStarted: false,
      cinematicFrame: createScavengeCinematicFrame(),
      cinematicCameraTarget: new Vector3(),
      updateInteraction: vi.fn(),
      updateFlight,
    });

    phase.update(0.25, 0.25);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1.25,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      true,
    );
    expect(updatePlayer).toHaveBeenCalledWith(0.25, input);

    input.pointerLocked = false;
    tick.mockClear();
    updatePlayer.mockClear();
    updateFlight.mockClear();
    phase.update(0.5, 0.25);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1.25,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      false,
    );
    expect(tick).not.toHaveBeenCalled();

    phase.setOverlayActive(true);
    phase.update(0.75, 0.25);
    expect(updateWorld).toHaveBeenLastCalledWith(
      1.5,
      0.25,
      expect.anything(),
      expect.any(Vector3),
      true,
    );
    expect(tick).toHaveBeenCalledWith(0.25, true);
    expect(updatePlayer).not.toHaveBeenCalled();
    expect(updatePassivePlayer).toHaveBeenCalledWith(0.25);
    expect(updateFlight).toHaveBeenCalledOnce();
    expect(input.clearLook).toHaveBeenCalled();
    expect(input.consumeLook).not.toHaveBeenCalled();
  });

  it('freezes shared-wave time with player movement while gameplay is paused', () => {
    const session = new ScavengeSession();
    session.start();
    session.pause();
    const { phase, input, updateWorld } = createUpdateHarness(
      session,
      {
        pointerLocked: false,
        consumeLook: vi.fn(),
        clearLook: vi.fn(),
        sprinting: false,
      },
    );

    phase.update(2, 0.25);

    expect(updateWorld).toHaveBeenLastCalledWith(
      1,
      0.25,
      expect.any(Object),
      expect.any(Vector3),
      false,
    );
    expect(session.snapshot().remainingSeconds).toBe(SCAVENGE_DURATION_SECONDS);
    expect(input.clearLook).toHaveBeenCalledOnce();
    expect(input.consumeLook).not.toHaveBeenCalled();
  });

  it('waits for Escape release before the next Escape resumes', () => {
    const requestPointerLock = vi.fn();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      overlayActive: false,
      escapeResumeArmed: false,
      session: { snapshot: () => ({ status: 'paused' }) },
      requestPointerLock,
    });
    const firstPress = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });

    const internals = phase as unknown as {
      handleKeyDown: (event: KeyboardEvent) => void;
      handleKeyUp: (event: KeyboardEvent) => void;
    };
    internals.handleKeyDown(firstPress);
    expect(firstPress.defaultPrevented).toBe(false);
    expect(requestPointerLock).not.toHaveBeenCalled();

    internals.handleKeyUp(new KeyboardEvent('keyup', { key: 'Escape' }));
    const resumePress = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    internals.handleKeyDown(resumePress);

    expect(resumePress.defaultPrevented).toBe(true);
    expect(requestPointerLock).toHaveBeenCalledOnce();
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

  it('places the gameplay camera after the world moves Dorothy', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase, updateWorld } = createUpdateHarness(session);
    const order: string[] = [];
    const player = (phase as unknown as {
      player: {
        update: ReturnType<typeof vi.fn>;
        placeCamera: ReturnType<typeof vi.fn>;
      };
    }).player;
    player.update.mockImplementation(() => order.push('player'));
    updateWorld.mockImplementation(() => order.push('world'));
    player.placeCamera.mockImplementation(() => order.push('camera'));

    phase.update(0.25, 0.25);

    expect(order).toEqual(['player', 'world', 'camera']);
  });

  it('updates visible hands from the player motion after placing the camera', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase, hands, input } = createUpdateHarness(session);
    input.sprinting = true;
    const player = (phase as unknown as {
      player: { update: ReturnType<typeof vi.fn> };
    }).player;
    player.update.mockReturnValue({ movedDistance: 0.08, grounded: true, jumped: false });

    phase.update(0.016, 0.016);

    expect(hands.update).toHaveBeenCalledWith(0.016, 0.08, true, true, true);
  });

  it('keeps idle hands visible while the grounded player stands still', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase, hands } = createUpdateHarness(session);
    const player = (phase as unknown as {
      player: { update: ReturnType<typeof vi.fn> };
    }).player;
    player.update.mockReturnValue({ movedDistance: 0, grounded: true, jumped: false });

    phase.update(0.016, 0.016);

    expect(hands.update).toHaveBeenCalledWith(0.016, 0, true, false, true);
  });

  it('hides hands when title, paused, overlay, hidden, or sinking states prevent control', () => {
    const title = createUpdateHarness(new ScavengeSession());
    title.phase.update(0.016, 0.016);
    expect(title.hands.update).toHaveBeenLastCalledWith(0.016, 0, false, false, false);

    const pausedSession = new ScavengeSession();
    pausedSession.start();
    pausedSession.pause();
    const paused = createUpdateHarness(pausedSession);
    paused.phase.update(0.016, 0.016);
    expect(paused.hands.update).toHaveBeenLastCalledWith(0.016, 0, false, false, false);

    const overlaySession = new ScavengeSession();
    overlaySession.start();
    const overlay = createUpdateHarness(overlaySession);
    overlay.phase.setOverlayActive(true);
    overlay.phase.update(0.016, 0.016);
    expect(overlay.hands.update).toHaveBeenLastCalledWith(0.016, 0, false, false, false);

    const hiddenSession = new ScavengeSession();
    hiddenSession.start();
    const hidden = createUpdateHarness(hiddenSession);
    const documentHidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      hidden.phase.update(0.016, 0.016);
      expect(hidden.hands.update).toHaveBeenLastCalledWith(0.016, 0, false, false, false);
    } finally {
      documentHidden.mockRestore();
    }

    const sinkingSession = new ScavengeSession();
    sinkingSession.start();
    const sinking = createUpdateHarness(sinkingSession);
    const player = (sinking.phase as unknown as { player: { localPosition: Vector3 } }).player;
    player.localPosition.set(0, 0, 0);
    const exitPointerLock = vi.fn();
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: exitPointerLock,
    });
    try {
      sinking.phase.update(0, SCAVENGE_DURATION_SECONDS);
      expect(sinking.hands.update).toHaveBeenLastCalledWith(
        SCAVENGE_DURATION_SECONDS,
        0,
        false,
        false,
        false,
      );
    } finally {
      delete (document as { exitPointerLock?: () => void }).exitPointerLock;
    }
  });

  it('resets hands immediately when control pauses', () => {
    const overlayHands = scavengeHandsStub();
    const overlay = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(overlay, {
      disposed: false,
      overlayActive: false,
      hands: overlayHands,
      audio: scavengeAudioStub(),
      session: { snapshot: () => ({ status: 'running' }) },
      input: { pointerLocked: true },
    });
    overlay.setOverlayActive(true);
    expect(overlayHands.hideAndReset).toHaveBeenCalledOnce();

    const hiddenHands = scavengeHandsStub();
    const hidden = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(hidden, {
      hands: hiddenHands,
      audio: scavengeAudioStub(),
      session: { snapshot: () => ({ status: 'running' }), pause: vi.fn() },
      ui: { setPaused: vi.fn() },
    });
    const documentHidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      (hidden as unknown as { handleVisibilityChange: () => void }).handleVisibilityChange();
    } finally {
      documentHidden.mockRestore();
    }
    expect(hiddenHands.hideAndReset).toHaveBeenCalledOnce();

    const pausedHands = scavengeHandsStub();
    const paused = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(paused, {
      overlayActive: false,
      hands: pausedHands,
      audio: scavengeAudioStub(),
      session: { snapshot: () => ({ status: 'running' }), pause: vi.fn() },
      ui: { setPaused: vi.fn() },
    });
    (paused as unknown as { handlePointerLockChange(locked: boolean): void })
      .handlePointerLockChange(false);
    expect(pausedHands.hideAndReset).toHaveBeenCalledOnce();
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

  it('evacuates at the deadline from inside the lifeboat bounds', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase } = createUpdateHarness(session);
    const player = (phase as unknown as { player: { localPosition: Vector3 } }).player;
    player.localPosition.set(8.9, player.localPosition.y, 0);

    phase.update(0, SCAVENGE_DURATION_SECONDS);

    expect(session.snapshot().status).toBe('success');
  });

  it('sinks at the deadline outside the lifeboat bounds and keeps the cinematic active', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase, updateWorld } = createUpdateHarness(session);
    const internals = phase as unknown as {
      player: { localPosition: Vector3 };
      ui: { renderEnding: ReturnType<typeof vi.fn> };
    };
    internals.player.localPosition.set(0, internals.player.localPosition.y, 0);
    const exitPointerLock = vi.fn();
    const originalExitPointerLock = Object.getOwnPropertyDescriptor(document, 'exitPointerLock');
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: exitPointerLock,
    });

    try {
      phase.update(0, SCAVENGE_DURATION_SECONDS);

      expect(session.snapshot().status).toBe('failure');
      expect(internals.ui.renderEnding).toHaveBeenCalledWith('sinking', expect.any(Number));
      expect(exitPointerLock).toHaveBeenCalledOnce();

      phase.update(1, 1);

      const [worldTime, , sinking, cameraPosition, simulatePhysics] = updateWorld.mock.calls.at(-1)!;
      expect(worldTime).toBe(SCAVENGE_DURATION_SECONDS + 2);
      expect(sinking.sinkOffset).toBeLessThan(0);
      expect(simulatePhysics).toBe(false);
      expect(cameraPosition.x).toBeCloseTo(44, 3);
      expect(cameraPosition.y).toBeCloseTo(15, 3);
      expect(cameraPosition.z).toBeCloseTo(34, 3);
    } finally {
      if (originalExitPointerLock) {
        Object.defineProperty(document, 'exitPointerLock', originalExitPointerLock);
      } else {
        delete (document as { exitPointerLock?: () => void }).exitPointerLock;
      }
    }
  });

  it('attaches paused barrels and disables their physics when failure starts', () => {
    const session = new ScavengeSession();
    session.start();
    const { phase, attachPhysicsBarrelsToShip, updateWorld } = createUpdateHarness(session);
    const player = (phase as unknown as { player: { localPosition: Vector3 } }).player;
    player.localPosition.set(0, player.localPosition.y, 0);
    const originalExitPointerLock = Object.getOwnPropertyDescriptor(document, 'exitPointerLock');
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: vi.fn(),
    });

    try {
      phase.update(0, SCAVENGE_DURATION_SECONDS);

      expect(attachPhysicsBarrelsToShip).toHaveBeenCalledOnce();
      expect(updateWorld).toHaveBeenLastCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
        expect.any(Vector3),
        false,
      );
    } finally {
      if (originalExitPointerLock) {
        Object.defineProperty(document, 'exitPointerLock', originalExitPointerLock);
      } else {
        delete (document as { exitPointerLock?: () => void }).exitPointerLock;
      }
    }
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

    phase.update(SCAVENGE_DURATION_SECONDS, SCAVENGE_DURATION_SECONDS);

    expect(session.snapshot().status).toBe('failure');
    expect(updateWorld).toHaveBeenLastCalledWith(
      SCAVENGE_DURATION_SECONDS + 1,
      SCAVENGE_DURATION_SECONDS,
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
      const initialPoses = structuredClone(firstPhysics.barrelPoses);
      const initialPositions = firstWorld.physicsBarrels.map((barrel) => barrel.position.clone());
      for (let step = 1; step <= 30; step += 1) {
        firstWorld.update(
          step / 60,
          1 / 60,
          getSinkingState(SCAVENGE_DURATION_SECONDS / 2, SCAVENGE_DURATION_SECONDS),
          new Vector3(),
          true,
        );
      }
      firstWorld.physicsBarrels.forEach((barrel, index) => {
        expect(barrel.position.distanceTo(initialPositions[index]!)).toBeGreaterThan(1e-3);
      });

      game.restart();

      const secondWorld = (phases[1] as unknown as { world: World }).world;
      const secondPhysics = (secondWorld as unknown as {
        scavengePhysics: ScavengePhysics;
      }).scavengePhysics;
      expect(secondWorld).not.toBe(firstWorld);
      expect(secondPhysics).not.toBe(firstPhysics);
      expect(secondWorld.physicsBarrels[0]).not.toBe(firstWorld.physicsBarrels[0]);
      firstWorld.physicsBarrels.forEach((barrel) => expect(barrel.parent).toBeNull());
      secondWorld.physicsBarrels.forEach((barrel) => expect(barrel.parent).not.toBeNull());
      expect(secondPhysics.barrelPoses).toEqual(initialPoses);
    } finally {
      game.dispose();
    }
  });

  it('runs the complete failure timeline and restarts once at a fresh title', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const phases: ScavengePhase[] = [];
    const createScavenge = vi.fn((context, onComplete, onRestart) => {
      const phase = new ScavengePhase(context, onComplete, onRestart);
      phases.push(phase);
      return phase;
    });
    const game = Game.forTest({
      createScavenge,
      createSurvival: () => gamePhase(),
    }, {
      propModels: createTestPropModels(),
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
      physicsMode: 'off',
      sceneRenderer: postProcessingSceneRenderer(),
      mount,
    });

    try {
      const first = phases[0]!;
      const firstInternals = first as unknown as {
        session: ScavengeSession;
        player: { localPosition: Vector3 };
        ending: { stage: string; elapsedSeconds: number };
      };
      firstInternals.session.start();
      firstInternals.player.localPosition.set(0, firstInternals.player.localPosition.y, 0);
      first.setOverlayActive(true);

      first.update(0, SCAVENGE_DURATION_SECONDS);
      expect(firstInternals.ending).toEqual({ stage: 'sinking', elapsedSeconds: 0 });

      first.update(0, SINKING_CINEMATIC_SECONDS);
      expect(firstInternals.ending).toEqual({ stage: 'endingHold', elapsedSeconds: 0 });
      const action = mount.querySelector<HTMLButtonElement>('[data-ending-action]')!;
      expect(action.hidden).toBe(true);

      first.update(0, ENDING_HOLD_SECONDS);
      expect(firstInternals.ending).toEqual({ stage: 'menuReady', elapsedSeconds: 0 });
      expect(action.hidden).toBe(false);

      action.click();
      action.click();

      expect(createScavenge).toHaveBeenCalledTimes(2);
      const fresh = phases[1] as unknown as {
        session: ScavengeSession;
        presentation: string;
        introElapsed: number;
      };
      expect(fresh.session.snapshot()).toMatchObject({
        status: 'idle',
        remainingSeconds: SCAVENGE_DURATION_SECONDS,
      });
      expect(fresh.presentation).toBe('title');
      expect(fresh.introElapsed).toBe(0);
      expect(mount.querySelector('[data-start]')?.classList).toContain('is-visible');
      expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', true);
    } finally {
      game.dispose();
      mount.remove();
    }
  });

  it('renders scavenging through sceneRenderer with current sinking progress', () => {
    const elapsed = SCAVENGE_DURATION_SECONDS * 0.75;
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
      elapsed,
      visualState,
      context: {
        camera,
        sceneRenderer: { render, resize: vi.fn(), dispose: vi.fn() },
      },
    });

    (phase as unknown as { syncVisualState(state: ReturnType<typeof getSinkingState>): void })
      .syncVisualState(getSinkingState(elapsed, SCAVENGE_DURATION_SECONDS));
    phase.render();

    expect(render).toHaveBeenCalledWith(scene, camera, {
      kind: 'scavenge',
      elapsedSeconds: elapsed,
      sinkingProgress: 0.75,
    });
  });

  it('forwards and reports scavenging presentation weather', () => {
    const setPresentationWeather = vi.fn();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      world: { setPresentationWeather },
    });

    phase.setWeatherOverride('rain');

    expect(setPresentationWeather).toHaveBeenLastCalledWith('rain');
    expect(phase.getPresentationWeather()).toBe('rain');

    phase.setWeatherOverride(null);

    expect(setPresentationWeather).toHaveBeenLastCalledWith('calm');
    expect(phase.getPresentationWeather()).toBe('calm');
  });

  it('persists a manual weather override across phase handoff and polls automatic weather', () => {
    const order: string[] = [];
    let complete!: (result: { savedItems: readonly []; elapsedSeconds: number }) => void;
    let scavengeWeather: PresentationWeatherId = 'calm';
    const scavengeSetWeather = vi.fn((id: PresentationWeatherId | null) => {
      order.push(`scavenge-weather:${id}`);
      if (id !== null) scavengeWeather = id;
    });
    const survivalSetWeather = vi.fn((id: PresentationWeatherId | null) => {
      order.push(`survival-weather:${id}`);
    });
    const scavenge = {
      ...gamePhase(),
      update: vi.fn(() => order.push('scavenge-update')),
      render: vi.fn(() => order.push('scavenge-render')),
      setWeatherOverride: scavengeSetWeather,
      getPresentationWeather: vi.fn(() => scavengeWeather),
    };
    const survival = {
      ...gamePhase(),
      resize: vi.fn(() => order.push('survival-resize')),
      start: vi.fn(() => order.push('survival-start')),
      render: vi.fn(() => order.push('survival-render')),
      setWeatherOverride: survivalSetWeather,
      getPresentationWeather: vi.fn(() => 'rain' as const),
    };
    const postProcessingControls: PostProcessingControls = {
      getState: vi.fn(() => ({
        ambientOcclusionAvailable: true,
        ambientOcclusionMode: 'composite' as const,
        ambientOcclusionIntensity: 1,
        ambientOcclusionRadius: 0.5,
      })),
      setAmbientOcclusionMode: vi.fn(),
      setNumeric: vi.fn(),
    };
    const sceneRenderer: SceneRenderer = {
      postProcessingControls,
      render: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(17);
    const mount = document.createElement('main');
    document.body.append(mount);
    const game = Game.forTest({
      createScavenge: (_context, onComplete) => {
        complete = onComplete;
        return scavenge;
      },
      createSurvival: () => survival,
    }, {
      propModels: createTestPropModels(),
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
      sceneRenderer,
      mount,
    });

    try {
      const weather = mount.querySelector<HTMLSelectElement>(
        '[data-presentation-weather]',
      )!;
      const source = mount.querySelector<HTMLOutputElement>(
        '[data-weather-source]',
      )!;
      expect((game as unknown as { weatherOverride: unknown }).weatherOverride).toBeNull();
      expect(weather.value).toBe('calm');
      expect(source.value).toBe('NORMAL');
      expect(scavengeSetWeather).not.toHaveBeenCalled();

      scavengeWeather = 'wind';
      (game as unknown as { handleAnimationFrame(): void }).handleAnimationFrame();
      expect(weather.value).toBe('wind');
      expect(source.value).toBe('EVENT');

      weather.value = 'rain';
      weather.dispatchEvent(new Event('change', { bubbles: true }));
      expect(scavengeSetWeather).toHaveBeenCalledOnce();
      expect(scavengeSetWeather).toHaveBeenLastCalledWith('rain');
      expect(source.value).toBe('FORCED');

      order.length = 0;
      complete({ savedItems: [], elapsedSeconds: 2 });
      expect(survivalSetWeather).toHaveBeenCalledOnce();
      expect(survivalSetWeather).toHaveBeenCalledWith('rain');
      expect(order).toEqual([
        'survival-weather:rain',
        'survival-resize',
        'survival-start',
      ]);

      weather.value = 'fog';
      weather.dispatchEvent(new Event('change', { bubbles: true }));
      expect(survivalSetWeather).toHaveBeenCalledTimes(2);
      expect(survivalSetWeather).toHaveBeenLastCalledWith('fog');
      expect(scavengeSetWeather).toHaveBeenCalledOnce();
    } finally {
      game.dispose();
      requestFrame.mockRestore();
    }
  });

  it('enters selected test events from scavenging and survival with every item', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const scavenge = gamePhase();
    const firstSurvival = gamePhase();
    const secondSurvival = gamePhase();
    const survivalPhases = [firstSurvival, secondSurvival];
    const initialEventIds: Array<string | undefined> = [];
    const createSurvival = vi.fn((
      _context: PhaseContext,
      _result: Readonly<ScavengeResult>,
      _seed: number,
      _onRestart: () => void,
      initialEventId?: string,
    ) => {
      initialEventIds.push(initialEventId);
      return survivalPhases[initialEventIds.length - 1]!;
    });
    const game = Game.forTest({
      createScavenge: () => scavenge,
      createSurvival,
    }, {
      propModels: createTestPropModels(),
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
      sceneRenderer: postProcessingSceneRenderer(),
      mount,
      createSeed: vi.fn()
        .mockReturnValueOnce(11)
        .mockReturnValueOnce(22)
        .mockReturnValueOnce(33),
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    const select = mount.querySelector<HTMLSelectElement>('[data-event-test-select]')!;
    select.value = 'shower-night';
    mount.querySelector<HTMLButtonElement>('[data-event-test-enter]')!.click();

    expect(scavenge.dispose).toHaveBeenCalledOnce();
    expect(createSurvival).toHaveBeenLastCalledWith(
      expect.anything(),
      {
        savedItems: ITEM_IDS.map((type) => ({ instanceId: `${type}-1`, type })),
        elapsedSeconds: 0,
      },
      22,
      expect.any(Function),
      'shower-night',
    );
    expect(firstSurvival.resize).toHaveBeenCalledWith(
      window.innerWidth,
      window.innerHeight,
    );
    expect(firstSurvival.start).toHaveBeenCalledOnce();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    select.value = 'dangerous-waters';
    mount.querySelector<HTMLButtonElement>('[data-event-test-enter]')!.click();

    expect(firstSurvival.dispose).toHaveBeenCalledOnce();
    expect(initialEventIds.at(-1)).toBe('dangerous-waters');
    expect(secondSurvival.start).toHaveBeenCalledOnce();

    expect(() => (
      game as unknown as { enterTestEvent(id: string): void }
    ).enterTestEvent('missing-event')).toThrow(/unknown event test scene/i);
    expect(secondSurvival.dispose).not.toHaveBeenCalled();

    game.dispose();
  });

  it('disposes a new scavenging phase when applying stored weather throws', () => {
    const failure = new Error('scavenging weather failed');
    const initialDispose = vi.fn();
    const failedDispose = vi.fn();
    const failedStart = vi.fn();
    const failedRender = vi.fn();
    let scavengeCount = 0;
    const failedPhase: GamePhase = {
      ...gamePhase(),
      setWeatherOverride: vi.fn(() => { throw failure; }),
      start: failedStart,
      render: failedRender,
      dispose: failedDispose,
    };
    const mount = document.createElement('main');
    document.body.append(mount);
    const game = Game.forTest({
      createScavenge: () => {
        scavengeCount += 1;
        return scavengeCount === 1
          ? { ...gamePhase(), dispose: initialDispose }
          : failedPhase;
      },
      createSurvival: () => gamePhase(),
    }, {
      propModels: createTestPropModels(),
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
      sceneRenderer: postProcessingSceneRenderer(),
      mount,
    });

    const weather = mount.querySelector<HTMLSelectElement>(
      '[data-presentation-weather]',
    )!;
    weather.value = 'rain';
    weather.dispatchEvent(new Event('change', { bubbles: true }));

    expect(() => game.restart()).toThrow(failure);
    game.dispose();

    expect(initialDispose).toHaveBeenCalledOnce();
    expect(failedDispose).toHaveBeenCalledOnce();
    expect(failedStart).not.toHaveBeenCalled();
    expect(failedRender).not.toHaveBeenCalled();
  });

  it('disposes a new survival phase when applying stored weather throws', () => {
    const failure = new Error('survival weather failed');
    const failedDispose = vi.fn();
    const failedStart = vi.fn();
    const failedRender = vi.fn();
    let complete!: (result: { savedItems: readonly []; elapsedSeconds: number }) => void;
    const failedPhase: GamePhase = {
      ...gamePhase(),
      setWeatherOverride: vi.fn(() => { throw failure; }),
      start: failedStart,
      render: failedRender,
      dispose: failedDispose,
    };
    const mount = document.createElement('main');
    document.body.append(mount);
    const game = Game.forTest({
      createScavenge: (_context, onComplete) => {
        complete = onComplete;
        return gamePhase();
      },
      createSurvival: () => failedPhase,
    }, {
      propModels: createTestPropModels(),
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
      sceneRenderer: postProcessingSceneRenderer(),
      mount,
    });

    const weather = mount.querySelector<HTMLSelectElement>(
      '[data-presentation-weather]',
    )!;
    weather.value = 'rain';
    weather.dispatchEvent(new Event('change', { bubbles: true }));

    expect(() => complete({ savedItems: [], elapsedSeconds: 2 })).toThrow(failure);
    game.dispose();

    expect(failedDispose).toHaveBeenCalledOnce();
    expect(failedStart).not.toHaveBeenCalled();
    expect(failedRender).not.toHaveBeenCalled();
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

  it('applies a supplied visual quality preference to the shared scene renderer', () => {
    const setVisualQuality = vi.fn();
    let received!: PhaseContext;
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(),
      resize: vi.fn(),
      setVisualQuality,
      dispose: vi.fn(),
    };
    const preference = createVisualQualityPreference(
      (quality) => sceneRenderer.setVisualQuality?.(quality),
      null,
    );
    const game = Game.forTest({
      createScavenge: (context) => {
        received = context;
        return gamePhase();
      },
      createSurvival: () => gamePhase(),
    }, {
      propModels: createTestPropModels(),
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
      sceneRenderer,
      visualQuality: preference,
    });

    preference.set('high');

    expect(received.visualQuality).toBe(preference);
    expect(setVisualQuality).toHaveBeenCalledWith('high');
    game.dispose();
  });

  it('applies water quality changes to the active phase', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const setWaterQuality = vi.fn();
    let received!: PhaseContext;
    const phase = {
      ...gamePhase(),
      setWaterQuality,
    };
    const game = Game.forTest({
      createScavenge: (context) => {
        received = context;
        return phase;
      },
      createSurvival: () => gamePhase(),
    }, {
      propModels: createTestPropModels(),
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
      mount,
      sceneRenderer: postProcessingSceneRenderer(),
    });
    const high = mount.querySelector<HTMLButtonElement>(
      '[data-water-quality-control] [data-quality="high"]',
    )!;

    high.click();

    expect(received.waterQuality.get()).toBe('high');
    expect(setWaterQuality).toHaveBeenCalledWith('high');
    game.dispose();
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
    const sharedEventModels = eventModels();
    const disposePropModels = vi.spyOn(propModels, 'dispose');
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose');
    const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose');
    const disposeEventModels = vi.spyOn(sharedEventModels, 'dispose');
    const scavengeModels: unknown[] = [];
    const survivalModels: unknown[] = [];
    const scavengeSkyAssets: unknown[] = [];
    const survivalSkyAssets: unknown[] = [];
    const scavengeFurniture: unknown[] = [];
    const survivalFurniture: unknown[] = [];
    const scavengePhysics: unknown[] = [];
    const survivalPhysics: unknown[] = [];
    const scavengeEventModels: unknown[] = [];
    const survivalEventModels: unknown[] = [];
    let complete!: (result: { savedItems: readonly []; elapsedSeconds: number }) => void;
    const game = Game.forTest({
      createScavenge: (context, onComplete) => {
        scavengeModels.push(context.propModels);
        scavengeSkyAssets.push(context.skyAssets);
        scavengeFurniture.push(context.shipFurniture);
        scavengePhysics.push(context.physicsRuntime);
        scavengeEventModels.push(context.eventModels);
        complete = onComplete;
        return gamePhase();
      },
      createSurvival: (context) => {
        survivalModels.push(context.propModels);
        survivalSkyAssets.push(context.skyAssets);
        survivalFurniture.push(context.shipFurniture);
        survivalPhysics.push(context.physicsRuntime);
        survivalEventModels.push(context.eventModels);
        return gamePhase();
      },
    }, {
      propModels,
      shipFurniture,
      skyAssets,
      eventModels: sharedEventModels,
      physicsRuntime,
    });

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
    expect(scavengeEventModels).toEqual([sharedEventModels, sharedEventModels]);
    expect(survivalEventModels).toEqual([sharedEventModels]);
    expect(disposePropModels).not.toHaveBeenCalled();
    expect(disposeShipFurniture).not.toHaveBeenCalled();
    expect(disposeSkyAssets).not.toHaveBeenCalled();
    expect(disposeEventModels).not.toHaveBeenCalled();
    game.dispose();
    expect(disposePropModels).toHaveBeenCalledOnce();
    expect(disposeShipFurniture).toHaveBeenCalledOnce();
    expect(disposeSkyAssets).toHaveBeenCalledOnce();
    expect(disposeEventModels).toHaveBeenCalledOnce();
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
      audio: AudioSystem.silent(),
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
    const scavengeItemCount = createScavengeItemInstances().length;
    expect(internals.world.itemObjects.size).toBe(scavengeItemCount);
    expect(internals.world.itemObjects.has('energyBar-1')).toBe(false);
    expect(firstItems).toHaveLength(scavengeItemCount);
    expect(firstItems).toContain(cannedFood);
    expect(depositTarget).toBe(internals.world.boatDepositTarget);
    expect(firstInstances.size).toBe(scavengeItemCount);
    expect(firstInstances.get('cannedFood-1')).toEqual({
      instanceId: 'cannedFood-1',
      type: 'cannedFood',
    });

    expect(internals.session.pickUp('cannedFood-1')).toBe(true);
    internals.updateInteraction();

    const nextItems = updateInteraction.mock.calls[1]![0];
    const nextInstances = updateInteraction.mock.calls[1]![3];
    expect(nextItems).toHaveLength(scavengeItemCount - 1);
    expect(nextItems).not.toContain(cannedFood);
    expect(nextInstances.has('cannedFood-1')).toBe(false);
    phase.dispose();
    context.audio.dispose();
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
    const hands = scavengeHandsStub();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      disposed: false,
      audio: scavengeAudioStub(),
      hands,
      input: { pointerLocked: true, dispose: disposeInput },
      carry: { reset: resetCarry },
      interaction: { dispose: disposeInteraction },
      world: { dispose: disposeWorld },
      ui: { dispose: disposeUI },
      onPointerLockChange: vi.fn(),
      onVisibilityChange: vi.fn(),
      onKeyDown: vi.fn(),
      onKeyUp: vi.fn(),
    });

    phase.dispose();
    phase.dispose();

    expect(exitPointerLock).toHaveBeenCalledOnce();
    expect(resetCarry).toHaveBeenCalledOnce();
    expect(disposeInput).toHaveBeenCalledOnce();
    expect(disposeInteraction).toHaveBeenCalledOnce();
    expect(hands.dispose).toHaveBeenCalledOnce();
    expect(disposeWorld).toHaveBeenCalledOnce();
    expect(disposeUI).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledTimes(4);
    expect(removeEventListener).toHaveBeenCalledWith('pointerlockchange', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
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
    const sampleFlightWaterHeight = vi.fn().mockReturnValue(17.25);
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
        sampleFlightWaterHeight,
      },
    });

    (phase as unknown as { updateFlight(delta: number, scale: number): void })
      .updateFlight(0.016, 0.75);

    expect(sampleFlightWaterHeight).toHaveBeenCalledWith(4.5, 2, -3, 0.75);
    expect(sampledHeight).toBe(17.25);
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
    const hands = scavengeHandsStub();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      session: { dropCarried },
      audio: scavengeAudioStub(),
      carry: { releaseActive },
      world: { dropItem },
      hands,
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
    expect(hands.playGesture).toHaveBeenCalledWith('ground-drop');
    expect(dropCarried.mock.invocationCallOrder[0]).toBeLessThan(
      hands.playGesture.mock.invocationCallOrder[0]!,
    );
    expect(dropItem.mock.invocationCallOrder[0]).toBeLessThan(
      hands.playGesture.mock.invocationCallOrder[0]!,
    );
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
    const hands = scavengeHandsStub();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      session,
      carry,
      world,
      audio: scavengeAudioStub(),
      hands,
    });

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
    expect(hands.playGesture).not.toHaveBeenCalled();
  });

  it('shows item smoke when pickup succeeds', () => {
    const instance: ItemInstance = {
      instanceId: 'flashlight-1',
      type: 'flashlight',
    };
    const object = new Group();
    const session = { pickUp: vi.fn().mockReturnValue(true) };
    const carry = { pickUp: vi.fn().mockReturnValue(true) };
    const world = {
      itemObjects: new Map([[instance.instanceId, object]]),
      showItemPickupSmoke: vi.fn(),
    };
    const hands = scavengeHandsStub();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      session,
      carry,
      world,
      audio: scavengeAudioStub(),
      hands,
    });

    (phase as unknown as {
      performAction: (action: {
        type: 'pickUp';
        item: ItemInstance;
        prompt: string;
      }) => void;
    }).performAction({
      type: 'pickUp',
      item: instance,
      prompt: 'LEFT CLICK — PICK UP FLASHLIGHT',
    });

    expect(world.showItemPickupSmoke).toHaveBeenCalledWith(instance.instanceId);
    expect(carry.pickUp).toHaveBeenCalledWith(instance, object);
    expect(hands.playGesture).toHaveBeenCalledWith('pickup');
    expect(session.pickUp.mock.invocationCallOrder[0]).toBeLessThan(
      hands.playGesture.mock.invocationCallOrder[0]!,
    );
    expect(world.showItemPickupSmoke.mock.invocationCallOrder[0]).toBeLessThan(
      hands.playGesture.mock.invocationCallOrder[0]!,
    );
    expect(carry.pickUp.mock.invocationCallOrder[0]).toBeLessThan(
      hands.playGesture.mock.invocationCallOrder[0]!,
    );
  });

  it('signals boat deposit only after the deposit succeeds', () => {
    const hands = scavengeHandsStub();
    const session = { saveCarriedBundle: vi.fn().mockReturnValue([{ instanceId: 'flareGun-1', type: 'flareGun' }]) };
    const carry = { releaseAll: vi.fn() };
    const world = { saveItems: vi.fn() };
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      session,
      carry,
      world,
      hands,
      audio: scavengeAudioStub(),
    });

    (phase as unknown as {
      performAction: (action: { type: 'depositBundle'; prompt: string }) => void;
    }).performAction({ type: 'depositBundle', prompt: 'STORE' });

    expect(hands.playGesture).toHaveBeenCalledWith('boat-deposit');
    expect(session.saveCarriedBundle.mock.invocationCallOrder[0]).toBeLessThan(
      hands.playGesture.mock.invocationCallOrder[0]!,
    );
    expect(world.saveItems.mock.invocationCallOrder[0]).toBeLessThan(
      hands.playGesture.mock.invocationCallOrder[0]!,
    );
  });

  it('does not signal gestures when pickup or deposit fails', () => {
    const instance = { instanceId: 'flashlight-1', type: 'flashlight' } as const;
    const hands = scavengeHandsStub();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      session: {
        pickUp: vi.fn().mockReturnValue(false),
        saveCarriedBundle: vi.fn().mockReturnValue(null),
      },
      carry: { releaseAll: vi.fn() },
      world: { itemObjects: new Map([[instance.instanceId, new Group()]]), saveItems: vi.fn() },
      hands,
      audio: scavengeAudioStub(),
    });

    (phase as unknown as {
      performAction: (action: ContextAction) => void;
    }).performAction({ type: 'pickUp', item: instance, prompt: 'PICK UP' });
    (phase as unknown as {
      performAction: (action: ContextAction) => void;
    }).performAction({ type: 'depositBundle', prompt: 'STORE' });

    expect(hands.playGesture).not.toHaveBeenCalled();
  });

  it('reports pointer-lock rejection through the UI', async () => {
    const showPointerLockError = vi.fn();
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      disposed: false,
      audio: scavengeAudioStub(),
      input: { requestPointerLock: vi.fn().mockResolvedValue(false) },
      session: { snapshot: () => ({ status: 'idle' }) },
      ui: { showPointerLockError },
    });

    await (phase as unknown as { requestPointerLock: () => Promise<void> }).requestPointerLock();

    expect(showPointerLockError).toHaveBeenCalledOnce();
  });
});
