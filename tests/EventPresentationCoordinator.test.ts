// Importance: 10/10 (scaled from 5/5). Protects exact routing and dedicated event scene ownership.
import { Group } from 'three';
import { describe,expect,it,vi } from 'vitest';
import { EventPresentationCoordinator } from '../src/survival/EventPresentationCoordinator';
import type { DedicatedEventId } from '../src/survival/eventPresentationRoutes';
import type {
  DedicatedEventPresentation,EventSceneContext
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

describe('EventPresentationCoordinator', () => {

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
