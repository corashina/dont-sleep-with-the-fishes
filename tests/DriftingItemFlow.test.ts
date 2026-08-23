import { describe, expect, it, vi } from 'vitest';
import type { ProjectedBoatBounds } from '../src/survival/BoatInteraction';
import type {
  DriftingItemFocusView,
  EventContextChoice,
} from '../src/ui/SurvivalUI';
import {
  DriftingItemFlow,
  type DriftingItemChoiceResolution,
  type DriftingItemFlowDependencies,
} from '../src/survival/DriftingItemFlow';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const choices: readonly EventContextChoice[] = [
  { id: 'retrieve', label: 'Retrieve It', unavailableReason: null },
  { id: 'delegate-carlitos', label: 'Send Carlitos', unavailableReason: null },
  { id: 'sleep', label: 'Let It Drift', unavailableReason: null },
];

function createRig() {
  const calls: string[] = [];
  let generation = 4;
  let pending = true;
  let terminal = false;
  let resolution: DriftingItemChoiceResolution = {
    accepted: true,
    animate: true,
    clearEvent: () => { calls.push('clear-event'); },
    renderSnapshot: () => {
      calls.push('render');
      return terminal;
    },
    presentTerminal: () => { calls.push('present-terminal'); },
  };
  const target = { left: 10, top: 20, width: 30, height: 40 };
  const world = {
    enterDriftingItemView: vi.fn(async (eventId: string) => {
      calls.push(`enter:${eventId}`);
    }),
    exitDriftingItemView: vi.fn(async () => { calls.push('exit'); }),
    retrieveDriftingItem: vi.fn(async (eventId: string) => {
      calls.push(`retrieve:${eventId}`);
    }),
    delegateDriftingItem: vi.fn(async (eventId: string) => {
      calls.push(`delegate:${eventId}`);
    }),
    recedeDriftingItem: vi.fn(async (eventId: string) => {
      calls.push(`recede:${eventId}`);
    }),
    projectEventInteractionBounds: vi.fn(() => target),
  };
  const ui = {
    setEventSelection: vi.fn(() => { calls.push('selection'); }),
    showDriftingItemFocus: vi.fn((_view: DriftingItemFocusView) => { calls.push('show-focus'); }),
    hideDriftingItemFocus: vi.fn(() => { calls.push('hide-focus'); }),
    updateDriftingItemFocusTarget: vi.fn((_target: ProjectedBoatBounds | null) => {
      calls.push('sync-target');
    }),
    playEventChoiceBeat: vi.fn(async (choiceId: string) => {
      calls.push(`beat:${choiceId}`);
    }),
    restoreCommandFocus: vi.fn(() => { calls.push('restore-focus'); }),
  };
  const resolveChoice = vi.fn((choiceId: string) => {
    calls.push(`resolve:${choiceId}`);
    return resolution;
  });
  const waitForVisibilityResume = vi.fn(async () => true);
  const dependencies = {
    world,
    ui,
    audio: { confirm: vi.fn(() => { calls.push('confirm'); }) },
    setBusy: vi.fn((busy: boolean) => { calls.push(busy ? 'busy' : 'ready'); }),
    setEventResolutionActive: vi.fn((active: boolean) => {
      calls.push(active ? 'event-resolving' : 'event-choosing');
    }),
    isPendingEvent: vi.fn(() => pending),
    resolveChoice,
    waitForVisibilityResume,
    captureLifecycleGeneration: vi.fn(() => generation),
    isLifecycleGenerationCurrent: vi.fn((captured: number) => captured === generation),
  } as unknown as DriftingItemFlowDependencies;
  const flow = new DriftingItemFlow(dependencies);
  return {
    flow,
    calls,
    world,
    ui,
    resolveChoice,
    waitForVisibilityResume,
    advanceGeneration: () => { generation += 1; },
    setPending: (value: boolean) => { pending = value; },
    setResolution: (value: DriftingItemChoiceResolution) => { resolution = value; },
    setTerminal: (value: boolean) => { terminal = value; },
  };
}

async function enter(rig: ReturnType<typeof createRig>): Promise<void> {
  await rig.flow.enter('drifting-barrel', choices);
}

describe('DriftingItemFlow', () => {
  it('enters the camera view before it shows the focused choices', async () => {
    const rig = createRig();

    await enter(rig);

    expect(rig.world.enterDriftingItemView).toHaveBeenCalledWith('drifting-barrel');
    expect(rig.ui.showDriftingItemFocus).toHaveBeenCalledWith({
      eventId: 'drifting-barrel',
      title: 'DRIFTING BARREL',
      choices,
      target: { left: 10, top: 20, width: 30, height: 40 },
    });
    expect(rig.calls).toEqual([
      'busy',
      'enter:drifting-barrel',
      'selection',
      'show-focus',
      'ready',
    ]);
  });

  it.each([
    ['retrieve', 'retrieve:drifting-barrel'],
    ['delegate-carlitos', 'delegate:drifting-barrel'],
    ['sleep', 'recede:drifting-barrel'],
  ] as const)('resolves and returns after the %s choice', async (choiceId, animationCall) => {
    const rig = createRig();
    await enter(rig);
    rig.calls.length = 0;

    await rig.flow.choose(choiceId);

    expect(rig.resolveChoice).toHaveBeenCalledWith(choiceId);
    expect(rig.calls).toEqual([
      'confirm',
      'event-resolving',
      'busy',
      `beat:${choiceId}`,
      `resolve:${choiceId}`,
      animationCall,
      'busy',
      'exit',
      'hide-focus',
      'clear-event',
      'render',
      'ready',
      'restore-focus',
    ]);
  });

  it('returns without an item animation when event validation rejects that animation', async () => {
    const rig = createRig();
    rig.setResolution({
      accepted: true,
      animate: false,
      clearEvent: () => { rig.calls.push('clear-event'); },
      renderSnapshot: () => false,
      presentTerminal: () => undefined,
    });
    await enter(rig);

    await rig.flow.choose('retrieve');

    expect(rig.world.retrieveDriftingItem).not.toHaveBeenCalled();
    expect(rig.world.exitDriftingItemView).toHaveBeenCalledOnce();
  });

  it('restores the same focus view after a rejected choice', async () => {
    const rig = createRig();
    rig.setResolution({ accepted: false });
    await enter(rig);
    const initialView = rig.ui.showDriftingItemFocus.mock.calls[0]![0];

    await rig.flow.choose('retrieve');

    expect(rig.world.retrieveDriftingItem).not.toHaveBeenCalled();
    expect(rig.ui.showDriftingItemFocus).toHaveBeenCalledTimes(2);
    expect(rig.ui.showDriftingItemFocus.mock.calls[1]![0]).toEqual(initialView);
    expect(rig.calls).toContain('event-choosing');
  });

  it('returns to the event view without resolving the event', async () => {
    const rig = createRig();
    await enter(rig);
    rig.calls.length = 0;

    await rig.flow.back();

    expect(rig.resolveChoice).not.toHaveBeenCalled();
    expect(rig.calls).toEqual([
      'busy',
      'exit',
      'hide-focus',
      'selection',
      'ready',
      'restore-focus',
    ]);
    await enter(rig);
    expect(rig.world.enterDriftingItemView).toHaveBeenCalledTimes(2);
  });

  it('clears an open focus before external cleanup and allows another entry', async () => {
    const rig = createRig();
    await enter(rig);
    rig.calls.length = 0;
    rig.world.projectEventInteractionBounds.mockClear();

    rig.flow.clear();
    rig.flow.syncTarget(1280, 720);

    expect(rig.calls).toEqual(['hide-focus']);
    expect(rig.world.projectEventInteractionBounds).not.toHaveBeenCalled();
    await enter(rig);
    expect(rig.world.enterDriftingItemView).toHaveBeenCalledTimes(2);
    expect(rig.ui.showDriftingItemFocus).toHaveBeenCalledTimes(2);
  });

  it('makes an in-flight choice inert when generic cleanup clears the focus', async () => {
    const rig = createRig();
    const retrieval = deferred();
    rig.world.retrieveDriftingItem.mockReturnValueOnce(retrieval.promise);
    await enter(rig);
    rig.calls.length = 0;

    const work = rig.flow.choose('retrieve');
    await Promise.resolve();
    await Promise.resolve();
    rig.flow.clear();
    retrieval.resolve();
    await work;

    expect(rig.calls).toContain('hide-focus');
    expect(rig.world.exitDriftingItemView).not.toHaveBeenCalled();
    expect(rig.calls).not.toContain('clear-event');
    await enter(rig);
    expect(rig.world.enterDriftingItemView).toHaveBeenCalledTimes(2);
  });

  it('does not let an old same-event entry complete the new entry', async () => {
    const rig = createRig();
    const oldEntry = deferred();
    const newEntry = deferred();
    rig.world.enterDriftingItemView
      .mockReturnValueOnce(oldEntry.promise)
      .mockReturnValueOnce(newEntry.promise);

    const oldWork = rig.flow.enter('drifting-barrel', choices);
    await Promise.resolve();
    rig.flow.clear();
    const newWork = rig.flow.enter('drifting-barrel', choices);
    await Promise.resolve();

    oldEntry.resolve();
    await oldWork;
    expect(rig.ui.showDriftingItemFocus).not.toHaveBeenCalled();

    newEntry.resolve();
    await newWork;
    expect(rig.ui.showDriftingItemFocus).toHaveBeenCalledOnce();
    await rig.flow.back();
    expect(rig.world.exitDriftingItemView).toHaveBeenCalledOnce();
  });

  it('does not let an old same-event choice animation mutate the new choice', async () => {
    const rig = createRig();
    const oldRetrieval = deferred();
    const newRetrieval = deferred();
    rig.world.retrieveDriftingItem
      .mockReturnValueOnce(oldRetrieval.promise)
      .mockReturnValueOnce(newRetrieval.promise);
    await enter(rig);

    const oldWork = rig.flow.choose('retrieve');
    await vi.waitFor(() => expect(rig.world.retrieveDriftingItem).toHaveBeenCalledOnce());
    rig.flow.clear();
    await enter(rig);
    const newWork = rig.flow.choose('retrieve');
    await vi.waitFor(() => expect(rig.world.retrieveDriftingItem).toHaveBeenCalledTimes(2));

    oldRetrieval.resolve();
    await oldWork;
    expect(rig.world.exitDriftingItemView).not.toHaveBeenCalled();
    expect(rig.calls.filter((call) => call === 'clear-event')).toHaveLength(0);

    newRetrieval.resolve();
    await newWork;
    expect(rig.world.exitDriftingItemView).toHaveBeenCalledOnce();
    expect(rig.calls.filter((call) => call === 'clear-event')).toHaveLength(1);
  });

  it('does not let an old same-event camera return clear the new return', async () => {
    const rig = createRig();
    const oldReturn = deferred();
    const newReturn = deferred();
    rig.world.exitDriftingItemView
      .mockReturnValueOnce(oldReturn.promise)
      .mockReturnValueOnce(newReturn.promise);
    await enter(rig);

    const oldWork = rig.flow.choose('retrieve');
    await vi.waitFor(() => expect(rig.world.exitDriftingItemView).toHaveBeenCalledOnce());
    rig.flow.clear();
    await enter(rig);
    const newWork = rig.flow.choose('retrieve');
    await vi.waitFor(() => expect(rig.world.exitDriftingItemView).toHaveBeenCalledTimes(2));

    oldReturn.resolve();
    await oldWork;
    expect(rig.calls.filter((call) => call === 'clear-event')).toHaveLength(0);

    newReturn.resolve();
    await newWork;
    expect(rig.calls.filter((call) => call === 'clear-event')).toHaveLength(1);
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
  });

  it('syncs the projected target on entry and resize', async () => {
    const rig = createRig();
    rig.flow.syncTarget(640, 360);
    await enter(rig);

    rig.flow.syncTarget(1280, 720);

    expect(rig.world.projectEventInteractionBounds).toHaveBeenNthCalledWith(
      1,
      'drifting-barrel',
      640,
      360,
    );
    expect(rig.world.projectEventInteractionBounds).toHaveBeenNthCalledWith(
      2,
      'drifting-barrel',
      1280,
      720,
    );
    expect(rig.ui.updateDriftingItemFocusTarget).toHaveBeenCalledWith(
      { left: 10, top: 20, width: 30, height: 40 },
    );
  });

  it('shows a usable focus view when the projected target is missing', async () => {
    const rig = createRig();
    rig.world.projectEventInteractionBounds.mockReturnValue(null as never);

    await enter(rig);

    expect(rig.ui.showDriftingItemFocus.mock.calls[0]![0]).toMatchObject({ target: null });
  });

  it('waits for visibility before it resolves a choice', async () => {
    const rig = createRig();
    const resume = deferred<boolean>();
    rig.waitForVisibilityResume.mockReturnValueOnce(resume.promise);
    await enter(rig);

    const choosing = rig.flow.choose('retrieve');
    await Promise.resolve();
    expect(rig.resolveChoice).not.toHaveBeenCalled();
    rig.flow.settleForVisibilityChange();

    resume.resolve(true);
    await choosing;
    expect(rig.resolveChoice).toHaveBeenCalledOnce();
  });

  it.each(['entering', 'resolving', 'returning'] as const)(
    'ignores a stale %s completion',
    async (stage) => {
      const rig = createRig();
      const pending = deferred();
      if (stage === 'entering') {
        rig.world.enterDriftingItemView.mockReturnValueOnce(pending.promise);
      } else {
        await enter(rig);
        if (stage === 'resolving') {
          rig.world.retrieveDriftingItem.mockReturnValueOnce(pending.promise);
        } else {
          rig.world.exitDriftingItemView.mockReturnValueOnce(pending.promise);
        }
      }

      const work = stage === 'entering'
        ? rig.flow.enter('drifting-barrel', choices)
        : rig.flow.choose('retrieve');
      await Promise.resolve();
      await Promise.resolve();
      rig.advanceGeneration();
      pending.resolve();
      await work;

      if (stage === 'entering') expect(rig.ui.showDriftingItemFocus).not.toHaveBeenCalled();
      else expect(rig.calls).not.toContain('clear-event');
    },
  );

  it('becomes inert after disposal', async () => {
    const rig = createRig();
    const entry = deferred();
    rig.world.enterDriftingItemView.mockReturnValueOnce(entry.promise);
    const work = rig.flow.enter('drifting-barrel', choices);
    await Promise.resolve();

    rig.flow.dispose();
    rig.world.enterDriftingItemView.mockClear();
    rig.ui.showDriftingItemFocus.mockClear();
    entry.resolve();
    await work;
    await rig.flow.enter('drifting-barrel', choices);
    await rig.flow.choose('retrieve');
    await rig.flow.back();
    rig.flow.syncTarget(800, 600);

    expect(rig.world.enterDriftingItemView).not.toHaveBeenCalled();
    expect(rig.ui.showDriftingItemFocus).not.toHaveBeenCalled();
    expect(rig.resolveChoice).not.toHaveBeenCalled();
  });

  it('does not restore command focus after a terminal result', async () => {
    const rig = createRig();
    rig.setTerminal(true);
    await enter(rig);

    await rig.flow.choose('sleep');

    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();
  });

  it('does not enter a focus view for a stale pending event', async () => {
    const rig = createRig();
    rig.setPending(false);

    await enter(rig);

    expect(rig.world.enterDriftingItemView).not.toHaveBeenCalled();
  });
});
