import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import {
  SurvivalEventFlow,
  type SurvivalEventFlowDependencies,
} from '../src/survival/SurvivalEventFlow';
import type {
  ActionOutcome,
  SurvivalInventorySnapshot,
  SurvivalItemState,
  SurvivalSnapshot,
} from '../src/survival/survivalTypes';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function inventory(
  overrides: Partial<Record<ItemInstanceId, SurvivalItemState>> = {},
): SurvivalInventorySnapshot {
  return overrides;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    state: 'day',
    endingReason: 'standard',
    day: 4,
    pressure: 2,
    health: 100,
    hunger: 20,
    energy: 3,
    hull: 100,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueProgress: 0,
    chest: { state: 'none', acquiredDay: null },
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: inventory(),
    savedItems: [],
    carlitos: null,
    pendingEventId: null,
    pendingEventTargetId: null,
    lastOutcome: null,
    seed: 17,
    ...overrides,
  };
}

function accepted(overrides: Partial<ActionOutcome> = {}): ActionOutcome {
  return {
    accepted: true,
    code: 'event-resolved',
    message: 'Resolved.',
    deltas: {},
    cue: 'none',
    ...overrides,
  };
}

function createRig(initial: SurvivalSnapshot) {
  let current = initial;
  let generation = 3;
  const calls: string[] = [];
  let resolveEvent = vi.fn((_response: unknown): ActionOutcome => accepted());
  const session = {
    snapshot: vi.fn(() => current),
    resolveEvent: vi.fn((response: unknown) => resolveEvent(response)),
    requestDayEvent: vi.fn(),
    beginDawn: vi.fn(() => {
      calls.push('begin-dawn');
      current = snapshot({ day: current.day + 1 });
      return accepted({ code: 'dawn', cue: 'dawn' });
    }),
    companionEventActionAvailability: vi.fn(() => ({
      visible: true,
      energyCost: 1,
      availableEnergy: 3,
      unavailableReason: null,
    })),
  };
  const world = {
    stageEvent: vi.fn((eventId: unknown) => calls.push(`stage:${
      typeof eventId === 'string' ? eventId : (eventId as { eventId: string }).eventId
    }`)),
    revealEvent: vi.fn(async (eventId: string) => { calls.push(`reveal:${eventId}`); }),
    playEventItemUse: vi.fn(async (
      eventId: string,
      choiceId: string,
      _instanceId: string,
      onAction?: (cueIndex: number) => void,
    ) => {
      calls.push(`use:${eventId}/${choiceId}`);
      onAction?.(0);
    }),
    returnEventItemUse: vi.fn(async () => undefined),
    playEventChoice: vi.fn(async (_eventId: string, choice: unknown) => {
      const choiceId = typeof choice === 'string'
        ? choice
        : (choice as { choiceId: string }).choiceId;
      calls.push(`choice:${choiceId}`);
    }),
    reactToEventOutcome: vi.fn(async (eventId: string) => {
      calls.push(`react:${eventId}`);
    }),
    clearEvent: vi.fn(() => calls.push('clear-world')),
    setEventEligibleItems: vi.fn(),
    setEventSelectedItem: vi.fn(),
    syncInventory: vi.fn(),
    projectInteractionAnchors: vi.fn(() => []),
    play: vi.fn(async (cue: string) => { calls.push(`play:${cue}`); }),
  };
  const ui = {
    beginEventPresentation: vi.fn(() => calls.push('begin-ui')),
    showEventReveal: vi.fn(async () => { calls.push('caption'); }),
    hideEventReveal: vi.fn(),
    setEventSelection: vi.fn(),
    setEventUsing: vi.fn(),
    playEventChoiceBeat: vi.fn(async (choiceId: string) => {
      calls.push(`beat:${choiceId}`);
    }),
    setEventSleepMask: vi.fn(),
    setSleepCovered: vi.fn(async (covered: boolean) => {
      calls.push(covered ? 'cover' : 'uncover');
    }),
    setSleepCoverProfile: vi.fn(async () => undefined),
    setBadSleepCue: vi.fn(),
    holdEventOutcome: vi.fn(async () => { calls.push('hold'); }),
    showFeedback: vi.fn(),
    clearEventPresentation: vi.fn(() => calls.push('clear-ui')),
    setAnchors: vi.fn(),
    restoreCommandFocus: vi.fn(() => calls.push('focus')),
  };
  const audio = {
    beginEvent: vi.fn((eventId: string) => calls.push(`audio-begin:${eventId}`)),
    eventReveal: vi.fn(),
    eventItem: vi.fn(),
    eventItemCue: vi.fn(),
    sleep: vi.fn(),
    confirm: vi.fn(),
    deny: vi.fn(),
    beginEventReaction: vi.fn(),
    finishEventReaction: vi.fn(),
    eventAction: vi.fn(),
    clearMidnightTour: vi.fn(),
    clearEvent: vi.fn(() => calls.push('clear-audio')),
    dawn: vi.fn(() => calls.push('audio-dawn')),
  };
  const bundles = {
    beginLoad: vi.fn((eventId: string) => {
      calls.push(`load:${eventId}`);
      return undefined;
    }),
    activate: vi.fn(async (eventId: string) => { calls.push(`activate:${eventId}`); }),
    releaseActive: vi.fn(() => calls.push('release-bundle')),
    dispose: vi.fn(),
  };
  const drifting = {
    enter: vi.fn(async () => undefined),
    choose: vi.fn(async () => undefined),
    clear: vi.fn(() => calls.push('clear-drifting')),
    settleForVisibilityChange: vi.fn(),
  };
  const onInvariantError = vi.fn();
  const onFatalError = vi.fn();
  const setBusy = vi.fn((busy: boolean) => calls.push(busy ? 'busy' : 'ready'));
  const renderSnapshot = vi.fn(() => {
    calls.push('render');
    return current;
  });
  const presentTerminal = vi.fn(() => calls.push('terminal'));
  const flow = new SurvivalEventFlow({
    session,
    world,
    ui,
    audio,
    bundles,
    drifting,
    renderSnapshot,
    renderAndSettleCoveredScene: vi.fn(async () => {
      calls.push('settle');
      return true;
    }),
    presentTerminal,
    setBusy,
    setAutomaticWeather: vi.fn((eventId) => calls.push(`weather:${eventId ?? 'calm'}`)),
    isVisibilityBlocked: vi.fn(() => false),
    waitForVisibilityResume: vi.fn(async () => true),
    getViewport: () => ({ width: 1280, height: 720 }),
    captureLifecycleGeneration: () => generation,
    isLifecycleGenerationCurrent: (captured: number) => captured === generation,
    onInvariantError,
    onFatalError,
  } as unknown as SurvivalEventFlowDependencies);
  return {
    flow,
    calls,
    session,
    world,
    ui,
    audio,
    bundles,
    drifting,
    setBusy,
    renderSnapshot,
    presentTerminal,
    onInvariantError,
    onFatalError,
    setSnapshot: (value: SurvivalSnapshot) => { current = value; },
    setResolveEvent: (handler: () => ActionOutcome) => {
      resolveEvent = vi.fn((_response: unknown) => handler());
    },
    advanceGeneration: () => { generation += 1; },
  };
}

describe('SurvivalEventFlow', () => {
  it('loads, activates, stages, and reveals before it enables eligible items', async () => {
    const umbrella = {
      instanceId: 'umbrella-1',
      type: 'umbrella',
      condition: 'usable',
    } as const;
    const rig = createRig(snapshot({
      state: 'dayEvent',
      pendingEventId: 'shower-night',
      inventory: inventory({ 'umbrella-1': umbrella }),
    }));

    await rig.flow.revealPending(rig.session.snapshot());

    expect(rig.bundles.beginLoad).toHaveBeenCalledWith('shower-night');
    expect(rig.bundles.activate).toHaveBeenCalledWith('shower-night');
    expect(rig.world.stageEvent).toHaveBeenCalled();
    expect(rig.world.revealEvent).toHaveBeenCalledWith('shower-night');
    expect(rig.ui.setEventSelection).toHaveBeenCalledWith(
      new Map([['umbrella-1', 'umbrella']]),
      expect.any(Array),
    );
    expect(rig.calls.indexOf('activate:shower-night')).toBeLessThan(
      rig.calls.indexOf('stage:shower-night'),
    );
    expect(rig.calls.at(-1)).toBe('ready');
  });

  it('uses an eligible item, resolves the event, runs dawn, and cleans in order', async () => {
    const umbrella = {
      instanceId: 'umbrella-1',
      type: 'umbrella',
      condition: 'usable',
    } as const;
    const pending = snapshot({
      state: 'nightEvent',
      pendingEventId: 'shower-night',
      inventory: inventory({ 'umbrella-1': umbrella }),
    });
    const rig = createRig(pending);
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot({ state: 'nightEvent', day: pending.day }));
      return accepted();
    });
    await rig.flow.revealPending(pending);
    rig.calls.length = 0;

    rig.flow.resolveItem('umbrella', 'umbrella-1');
    await vi.waitFor(() => expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce());

    expect(rig.calls).toContain('use:shower-night/umbrella');
    expect(rig.calls).toContain('begin-dawn');
    expect(rig.calls.indexOf('clear-world')).toBeLessThan(
      rig.calls.indexOf('release-bundle'),
    );
    expect(rig.calls.indexOf('release-bundle')).toBeLessThan(
      rig.calls.indexOf('clear-ui'),
    );
  });

  it('reports an exact focused-result invariant and recovers the covered scene', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'handyman' });
    const rig = createRig(pending);
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot());
      return accepted();
    });
    await rig.flow.revealPending(pending);
    rig.calls.length = 0;

    rig.flow.resolveContextual('touch');
    await vi.waitFor(() => expect(rig.onInvariantError).toHaveBeenCalledOnce());

    expect(rig.onInvariantError.mock.calls[0]![0].message).toContain(
      'requires result handyman/touch; received missing',
    );
    expect(rig.calls).toContain('cover');
    expect(rig.calls).toContain('uncover');
    expect(rig.calls).toContain('focus');
    expect(rig.calls.indexOf('ready')).toBeLessThan(rig.calls.indexOf('focus'));
  });

  it('retains a rescued event tableau while it clears selection and UI state', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'other-people' });
    const rig = createRig(pending);
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot({ state: 'rescued' }));
      return accepted({
        eventResult: {
          eventId: 'other-people',
          choiceId: 'sleep',
          resultId: 'people-sleep',
        },
      });
    });
    await rig.flow.revealPending(pending);
    rig.calls.length = 0;

    rig.flow.resolveEndure();
    await vi.waitFor(() => expect(rig.presentTerminal).toHaveBeenCalledOnce());

    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    expect(rig.bundles.releaseActive).not.toHaveBeenCalled();
    expect(rig.ui.clearEventPresentation).toHaveBeenCalled();
    expect(rig.world.setEventEligibleItems).toHaveBeenLastCalledWith(null);
  });

  it('makes a stale activation inert and does not clear newer busy state', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'shower-night' });
    const rig = createRig(pending);
    const activation = deferred();
    rig.bundles.activate.mockReturnValueOnce(activation.promise);

    const reveal = rig.flow.revealPending(pending);
    await vi.waitFor(() => expect(rig.bundles.activate).toHaveBeenCalledOnce());
    rig.advanceGeneration();
    rig.calls.length = 0;
    activation.resolve();
    await reveal;

    expect(rig.world.stageEvent).not.toHaveBeenCalled();
    expect(rig.calls).not.toContain('ready');
  });

  it('routes activation and presenter failures to the fatal handler', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'shower-night' });
    const activationRig = createRig(pending);
    const activationError = new Error('bundle activation failed');
    activationRig.bundles.activate.mockRejectedValueOnce(activationError);

    await activationRig.flow.revealPending(pending);

    expect(activationRig.onFatalError).toHaveBeenCalledWith(activationError);
    expect(activationRig.calls.at(-1)).toBe('ready');

    const presenterRig = createRig(pending);
    const presenterError = new Error('presenter failed');
    presenterRig.world.revealEvent.mockRejectedValueOnce(presenterError);
    await presenterRig.flow.revealPending(pending);

    expect(presenterRig.onFatalError).toHaveBeenCalledWith(presenterError);
    expect(presenterRig.calls.at(-1)).toBe('ready');
  });
});
