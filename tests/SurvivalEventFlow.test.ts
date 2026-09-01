import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { EventBundle } from '../src/survival/EventBundle';
import { EventBundleManager } from '../src/survival/EventBundleManager';
import {
  SurvivalEventFlow,
  type SurvivalEventFlowDependencies,
} from '../src/survival/SurvivalEventFlow';
import type { FocusedEventChoiceResolution } from '../src/survival/FocusedEventFlow';
import type {
  ActionOutcome,
  SurvivalInventorySnapshot,
  SurvivalItemState,
} from '../src/survival/survivalTypes';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';
import type { FocusedEventChoiceView } from '../src/ui/SurvivalUiViewModel';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { PLANE_CHOICE_WINDOW_SECONDS } from '../src/survival/eventCatalog';
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
      energyCost: 3,
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
    retrieveDriftingItem: vi.fn(async () => undefined),
    searchDriftingItem: vi.fn(async () => undefined),
    delegateDriftingItem: vi.fn(async () => undefined),
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
  const focused = {
    enter: vi.fn(async (
      _eventId?: string,
      _choices?: readonly unknown[],
    ): Promise<void> => undefined),
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
    focused,
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
    focused,
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

function createSessionRig(realSession: SurvivalSession) {
  const rig = createRig(realSession.snapshot());
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
  it.each([
    ['spyglass', 'flashlight', 'lost'],
    ['flareGun', 'shotgun', 'consumed'],
    ['ductTape', 'energyBar', 'consumed'],
  ] as const)('keeps the selected Handyman %s instance through the result and journal', async (
    source, reward, condition,
  ) => {
    const selectedId = `${source}-2` as ItemInstanceId;
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: `${source}-1`, type: source },
      { instanceId: selectedId, type: source },
    ], {
      seed: 105, random: sequenceRandom([0, 0.99, 0.99, 0.99]),
      initial: { day: 20 }, initialEventId: 'handyman',
    }));
    const use = deferred();
    rig.world.playEventItemUse.mockImplementation(() => use.promise);
    await rig.flow.revealPending(rig.realSession.snapshot());

    rig.flow.resolveItem(source, selectedId);
    rig.flow.resolveContextual('touch');
    rig.flow.resolveItem(source, `${source}-1`);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    use.resolve();

    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({
      kind: 'item', choiceId: source, instanceId: selectedId,
    });
    expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
      accepted: true,
      eventResult: { eventId: 'handyman', choiceId: source, resultId: 'handyman-reward' },
    });
    const after = rig.realSession.snapshot();
    expect(after.inventory).toMatchObject({
      [`${source}-1`]: { condition: 'usable' },
      [selectedId]: { condition },
      [`${reward}-1`]: { condition: 'usable' },
    });
    expect(after.health).toBe(100);
    const entry = after.journalEntries.find(({ day }) => day === 20)!;
    expect(entry.nighttime).toMatchObject({
      kind: 'event',
      event: {
        eventId: 'handyman', attemptedChoiceId: source, attemptedItemId: source,
        inventoryMutations: expect.arrayContaining([
          { kind: condition === 'lost' ? 'lose' : 'consume', instanceIds: [selectedId] },
          { kind: 'gain', instanceIds: [`${reward}-1`] },
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
    expect(after).toMatchObject({ health: 40, inventory: { 'spyglass-1': { condition: 'usable' } } });
    const entry = after.journalEntries.find(({ day }) => day === 20)!;
    expect(entry.nighttime).toMatchObject({
      kind: 'event',
      event: { attemptedChoiceId: 'touch', attemptedItemId: null, inventoryMutations: [] },
    });
    expect(formatJournalEntry(entry).nighttime).toContain('Touch the Hand');
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
      rig.flow.update(PLANE_CHOICE_WINDOW_SECONDS - 0.01);
      rig.flow.resolveItem(itemId, instanceId);
      rig.flow.update(PLANE_CHOICE_WINDOW_SECONDS);
      rig.flow.resolveEndure();
      rig.flow.resolveItem(itemId, instanceId);
      expect(rig.session.resolveEvent).not.toHaveBeenCalled();
      use.resolve();

      await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
      rig.flow.update(PLANE_CHOICE_WINDOW_SECONDS);
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

  it('rejects late Plane input and records Let It Pass once without consuming either item', async () => {
    const rig = createSessionRig(new SurvivalSession([
      { instanceId: 'flareGun-1', type: 'flareGun' },
      { instanceId: 'flashlight-1', type: 'flashlight' },
    ], {
      seed: 1112, random: sequenceRandom([0, 0.99, 0.99, 0.99]),
      initial: { day: 15, rescueLead: 2 }, initialEventId: 'plane',
    }));
    const choice = deferred();
    rig.world.playEventChoice.mockImplementation(() => choice.promise);
    await rig.flow.revealPending(rig.realSession.snapshot());
    rig.flow.update(PLANE_CHOICE_WINDOW_SECONDS);
    rig.flow.resolveItem('flareGun', 'flareGun-1');
    rig.flow.resolveItem('flashlight', 'flashlight-1');
    rig.flow.resolveEndure();
    rig.flow.update(PLANE_CHOICE_WINDOW_SECONDS);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    choice.resolve();

    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({ kind: 'endure' });
    expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
      accepted: true,
      eventResult: { eventId: 'plane', choiceId: 'sleep', resultId: 'plane-pass' },
    });
    const after = rig.realSession.snapshot();
    expect(after).toMatchObject({
      rescueLead: 2,
      inventory: { 'flareGun-1': { condition: 'usable' }, 'flashlight-1': { condition: 'usable' } },
    });
    expect(after.journalEntries).toHaveLength(1);
    expect(after.journalEntries[0]!.nighttime).toMatchObject({
      kind: 'event',
      event: { attemptedChoiceId: 'sleep', choiceLabel: 'Let It Pass', attemptedItemId: null },
    });
    expect(rig.onInvariantError).not.toHaveBeenCalled();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });

  it('preserves Health during Chest Attack reveal and applies Attack damage once after selection', async () => {
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
    expect(rig.ui.setEventSelection).toHaveBeenLastCalledWith(expect.any(Map), expect.arrayContaining([
      expect.objectContaining({ id: 'attack', unavailableReason: null }),
    ]));
    reveal.resolve();
    await revealing;
    expect(rig.realSession.snapshot().health).toBe(100);
    expect(rig.flow.isStableChoice()).toBe(true);

    rig.flow.resolveContextual('attack');
    rig.flow.resolveContextual('attack');
    expect(rig.realSession.snapshot().health).toBe(100);
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    attack.resolve();
    await vi.waitFor(() => expect(rig.flow.isIdle()).toBe(true));
    rig.flow.resolveContextual('attack');
    expect(rig.session.resolveEvent).toHaveBeenCalledExactlyOnceWith({ kind: 'choice', choiceId: 'attack' });
    expect(rig.session.resolveEvent.mock.results[0]!.value).toMatchObject({
      accepted: true, deltas: { health: -40 },
      eventResult: { eventId: 'chest-attack', choiceId: 'attack', resultId: 'chest-attack' },
    });
    expect(rig.realSession.snapshot()).toMatchObject({
      state: 'day', pendingEventId: null, health: 60, chest: { state: 'none', acquiredDay: null },
    });
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalled();
    expect(rig.onInvariantError).not.toHaveBeenCalled();
    expect(rig.onFatalError).not.toHaveBeenCalled();
  });
});

describe('SurvivalEventFlow', () => {
  it('builds the four exact Wreckage choices with independent requirements', async () => {
    const rig = createRig(snapshot({
      state: 'dayEvent',
      pendingEventId: 'wreckage',
      energy: 2,
      carlitos: {
        alive: true, energy: 3, hunger: 5, sickness: 0,
        unhappiness: 0, pettedToday: false, deathCause: null,
      },
      inventory: inventory({
        'scubaSet-2': {
          instanceId: 'scubaSet-2', type: 'scubaSet', condition: 'usable',
        },
        'scubaSet-1': {
          instanceId: 'scubaSet-1', type: 'scubaSet', condition: 'usable',
        },
      }),
    }));
    await rig.flow.revealPending(rig.session.snapshot());
    await rig.flow.focusEvent('wreckage');

    expect(rig.focused.enter).toHaveBeenCalledWith('wreckage', [
      {
        id: 'search', label: 'Search Debris', unavailableReason: null,
        energyCost: 2, energyOwner: 'player', instanceId: null,
      },
      {
        id: 'delegate-carlitos', label: 'Send Carlitos', unavailableReason: null,
        energyCost: 3, energyOwner: 'carlitos', instanceId: null,
      },
      {
        id: 'dive', label: 'Search underwater',
        unavailableReason: 'Requires 3 energy; you have 2.',
        energyCost: 3, energyOwner: 'player', instanceId: 'scubaSet-1',
      },
      {
        id: 'leave', label: 'Leave', unavailableReason: null, instanceId: null,
        dismisses: true,
      },
    ]);
  });

  it.each([
    ['missing', inventory(), 'Requires usable scuba gear.'],
    ['broken', inventory({
      'scubaSet-1': {
        instanceId: 'scubaSet-1', type: 'scubaSet', condition: 'broken',
      },
    }), 'Requires usable scuba gear.'],
  ])('keeps Dive visible with %s scuba gear', async (_label, carried, reason) => {
    const rig = createRig(snapshot({
      state: 'dayEvent', pendingEventId: 'wreckage', energy: 3, inventory: carried,
    }));
    await rig.flow.revealPending(rig.session.snapshot());
    await rig.flow.focusEvent('wreckage');

    expect(rig.focused.enter).toHaveBeenCalledWith('wreckage', expect.arrayContaining([
      expect.objectContaining({
        id: 'dive', instanceId: null, unavailableReason: reason,
      }),
    ]));
  });

  it.each([
    ['absent', null, 'Carlitos is not aboard.'],
    ['dead', {
      alive: false, energy: 3, hunger: 5, sickness: 0,
      unhappiness: 0, pettedToday: false, deathCause: 'sickness' as const,
    }, 'Carlitos cannot retrieve the loot.'],
    ['tired', {
      alive: true, energy: 1, hunger: 5, sickness: 0,
      unhappiness: 0, pettedToday: false, deathCause: null,
    }, 'Carlitos needs 3 energy; he has 1.'],
    ['hungry', {
      alive: true, energy: 3, hunger: 3, sickness: 0,
      unhappiness: 0, pettedToday: false, deathCause: null,
    }, 'Carlitos is Hungry and cannot retrieve the loot.'],
  ] as const)('keeps all four Wreckage choices visible when Carlitos is %s', async (
    _label,
    carlitos,
    unavailableReason,
  ) => {
    const rig = createRig(snapshot({
      state: 'dayEvent',
      pendingEventId: 'wreckage',
      carlitos,
    }));
    await rig.flow.revealPending(rig.session.snapshot());
    await rig.flow.focusEvent('wreckage');

    const choices = rig.focused.enter.mock.calls[0]![1] as readonly FocusedEventChoiceView[];
    expect(choices.map(({ id }) => id)).toEqual([
      'search', 'delegate-carlitos', 'dive', 'leave',
    ]);
    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'delegate-carlitos',
        energyCost: 3,
        energyOwner: 'carlitos',
        unavailableReason,
      }),
    ]));
  });

  it.each([
    ['search', null, { kind: 'resource', id: 'repairMaterial', quantity: 2 }],
    ['delegate-carlitos', null, { kind: 'resource', id: 'food', quantity: 1 }],
    ['dive', 'scubaSet-1', { kind: 'item', id: 'medicalKit', quantity: 1 }],
  ] as const)('returns before showing the %s Wreckage result', async (
    choiceId,
    instanceId,
    rewardSummary,
  ) => {
    const pending = snapshot({
      state: 'dayEvent', pendingEventId: 'wreckage', energy: 3,
      inventory: inventory({
        'scubaSet-1': {
          instanceId: 'scubaSet-1', type: 'scubaSet', condition: 'usable',
        },
      }),
    });
    const rig = createRig(pending);
    rig.setResolveEvent(() => {
      rig.calls.push('action-complete');
      rig.setSnapshot(snapshot({ state: 'day', inventory: pending.inventory }));
      return accepted({ rewardSummary });
    });
    await rig.flow.revealPending(pending);
    await rig.flow.focusEvent('wreckage');
    rig.flow.setFocusedResolutionActive(true);
    const actionStart = rig.calls.length;
    const resolution = rig.flow.resolveFocusedEventChoice({ id: choiceId, instanceId });
    if (resolution === undefined || !resolution.accepted) throw new Error('Expected Wreckage choice.');

    await resolution.playAnimation();
    if (choiceId === 'search') {
      expect(rig.world.playEventChoice).not.toHaveBeenCalled();
      expect(rig.world.reactToEventOutcome).not.toHaveBeenCalled();
    }
    await resolution.afterAnimation();
    await resolution.beforeReturn();
    rig.calls.push('exit-focus');
    resolution.clearEvent(true);
    rig.calls.push('render-default');
    resolution.renderSnapshot();
    await resolution.afterReturn();

    const orderedCalls = rig.calls.slice(actionStart).filter((call) => [
      'action-complete', 'cover', 'exit-focus', 'clear-world',
      'render-default', 'settle', 'uncover', 'show-result',
    ].includes(call));
    expect(orderedCalls).toEqual([
      'action-complete', 'cover', 'exit-focus', 'clear-world',
      'render-default', 'settle', 'uncover', 'show-result',
    ]);
    expect(rig.ui.showRewardResult).toHaveBeenCalledWith({
      title: 'WRECKAGE', reward: rewardSummary, lines: [],
    });
  });

  it('reports a broken selected scuba instance after the Wreckage return', async () => {
    const pending = snapshot({
      state: 'dayEvent', pendingEventId: 'wreckage', energy: 3,
      inventory: inventory({
        'scubaSet-1': {
          instanceId: 'scubaSet-1', type: 'scubaSet', condition: 'usable',
        },
      }),
    });
    const rig = createRig(pending);
    rig.setResolveEvent(() => {
      rig.setSnapshot(snapshot({
        state: 'day',
        inventory: inventory({
          'scubaSet-1': {
            instanceId: 'scubaSet-1', type: 'scubaSet', condition: 'broken',
          },
        }),
      }));
      return accepted({ message: 'The wreck collapses and damages your gear.' });
    });
    await rig.flow.revealPending(pending);
    await rig.flow.focusEvent('wreckage');
    rig.flow.setFocusedResolutionActive(true);
    const resolution = rig.flow.resolveFocusedEventChoice({
      id: 'dive', instanceId: 'scubaSet-1',
    });
    if (resolution === undefined || !resolution.accepted) throw new Error('Expected Dive choice.');
    await resolution.playAnimation();
    await resolution.beforeReturn();
    resolution.clearEvent(true);
    resolution.renderSnapshot();
    await resolution.afterReturn();

    expect(rig.ui.showRewardResult).toHaveBeenCalledWith({
      title: 'WRECKAGE',
      reward: null,
      lines: [
        'The wreck collapses and damages your gear.',
        'Your scuba gear broke.',
      ],
    });
  });

  it('keeps Wreckage controls inside the shared focused flow', async () => {
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
      [],
    );
    await rig.flow.focusEvent('wreckage');
    expect(rig.focused.enter).toHaveBeenCalledWith('wreckage', expect.arrayContaining([
      expect.objectContaining({ id: 'search', instanceId: null }),
      expect.objectContaining({ id: 'leave', instanceId: null }),
    ]));
  });

  it('runs dive audio through the Wreckage focused item use', async () => {
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
    let waterImpact: ((cueIndex: number) => void) | undefined;
    rig.world.playEventItemUse.mockImplementationOnce(async (
      _eventId,
      _choiceId,
      _instanceId,
      onAction,
    ) => {
      waterImpact = onAction;
    });
    await rig.flow.revealPending(pending);

    await rig.flow.focusEvent('wreckage');
    rig.flow.setFocusedResolutionActive(true);
    const resolution = rig.flow.resolveFocusedEventChoice({
      id: 'dive',
      instanceId: 'scubaSet-1',
    });
    if (resolution === undefined || !resolution.accepted) throw new Error('Expected Wreckage choice.');
    const animation = resolution.playAnimation();
    await Promise.resolve();

    expect(rig.audio.beginDive).not.toHaveBeenCalled();
    expect(rig.audio.finishDive).not.toHaveBeenCalled();
    waterImpact?.(0);
    await animation;

    expect(rig.audio.beginDive).toHaveBeenCalledOnce();
    expect(rig.audio.finishDive).not.toHaveBeenCalled();
    await resolution.beforeReturn();
    expect(rig.audio.finishDive).toHaveBeenCalledOnce();
    expect(rig.ui.setSleepCovered.mock.invocationCallOrder[0]!).toBeLessThan(
      rig.audio.finishDive.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps the focused operation active when a choice is rejected', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' });
    const rig = createRig(pending);
    rig.setResolveEvent(() => ({
      accepted: false,
      code: 'requirements-unmet',
      message: 'No longer available.',
      deltas: {},
      cue: 'none',
    }));
    await rig.flow.revealPending(pending);
    await rig.flow.focusEvent('drifting-supplies');
    rig.flow.setFocusedResolutionActive(true);

    expect(rig.flow.resolveFocusedEventChoice({ id: 'retrieve', instanceId: null }))
      .toEqual({ accepted: false });
    rig.flow.setFocusedResolutionActive(false);
    rig.flow.setFocusedResolutionActive(true);

    expect(rig.flow.resolveFocusedEventChoice({ id: 'retrieve', instanceId: null }))
      .toEqual({ accepted: false });
  });

  it('skips invalid Drifting Loot retrieval animation', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' });
    const rig = createRig(pending);
    rig.setResolveEvent(() => accepted({ rewardSummary: undefined }));
    await rig.flow.revealPending(pending);
    await rig.flow.focusEvent('drifting-supplies');
    rig.flow.setFocusedResolutionActive(true);
    const resolution = rig.flow.resolveFocusedEventChoice({ id: 'retrieve', instanceId: null });
    if (resolution === undefined || !resolution.accepted) throw new Error('Expected accepted result.');

    await resolution.playAnimation();

    expect(rig.world.retrieveDriftingItem).not.toHaveBeenCalled();
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
    rig.world.playEventItemUse.mockImplementationOnce((
      _eventId,
      _choiceId,
      _instanceId,
      onAction,
    ) => {
      onAction?.(0);
      return itemUse.promise;
    });
    rig.audio.clearEvent.mockImplementation(() => rig.audio.cancelDive());
    await rig.flow.revealPending(pending);

    await rig.flow.focusEvent('wreckage');
    rig.flow.setFocusedResolutionActive(true);
    const resolution = rig.flow.resolveFocusedEventChoice({
      id: 'dive',
      instanceId: 'scubaSet-1',
    });
    if (resolution === undefined || !resolution.accepted) throw new Error('Expected Wreckage choice.');
    const work = resolution.playAnimation();
    await vi.waitFor(() => expect(rig.audio.beginDive).toHaveBeenCalledOnce());
    rig.flow.clearAfterFailure();

    expect(rig.audio.cancelDive).toHaveBeenCalledOnce();
    itemUse.resolve();
    await work;
  });

  it('plays dawn after overnight hull wear', async () => {
    const rig = createRig(snapshot({ state: 'nightEvent' }));
    rig.session.beginDawn.mockReturnValueOnce(accepted({
      code: 'dawn',
      message: 'The sea wears at the hull overnight. Another dawn breaks.',
      deltas: { hull: -3 },
      cue: 'dawn',
    }));

    await rig.flow.beginDawn();

    expect(rig.audio.dawn).toHaveBeenCalledOnce();
    expect(rig.world.play).toHaveBeenCalledWith('dawn');
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

  it('ignores a stale drifting focus rejection after a same-lifecycle replacement', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' });
    const rig = createRig(pending);
    const firstEntry = deferred();
    rig.focused.enter.mockReturnValueOnce(firstEntry.promise);
    await rig.flow.revealPending(pending);

    const first = rig.flow.focusEvent('drifting-supplies');
    await vi.waitFor(() => expect(rig.focused.enter).toHaveBeenCalledOnce());
    await rig.flow.focusEvent('drifting-supplies');
    rig.onFatalError.mockClear();
    rig.setBusy.mockClear();

    firstEntry.reject(new Error('stale drifting focus failed'));
    await first;

    expect(rig.onFatalError).not.toHaveBeenCalled();
    expect(rig.setBusy).not.toHaveBeenCalled();
  });

  it('makes returned focused callbacks inert after a same-lifecycle replacement', async () => {
    const pending = snapshot({ state: 'dayEvent', pendingEventId: 'drifting-supplies' });
    const rig = createRig(pending);
    await rig.flow.revealPending(pending);
    await rig.flow.focusEvent('drifting-supplies');
    rig.flow.setFocusedResolutionActive(true);
    const resolution = rig.flow.resolveFocusedEventChoice({ id: 'sleep', instanceId: null });
    if (resolution === undefined || !resolution.accepted) throw new Error('Expected resolution.');
    const staleResolution = resolution;
    rig.flow.clear();
    await rig.flow.revealPending(pending);
    rig.world.clearEvent.mockClear();
    rig.renderSnapshot.mockClear();
    rig.presentTerminal.mockClear();

    staleResolution.clearEvent(true);
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
    expect(rig.focused.clear).toHaveBeenCalledOnce();
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
    expect(rig.focused.clear).toHaveBeenCalledOnce();
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
