// Importance: 10/10 (scaled from 5/5). Protects exact routing and dedicated event scene ownership.
import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EventPresentationCoordinator } from '../src/survival/EventPresentationCoordinator';
import type { DedicatedEventId } from '../src/survival/eventPresentationRoutes';
import type {
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../src/survival/eventPresentationTypes';

function fakePresentation(eventId: DedicatedEventId) {
  return {
    eventId,
    worldRoot: new Group(),
    boatRoot: new Group(),
    itemAimTarget: new Group(),
    stage: vi.fn<(context: EventSceneContext) => void>(),
    reveal: vi.fn<() => Promise<void>>().mockResolvedValue(),
    skip: vi.fn<() => void>(),
    playItemUse: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    react: vi.fn<() => Promise<void>>().mockResolvedValue(),
    update: vi.fn<(time: number, delta: number) => void>(),
    settleForVisibilityChange: vi.fn<() => void>(),
    clear: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
  } satisfies DedicatedEventPresentation;
}

const context = (
  eventId: DedicatedEventId,
  targetInstanceId: EventSceneContext['targetInstanceId'] = null,
): EventSceneContext => ({
  eventId,
  targetInstanceId,
  variantSeed: 42,
});

const outcome: EventOutcomePresentation = {
  outcome: {
    accepted: true,
    code: 'event-resolved',
    message: 'Safe.',
    deltas: {},
    cue: 'none',
  },
  resourceDeltas: {},
  gainedInstanceIds: [],
  brokenInstanceIds: [],
  lostInstanceIds: [],
  consumedInstanceIds: [],
  selectedInstanceId: null,
  selectedCondition: null,
  targetInstanceId: null,
};

describe('EventPresentationCoordinator', () => {
  it('registers exact event IDs and attaches each module below owned roots', () => {
    const leak = fakePresentation('leak');
    const snatcher = fakePresentation('snatcher');
    const coordinator = new EventPresentationCoordinator([leak, snatcher]);

    expect(coordinator.handles('leak')).toBe(true);
    expect(coordinator.handles('shower-night')).toBe(false);
    expect(leak.worldRoot.parent).toBe(coordinator.worldRoot);
    expect(leak.boatRoot.parent).toBe(coordinator.boatRoot);
    expect(snatcher.worldRoot.parent).toBe(coordinator.worldRoot);
    expect(snatcher.boatRoot.parent).toBe(coordinator.boatRoot);
  });

  it('clears the prior route and stages only the selected module', () => {
    const leak = fakePresentation('leak');
    const snatcher = fakePresentation('snatcher');
    const coordinator = new EventPresentationCoordinator([leak, snatcher]);

    expect(coordinator.stage(context('leak'))).toBe(true);
    const snatcherContext = context('snatcher', 'map-1');
    expect(coordinator.stage(snatcherContext)).toBe(true);

    expect(leak.stage).toHaveBeenCalledOnce();
    expect(leak.clear).toHaveBeenCalledOnce();
    expect(snatcher.stage).toHaveBeenCalledExactlyOnceWith(snatcherContext);
    expect(snatcher.clear).not.toHaveBeenCalled();
  });

  it('returns the stable aim target from the active route', () => {
    const leak = fakePresentation('leak');
    const coordinator = new EventPresentationCoordinator([leak]);

    expect(coordinator.itemAimTarget()).toBeNull();
    coordinator.stage(context('leak'));
    expect(coordinator.itemAimTarget()).toBe(leak.itemAimTarget);
    coordinator.clear();
    expect(coordinator.itemAimTarget()).toBeNull();
  });

  it('keeps the active route when an unknown event reaches stage', () => {
    const leak = fakePresentation('leak');
    const coordinator = new EventPresentationCoordinator([leak]);
    coordinator.stage(context('leak'));

    const unknown = {
      eventId: 'shower-night',
      targetInstanceId: null,
      variantSeed: 9,
    } as unknown as EventSceneContext;

    expect(coordinator.stage(unknown)).toBe(false);
    coordinator.update(3, 0.25);
    expect(leak.clear).not.toHaveBeenCalled();
    expect(leak.update).toHaveBeenCalledExactlyOnceWith(3, 0.25);
  });

  it('routes reveal, skip, item use, reaction, update, and hidden settling to the active module', async () => {
    const leak = fakePresentation('leak');
    const snatcher = fakePresentation('snatcher');
    const coordinator = new EventPresentationCoordinator([leak, snatcher]);
    coordinator.stage(context('snatcher'));

    await expect(coordinator.reveal()).resolves.toBeUndefined();
    coordinator.skip();
    await expect(coordinator.playItemUse('map', 'map-1')).resolves.toBe(true);
    await expect(coordinator.react(outcome)).resolves.toBeUndefined();
    coordinator.update(4, 0.5);
    coordinator.settleForVisibilityChange();

    expect(snatcher.reveal).toHaveBeenCalledOnce();
    expect(snatcher.skip).toHaveBeenCalledOnce();
    expect(snatcher.playItemUse).toHaveBeenCalledExactlyOnceWith('map', 'map-1');
    expect(snatcher.react).toHaveBeenCalledExactlyOnceWith(outcome);
    expect(snatcher.update).toHaveBeenCalledExactlyOnceWith(4, 0.5);
    expect(snatcher.settleForVisibilityChange).toHaveBeenCalledOnce();
    expect(leak.reveal).not.toHaveBeenCalled();
    expect(leak.skip).not.toHaveBeenCalled();
    expect(leak.update).not.toHaveBeenCalled();
  });

  it('clears the active route and makes inactive calls safe', async () => {
    const leak = fakePresentation('leak');
    const coordinator = new EventPresentationCoordinator([leak]);
    coordinator.stage(context('leak'));

    coordinator.clear();
    coordinator.clear();
    coordinator.update(1, 1);
    coordinator.settleForVisibilityChange();
    coordinator.skip();

    expect(leak.clear).toHaveBeenCalledOnce();
    expect(leak.update).not.toHaveBeenCalled();
    expect(leak.settleForVisibilityChange).not.toHaveBeenCalled();
    expect(leak.skip).not.toHaveBeenCalled();
    await expect(coordinator.reveal()).resolves.toBeUndefined();
    await expect(coordinator.playItemUse('none', 'map-1')).resolves.toBe(false);
    await expect(coordinator.react(outcome)).resolves.toBeUndefined();
  });

  it('disposes every module and both owned roots once', () => {
    const worldParent = new Group();
    const boatParent = new Group();
    const leak = fakePresentation('leak');
    const snatcher = fakePresentation('snatcher');
    const coordinator = new EventPresentationCoordinator([leak, snatcher]);
    worldParent.add(coordinator.worldRoot);
    boatParent.add(coordinator.boatRoot);
    coordinator.stage(context('leak'));

    coordinator.dispose();
    coordinator.dispose();

    expect(leak.clear).toHaveBeenCalledOnce();
    expect(leak.dispose).toHaveBeenCalledOnce();
    expect(snatcher.dispose).toHaveBeenCalledOnce();
    expect(coordinator.worldRoot.parent).toBeNull();
    expect(coordinator.boatRoot.parent).toBeNull();
    expect(coordinator.worldRoot.children).toHaveLength(0);
    expect(coordinator.boatRoot.children).toHaveLength(0);
  });
});
