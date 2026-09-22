import { describe,expect,it,vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { EventBundle } from '../src/survival/EventBundle';
import { EventBundleManager } from '../src/survival/EventBundleManager';
import {
  SurvivalEventFlow,
  type SurvivalEventFlowDependencies,
} from '../src/survival/SurvivalEventFlow';
import type {
  ActionOutcome,
  SurvivalInventorySnapshot,
  SurvivalItemState,
} from '../src/survival/survivalTypes';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { FLYBY_CHOICE_WINDOW_SECONDS, UFO_CHOICE_WINDOW_SECONDS } from '../src/survival/eventCatalog';
import { formatJournalEntry } from '../src/survival/journal';
import type { EventResponse } from '../src/survival/survivalTypes';
import { sequenceRandom } from './helpers/random';

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
    history: [],
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
  overrides: Partial<SurvivalEventFlowDependencies> = {},
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
      unavailableReason: null,
    })),
  };
  const world = {
    exitFocusedEventView: vi.fn(async (): Promise<void> => undefined),
    projectEventInteractionBounds: vi.fn(() => null),
    hasEventPassed: vi.fn(() => false),
    returnEventItemUse: vi.fn(async () => undefined),
    enterFocusedEventView: vi.fn(async (): Promise<void> => undefined),
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
    prepareEventOutcome: vi.fn((eventId: string) => {
      calls.push(`prepare:${eventId}`);
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
    retrieveDriftingItem: vi.fn(async () => undefined),
    searchDriftingItem: vi.fn(async () => undefined),
    delegateDriftingItem: vi.fn(async () => undefined),
  };
  const ui = {
    showFocusedEvent: vi.fn(), hideFocusedEvent: vi.fn(), updateFocusedEventTarget: vi.fn(),
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
    holdSleep: vi.fn(async (_durationMs?: number): Promise<void> => undefined),
    setBadSleepCue: vi.fn(),
    holdEventOutcome: vi.fn(async () => { calls.push('hold'); }),
    showRewardResult: vi.fn(async () => { calls.push('show-result'); }),
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
      if (eventId === 'drifting-supplies') finishDive();
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
    ...overrides,
  } as unknown as SurvivalEventFlowDependencies);
  return {
    flow,
    calls,
    session,
    world,
    ui,
    audio,
    bundles,
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

function createSessionRig(
  realSession: SurvivalSession,
  overrides: Partial<SurvivalEventFlowDependencies> = {},
) {
  const rig = createRig(realSession.snapshot(), undefined, overrides);
  rig.session.resolveEvent.mockImplementation((response: unknown) => {
    const outcome = realSession.resolveEvent(response as EventResponse);
    rig.setSnapshot(realSession.snapshot());
    return outcome;
  });
  rig.session.beginDawn.mockImplementation(() => {
    const outcome = realSession.beginDawn();
    rig.setSnapshot(realSession.snapshot());
    return outcome;
  });
  return { ...rig, realSession };
}

describe('event selection contracts', () => {
  it('resolves seagull theft at contact, keeps the flock, and releases it at night', async () => {
    const rig = createSessionRig(new SurvivalSession([], {
      seed: 41, initial: { day: 4, food: 2 }, initialEventId: 'seagull-theft',
    }));
    const flight = deferred();
    rig.world.revealEvent.mockImplementation(() => flight.promise);
    const reveal = rig.flow.revealPending(rig.realSession.snapshot());
    await vi.waitFor(() => expect(rig.world.revealEvent).toHaveBeenCalledWith('seagull-theft'));
    expect(rig.calls.indexOf('stage:seagull-theft')).toBeLessThan(rig.calls.indexOf('uncover'));
    expect(rig.realSession.snapshot().food).toBe(2);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    expect(rig.ui.setEventSelection).not.toHaveBeenCalled();
    rig.flow.seagullGrab();
    rig.flow.seagullGrab();
    expect(rig.session.resolveEvent).toHaveBeenCalledOnce();
    expect(rig.realSession.snapshot()).toMatchObject({ food: 1, state: 'day', day: 4 });
    expect(rig.setBusy).toHaveBeenLastCalledWith(true);
    flight.resolve();
    await reveal;
    expect(rig.onFatalError).not.toHaveBeenCalled();
    expect(rig.ui.holdEventOutcome).not.toHaveBeenCalled();
    expect(rig.ui.showEventReveal).not.toHaveBeenCalled();
    expect(rig.ui.setEventSelection).not.toHaveBeenCalled();
    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    expect(rig.bundles.releaseActive).not.toHaveBeenCalled();
    expect(rig.flow.isIdle()).toBe(true);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    rig.flow.beginNightTransition(rig.realSession.snapshot(), false);
    expect(rig.world.clearEvent).toHaveBeenCalledOnce();
    expect(rig.audio.clearEvent).toHaveBeenCalledOnce();
    expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
    rig.flow.dispose();
  });

  it('ignores seagull contact after cancellation', async () => {
    const rig = createSessionRig(new SurvivalSession([], {
      seed: 41, initial: { day: 4, food: 2 }, initialEventId: 'seagull-theft',
    }));
    const flight = deferred();
    rig.world.revealEvent.mockImplementation(() => flight.promise);
    const reveal = rig.flow.revealPending(rig.realSession.snapshot());
    await vi.waitFor(() => expect(rig.world.revealEvent).toHaveBeenCalled());
    rig.flow.clear();
    rig.flow.seagullGrab();
    flight.resolve();
    await reveal;
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    expect(rig.realSession.snapshot().food).toBe(2);
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it('anchors Starry Night to the constellation and restores both survivors at dawn', async () => {
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: 'carlitos-1', type: 'carlitos' },
    ], {
      seed: 715, initial: { day: 4, health: 14, hunger: 95, energy: 0 },
      initialCarlitos: { rest: 'exhausted', hunger: 0, unhappiness: 10 },
      initialEventId: 'starry-night',
    }));
    await rig.flow.revealPending(rig.realSession.snapshot());
    expect(rig.ui.setEventSelection).toHaveBeenLastCalledWith(new Map(), [
      expect.objectContaining({ id: 'wish', anchorId: 'starry-night:constellation' }),
      expect.objectContaining({ id: 'sleep' }),
    ]);
    rig.flow.resolveContextual('wish');
    rig.flow.resolveContextual('wish');
    await vi.waitFor(() => expect(rig.session.beginDawn).toHaveBeenCalledTimes(1));
    expect(rig.session.resolveEvent).toHaveBeenCalledTimes(1);
    expect(rig.realSession.snapshot()).toMatchObject({
      health: 100, hunger: 0, energy: 4,
      carlitos: { rest: 'rested', hunger: 5, unhappiness: 0 },
    });
    rig.flow.dispose();
  });
  it('offers the Radio to call a crew and routes its reply through the event flow', async () => {
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: 'radio-1', type: 'radio' },
    ], {
      seed: 41, random: sequenceRandom([0]),
      initial: { day: 20, energy: 0, hunger: 0, food: 3 },
      initialEventId: 'other-people',
    }));
    await rig.flow.revealPending(rig.realSession.snapshot());
    expect(rig.world.setEventEligibleItems).toHaveBeenLastCalledWith(new Set(['radio-1']));

    rig.flow.resolveItem('radio', 'radio-1');
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));

    expect(rig.world.playEventItemUse).toHaveBeenCalledWith(
      'other-people', 'radio', 'radio-1', expect.any(Function),
    );
    expect(rig.audio.eventItemCue).toHaveBeenCalledExactlyOnceWith('radio', 1);
    expect(rig.realSession.snapshot()).toMatchObject({
      rescueLead: 5, energy: 2, ending: null,
      inventory: { 'radio-1': { condition: 'usable' } },
    });
    expect(rig.onInvariantError).not.toHaveBeenCalled();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it.each([
    'spyglass',
    'flareGun',
    'ductTape',
  ] as const)('loses the selected Handyman %s instance and records the resolved reward', async (
    source,
  ) => {
    const selectedId = `${source}-2` as ItemInstanceId;
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: `${source}-1`, type: source },
      { instanceId: selectedId, type: source },
    ], {
      seed: 105, random: sequenceRandom([0, 0.99, 0.99, 0.99]),
      initial: { day: 20 }, initialEventId: 'handyman',
    }));
    // Importance: 95/100. A Handyman payment must have exactly one animation owner.
    const use = deferred();
    rig.world.playEventChoice.mockImplementation(() => use.promise);
    await rig.flow.revealPending(rig.realSession.snapshot());

    rig.flow.resolveItem(source, selectedId);
    rig.flow.resolveContextual('touch');
    rig.flow.resolveItem(source, `${source}-1`);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    use.resolve();

    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.world.playEventItemUse).not.toHaveBeenCalled();
    expect(rig.world.playEventChoice).toHaveBeenCalledExactlyOnceWith('handyman', {
      choiceId: source, instanceId: selectedId, condition: 'usable',
    });
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({
      kind: 'item', choiceId: source, instanceId: selectedId,
    });
    expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
      accepted: true,
      eventResult: { eventId: 'handyman', choiceId: source, resultId: 'handyman-reward' },
      rewardSummary: { kind: 'item', id: 'energyBar', quantity: 1 },
    });
    const after = rig.realSession.snapshot();
    expect(after.inventory).toMatchObject({
      [`${source}-1`]: { condition: 'usable' },
      [selectedId]: { condition: 'lost' },
      'energyBar-1': { condition: 'usable' },
    });
    expect(after.health).toBe(100);
    const entry = after.journalEntries.find(({ day }) => day === 20)!;
    expect(entry.nighttime).toMatchObject({
      kind: 'event',
      event: {
        eventId: 'handyman', attemptedChoiceId: source, attemptedItemId: source,
        inventoryMutations: expect.arrayContaining([
          { kind: 'lose', instanceIds: [selectedId] },
          { kind: 'gain', instanceIds: ['energyBar-1'] },
        ]),
      },
    });
    expect(formatJournalEntry(entry).nighttime).not.toContain('Touch the Hand');
    expect(rig.onInvariantError).not.toHaveBeenCalled();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it('keeps intentional Hand selection when later input arrives in the same turn', async () => {
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: 'spyglass-1', type: 'spyglass' },
    ], {
      seed: 1061, random: sequenceRandom([0, 0, 0.99, 0.99]),
      initial: { day: 20 }, initialEventId: 'handyman',
    }));
    await rig.flow.revealPending(rig.realSession.snapshot());

    rig.flow.resolveContextual('touch');
    rig.flow.resolveItem('spyglass', 'spyglass-1');
    rig.flow.resolveContextual('touch');

    await vi.waitFor(() => expect(rig.session.resolveEvent).toHaveBeenCalledOnce());
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({
      kind: 'choice', choiceId: 'touch',
    });
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
      accepted: true, deltas: { health: -60, hull: -30 },
      eventResult: { eventId: 'handyman', choiceId: 'touch', resultId: 'handyman-touch' },
    });
    const after = rig.realSession.snapshot();
    expect(after).toMatchObject({ health: 45, inventory: { 'spyglass-1': { condition: 'usable' } } });
    const entry = after.journalEntries.find(({ day }) => day === 20)!;
    expect(entry.nighttime).toMatchObject({
      kind: 'event',
      event: { attemptedChoiceId: 'touch', attemptedItemId: null, inventoryMutations: [] },
    });
    expect(formatJournalEntry(entry).nighttime).toContain('I touched the offered hand.');
    expect(rig.onInvariantError).not.toHaveBeenCalled();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it.each(['flareGun', 'flashlight'] as const)(
    'keeps a Plane %s signal selected before expiry through animation and repeated input',
    async (itemId) => {
      const instanceId = `${itemId}-1` as ItemInstanceId;
      const rig = createSessionRig(new SurvivalSession([{ instanceId, type: itemId }], {
        seed: 1111, random: sequenceRandom([0, 0.99, 0.99, 0.99]),
        initial: { day: 15, rescueLead: 2 }, initialEventId: 'plane',
      }));
      const use = deferred();
      rig.world.playEventItemUse.mockImplementation(() => use.promise);
      await rig.flow.revealPending(rig.realSession.snapshot());
      rig.flow.update(FLYBY_CHOICE_WINDOW_SECONDS - 0.01);
      rig.flow.resolveItem(itemId, instanceId);
      rig.flow.update(FLYBY_CHOICE_WINDOW_SECONDS);
      rig.flow.resolveEndure();
      rig.flow.resolveItem(itemId, instanceId);
      expect(rig.session.resolveEvent).not.toHaveBeenCalled();
      use.resolve();

      await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
      rig.flow.update(FLYBY_CHOICE_WINDOW_SECONDS);
      rig.flow.resolveItem(itemId, instanceId);
      expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({
        kind: 'item', choiceId: itemId, instanceId,
      });
      expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
        accepted: true,
        eventResult: { eventId: 'plane', choiceId: itemId, resultId: 'plane-signaled' },
      });
      const after = rig.realSession.snapshot();
      expect(after.rescueLead).toBe(itemId === 'flareGun' ? 6 : 4);
      expect(after.inventory[instanceId]?.condition).toBe(itemId === 'flareGun' ? 'consumed' : 'usable');
      expect(after.journalEntries).toHaveLength(1);
      expect(after.journalEntries[0]!.nighttime).toMatchObject({
        kind: 'event', event: { attemptedChoiceId: itemId, attemptedItemId: itemId },
      });
      expect(rig.onInvariantError).not.toHaveBeenCalled();
      expect(rig.onFatalError).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])('offers only UFO signals and pauses the twelve-second window, equipped=%s', async (equipped) => {
    const isVisibilityBlocked = vi.fn(() => false);
    const rig = createSessionRig(new SurvivalSession(equipped ? [
      { instanceId: 'flashlight-1', type: 'flashlight' },
    ] : [], { seed: 1113, initial: { day: 15 }, initialEventId: 'flying-saucer' }), { isVisibilityBlocked });
    rig.flow.update(100);
    await rig.flow.revealPending(rig.realSession.snapshot());
    expect(rig.flow.canUsePillow(rig.realSession.snapshot())).toBe(false);
    expect(rig.ui.setEventSelection).toHaveBeenLastCalledWith(new Map(equipped ? [['flashlight-1', 'flashlight']] : []), []);
    rig.flow.update(UFO_CHOICE_WINDOW_SECONDS - 1);
    isVisibilityBlocked.mockReturnValue(true);
    rig.flow.update(100);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    isVisibilityBlocked.mockReturnValue(false);
    rig.flow.update(1);
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({ kind: 'endure' });
    expect(rig.audio.confirm).not.toHaveBeenCalled();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it.each(['flashlight', 'flareGun'] as const)('waits for the UFO beam after %s and clears the scene', async (itemId) => {
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: `${itemId}-1`, type: itemId },
    ], { seed: 1113, initial: { day: 15 }, initialEventId: 'flying-saucer' }));
    const beam = deferred();
    rig.world.reactToEventOutcome.mockImplementation(() => beam.promise);
    await rig.flow.revealPending(rig.realSession.snapshot());
    rig.world.clearEvent.mockClear();
    rig.flow.resolveItem(itemId, `${itemId}-1`);
    await vi.waitFor(() => expect(rig.world.reactToEventOutcome).toHaveBeenCalledOnce());
    expect(rig.realSession.snapshot().state).toBe('nightEvent');
    expect(rig.presentTerminal).not.toHaveBeenCalled();
    rig.flow.update(FLYBY_CHOICE_WINDOW_SECONDS);
    expect(rig.session.resolveEvent).toHaveBeenCalledOnce();
    beam.resolve();
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.presentTerminal).toHaveBeenCalledOnce();
    expect(rig.presentTerminal).toHaveBeenCalledWith(expect.objectContaining({ ending: null }));
    expect(rig.world.clearEvent).toHaveBeenCalledOnce();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it.each([
    ['plane', 'plane-pass', FLYBY_CHOICE_WINDOW_SECONDS],
    ['flying-saucer', 'ufo-pass', UFO_CHOICE_WINDOW_SECONDS],
  ] as const)('rejects late %s signals and records the safe response once', async (eventId, resultId, windowSeconds) => {
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: 'flareGun-1', type: 'flareGun' },
      { instanceId: 'flashlight-1', type: 'flashlight' },
    ], {
      seed: 1112, random: sequenceRandom([0, 0.99, 0.99, 0.99]),
      initial: { day: 15, rescueLead: 2 }, initialEventId: eventId,
    }));
    const choice = deferred();
    rig.world.playEventChoice.mockImplementation(() => choice.promise);
    await rig.flow.revealPending(rig.realSession.snapshot());
    rig.flow.update(windowSeconds);
    rig.flow.resolveItem('flareGun', 'flareGun-1');
    rig.flow.resolveItem('flashlight', 'flashlight-1');
    rig.flow.resolveEndure();
    rig.flow.update(FLYBY_CHOICE_WINDOW_SECONDS);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    choice.resolve();

    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({ kind: 'endure' });
    expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
      accepted: true,
      eventResult: { eventId, choiceId: 'sleep', resultId },
    });
    const after = rig.realSession.snapshot();
    expect(after).toMatchObject({
      rescueLead: 2,
      inventory: { 'flareGun-1': { condition: 'usable' }, 'flashlight-1': { condition: 'usable' } },
    });
    expect(after.journalEntries).toHaveLength(1);
    expect(after.journalEntries[0]!.nighttime).toMatchObject({
      kind: 'event',
      event: {
        eventId, attemptedChoiceId: 'sleep', attemptedItemId: null,
        text: { kind: 'eventResult', reference: { eventId, choiceId: 'sleep', resultId } },
      },
    });
    expect(rig.onInvariantError).not.toHaveBeenCalled();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  // Importance: 95/100. Spent guns must remain until the fade fully covers their return.
  it.each(['shotgun', 'flareGun'] as const)(
    'clears the spent %s only after the event fade covers the scene', async (itemId) => {
      const instanceId: ItemInstanceId = `${itemId}-1`;
      const rig = createSessionRig(new SurvivalSession([{ instanceId, type: itemId }], {
        seed: 42, random: sequenceRandom([0, 0.99, 0.99, 0.99]),
        initial: { day: 15 }, initialEventId: 'ghost-ship',
      }));
      const hold = deferred();
      const cover = deferred();
      try {
        await rig.flow.revealPending(rig.realSession.snapshot());
        rig.ui.holdEventOutcome.mockImplementation(() => hold.promise);
        rig.ui.setSleepCovered.mockImplementation((covered) => covered ? cover.promise : Promise.resolve());
        rig.world.clearEvent.mockClear();
        rig.ui.setSleepCovered.mockClear();
        rig.flow.resolveItem(itemId, instanceId);
        await vi.waitFor(() => expect(rig.ui.holdEventOutcome).toHaveBeenCalledOnce());
        expect(rig.realSession.snapshot().inventory[instanceId]?.condition).toBe('consumed');
        expect(rig.world.clearEvent).not.toHaveBeenCalled();
        hold.resolve();
        await vi.waitFor(() => expect(rig.ui.setSleepCovered).toHaveBeenCalledWith(true));
        expect(rig.world.clearEvent).not.toHaveBeenCalled();
        cover.resolve();
        await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
        expect(rig.world.clearEvent).toHaveBeenCalledOnce();
        const uncover = rig.ui.setSleepCovered.mock.calls.findIndex(([covered]) => !covered);
        expect(uncover).toBeGreaterThanOrEqual(0);
        expect(rig.world.clearEvent.mock.invocationCallOrder[0]).toBeLessThan(
          rig.ui.setSleepCovered.mock.invocationCallOrder[uncover]!,
        );
        expect(rig.onFatalError).not.toHaveBeenCalled();
      } finally {
        hold.resolve();
        cover.resolve();
        rig.flow.dispose();
      }
    },
  );

  it('starts the sleep fade before the outcome hold and waits before clearing Ghost Ship', async () => {
    const rig = createSessionRig(new SurvivalSession([], {
      seed: 42, random: sequenceRandom([0, 0.99, 0.99, 0.99]), initial: { day: 15 }, initialEventId: 'ghost-ship',
    }));
    await rig.flow.revealPending(rig.realSession.snapshot());
    const hold = deferred();
    const cover = deferred();
    rig.ui.holdEventOutcome.mockImplementation(() => hold.promise);
    rig.ui.setSleepCovered.mockImplementation((covered) => covered ? cover.promise : Promise.resolve());
    rig.world.clearEvent.mockClear();
    rig.ui.setSleepCovered.mockClear();
    rig.flow.resolveContextual('sleep');
    expect(rig.ui.setSleepCovered).toHaveBeenCalledWith(true);
    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    cover.resolve();
    await vi.waitFor(() => expect(rig.ui.holdEventOutcome).toHaveBeenCalledOnce());
    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    hold.resolve();
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.world.clearEvent).toHaveBeenCalledOnce();
    expect(rig.onFatalError).not.toHaveBeenCalled();
    rig.flow.dispose();
  });

  it('uncovers the event when sleep is rejected', async () => {
    const pending = snapshot({ state: 'nightEvent', pendingEventId: 'ghost-ship' });
    const rig = createRig(pending);
    rig.setResolveEvent(() => accepted({ accepted: false }));
    await rig.flow.revealPending(pending);
    rig.ui.setSleepCovered.mockClear();
    rig.flow.resolveContextual('sleep');
    await vi.waitFor(() => expect(rig.audio.deny).toHaveBeenCalledOnce());
    expect(rig.ui.setSleepCovered).toHaveBeenLastCalledWith(false);
    await vi.waitFor(() => expect(rig.flow.isStableChoice()).toBe(true));
    rig.flow.dispose();
  });

  it('ends Ghost Ship only after the presenter reports the whole ship has passed', async () => {
    const rig = createSessionRig(new SurvivalSession([], {
      seed: 42, random: sequenceRandom([0, 0.99, 0.99, 0.99]), initial: { day: 15 }, initialEventId: 'ghost-ship',
    }));
    await rig.flow.revealPending(rig.realSession.snapshot());
    rig.flow.update(1000);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    rig.world.hasEventPassed.mockReturnValue(true);
    rig.flow.update(0.016);
    rig.flow.update(0.016);
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({ kind: 'endure' });
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it('returns from binoculars to Ghost Ship choices without resolving or spending the item', async () => {
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: 'spyglass-1', type: 'spyglass' },
      { instanceId: 'flashlight-1', type: 'flashlight' },
    ], {
      seed: 42, random: sequenceRandom([0, 0.99, 0.99, 0.99]), initial: { day: 15 }, initialEventId: 'ghost-ship',
    }));
    await rig.flow.revealPending(rig.realSession.snapshot());
    const before = rig.realSession.snapshot();
    rig.flow.resolveItem('spyglass', 'spyglass-1');
    await vi.waitFor(() => expect(rig.world.returnEventItemUse).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(rig.flow.isStableChoice()).toBe(true));
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    expect(rig.realSession.snapshot()).toEqual(before);
    expect(rig.world.setEventEligibleItems).toHaveBeenLastCalledWith(new Set(['spyglass-1', 'flashlight-1']));
    rig.flow.resolveItem('flashlight', 'flashlight-1');
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({
      kind: 'item', choiceId: 'flashlight', instanceId: 'flashlight-1',
    });
    expect(rig.realSession.snapshot().health).toBeLessThan(before.health);
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it('resolves Chest Attack automatically after the reveal without choice UI', async () => {
    const rig = createSessionRig(new SurvivalSession([], {
      seed: 10, random: sequenceRandom([0, 0.99, 0.99, 0.99]),
      initial: { day: 3, health: 100 },
      initialChest: { state: 'mimic', acquiredDay: 1 }, initialEventId: 'chest-attack',
    }));
    const reveal = deferred();
    const attack = deferred();
    rig.world.revealEvent.mockImplementation(() => reveal.promise);
    rig.world.playEventChoice.mockImplementation(() => attack.promise);
    const revealing = rig.flow.revealPending(rig.realSession.snapshot());
    await vi.waitFor(() => expect(rig.world.revealEvent).toHaveBeenCalled());
    expect(rig.realSession.snapshot().health).toBe(100);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    expect(rig.ui.setEventSelection).not.toHaveBeenCalled();
    reveal.resolve();
    await vi.waitFor(() => expect(rig.world.playEventChoice).toHaveBeenCalledWith(
      'chest-attack',
      { choiceId: 'attack', instanceId: null, condition: null },
    ));
    expect(rig.realSession.snapshot().health).toBe(100);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    attack.resolve();
    await revealing;
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    rig.flow.resolveContextual('attack');
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({ kind: 'choice', choiceId: 'attack' });
    expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
      accepted: true, deltas: { health: -25 },
      eventResult: { eventId: 'chest-attack', choiceId: 'attack', resultId: 'chest-attack' },
    });
    expect(rig.realSession.snapshot()).toMatchObject({
      state: 'day', pendingEventId: null, health: 80, chest: { state: 'none', acquiredDay: null },
    });
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalled();
    expect(rig.onInvariantError).not.toHaveBeenCalled();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'check-the-back.fish', 'usable', 1],
    [0.999, 'check-the-back.bad', 'broken', 0],
  ] as const)(
    'uses the Knife automatically for Check the Back result %s',
    async (roll, resultId, knifeCondition, food) => {
      const rig = createSessionRig(new SurvivalSession([
        { instanceId: 'knife-1', type: 'knife' },
      ], {
        seed: 105,
        random: sequenceRandom([roll]),
        initial: { day: 2 },
        initialEventId: 'check-the-back',
      }));
      await rig.flow.revealPending(rig.realSession.snapshot());

      expect(rig.world.setEventEligibleItems).toHaveBeenLastCalledWith(new Set());
      expect(rig.ui.setEventSelection).toHaveBeenLastCalledWith(
        new Map(),
        expect.arrayContaining([
          expect.objectContaining({ id: 'check', label: 'Yes' }),
          expect.objectContaining({ id: 'sleep', label: 'No' }),
        ]),
      );

      rig.flow.resolveContextual('check');
      await vi.waitFor(() => expect(rig.session.resolveEvent).toHaveBeenCalledOnce());

      expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({
        kind: 'item', choiceId: 'knife', instanceId: 'knife-1',
      });
      expect(rig.world.playEventItemUse).not.toHaveBeenCalled();
      expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
        accepted: true,
        eventResult: { eventId: 'check-the-back', choiceId: 'knife', resultId },
      });
      expect(rig.realSession.snapshot()).toMatchObject({
        food,
        health: 100,
        inventory: { 'knife-1': { condition: knifeCondition } },
      });
      expect(rig.onInvariantError).not.toHaveBeenCalled();
      expect(rig.onFatalError).not.toHaveBeenCalled();
      rig.flow.clear();
    },
  );

  it('keeps gained food off the boat until the Check the Back reaction ends', async () => {
    const rig = createSessionRig(new SurvivalSession([], {
      seed: 105,
      random: sequenceRandom([0]),
      initial: { day: 2 },
      initialEventId: 'check-the-back',
    }));
    const reaction = deferred();
    rig.world.reactToEventOutcome.mockImplementation(() => reaction.promise);
    await rig.flow.revealPending(rig.realSession.snapshot());

    rig.flow.resolveContextual('check');
    await vi.waitFor(() => expect(rig.world.reactToEventOutcome).toHaveBeenCalledOnce());
    expect(rig.realSession.snapshot().food).toBe(1);

    rig.flow.sync(rig.realSession.snapshot());
    expect(rig.world.syncInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ food: 0 }),
    );

    reaction.resolve();
    await vi.waitFor(() => expect(rig.world.syncInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ food: 1 }),
    ));
    rig.flow.clear();
  });

  it('keeps the forced Fish result when automatic Knife use replaces Yes', async () => {
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: 'knife-1', type: 'knife' },
    ], {
      seed: 105,
      random: sequenceRandom([0.999]),
      initial: { day: 2 },
      initialEventId: 'check-the-back',
    }), {
      initialEventResultId: 'check-the-back.fish',
    });
    await rig.flow.revealPending(rig.realSession.snapshot());

    rig.flow.resolveContextual('check');
    await vi.waitFor(() => expect(rig.session.resolveEvent).toHaveBeenCalledOnce());

    expect(rig.session.resolveEvent).toHaveBeenCalledWith({
      kind: 'item',
      choiceId: 'knife',
      instanceId: 'knife-1',
      resultId: 'check-the-back.fish',
    });
    expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
      eventResult: {
        eventId: 'check-the-back',
        choiceId: 'knife',
        resultId: 'check-the-back.fish',
      },
    });
    expect(rig.realSession.snapshot().inventory['knife-1']?.condition).toBe('usable');
    rig.flow.clear();
  });
});

describe('SurvivalEventFlow', () => {
  it('prepares the Midnight Tour grave before uncovering the island', async () => {
    const rig = createRig(snapshot({ state: 'nightEvent', pendingEventId: 'midnight-tour' }));
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot({ state: 'nightEvent', pendingEventId: null }));
      return accepted({
        eventResult: {
          eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-grave',
        },
      });
    });
    await rig.flow.revealPending(rig.session.snapshot());
    rig.flow.resolveContextual('visit');
    await vi.waitFor(() => expect(rig.setBusy).toHaveBeenLastCalledWith(false));

    rig.calls.length = 0;
    rig.flow.resolveContextual('visit');
    await vi.waitFor(() => expect(rig.world.reactToEventOutcome).toHaveBeenCalledOnce());

    expect(rig.calls.indexOf('prepare:midnight-tour')).toBeGreaterThan(-1);
    expect(rig.calls.indexOf('prepare:midnight-tour')).toBeLessThan(rig.calls.indexOf('uncover'));
    expect(rig.calls.indexOf('uncover')).toBeLessThan(rig.calls.indexOf('react:midnight-tour'));
    rig.flow.dispose();
  });

  it.each([false, true])('holds the bite blackout after dawn settles, disposed=%s', async (disposeDuringHold) => {
    const settled = deferred<boolean>();
    const hold = deferred();
    let waitForDawn = false;
    const rig = createRig(snapshot({ state: 'nightEvent', pendingEventId: 'midnight-tour' }), undefined, {
      renderAndSettleCoveredScene: async () => waitForDawn ? settled.promise : true,
    });
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot({ state: 'nightEvent', pendingEventId: null }));
      return accepted({ eventResult: { eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-attack' } });
    });
    rig.ui.holdSleep.mockReturnValue(hold.promise);
    await rig.flow.revealPending(rig.session.snapshot());
    rig.flow.resolveContextual('visit');
    await vi.waitFor(() => expect(rig.setBusy).toHaveBeenLastCalledWith(false));
    waitForDawn = true;
    rig.flow.resolveContextual('visit');
    await vi.waitFor(() => expect(rig.session.beginDawn).toHaveBeenCalledOnce());
    expect(rig.ui.setSleepCovered).toHaveBeenLastCalledWith(true);
    expect(rig.ui.holdSleep).not.toHaveBeenCalled();
    expect(rig.flow.presentationSnapshot(rig.session.snapshot()).state).toBe('day');
    settled.resolve(true);
    await vi.waitFor(() => expect(rig.ui.holdSleep).toHaveBeenCalledExactlyOnceWith(3_000));
    expect(rig.ui.setSleepCovered).toHaveBeenLastCalledWith(true);
    expect(rig.setBusy).toHaveBeenLastCalledWith(true);
    if (disposeDuringHold) rig.flow.dispose();
    rig.ui.setSleepCovered.mockClear();
    hold.resolve();
    if (disposeDuringHold) {
      await hold.promise;
      await Promise.resolve();
      expect(rig.ui.setSleepCovered).not.toHaveBeenCalledWith(false);
    } else {
      await vi.waitFor(() => expect(rig.ui.setSleepCovered).toHaveBeenLastCalledWith(false));
      expect(rig.setBusy).toHaveBeenLastCalledWith(false);
      rig.flow.dispose();
    }
  });

  it('waits at the bow before offering an island choice without consuming the event', async () => {
    const rig = createRig(snapshot({ state: 'nightEvent', pendingEventId: 'midnight-tour' }));
    await rig.flow.revealPending(rig.session.snapshot());
    const arrival = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(arrival.promise);
    rig.flow.resolveContextual('visit');
    rig.flow.resolveContextual('visit');
    expect(rig.world.enterFocusedEventView).toHaveBeenCalledOnce();
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    expect(rig.ui.setEventSelection).toHaveBeenLastCalledWith(new Map(), []);
    arrival.resolve();
    await vi.waitFor(() => expect(rig.setBusy).toHaveBeenLastCalledWith(false));
    expect(rig.ui.setEventSelection).toHaveBeenLastCalledWith(new Map(), [
      expect.objectContaining({ id: 'visit' }), expect.objectContaining({ id: 'sleep' }),
    ]);
    const choices = rig.ui.setEventSelection.mock.lastCall?.[1];
    expect(choices?.every((choice: { anchorId?: string }) => choice.anchorId === undefined)).toBe(true);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    rig.flow.resolveContextual('sleep');
    await vi.waitFor(() => expect(rig.session.resolveEvent).toHaveBeenCalledWith({ kind: 'choice', choiceId: 'sleep' }));
    rig.flow.dispose();
  });

  it('does not reopen an island popup after disposal during the walk', async () => {
    const rig = createRig(snapshot({ state: 'nightEvent', pendingEventId: 'midnight-tour' }));
    await rig.flow.revealPending(rig.session.snapshot());
    const arrival = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(arrival.promise);
    rig.flow.resolveContextual('visit');
    rig.flow.dispose();
    rig.ui.setEventSelection.mockClear();
    arrival.resolve();
    await arrival.promise;
    await Promise.resolve();
    expect(rig.ui.setEventSelection).not.toHaveBeenCalled();
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
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

  it('ignores a stale drifting focus rejection after a same-lifecycle replacement', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' });
    const rig = createRig(pending);
    const firstEntry = deferred();
    rig.world.enterFocusedEventView.mockReturnValueOnce(firstEntry.promise);
    await rig.flow.revealPending(pending);

    const first = rig.flow.focusEvent('drifting-supplies');
    await vi.waitFor(() => expect(rig.world.enterFocusedEventView).toHaveBeenCalledOnce());
    rig.flow.clear();
    await rig.flow.revealPending(pending);
    await rig.flow.focusEvent('drifting-supplies');
    rig.onFatalError.mockClear();
    rig.setBusy.mockClear();

    firstEntry.reject(new Error('stale drifting focus failed'));
    await first;

    expect(rig.onFatalError).not.toHaveBeenCalled();
    expect(rig.setBusy).not.toHaveBeenCalled();
  });

  // Importance: 98/100. Stale camera work must not change a replacement event.
  it('makes a focused camera return inert after a same-lifecycle replacement', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' });
    const rig = createRig(pending);
    const camera = deferred();
    await rig.flow.revealPending(pending);
    await rig.flow.focusEvent('drifting-supplies');
    rig.world.exitFocusedEventView.mockReturnValueOnce(camera.promise);
    const work = rig.flow.chooseFocused({ id: 'sleep', instanceId: null });
    await vi.waitFor(() => expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce());
    rig.flow.clear();
    await rig.flow.revealPending(pending);
    rig.world.clearEvent.mockClear(); rig.renderSnapshot.mockClear(); rig.presentTerminal.mockClear();
    rig.setBusy.mockClear();
    camera.resolve(); await work;
    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    expect(rig.renderSnapshot).not.toHaveBeenCalled();
    expect(rig.presentTerminal).not.toHaveBeenCalled();
    expect(rig.setBusy).not.toHaveBeenCalled();
  });

  it.each(['drifting-supplies', 'drifting-chest'] as const)('returns from %s without resolving or clearing it', async (eventId) => {
    const rig = createRig(snapshot({ state: 'dayEvent', pendingEventId: eventId }));
    await rig.flow.revealPending(rig.session.snapshot());
    await rig.flow.focusEvent(eventId);
    await rig.flow.backFocused();
    expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce();
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalled();
    await rig.flow.focusEvent(eventId);
    expect(rig.ui.showFocusedEvent).toHaveBeenCalledTimes(2);
  });

  it('rejects an ID and instance pair that was not rendered', async () => {
    const rig = createRig(snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' }));
    await rig.flow.revealPending(rig.session.snapshot());
    await rig.flow.focusEvent('drifting-supplies');
    await rig.flow.chooseFocused({ id: 'retrieve', instanceId: 'scubaSet-1' });
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
  });

  it('waits for visibility before resolving a focused choice', async () => {
    const resume = deferred<boolean>();
    const wait = vi.fn(async () => true);
    const rig = createRig(snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' }), undefined,
      { waitForVisibilityResume: wait });
    await rig.flow.revealPending(rig.session.snapshot());
    await rig.flow.focusEvent('drifting-supplies');
    wait.mockReturnValueOnce(resume.promise);
    const work = rig.flow.chooseFocused({ id: 'sleep', instanceId: null });
    await Promise.resolve();
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    resume.resolve(true); await work;
    expect(rig.session.resolveEvent).toHaveBeenCalledOnce();
  });

  it('does not restore controls after disposal during camera return', async () => {
    const rig = createRig(snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' }));
    const camera = deferred();
    await rig.flow.revealPending(rig.session.snapshot());
    await rig.flow.focusEvent('drifting-supplies');
    rig.world.exitFocusedEventView.mockReturnValueOnce(camera.promise);
    const work = rig.flow.backFocused();
    rig.flow.dispose();
    const calls = rig.ui.restoreCommandFocus.mock.calls.length;
    camera.resolve(); await work;
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledTimes(calls);
  });

  it('does not unlock a new entry after stale entry cleanup', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' });
    const rig = createRig(pending);
    const entry = deferred(), staleExit = deferred(), newEntry = deferred();
    await rig.flow.revealPending(pending);
    rig.world.enterFocusedEventView.mockReturnValueOnce(entry.promise);
    rig.world.exitFocusedEventView.mockReturnValueOnce(staleExit.promise);
    const stale = rig.flow.focusEvent('drifting-supplies');
    rig.setSnapshot(snapshot()); entry.resolve();
    await vi.waitFor(() => expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce());
    rig.flow.clear(); rig.setSnapshot(pending); await rig.flow.revealPending(pending);
    rig.world.enterFocusedEventView.mockReturnValueOnce(newEntry.promise);
    rig.setBusy.mockClear(); rig.ui.showFocusedEvent.mockClear();
    const newer = rig.flow.focusEvent('drifting-supplies');
    staleExit.resolve(); await stale;
    expect(rig.setBusy).toHaveBeenCalledExactlyOnceWith(true);
    expect(rig.ui.showFocusedEvent).not.toHaveBeenCalled();
    newEntry.resolve(); await newer;
    expect(rig.ui.showFocusedEvent).toHaveBeenCalledOnce();
  });

  it.each(['drifting-supplies', 'drifting-chest'] as const)(
    'keeps %s visible after Let It Drift, then clears it at night',
    async (eventId) => {
      const rig = createSessionRig(new SurvivalSession([], {
        seed: 41,
        initial: { day: 4 },
        initialEventId: eventId,
      }));
      await rig.flow.revealPending(rig.realSession.snapshot());
      await rig.flow.focusEvent(eventId);
      await rig.flow.chooseFocused({ id: 'sleep', instanceId: null });

      expect(rig.world.clearEvent).not.toHaveBeenCalled();
      expect(rig.bundles.releaseActive).not.toHaveBeenCalled();
      expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
      expect(rig.flow.isIdle()).toBe(true);

      rig.flow.beginNightTransition(rig.realSession.snapshot(), false);

      expect(rig.world.clearEvent).toHaveBeenCalledOnce();
      expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
      rig.flow.dispose();
    },
  );

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
    expect(rig.bundles.cancelPendingActivation).toHaveBeenCalledOnce();
    expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
    expect(rig.calls).toContain('weather:calm');
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

it.each([false, true])('shows grave gains only after dawn and waits for close, disposed=%s', async (disposeDuringPopup) => {
  const settled = deferred<boolean>();
  const close = deferred();
  let waitForDawn = false;
  const rig = createRig(snapshot({ state: 'nightEvent', pendingEventId: 'midnight-tour' }), undefined, {
    renderAndSettleCoveredScene: async () => waitForDawn ? settled.promise : true,
  });
  const reward = { kind: 'bundle', rewards: [{ kind: 'item', id: 'knife', quantity: 1 }] } as const;
  rig.setResolveEvent(() => {
    rig.setSnapshot(snapshot({ state: 'nightEvent', pendingEventId: null }));
    return accepted({ eventResult: { eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-grave' }, rewardSummary: reward });
  });
  rig.ui.showRewardResult.mockReturnValue(close.promise);
  await rig.flow.revealPending(rig.session.snapshot());
  rig.flow.resolveContextual('visit');
  await vi.waitFor(() => expect(rig.setBusy).toHaveBeenLastCalledWith(false));
  waitForDawn = true;
  rig.flow.resolveContextual('visit');
  await vi.waitFor(() => expect(rig.session.beginDawn).toHaveBeenCalledOnce());
  expect(rig.ui.showRewardResult).not.toHaveBeenCalled();
  settled.resolve(true);
  await vi.waitFor(() => expect(rig.ui.showRewardResult).toHaveBeenCalledExactlyOnceWith({
    title: 'ISLAND REWARDS', reward, lines: [],
  }));
  expect(rig.session.snapshot().day).toBe(5);
  expect(rig.ui.setSleepCovered).toHaveBeenLastCalledWith(false);
  expect(rig.setBusy).toHaveBeenLastCalledWith(true);
  if (disposeDuringPopup) rig.flow.dispose();
  rig.ui.restoreCommandFocus.mockClear();
  close.resolve();
  if (disposeDuringPopup) {
    await close.promise;
    await Promise.resolve();
    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();
  } else {
    await vi.waitFor(() => expect(rig.setBusy).toHaveBeenLastCalledWith(false));
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalled();
    rig.flow.dispose();
  }
});
