import { describe, expect, it, vi } from 'vitest';
import type { FocusedEventChoiceResolution } from '../src/survival/FocusedEventFlow';
import {
  FocusedEventFlow,
  type FocusedEventFlowDependencies,
} from '../src/survival/FocusedEventFlow';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const driftingChoices = [
  { id: 'retrieve', label: 'Retrieve', unavailableReason: null, instanceId: null },
  {
    id: 'sleep', label: 'Leave', unavailableReason: null, instanceId: null,
    dismisses: true,
  },
] as const;

function createRig(eventId: 'drifting-supplies' | 'wreckage' = 'drifting-supplies') {
  const calls: string[] = [];
  let generation = 1;
  let pending = true;
  let resolution: FocusedEventChoiceResolution = {
    accepted: true,
    playAnimation: async () => { calls.push('animate'); },
    afterAnimation: async () => { calls.push('after-animation'); },
    beforeReturn: async () => { calls.push('before-return'); },
    afterReturn: async () => { calls.push('after-return'); },
    clearEvent: () => { calls.push('clear-event'); },
    renderSnapshot: () => { calls.push('render'); return false; },
    presentTerminal: () => { calls.push('terminal'); },
  };
  const world = {
    enterFocusedEventView: vi.fn(async (id: string) => { calls.push(`enter:${id}`); }),
    exitFocusedEventView: vi.fn(async () => { calls.push('exit'); }),
    projectEventInteractionBounds: vi.fn(() => null),
  };
  const ui = {
    setEventSelection: vi.fn(),
    showFocusedEvent: vi.fn(() => { calls.push('show-focus'); }),
    hideFocusedEvent: vi.fn(() => { calls.push('hide-focus'); }),
    updateFocusedEventTarget: vi.fn(),
    playEventChoiceBeat: vi.fn(async (id: string) => { calls.push(`beat:${id}`); }),
    restoreCommandFocus: vi.fn(() => { calls.push('restore-focus'); }),
  };
  const resolveChoice = vi.fn((choice: { id: string; instanceId: string | null }) => {
    calls.push(`resolve:${choice.id}:${choice.instanceId ?? 'none'}`);
    return resolution;
  });
  const waitForVisibilityResume = vi.fn(async () => true);
  const setBusy = vi.fn((busy: boolean) => { calls.push(busy ? 'busy' : 'ready'); });
  const setEventResolutionActive = vi.fn((active: boolean) => {
    calls.push(active ? 'event-resolving' : 'event-choosing');
  });
  const flow = new FocusedEventFlow({
    world,
    ui,
    audio: { confirm: vi.fn(() => { calls.push('confirm'); }) },
    setBusy,
    setEventResolutionActive,
    isPendingEvent: vi.fn((id: string) => pending && id === eventId),
    resolveChoice,
    waitForVisibilityResume,
    captureLifecycleGeneration: vi.fn(() => generation),
    isLifecycleGenerationCurrent: vi.fn((value: number) => value === generation),
  } as unknown as FocusedEventFlowDependencies);
  return {
    flow, calls, world, ui, resolveChoice, waitForVisibilityResume,
    setBusy, setEventResolutionActive,
    setResolution: (value: FocusedEventChoiceResolution) => { resolution = value; },
    advanceGeneration: () => { generation += 1; },
    setPending: (value: boolean) => { pending = value; },
  };
}

describe('FocusedEventFlow', () => {
  it('enters the focused camera before it shows choices', async () => {
    const rig = createRig();
    await rig.flow.enter('drifting-supplies', driftingChoices);
    expect(rig.calls).toEqual(['busy', 'enter:drifting-supplies', 'show-focus', 'ready']);
  });

  it('rejects an ID and instance pair that was not rendered', async () => {
    const rig = createRig();
    await rig.flow.enter('drifting-supplies', driftingChoices);
    await rig.flow.choose({ id: 'retrieve', instanceId: 'scubaSet-1' });
    expect(rig.resolveChoice).not.toHaveBeenCalled();
  });

  it('restores the focus after a rejected resolution', async () => {
    const rig = createRig();
    rig.setResolution({ accepted: false });
    await rig.flow.enter('drifting-supplies', driftingChoices);
    await rig.flow.choose({ id: 'retrieve', instanceId: null });
    expect(rig.calls).toContain('event-choosing');
    expect(rig.ui.showFocusedEvent).toHaveBeenCalledTimes(2);
  });

  it('makes an in-flight entry inert after cleanup', async () => {
    const rig = createRig();
    const pending = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(pending.promise);
    const work = rig.flow.enter('drifting-supplies', driftingChoices);
    await Promise.resolve();
    rig.flow.clear();
    pending.resolve();
    await work;
    expect(rig.ui.showFocusedEvent).not.toHaveBeenCalled();
  });

  it('releases busy when the pending event changes after camera entry', async () => {
    const rig = createRig();
    const entry = deferred();
    const exit = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(entry.promise);
    rig.world.exitFocusedEventView.mockReturnValueOnce(exit.promise);
    const work = rig.flow.enter('drifting-supplies', driftingChoices);
    await Promise.resolve();

    rig.setPending(false);
    entry.resolve();
    await Promise.resolve();

    expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce();
    expect(rig.ui.showFocusedEvent).not.toHaveBeenCalled();
    expect(rig.setBusy).toHaveBeenLastCalledWith(true);

    exit.resolve();
    await work;

    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    rig.setPending(true);
    await rig.flow.enter('drifting-supplies', driftingChoices);
    expect(rig.ui.showFocusedEvent).toHaveBeenCalledOnce();
  });

  it('does not unlock newer work after cleanup supersedes an entry', async () => {
    const rig = createRig();
    const entry = deferred();
    const staleExit = deferred();
    const newerEntry = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(entry.promise);
    rig.world.exitFocusedEventView.mockReturnValueOnce(staleExit.promise);
    const staleWork = rig.flow.enter('drifting-supplies', driftingChoices);
    await Promise.resolve();

    rig.setPending(false);
    entry.resolve();
    await vi.waitFor(() => expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce());

    rig.flow.clear();
    rig.setPending(true);
    rig.setBusy.mockClear();
    rig.ui.hideFocusedEvent.mockClear();
    rig.world.enterFocusedEventView.mockReturnValueOnce(newerEntry.promise);
    const newerWork = rig.flow.enter('drifting-supplies', driftingChoices);
    await Promise.resolve();

    staleExit.resolve();
    await staleWork;

    expect(rig.setBusy).toHaveBeenCalledExactlyOnceWith(true);
    expect(rig.ui.hideFocusedEvent).not.toHaveBeenCalled();
    expect(rig.ui.showFocusedEvent).not.toHaveBeenCalled();

    newerEntry.resolve();
    await newerWork;
    expect(rig.ui.showFocusedEvent).toHaveBeenCalledOnce();
    await rig.flow.choose({ id: 'retrieve', instanceId: null });
    expect(rig.resolveChoice).toHaveBeenCalledOnce();
  });

  it('makes stale lifecycle work inert', async () => {
    const rig = createRig();
    const pending = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(pending.promise);
    const work = rig.flow.enter('drifting-supplies', driftingChoices);
    await Promise.resolve();
    rig.advanceGeneration();
    pending.resolve();
    await work;
    expect(rig.ui.showFocusedEvent).not.toHaveBeenCalled();
  });

  it('waits for visibility before it resolves a choice', async () => {
    const rig = createRig();
    const resume = deferred<boolean>();
    rig.waitForVisibilityResume.mockReturnValueOnce(resume.promise);
    await rig.flow.enter('drifting-supplies', driftingChoices);

    const choosing = rig.flow.choose({ id: 'retrieve', instanceId: null });
    await Promise.resolve();
    expect(rig.resolveChoice).not.toHaveBeenCalled();
    resume.resolve(true);
    await choosing;

    expect(rig.resolveChoice).toHaveBeenCalledOnce();
  });

  it('returns to the boat by resolving the decline choice', async () => {
    const rig = createRig();
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.calls.length = 0;
    await rig.flow.back();
    expect(rig.resolveChoice).toHaveBeenCalledExactlyOnceWith({
      id: 'sleep', instanceId: null,
    });
    expect(rig.calls).toContain('clear-event');
    expect(rig.calls).toContain('exit');
    expect(rig.calls.at(-1)).toBe('restore-focus');
  });

  it('makes a pending choice inert after external cleanup', async () => {
    const rig = createRig();
    const animation = deferred();
    rig.setResolution({
      accepted: true,
      playAnimation: async () => animation.promise,
      afterAnimation: async () => undefined,
      beforeReturn: async () => undefined,
      afterReturn: async () => undefined,
      clearEvent: vi.fn(),
      renderSnapshot: () => false,
      presentTerminal: vi.fn(),
    });
    await rig.flow.enter('drifting-supplies', driftingChoices);
    const work = rig.flow.choose({ id: 'retrieve', instanceId: null });
    await Promise.resolve();
    rig.flow.clear();
    animation.resolve();
    await work;
    expect(rig.world.exitFocusedEventView).not.toHaveBeenCalled();
  });

  it('clears an open focus before another entry', async () => {
    const rig = createRig();
    await rig.flow.enter('drifting-supplies', driftingChoices);

    rig.flow.clear();
    await rig.flow.enter('drifting-supplies', driftingChoices);

    expect(rig.world.enterFocusedEventView).toHaveBeenCalledTimes(2);
  });

  it('makes a stale camera return inert', async () => {
    const rig = createRig();
    const returning = deferred();
    rig.world.exitFocusedEventView.mockReturnValueOnce(returning.promise);
    await rig.flow.enter('drifting-supplies', driftingChoices);

    const work = rig.flow.choose({ id: 'retrieve', instanceId: null });
    await Promise.resolve();
    await Promise.resolve();
    rig.advanceGeneration();
    returning.resolve();
    await work;

    expect(rig.calls).not.toContain('clear-event');
  });

  it('becomes inert after disposal', async () => {
    const rig = createRig();
    const entry = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(entry.promise);
    const work = rig.flow.enter('drifting-supplies', driftingChoices);
    await Promise.resolve();

    rig.flow.dispose();
    entry.resolve();
    await work;
    await rig.flow.enter('drifting-supplies', driftingChoices);
    await rig.flow.choose({ id: 'retrieve', instanceId: null });
    await rig.flow.back();

    expect(rig.resolveChoice).not.toHaveBeenCalled();
  });
});
