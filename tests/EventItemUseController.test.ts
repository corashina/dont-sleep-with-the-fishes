// Importance: 10/10 (scaled from 5/5). Protects the event item use state machine and cancellation cleanup.
import { describe, expect, it, vi } from 'vitest';
import { Group, Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { ItemInstanceId } from '../src/game/ItemState';
import type {
  BoatSupplyDisplay,
  BorrowedSupplyActor,
} from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import {
  EventItemUseController,
  type EventItemUseRequest,
} from '../src/survival/EventItemUseController';
import { eventItemUseDuration } from '../src/survival/eventItemUseChoreography';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';

function request(
  instanceId: ItemInstanceId = 'flashlight-1' as ItemInstanceId,
  aimTarget: Object3D | null = null,
): EventItemUseRequest {
  return {
    eventId: 'flowers',
    choiceId: 'flashlight',
    instanceId,
    itemId: 'flashlight',
    context: 'flashlight-signal',
    aimTarget,
  };
}

function result(
  instanceId: ItemInstanceId,
  changes: Partial<Pick<
    EventOutcomePresentation,
    'brokenInstanceIds' | 'lostInstanceIds' | 'consumedInstanceIds'
  >> = {},
): EventOutcomePresentation {
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Done.',
      deltas: {},
      cue: 'none',
    },
    resourceDeltas: {},
    gainedInstanceIds: [],
    brokenInstanceIds: [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: instanceId,
    selectedCondition: 'usable',
    targetInstanceId: null,
    ...changes,
  };
}

function setup() {
  const root = new Group();
  const actor: BorrowedSupplyActor = {
    instanceId: 'flashlight-1' as ItemInstanceId,
    root,
    applyPose: vi.fn(),
    releaseOnNextSync: vi.fn(),
    release: vi.fn(),
  };
  const supplies = {
    borrowEventActor: vi.fn(() => actor),
    stowEventItemUntilDay: vi.fn(),
  } as unknown as BoatSupplyDisplay;
  const adapter = new EventItemUseAdapter(
    new PerspectiveCamera(),
    new EventItemEffects(),
  );
  const clear = vi.spyOn(adapter, 'clear');
  const controller = new EventItemUseController(supplies, adapter);
  return { actor, adapter, clear, controller, supplies };
}

describe('EventItemUseController', () => {
  it('holds a borrowed actor after use, then recovers and stows it', async () => {
    const { actor, adapter, clear, controller, supplies } = setup();
    const use = controller.play(request());

    controller.update(10);
    await expect(use).resolves.toBe(true);
    expect(actor.release).not.toHaveBeenCalled();

    const reaction = controller.react(result(actor.instanceId));
    controller.update(0.35);
    expect(actor.root.visible).toBe(true);
    controller.update(10);
    await reaction;
    const stowedPose = (actor.applyPose as ReturnType<typeof vi.fn>)
      .mock.calls.at(-2)![0];

    expect(actor.root.visible).toBe(false);
    expect(stowedPose.x).toBeCloseTo(0);
    expect(stowedPose.y).toBeCloseTo(0);
    expect(stowedPose.z).toBeCloseTo(0);
    expect(supplies.stowEventItemUntilDay).toHaveBeenCalledExactlyOnceWith(actor.instanceId);
    expect(clear).toHaveBeenCalledBefore(actor.release as ReturnType<typeof vi.fn>);
    expect(actor.release).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it('returns a recovered bucket to the boat instead of stowing it', async () => {
    const { actor, adapter, controller, supplies } = setup();
    const use = controller.play({
      ...request(actor.instanceId),
      eventId: 'leak',
      choiceId: 'bucket',
      itemId: 'bucket',
      context: 'bucket-scoop',
    });

    controller.update(10);
    await expect(use).resolves.toBe(true);
    const reaction = controller.react(result(actor.instanceId));
    controller.update(10);
    await reaction;

    expect(supplies.stowEventItemUntilDay).not.toHaveBeenCalled();
    expect(actor.release).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it('tracks a moving aim target while the completed use remains held', async () => {
    const { actor, adapter, controller } = setup();
    const target = new Object3D();
    target.position.set(2, 0.4, -4);
    const use = controller.play(request(actor.instanceId, target));
    controller.update(10);
    await use;
    const initialForward = new Vector3(1, 0, 0)
      .applyQuaternion(actor.root.quaternion)
      .normalize();

    target.position.set(-3, 1.2, -2);
    controller.update(0.1);

    const actorPosition = actor.root.getWorldPosition(new Vector3());
    const expectedDirection = target.position.clone()
      .sub(actorPosition)
    expectedDirection.y = 0;
    expectedDirection.normalize();
    const heldForward = new Vector3(1, 0, 0)
      .applyQuaternion(actor.root.quaternion)
      .normalize();
    expect(heldForward.angleTo(expectedDirection)).toBeLessThan(1e-6);
    expect(heldForward.y).toBeCloseTo(0);
    expect(heldForward.angleTo(initialForward)).toBeGreaterThan(0.1);

    controller.clear('day');
    adapter.dispose();
  });

  it('fires the shotgun action cue once at the keyed shot frame', async () => {
    const { actor, adapter, controller } = setup();
    const onAction = vi.fn();
    const use = controller.play({
      ...request(actor.instanceId),
      itemId: 'shotgun',
      context: 'shotgun-fire',
      onAction,
    });
    const duration = eventItemUseDuration('shotgun-fire');

    expect(onAction).not.toHaveBeenCalled();
    controller.update(duration * 0.45);
    expect(onAction).not.toHaveBeenCalled();
    controller.update(duration * 0.02);
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith(0);
    controller.update(duration);
    await use;
    expect(onAction).toHaveBeenCalledOnce();

    controller.clear('day');
    adapter.dispose();
  });

  it('fires the tape sound cue halfway through its animation', async () => {
    const { actor, adapter, controller } = setup();
    const onAction = vi.fn();
    const use = controller.play({
      ...request(actor.instanceId),
      choiceId: 'ductTape',
      itemId: 'ductTape',
      context: 'tape-stretch',
      onAction,
    });
    const duration = eventItemUseDuration('tape-stretch');

    controller.update(duration * 0.49);
    expect(onAction).not.toHaveBeenCalled();
    controller.update(duration * 0.02);
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith(0);
    controller.update(duration);
    await use;
    expect(onAction).toHaveBeenCalledOnce();

    controller.clear('day');
    adapter.dispose();
  });

  it('fires all nine flashlight Morse cues', async () => {
    const { actor, adapter, controller } = setup();
    const onAction = vi.fn();
    const use = controller.play({
      ...request(actor.instanceId),
      onAction,
    });

    controller.update(eventItemUseDuration('flashlight-signal'));
    await use;

    expect(onAction).toHaveBeenCalledTimes(9);
    expect(onAction.mock.calls.map(([cueIndex]) => cueIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    controller.clear('day');
    adapter.dispose();
  });

  it.each([
    ['lost', { lostInstanceIds: ['flashlight-1' as ItemInstanceId] }],
    ['consumed', { consumedInstanceIds: ['flashlight-1' as ItemInstanceId] }],
  ])('departs and releases a %s item once', async (_condition, changes) => {
    const { actor, adapter, controller, supplies } = setup();
    const use = controller.play(request());
    controller.update(10);
    await use;

    const reaction = controller.react(result(actor.instanceId, changes));
    controller.update(10);
    await reaction;

    expect(actor.root.visible).toBe(false);
    expect(supplies.stowEventItemUntilDay).toHaveBeenCalledExactlyOnceWith(actor.instanceId);
    expect(actor.release).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it('stows a broken item after its outcome motion', async () => {
    const { actor, adapter, controller, supplies } = setup();
    const use = controller.play(request());
    controller.update(10);
    await use;

    const reaction = controller.react(result(actor.instanceId, {
      brokenInstanceIds: [actor.instanceId],
    }));
    controller.update(10);
    await reaction;

    expect(supplies.stowEventItemUntilDay).toHaveBeenCalledExactlyOnceWith(actor.instanceId);
    expect(actor.release).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it('stows and releases a night item when use is cancelled', async () => {
    const { actor, adapter, controller, supplies } = setup();
    const use = controller.play(request());

    controller.settleForVisibilityChange('night');
    await expect(use).resolves.toBe(true);

    expect(supplies.stowEventItemUntilDay).toHaveBeenCalledExactlyOnceWith(actor.instanceId);
    expect(actor.release).toHaveBeenCalledOnce();
    adapter.dispose();
  });
});
