import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { EventBundle } from '../src/survival/EventBundle';
import { EventBundleManager } from '../src/survival/EventBundleManager';
import {
  SurvivalEventFlow,
  type SurvivalEventFlowDependencies,
} from '../src/survival/SurvivalEventFlow';
import type { DriftingItemChoiceResolution } from '../src/survival/DriftingItemFlow';
import type {
  ActionOutcome,
  SurvivalInventorySnapshot,
  SurvivalItemState,
} from '../src/survival/survivalTypes';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function inventory(
  overrides: Partial<Record<ItemInstanceId, SurvivalItemState>> = {},
): SurvivalInventorySnapshot {
  return overrides;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    state: 'day',
    ending: null,
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
    rescueLead: 0,
    rescueTraceFinds: 0,
    radioSignalAvailable: false,
    radioSignalsSent: 0,
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

function testBundle(eventId: EventBundle['eventId'], calls: string[]): EventBundle {
  return {
    eventId,
    attach: vi.fn(() => calls.push(`bundle-attach:${eventId}`)),
    dispose: vi.fn(() => calls.push(`bundle-dispose:${eventId}`)),
  } as unknown as EventBundle;
}

function createRig(
  initial: SurvivalSnapshot,
  bundleManager?: EventBundleManager,
) {
  let current = initial;
  let generation = 3;
  const calls: string[] = [];
  let resolveEvent = vi.fn((_response: unknown): ActionOutcome => accepted());
  const session = {
    snapshot: vi.fn(() => current),
    resolveEvent: vi.fn((response: unknown) => resolveEvent(response)),
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
  const finishDive = vi.fn();
  const audio = {
    beginEvent: vi.fn((eventId: string) => calls.push(`audio-begin:${eventId}`)),
    eventReveal: vi.fn(),
    eventItem: vi.fn(),
    eventItemCue: vi.fn(),
    sleep: vi.fn(),
    confirm: vi.fn(),
    deny: vi.fn(),
    beginEventReaction: vi.fn(),
    finishEventReaction: vi.fn((eventId: string) => {
      if (eventId === 'wreckage') finishDive();
    }),
    beginDive: vi.fn(),
    finishDive,
    cancelDive: vi.fn(),
    eventAction: vi.fn(),
    clearMidnightTour: vi.fn(),
    clearEvent: vi.fn(() => calls.push('clear-audio')),
    dawn: vi.fn(() => calls.push('audio-dawn')),
  };
  const defaultBundles = {
    beginLoad: vi.fn((eventId: string) => {
      calls.push(`load:${eventId}`);
      return undefined;
    }),
    activate: vi.fn(async (eventId: string) => { calls.push(`activate:${eventId}`); }),
    cancelPendingActivation: vi.fn(() => calls.push('cancel-bundle')),
    releaseActive: vi.fn(() => calls.push('release-bundle')),
  };
  const bundles = (bundleManager ?? defaultBundles) as typeof defaultBundles;
  const drifting = {
    enter: vi.fn(async (_eventId?: string): Promise<void> => undefined),
    choose: vi.fn(async (_choiceId?: string): Promise<void> => undefined),
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
    getViewportWidth: () => 1280,
    getViewportHeight: () => 720,
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
  it('hides the Wreckage scuba choice without three energy', async () => {
    const rig = createRig(snapshot({
      state: 'dayEvent',
      pendingEventId: 'wreckage',
      energy: 2,
      inventory: inventory({
        'scubaSet-1': {
          instanceId: 'scubaSet-1',
          type: 'scubaSet',
          condition: 'usable',
        },
      }),
    }));

    await rig.flow.revealPending(rig.session.snapshot());

    expect(rig.ui.setEventSelection).toHaveBeenLastCalledWith(
      new Map(),
      expect.arrayContaining([expect.objectContaining({
        id: 'search',
        energyCost: 2,
        energyOwner: 'player',
      })]),
    );
  });

  it('runs dive audio through Wreckage item use and reaction', async () => {
    const pending = snapshot({
      state: 'dayEvent',
      pendingEventId: 'wreckage',
      energy: 3,
      inventory: inventory({
        'scubaSet-1': {
          instanceId: 'scubaSet-1',
          type: 'scubaSet',
          condition: 'usable',
        },
      }),
    });
    const rig = createRig(pending);
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot({
        state: 'day',
        energy: 0,
        inventory: pending.inventory,
      }));
      return accepted({ eventPresentationKey: 'wreckage.dive-loot' });
    });
    await rig.flow.revealPending(pending);

    rig.flow.resolveItem('dive', 'scubaSet-1');
    await vi.waitFor(() => expect(rig.audio.finishDive).toHaveBeenCalledOnce());

    expect(rig.audio.beginDive).toHaveBeenCalledOnce();
  });

  it('clears active Wreckage dive audio after failure', async () => {
    const itemUse = deferred();
    const pending = snapshot({
      state: 'dayEvent',
      pendingEventId: 'wreckage',
      energy: 3,
      inventory: inventory({
        'scubaSet-1': {
          instanceId: 'scubaSet-1',
          type: 'scubaSet',
          condition: 'usable',
        },
      }),
    });
    const rig = createRig(pending);
    rig.world.playEventItemUse.mockReturnValueOnce(itemUse.promise);
    rig.audio.clearEvent.mockImplementation(() => rig.audio.cancelDive());
    await rig.flow.revealPending(pending);

    rig.flow.resolveItem('dive', 'scubaSet-1');
    await vi.waitFor(() => expect(rig.audio.beginDive).toHaveBeenCalledOnce());
    rig.flow.clearAfterFailure();

    expect(rig.audio.cancelDive).toHaveBeenCalledOnce();
    itemUse.resolve();
  });
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

  it.each([
    'clear',
    'restart',
    'dispose',
    'replacement',
  ] as const)('ignores a keyed item cue after %s invalidates its operation', async (reason) => {
    const itemUse = deferred();
    let cue: ((cueIndex: number) => void) | undefined;
    const pending = snapshot({
      state: 'dayEvent',
      pendingEventId: 'leak',
      inventory: inventory({
        'ductTape-1': {
          instanceId: 'ductTape-1',
          type: 'ductTape',
          condition: 'usable',
        },
      }),
    });
    const rig = createRig(pending);
    rig.world.playEventItemUse.mockImplementationOnce((
      _eventId: string,
      _choiceId: string,
      _instanceId: string,
      onAction?: (cueIndex: number) => void,
    ) => {
      cue = onAction;
      return itemUse.promise;
    });
    await rig.flow.revealPending(pending);
    rig.flow.resolveItem('ductTape', 'ductTape-1');
    await vi.waitFor(() => expect(cue).toEqual(expect.any(Function)));

    if (reason === 'clear') rig.flow.clear();
    else if (reason === 'restart') rig.advanceGeneration();
    else if (reason === 'dispose') rig.flow.dispose();
    else await rig.flow.revealPending(pending);

    cue?.(0);
    expect(rig.audio.eventItemCue).not.toHaveBeenCalled();
    itemUse.resolve();
    await Promise.resolve();
  });

  it('ignores a stale drifting choice rejection after a same-lifecycle replacement', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-barrel' });
    const rig = createRig(pending);
    const choice = deferred();
    rig.drifting.choose.mockReturnValueOnce(choice.promise);
    await rig.flow.revealPending(pending);

    rig.flow.resolveContextual('sleep');
    await vi.waitFor(() => expect(rig.drifting.choose).toHaveBeenCalledOnce());
    rig.flow.clear();
    await rig.flow.revealPending(pending);
    rig.onFatalError.mockClear();
    rig.setBusy.mockClear();

    choice.reject(new Error('stale drifting choice failed'));
    await Promise.resolve();
    await Promise.resolve();

    expect(rig.onFatalError).not.toHaveBeenCalled();
    expect(rig.setBusy).not.toHaveBeenCalled();
  });

  it('ignores a stale drifting focus rejection after a same-lifecycle replacement', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-barrel' });
    const rig = createRig(pending);
    const firstEntry = deferred();
    rig.drifting.enter.mockReturnValueOnce(firstEntry.promise);
    await rig.flow.revealPending(pending);

    const first = rig.flow.focusDriftingItem('drifting-barrel');
    await vi.waitFor(() => expect(rig.drifting.enter).toHaveBeenCalledOnce());
    await rig.flow.focusDriftingItem('drifting-barrel');
    rig.onFatalError.mockClear();
    rig.setBusy.mockClear();

    firstEntry.reject(new Error('stale drifting focus failed'));
    await first;

    expect(rig.onFatalError).not.toHaveBeenCalled();
    expect(rig.setBusy).not.toHaveBeenCalled();
  });

  it('makes returned drifting callbacks inert after a same-lifecycle replacement', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-barrel' });
    const rig = createRig(pending);
    let resolution: DriftingItemChoiceResolution | undefined;
    rig.drifting.choose.mockImplementationOnce(async (choiceId?: string) => {
      if (choiceId === undefined) throw new Error('Expected a choice.');
      rig.flow.setDriftingResolutionActive(true);
      resolution = rig.flow.resolveDriftingItemChoice(choiceId);
    });
    await rig.flow.revealPending(pending);

    rig.flow.resolveContextual('sleep');
    await vi.waitFor(() => expect(resolution).toBeDefined());
    if (resolution === undefined || !resolution.accepted) throw new Error('Expected resolution.');
    const staleResolution = resolution;
    rig.flow.clear();
    await rig.flow.revealPending(pending);
    rig.world.clearEvent.mockClear();
    rig.renderSnapshot.mockClear();
    rig.presentTerminal.mockClear();

    staleResolution.clearEvent();
    staleResolution.renderSnapshot();
    staleResolution.presentTerminal();

    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    expect(rig.renderSnapshot).not.toHaveBeenCalled();
    expect(rig.presentTerminal).not.toHaveBeenCalled();
  });

  it('keeps a focused invariant primary when synchronous cleanup fails', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'handyman' });
    const rig = createRig(pending);
    const cleanupError = new Error('world cleanup failed');
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot());
      return accepted();
    });
    await rig.flow.revealPending(pending);
    rig.world.clearEvent.mockImplementationOnce(() => { throw cleanupError; });

    rig.flow.resolveContextual('touch');
    await vi.waitFor(() => expect(rig.onInvariantError).toHaveBeenCalledOnce());

    expect(rig.onInvariantError.mock.calls[0]![0].message).toContain(
      'requires result handyman/touch; received missing',
    );
    expect(rig.onFatalError).not.toHaveBeenCalled();
    expect(rig.bundles.releaseActive).toHaveBeenCalled();
    expect(rig.ui.clearEventPresentation).toHaveBeenCalled();
  });

  it('finishes focused recovery when the invariant reporter throws', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'handyman' });
    const rig = createRig(pending);
    const reporterFailure = new Error('invariant reporter failed');
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot());
      return accepted();
    });
    rig.onInvariantError.mockImplementationOnce(() => { throw reporterFailure; });
    await rig.flow.revealPending(pending);
    rig.setBusy.mockClear();

    rig.flow.resolveContextual('touch');
    await vi.waitFor(() => expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce());

    expect(rig.onInvariantError).toHaveBeenCalledOnce();
    expect(rig.onInvariantError.mock.calls[0]![0].message).toContain(
      'requires result handyman/touch; received missing',
    );
    expect(rig.onFatalError).not.toHaveBeenCalled();
    expect(rig.ui.setSleepCovered).toHaveBeenCalledWith(true);
    expect(rig.ui.setSleepCovered).toHaveBeenLastCalledWith(false);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('keeps a Midnight Tour fatal error primary when synchronous cleanup fails', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'midnight-tour' });
    const rig = createRig(pending);
    const primaryError = new Error('visit presenter failed');
    rig.world.playEventChoice.mockRejectedValueOnce(primaryError);
    await rig.flow.revealPending(pending);
    rig.world.clearEvent.mockImplementationOnce(() => {
      throw new Error('world cleanup failed');
    });

    rig.flow.resolveContextual('visit');
    await vi.waitFor(() => expect(rig.onFatalError).toHaveBeenCalledOnce());

    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(primaryError);
    expect(rig.bundles.releaseActive).toHaveBeenCalled();
    expect(rig.calls).toContain('ready');
  });

  it('keeps normal cleanup failure reporting and continues later cleanup', () => {
    const cleanupError = new Error('normal world cleanup failed');
    const rig = createRig(snapshot());
    rig.world.clearEvent.mockImplementationOnce(() => { throw cleanupError; });

    rig.flow.clear();

    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(cleanupError);
    expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
    expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
  });

  it('reports only the first cleanup error after every cleanup step', () => {
    const firstError = new Error('audio cleanup failed');
    const rig = createRig(snapshot());
    rig.audio.clearEvent.mockImplementationOnce(() => { throw firstError; });
    rig.world.clearEvent.mockImplementationOnce(() => {
      throw new Error('world cleanup failed');
    });
    rig.bundles.releaseActive.mockImplementationOnce(() => {
      throw new Error('bundle cleanup failed');
    });

    rig.flow.clear();

    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(firstError);
    expect(rig.drifting.clear).toHaveBeenCalledOnce();
    expect(rig.bundles.cancelPendingActivation).toHaveBeenCalledOnce();
    expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
    expect(rig.calls).toContain('weather:calm');
  });

  it.each([undefined, null])(
    'preserves a first cleanup failure thrown as %s',
    (firstError) => {
      const rig = createRig(snapshot());
      rig.audio.clearEvent.mockImplementationOnce(() => { throw firstError; });
      rig.world.clearEvent.mockImplementationOnce(() => {
        throw new Error('later world cleanup failed');
      });

      rig.flow.clear();

      expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(firstError);
      expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
      expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
      expect(rig.calls).toContain('weather:calm');
    },
  );

  it('keeps disposal idempotent when the fatal reporter throws', () => {
    const cleanupError = new Error('audio cleanup failed');
    const reporterError = new Error('fatal reporter failed');
    const rig = createRig(snapshot());
    rig.audio.clearEvent.mockImplementationOnce(() => { throw cleanupError; });
    rig.onFatalError.mockImplementationOnce(() => { throw reporterError; });

    expect(() => rig.flow.dispose()).toThrow(reporterError);
    expect(() => rig.flow.dispose()).not.toThrow();

    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(cleanupError);
    expect(rig.drifting.clear).toHaveBeenCalledOnce();
    expect(rig.bundles.cancelPendingActivation).toHaveBeenCalledOnce();
    expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
    expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
  });

  it('suppresses cleanup errors when another flow owns the primary failure', () => {
    const rig = createRig(snapshot());
    rig.world.clearEvent.mockImplementationOnce(() => {
      throw new Error('secondary world cleanup failed');
    });

    rig.flow.clearAfterFailure();

    expect(rig.onFatalError).not.toHaveBeenCalled();
    expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
    expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
  });

  it('cleans and unlocks when night-transition UI setup throws', () => {
    const pending = snapshot({ state: 'nightEvent', pendingEventId: 'shower-night' });
    const rig = createRig(pending);
    const primaryError = new Error('event UI setup failed');
    rig.ui.beginEventPresentation.mockImplementationOnce(() => { throw primaryError; });

    const acceptedTransition = rig.flow.beginNightTransition(pending, true);

    expect(acceptedTransition).toBe(false);
    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(primaryError);
    expect(rig.bundles.beginLoad).not.toHaveBeenCalled();
    expect(rig.world.clearEvent).toHaveBeenCalled();
    expect(rig.bundles.releaseActive).toHaveBeenCalled();
    expect(rig.setBusy.mock.calls.map(([busy]) => busy)).toEqual([true, false]);
  });

  it.each(['clear', 'dispose'] as const)(
    '%s cancels a real pending bundle before fulfillment',
    async (cleanup) => {
      const loading = deferred<EventBundle>();
      const bundleCalls: string[] = [];
      const manager = new EventBundleManager({ load: () => loading.promise });
      const pending = snapshot({ state: 'nightEvent', pendingEventId: 'shower-night' });
      const rig = createRig(pending, manager);

      expect(rig.flow.beginNightTransition(pending, true)).toBe(true);
      if (cleanup === 'clear') rig.flow.clear();
      else rig.flow.dispose();
      const loaded = testBundle('shower-night', bundleCalls);
      loading.resolve(loaded);
      await loading.promise;
      await Promise.resolve();

      expect(loaded.attach).not.toHaveBeenCalled();
      expect(loaded.dispose).toHaveBeenCalledOnce();
    },
  );

  it('clear cancels a real pending bundle after fulfillment', async () => {
    const bundleCalls: string[] = [];
    const loaded = testBundle('shower-night', bundleCalls);
    const manager = new EventBundleManager({ load: async () => loaded });
    const pending = snapshot({ state: 'nightEvent', pendingEventId: 'shower-night' });
    const rig = createRig(pending, manager);

    expect(rig.flow.beginNightTransition(pending, true)).toBe(true);
    await Promise.resolve();
    rig.flow.clear();

    expect(loaded.attach).not.toHaveBeenCalled();
    expect(loaded.dispose).toHaveBeenCalledOnce();
  });

  it('failure cleanup cancels a late bundle and permits a later event load', async () => {
    const firstLoad = deferred<EventBundle>();
    const bundleCalls: string[] = [];
    const first = testBundle('shower-night', bundleCalls);
    const second = testBundle('flowers', bundleCalls);
    const load = vi.fn()
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce(second);
    const manager = new EventBundleManager({ load });
    const pending = snapshot({ state: 'nightEvent', pendingEventId: 'shower-night' });
    const rig = createRig(pending, manager);

    expect(rig.flow.beginNightTransition(pending, true)).toBe(true);
    rig.flow.clearAfterFailure();
    firstLoad.resolve(first);
    await firstLoad.promise;
    await Promise.resolve();

    const later = snapshot({ state: 'dayEvent', pendingEventId: 'flowers' });
    rig.setSnapshot(later);
    await rig.flow.revealPending(later);

    expect(first.attach).not.toHaveBeenCalled();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.attach).toHaveBeenCalledOnce();
    expect(rig.world.stageEvent).toHaveBeenLastCalledWith(
      'flowers',
      expect.any(Number),
    );
    rig.flow.clear();
    expect(second.dispose).toHaveBeenCalledOnce();
  });
});
