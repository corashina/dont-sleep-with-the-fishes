// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { Box3, Group, Vector3 } from 'three';
import { ScavengeSession } from '../src/game/ScavengeSession';
import type { ItemInstance } from '../src/game/ItemState';
import { ScavengePhase } from '../src/phases/ScavengePhase';

describe('ScavengePhase lifecycle integration', () => {
  it('adapts a type-keyed world prop to its first available stable instance', () => {
    const session = new ScavengeSession();
    session.start();
    const cannedFood = new Group();
    cannedFood.userData.itemId = 'cannedFood';
    const lifeboat = new Group();
    const updateInteraction = vi.fn((_items, _lifeboat, instances: ReadonlyMap<string, unknown>) => ({
      target: 'item' as const,
      targetItem: instances.get('cannedFood-1'),
    }));
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      session,
      world: {
        itemObjects: new Map([['cannedFood', cannedFood]]),
        lifeboat,
        evacuationPoint: new Vector3(50, 0, 0),
      },
      interaction: { update: updateInteraction },
      carry: { activeInstance: null, flightActive: false },
      player: { localPosition: new Vector3() },
      input: { consumeInteract: () => false },
      contextAction: { type: 'none', prompt: '' },
    });

    (phase as unknown as { updateInteraction: () => void }).updateInteraction();

    const instances = updateInteraction.mock.calls[0]![2] as ReadonlyMap<string, unknown>;
    expect(cannedFood.userData.instanceId).toBe('cannedFood-1');
    expect(instances.get('cannedFood-1')).toEqual({
      instanceId: 'cannedFood-1', type: 'cannedFood',
    });
    expect((phase as unknown as { contextAction: unknown }).contextAction).toEqual({
      type: 'pickUp',
      item: { instanceId: 'cannedFood-1', type: 'cannedFood' },
      prompt: 'E — PICK UP CANNED FOOD',
    });
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
    session.pickUp('flareGun');
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

    expect(session.snapshot().carriedItem).toBe('flareGun');
    expect(loseItem).not.toHaveBeenCalled();
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
