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

  it('keeps Drifting Loot animation event-owned', async () => {
    const rig = createRig();
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.calls.length = 0;
    await rig.flow.choose({ id: 'retrieve', instanceId: null });
    expect(rig.calls).toEqual([
      'confirm', 'event-resolving', 'busy', 'beat:retrieve', 'resolve:retrieve:none',
      'hide-focus', 'animate', 'after-animation', 'before-return', 'exit', 'clear-event', 'render', 'after-return', 'ready', 'restore-focus',
    ]);
  });

  it('uses the Wreckage resolution hook order', async () => {
    const rig = createRig('wreckage');
    const choices = [{ id: 'dive', label: 'Dive', unavailableReason: null, instanceId: 'scubaSet-1' }] as const;
    await rig.flow.enter('wreckage', choices);
    rig.calls.length = 0;
    await rig.flow.choose({ id: 'dive', instanceId: 'scubaSet-1' });
    expect(rig.calls).toEqual([
      'confirm', 'event-resolving', 'busy', 'beat:dive', 'resolve:dive:scubaSet-1',
      'hide-focus', 'animate', 'after-animation', 'before-return', 'exit', 'clear-event', 'render', 'after-return', 'ready', 'restore-focus',
    ]);
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

  it('rejects a camera entry error after cleanup restores the idle state', async () => {
    const rig = createRig();
    const entryError = new Error('camera entry failed');
    rig.world.enterFocusedEventView.mockRejectedValueOnce(entryError);
    rig.world.exitFocusedEventView.mockRejectedValueOnce(new Error('camera cleanup failed'));

    await expect(rig.flow.enter('drifting-supplies', driftingChoices)).rejects.toBe(entryError);

    expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce();
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    rig.world.exitFocusedEventView.mockResolvedValue(undefined);
    await rig.flow.enter('drifting-supplies', driftingChoices);
    expect(rig.world.enterFocusedEventView).toHaveBeenCalledTimes(2);
    expect(rig.ui.showFocusedEvent).toHaveBeenCalledOnce();
  });

  it('restores the focused event when the Back camera fails', async () => {
    const rig = createRig();
    const backError = new Error('camera return failed');
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.world.exitFocusedEventView.mockRejectedValueOnce(backError);

    await expect(rig.flow.back()).rejects.toBe(backError);

    expect(rig.ui.showFocusedEvent).toHaveBeenCalledTimes(2);
    expect(rig.calls).not.toContain('clear-event');
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    rig.world.exitFocusedEventView.mockResolvedValue(undefined);
    await expect(rig.flow.back()).resolves.toBeUndefined();
    expect(rig.resolveChoice).not.toHaveBeenCalled();
  });

  it('keeps a choice beat error primary while focus cleanup errors stay secondary', async () => {
    const rig = createRig();
    const choiceError = new Error('choice beat failed');
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.ui.playEventChoiceBeat.mockRejectedValueOnce(choiceError);
    rig.ui.showFocusedEvent.mockImplementationOnce(() => {
      throw new Error('focus restore failed');
    });

    await expect(rig.flow.choose({ id: 'retrieve', instanceId: null })).rejects.toBe(choiceError);

    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    rig.ui.showFocusedEvent.mockImplementation(() => undefined);
    await expect(rig.flow.choose({ id: 'retrieve', instanceId: null })).resolves.toBeUndefined();
    expect(rig.resolveChoice).toHaveBeenCalledOnce();
  });

  it('reports a rejected resolution animation after all cleanup attempts', async () => {
    const rig = createRig();
    const failure = new Error('animation failed');
    const clearEvent = vi.fn(() => { throw new Error('event cleanup failed'); });
    rig.setResolution({
      accepted: true,
      playAnimation: async () => { throw failure; },
      afterAnimation: async () => undefined,
      beforeReturn: async () => undefined,
      afterReturn: async () => { throw new Error('return cleanup failed'); },
      clearEvent,
      renderSnapshot: () => false,
      presentTerminal: vi.fn(),
    });
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.world.exitFocusedEventView.mockRejectedValueOnce(new Error('camera cleanup failed'));

    await expect(rig.flow.choose({ id: 'retrieve', instanceId: null })).rejects.toBe(failure);

    expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce();
    expect(clearEvent).toHaveBeenCalledOnce();
    expect(rig.setEventResolutionActive).toHaveBeenLastCalledWith(false);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('releases busy after an after-return failure without reviving focus', async () => {
    const rig = createRig();
    rig.setResolution({
      accepted: true,
      playAnimation: async () => undefined,
      afterAnimation: async () => undefined,
      beforeReturn: async () => undefined,
      afterReturn: async () => { throw new Error('after return failed'); },
      clearEvent: vi.fn(),
      renderSnapshot: () => false,
      presentTerminal: vi.fn(),
    });
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.calls.length = 0;

    await expect(rig.flow.choose({ id: 'retrieve', instanceId: null })).rejects
      .toThrow('after return failed');

    expect(rig.calls).toContain('ready');
    expect(rig.ui.showFocusedEvent).toHaveBeenCalledOnce();
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

  it('does not start a second entry while the first camera entry is pending', async () => {
    const rig = createRig();
    const pending = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(pending.promise);
    const first = rig.flow.enter('drifting-supplies', driftingChoices);
    await Promise.resolve();
    await rig.flow.enter('drifting-supplies', driftingChoices);
    expect(rig.world.enterFocusedEventView).toHaveBeenCalledOnce();
    pending.resolve();
    await first;
  });

  it('does not enter a focus view for a stale pending event', async () => {
    const rig = createRig();
    rig.setPending(false);

    await rig.flow.enter('drifting-supplies', driftingChoices);

    expect(rig.world.enterFocusedEventView).not.toHaveBeenCalled();
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

  it('returns to the boat without resolving the pending event', async () => {
    const rig = createRig();
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.calls.length = 0;
    await rig.flow.back();
    expect(rig.resolveChoice).not.toHaveBeenCalled();
    expect(rig.calls).not.toContain('clear-event');
    expect(rig.calls).toContain('exit');
    expect(rig.calls.at(-1)).toBe('restore-focus');
  });

  it('hides the popup before the back camera finishes', async () => {
    const rig = createRig();
    const returning = deferred();
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.calls.length = 0;
    rig.world.exitFocusedEventView.mockImplementationOnce(() => {
      rig.calls.push('exit');
      return returning.promise;
    });

    const work = rig.flow.back();

    await vi.waitFor(() => expect(rig.calls).toContain('exit'));
    expect(rig.calls.indexOf('hide-focus')).toBeLessThan(rig.calls.indexOf('exit'));
    expect(rig.calls).not.toContain('clear-event');
    returning.resolve();
    await work;
    expect(rig.calls).not.toContain('clear-event');
    expect(rig.calls.at(-1)).toBe('restore-focus');
  });

  it('uses Wreckage Leave to close focus without resolving the event', async () => {
    const rig = createRig('wreckage');
    const choices = [
      {
        id: 'leave', label: 'Leave', unavailableReason: null, instanceId: null,
        dismisses: true,
      },
    ] as const;
    await rig.flow.enter('wreckage', choices);
    rig.calls.length = 0;

    await rig.flow.choose({ id: 'leave', instanceId: null });

    expect(rig.resolveChoice).not.toHaveBeenCalled();
    expect(rig.setEventResolutionActive).not.toHaveBeenCalledWith(true);
    expect(rig.calls).not.toContain('clear-event');
    expect(rig.calls).toContain('exit');
    expect(rig.calls).toContain('restore-focus');
  });

  it('updates the shown focus target after a resize', async () => {
    const rig = createRig();
    rig.world.projectEventInteractionBounds.mockReturnValue({
      x: 2, y: 3, width: 4, height: 5, depth: 6, visible: true,
    } as never);
    await rig.flow.enter('drifting-supplies', driftingChoices);
    rig.flow.syncTarget(1280, 720);
    expect(rig.ui.updateFocusedEventTarget).toHaveBeenCalledWith({
      x: 2, y: 3, width: 4, height: 5, depth: 6, visible: true,
    });
  });

  it('shows focus choices when the projected target is missing', async () => {
    const rig = createRig();
    rig.world.projectEventInteractionBounds.mockReturnValue(null);

    await rig.flow.enter('drifting-supplies', driftingChoices);

    expect(rig.ui.showFocusedEvent).toHaveBeenCalledWith(expect.objectContaining({ target: null }));
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

  it('does not restore command focus after a terminal result', async () => {
    const rig = createRig();
    rig.setResolution({
      accepted: true,
      playAnimation: async () => undefined,
      afterAnimation: async () => undefined,
      beforeReturn: async () => undefined,
      afterReturn: async () => undefined,
      clearEvent: vi.fn(),
      renderSnapshot: () => true,
      presentTerminal: vi.fn(),
    });
    await rig.flow.enter('drifting-supplies', driftingChoices);
    await rig.flow.choose({ id: 'retrieve', instanceId: null });

    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();
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

  it('commits disposal before a focus cleanup failure', async () => {
    const rig = createRig();
    await rig.flow.enter('drifting-supplies', driftingChoices);
    const failure = new Error('cleanup failed');
    rig.ui.hideFocusedEvent.mockImplementationOnce(() => { throw failure; });

    expect(() => rig.flow.dispose()).toThrow(failure);
    expect(() => rig.flow.dispose()).not.toThrow();
    await rig.flow.enter('drifting-supplies', driftingChoices);

    expect(rig.world.enterFocusedEventView).toHaveBeenCalledOnce();
  });
});
