// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { Box3, Group, PerspectiveCamera, Vector3 } from 'three';
import type { GamePhase, PhaseContext } from '../src/app/GamePhase';
import { Game } from '../src/Game';
import { ScavengeSession } from '../src/game/ScavengeSession';
import type { ItemInstance } from '../src/game/ItemState';
import { InteractionSystem } from '../src/interaction/InteractionSystem';
import { ScavengePhase } from '../src/phases/ScavengePhase';
import { World } from '../src/world/World';
import { createTestPropModels } from './helpers/propModels';

function gamePhase(): GamePhase {
  return {
    start: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('ScavengePhase lifecycle integration', () => {
  it('shares one prop model library across phase completion and restart', () => {
    const propModels = createTestPropModels();
    const disposePropModels = vi.spyOn(propModels, 'dispose');
    const scavengeModels: unknown[] = [];
    const survivalModels: unknown[] = [];
    let complete!: (result: { savedItems: readonly []; elapsedSeconds: number }) => void;
    const game = Game.forTest({
      createScavenge: (context, onComplete) => {
        scavengeModels.push(context.propModels);
        complete = onComplete;
        return gamePhase();
      },
      createSurvival: (context) => {
        survivalModels.push(context.propModels);
        return gamePhase();
      },
    }, { propModels });

    game.start();
    complete({ savedItems: [], elapsedSeconds: 3 });
    game.restart();

    expect(scavengeModels).toHaveLength(2);
    expect(scavengeModels[0]).toBe(propModels);
    expect(scavengeModels[1]).toBe(propModels);
    expect(survivalModels).toHaveLength(1);
    expect(survivalModels[0]).toBe(propModels);
    expect(disposePropModels).not.toHaveBeenCalled();
    game.dispose();
    expect(disposePropModels).toHaveBeenCalledOnce();
  });

  it('binds all real world instances to interaction and excludes an unavailable prop', () => {
    const propModels = createTestPropModels();
    const context = {
      mount: document.createElement('main'),
      camera: new PerspectiveCamera(70, 1, 0.1, 100),
      renderer: { domElement: document.createElement('canvas') },
      reducedMotion: { matches: false },
      propModels,
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
    const firstInstances = updateInteraction.mock.calls[0]![2];
    const cannedFood = internals.world.itemObjects.get('cannedFood-1')!;
    expect(internals.world.itemObjects.size).toBe(14);
    expect(firstItems).toHaveLength(14);
    expect(firstItems).toContain(cannedFood);
    expect(firstInstances.size).toBe(14);
    expect(firstInstances.get('cannedFood-1')).toEqual({
      instanceId: 'cannedFood-1',
      type: 'cannedFood',
    });

    expect(internals.session.pickUp('cannedFood-1')).toBe(true);
    internals.updateInteraction();

    const nextItems = updateInteraction.mock.calls[1]![0];
    const nextInstances = updateInteraction.mock.calls[1]![2];
    expect(nextItems).toHaveLength(13);
    expect(nextItems).not.toContain(cannedFood);
    expect(nextInstances.has('cannedFood-1')).toBe(false);
    phase.dispose();
    propModels.dispose();
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

  it.each([
    ['onSaved', 'saveCarried', 'saveItem'],
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
          snapshot: () => ({ savedCount: 2 }),
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
      expect(worldResult).toHaveBeenCalledWith(
        worldMethod === 'saveItem' ? instance : instance.instanceId,
      );
    },
  );

  it('handles capacity rejection without mutating gameplay or world state', () => {
    const session = { pickUp: vi.fn(), evacuate: vi.fn() };
    const carry = { pickUp: vi.fn(), throw: vi.fn(), drop: vi.fn() };
    const world = {
      itemObjects: new Map(),
      saveItem: vi.fn(),
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
    expect(carry.throw).not.toHaveBeenCalled();
    expect(carry.drop).not.toHaveBeenCalled();
    expect(world.saveItem).not.toHaveBeenCalled();
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
