import { fishingRoll } from './helpers/fishing';
// Importance: 10/10 (scaled from 5/5). Protects core survival rules and state.
import { describe,expect,it,vi } from 'vitest';
import type { ItemId,ItemInstance,ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  nightlyHullWearDamage,
  SURVIVAL_BALANCE,
} from '../src/survival/survivalBalance';
import { formatJournalEntry } from '../src/survival/journal';
import type { FishingSession,FishingTerminalResult } from '../src/survival/FishingSession';
import type {
  DayActionId,
  DayActionOption,
  EventResponse,
  SurvivalEventDefinition,
} from '../src/survival/survivalTypes';
import { sequenceRandom } from './helpers/random';

const saved = (...types: ItemId[]): ItemInstance[] => {
  const counts = new Map<ItemId, number>();
  return types.map((type) => {
    const number = (counts.get(type) ?? 0) + 1;
    counts.set(type, number);
    return { instanceId: `${type}-${number}` as ItemInstanceId, type };
  });
};

it('round-trips a stable pending event checkpoint', () => {
  const source = new SurvivalSession(saved('carlitos', 'compass', 'cannedFood'), {
    seed: 41,
    initial: { day: 8, pressure: 2, energy: 2 },
    initialEventId: 'monster-in-the-fog',
  });

  const restored = SurvivalSession.restore(source.exportCheckpoint());

  expect(restored.snapshot()).toEqual(source.snapshot());
  expect(restored.exportCheckpoint()).toEqual(source.exportCheckpoint());
});

it('keeps future random outcomes after restore', () => {
  const source = new SurvivalSession(saved(), {
    seed: 77,
    initialEventId: 'bad-sleep',
  });
  const restored = SurvivalSession.restore(source.exportCheckpoint());

  expect(restored.resolveEvent({ kind: 'endure' }))
    .toEqual(source.resolveEvent({ kind: 'endure' }));
});

it('refuses a checkpoint during fishing', () => {
  const session = new SurvivalSession(saved(), { seed: 12 });
  session.beginFishing();

  expect(() => session.exportCheckpoint())
    .toThrow('Cannot checkpoint active fishing.');
});

it.each([
  ['rescued', () => {
    const session = new SurvivalSession(saved(), {
      seed: 13,
      random: sequenceRandom([0, 0, 0.99]),
      initial: { day: 24, rescueLead: 8 },
      initialEventId: 'quiet-night',
    });
    session.resolveEvent(choiceResponse('sleep'));
    session.beginDawn();
    return session;
  }],
  ['dead', () => new SurvivalSession(saved(), {
    seed: 14,
    initial: { health: 0 },
  })],
  ['sunk', () => new SurvivalSession(saved(), {
    seed: 15,
    initial: { hull: 0 },
  })],
] as const)('refuses a checkpoint for a %s run', (state, createSession) => {
  const session = createSession();

  expect(session.snapshot().state).toBe(state);
  expect(() => session.exportCheckpoint())
    .toThrow('Cannot checkpoint terminal state.');
});

it('applies six hull wear after four of every five nights', () => {
  expect(Array.from({ length: 10 }, (_, index) => nightlyHullWearDamage(index + 1)))
    .toEqual([6, 6, 6, 6, 0, 6, 6, 6, 6, 0]);

  const worn = new SurvivalSession(saved(), {
    seed: 1,
    initial: { day: 4 },
    initialEventId: 'quiet-night',
  });
  worn.resolveEvent(choiceResponse('sleep'));
  expect(worn.beginDawn()).toMatchObject({
    accepted: true,
    deltas: { hull: -6 },
  });

  const respite = new SurvivalSession(saved(), {
    seed: 1,
    initial: { day: 5 },
    initialEventId: 'quiet-night',
  });
  respite.resolveEvent(choiceResponse('sleep'));
  expect(respite.beginDawn().deltas).not.toHaveProperty('hull');
});

it('can sink from overnight hull wear', () => {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    initial: { hull: 3 },
    initialEventId: 'quiet-night',
  });
  session.resolveEvent(choiceResponse('sleep'));

  expect(session.beginDawn()).toMatchObject({
    accepted: true,
    cue: 'sinking',
    deltas: { hull: -3 },
  });
  expect(session.snapshot().ending).toMatchObject({
    id: 'sinking',
    cause: { eventId: null },
  });
});

function beginFishing(session: SurvivalSession): FishingSession {
  const begun = session.beginFishing();
  expect(begun.accepted).toBe(true);
  if (!begun.accepted) throw new Error(`Fishing start was rejected: ${begun.outcome.code}`);
  return begun.attempt;
}

function reelCatch(attempt: FishingSession): FishingTerminalResult {
  expect(attempt.cast({ x: 4, z: -2 }).accepted).toBe(true);
  expect(attempt.completeCast().accepted).toBe(true);
  attempt.advance(attempt.snapshot().biteDelaySeconds);
  const reeled = attempt.reel();
  expect(reeled.accepted).toBe(true);
  if (reeled.result === undefined) throw new Error('Expected a fishing catch result.');
  expect(attempt.completeReel().accepted).toBe(true);
  return reeled.result;
}

function missCatch(attempt: FishingSession): FishingTerminalResult {
  expect(attempt.cast({ x: 4, z: -2 }).accepted).toBe(true);
  expect(attempt.completeCast().accepted).toBe(true);
  attempt.advance(
    attempt.snapshot().biteDelaySeconds + SURVIVAL_BALANCE.fishing.reactionSeconds,
  );
  const result = attempt.snapshot().result;
  if (result === null) throw new Error('Expected a fishing miss result.');
  return result;
}

function physicalItemEvent(
  itemIds: readonly [ItemId, ...ItemId[]],
  effects: SurvivalEventDefinition['choices'][number]['outcomes'][number]['effects'] = {},
): SurvivalEventDefinition {
  return {
    id: 'test-physical-item',
    phase: 'night',
    title: 'Physical Item',
    revealText: 'Choose a physical item.',
    prompt: 'Choose.',
    danger: 'uncertain',
      cue: 'none',
    weight: 1,
    earliestDay: 1,
    cooldownDays: 0,
    choices: [
      ...itemIds.map((itemId) => ({
        id: itemId,
        label: `Use ${itemId}`,
        itemId,
        outcomes: [{ resultId: 'test-result', weight: 1, message: 'Handled.', effects }],
      })),
      {
        id: 'sleep',
        label: 'Endure',
        outcomes: [{ resultId: 'test-endure', weight: 1, message: 'Endured.', effects: {} }],
      },
    ] as unknown as SurvivalEventDefinition['choices'],
  };
}

function itemResponse(itemId: ItemId, number = 1): EventResponse {
  return {
    kind: 'item',
    choiceId: itemId,
    instanceId: `${itemId}-${number}` as ItemInstanceId,
  };
}

function choiceResponse(choiceId: string): EventResponse {
  return { kind: 'choice', choiceId };
}

describe('SurvivalSession Carlitos events', () => {
  it('uses exact Shadow Figure choice effects', () => {
    const pressure = new SurvivalSession(saved('carlitos', 'flashlight'), {
      seed: 1,
      random: sequenceRandom([0.499999]),
      initialEventId: 'shadow-figure',
    });
    pressure.resolveEvent({ kind: 'item', choiceId: 'flashlight', instanceId: 'flashlight-1' });
    expect(pressure.snapshot()).toMatchObject({
      state: 'nightEvent', pressure: 1, ending: null,
    });

    const injured = new SurvivalSession(saved('carlitos', 'flashlight'), {
      seed: 1,
      random: sequenceRandom([0.5]),
      initialEventId: 'shadow-figure',
    });
    injured.resolveEvent({ kind: 'item', choiceId: 'flashlight', instanceId: 'flashlight-1' });
    expect(injured.snapshot()).toMatchObject({
      state: 'nightEvent', health: 50, ending: null,
    });

    const flare = new SurvivalSession(saved('carlitos', 'flareGun'), {
      seed: 1,
      random: sequenceRandom([0]),
      initialEventId: 'shadow-figure',
    });
    expect(flare.resolveEvent({
      kind: 'item',
      choiceId: 'flareGun',
      instanceId: 'flareGun-1',
    })).toMatchObject({
      accepted: true,
      message: 'The flare drives the false shape away.',
      deltas: {},
    });
    expect(flare.snapshot()).toMatchObject({
      state: 'nightEvent', health: 100, ending: null,
      inventory: { 'flareGun-1': { condition: 'consumed' } },
    });

    const sleep = new SurvivalSession(saved('carlitos'), {
      seed: 1,
      random: sequenceRandom([0]),
      initialEventId: 'shadow-figure',
    });
    sleep.resolveEvent({ kind: 'choice', choiceId: 'sleep' });
    expect(sleep.snapshot()).toMatchObject({
      state: 'nightEvent', pressure: 0, ending: null,
    });
  });

  it('uses Guarded Sleep boundaries and excludes itself from follow-up selection', () => {
    const guarded = new SurvivalSession(saved('carlitos'), {
      seed: 1,
      random: sequenceRandom([0.849999]),
      initial: { day: 20, pressure: 4 },
      initialEventId: 'guarded-sleep',
    });
    guarded.resolveEvent({ kind: 'choice', choiceId: 'watch' });
    expect(guarded.snapshot().pendingEventId).toBeNull();

    const failed = new SurvivalSession(saved('carlitos'), {
      seed: 1,
      random: sequenceRandom([0.85, 0]),
      initial: { day: 20, pressure: 4 },
      initialEventId: 'guarded-sleep',
    });
    failed.resolveEvent({ kind: 'choice', choiceId: 'watch' });
    expect(failed.snapshot().pendingEventId).not.toBeNull();
    expect(failed.snapshot().pendingEventId).not.toBe('guarded-sleep');

    const normal = new SurvivalSession(saved('carlitos'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
      initial: { day: 20, pressure: 4 },
      initialEventId: 'guarded-sleep',
    });
    normal.resolveEvent({ kind: 'choice', choiceId: 'sleep' });
    expect(normal.snapshot().pendingEventId).not.toBeNull();
    expect(normal.snapshot().pendingEventId).not.toBe('guarded-sleep');
  });

  it('delegates Drifting Cargo when rested and exhausts Carlitos', () => {
    const session = new SurvivalSession(saved('carlitos'), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { energy: 1 },
      initialCarlitos: { hunger: 5, rest: 'rested' },
      initialEventId: 'drifting-supplies',
    });
    const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' });
    expect(outcome).toMatchObject({
      accepted: true,
      deltas: { food: 1 },
      rewardSummary: { kind: 'bundle', rewards: expect.arrayContaining([{ kind: 'resource', id: 'food', quantity: 1 }]) },
    });
    expect(session.snapshot().energy).toBe(1);
    expect(session.snapshot().carlitos?.rest).toBe('exhausted');
  });

  it.each([
    {
      label: 'absent',
      items: [] as ItemId[],
      state: {},
      expected: {
        visible: false,
        unavailableReason: 'Carlitos is not aboard.',
      },
    },
    {
      label: 'exhausted',
      items: ['carlitos'] as ItemId[],
      state: { rest: 'exhausted' as const },
      expected: {
        visible: true,
        unavailableReason: 'Carlitos is exhausted. He must rest before helping.',
      },
    },
    {
      label: 'Hungry',
      items: ['carlitos'] as ItemId[],
      state: { hunger: 3 },
      expected: {
        visible: true,
        unavailableReason: null,
      },
    },
    {
      label: 'Lonely',
      items: ['carlitos'] as ItemId[],
      state: { hunger: 5, unhappiness: 5 },
      expected: {
        visible: true,
        unavailableReason: null,
      },
    },
    {
      label: 'wellness four',
      items: ['carlitos'] as ItemId[],
      state: { hunger: 4 },
      expected: { visible: true, unavailableReason: null },
    },
  ])('owns exact Drifting Cargo delegation availability for $label', ({
    items,
    state,
    expected,
  }) => {
    const session = new SurvivalSession(saved(...items), {
      seed: 1,
      initialCarlitos: state,
      initialEventId: 'drifting-supplies',
    });

    expect(session.companionEventActionAvailability({
      id: 'delegateCarlitos',
    })).toMatchObject(expected);
  });
});

describe('SurvivalSession daytime actions', () => {

  it('reuses an immutable snapshot until an action changes state', () => {
    const session = new SurvivalSession(saved(), { seed: 1 });
    const initial = session.snapshot();

    expect(session.snapshot()).toBe(initial);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.inventory)).toBe(true);

    expect(session.perform('endDay').accepted).toBe(true);
    expect(session.snapshot()).not.toBe(initial);
  });

  it('raises scheduled pressure at dawn', () => {
    const pressure = new SurvivalSession(saved(), {
      seed: 7,
      random: sequenceRandom([0.99, 0.99, 0.99]),
      initial: { day: 7 },
    });
    pressure.perform('endDay');
    expect(pressure.beginDawn().deltas.pressure).toBe(1);
    expect(pressure.snapshot().pressure).toBe(1);

    const increased = new SurvivalSession(saved('spyglass'), {
      seed: 12,
      random: sequenceRandom([0]),
      initial: { day: 6 },
      initialEventId: 'monster-in-the-fog',
    });
    expect(increased.resolveEvent(itemResponse('spyglass')).deltas.pressure).toBe(1);
  });

  it('turns an old chest into a mimic before the automatic attack', () => {
    const session = new SurvivalSession(saved(), {
      seed: 10,
      random: sequenceRandom([0, 0]),
      initial: { day: 3 },
      initialChest: { state: 'closed', acquiredDay: 1 },
    });

    expect(session.perform('endDay')).toMatchObject({ accepted: true, code: 'event-opened' });
    expect(session.snapshot()).toMatchObject({
      pendingEventId: 'chest-attack',
      chest: { state: 'mimic', acquiredDay: 1 },
    });
    expect(session.resolveEvent(choiceResponse('attack'))).toMatchObject({
      accepted: true,
      deltas: { health: -25 },
    });
    expect(session.snapshot().chest).toEqual({ state: 'none', acquiredDay: null });
  });

  it('publishes stable results for Chest Attack and Midnight Tour', () => {
    const chestAttacked = new SurvivalSession(saved(), {
      seed: 10,
      random: sequenceRandom([0]),
      initialChest: { state: 'mimic', acquiredDay: 1 },
      initialEventId: 'chest-attack',
    });
    expect(chestAttacked.resolveEvent(choiceResponse('attack'))).toMatchObject({
      deltas: { health: -25 },
      eventResult: { resultId: 'chest-attack' },
    });
    expect(chestAttacked.snapshot().chest.state).toBe('none');

    const knifeMitigated = new SurvivalSession(saved('knife'), {
      seed: 12,
      random: sequenceRandom([0]),
      initialChest: { state: 'mimic', acquiredDay: 1 },
      initialEventId: 'chest-attack',
    });
    expect(knifeMitigated.resolveEvent(itemResponse('knife'))).toMatchObject({
      deltas: { health: -10 },
      eventResult: {
        choiceId: 'knife',
        resultId: 'chest-attack',
      },
    });
    expect(knifeMitigated.beginDawn().accepted).toBe(true);
    const mitigatedSnapshot = knifeMitigated.snapshot();
    expect(mitigatedSnapshot.chest.state).toBe('none');
    expect(mitigatedSnapshot.inventory['knife-1']?.condition).toBe('usable');
    expect(formatJournalEntry(mitigatedSnapshot.journalEntries[0]!).nighttime).toContain(
      'I wedged the knife between the chest’s teeth and pulled free',
    );

    const tour = new SurvivalSession(saved(), {
      seed: 11,
      random: sequenceRandom([0]),
      initialEventId: 'midnight-tour',
    });
    expect(tour.resolveEvent(choiceResponse('visit')).eventResult?.resultId).toBe('tour-chest');
    expect(tour.snapshot()).toMatchObject({
      chest: { state: 'closed', acquiredDay: 1 },
      pressure: 1,
    });

    const attacked = new SurvivalSession(saved(), {
      seed: 103,
      random: sequenceRandom([0.99, 0, 0.5, 0.999]),
      initial: { day: 7, health: 100 },
      initialEventId: 'midnight-tour',
    });
    const attack = attacked.resolveEvent(choiceResponse('visit'));
    expect(attack.eventResult?.resultId).toBe('tour-attack');
    expect(attacked.snapshot().health).toBeGreaterThanOrEqual(55);
    expect(attacked.snapshot().health).toBeLessThanOrEqual(75);
    const passed = new SurvivalSession(saved(), {
      seed: 11,
      random: sequenceRandom([0]),
      initialEventId: 'midnight-tour',
    });
    expect(passed.resolveEvent(choiceResponse('sleep')).eventResult?.resultId).toBe('tour-pass');

  });

  it('enforces contextual requirements without mutating the session', () => {
    const session = new SurvivalSession(saved(), {
      seed: 104, random: sequenceRandom([0]), initial: { day: 3, energy: 0 }, initialEventId: 'drifting-supplies',
    });
    const before = session.snapshot();
    expect(session.resolveEvent(choiceResponse('retrieve'))).toMatchObject({
      accepted: false, code: 'requirements-unmet', deltas: {},
    });
    expect(session.snapshot()).toEqual(before);
  });

  it('rejects a mismatched or stale exact instance without mutation or random draws', () => {
    const random = { next: vi.fn(() => 0) };
    const session = new SurvivalSession(saved('anchor', 'map'), {
      seed: 1,
      random,
      initialEventId: 'shower-night',
    });
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent =
      physicalItemEvent(['anchor', 'map']);
    const before = session.snapshot();

    expect(session.resolveEvent({
      kind: 'item',
      choiceId: 'anchor',
      instanceId: 'map-1',
    })).toMatchObject({ accepted: false, code: 'item-mismatch' });
    expect(session.snapshot()).toEqual(before);
    expect(random.next).not.toHaveBeenCalled();
  });

  it('reports applied rather than requested clamped deltas', () => {
    const eating = new SurvivalSession(saved('cannedFood'), {
      seed: 1, random: sequenceRandom([0.999999]), initial: { hunger: 20 },
    });
    expect(eating.perform('eat').deltas).toEqual({ hunger: -20, food: -1 });
    const treating = new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 90 } });
    expect(treating.perform('treat').deltas).toEqual({ health: 10 });
    const repairing = new SurvivalSession(saved(), { seed: 1, initial: { hull: 90, energy: 3 } });
    expect(repairing.perform('repair').deltas).toEqual({ energy: -1, hull: 10 });
  });

  it('rejects stale or mismatched physical responses before drawing an outcome', () => {
    let randomCalls = 0;
    const session = new SurvivalSession(saved('bucket', 'umbrella'), {
      seed: 1,
      random: { next: () => { randomCalls += 1; return 0; } },
      initialEventId: 'leak',
    });
    const before = session.snapshot();

    expect(session.resolveEvent({
      kind: 'item',
      choiceId: 'bucket',
      instanceId: 'umbrella-1',
    })).toMatchObject({ accepted: false, code: 'item-mismatch' });
    expect(session.snapshot()).toEqual(before);
    expect(randomCalls).toBe(0);
  });

  it('offers Endure only when no suitable usable item exists', () => {
    const equipped = new SurvivalSession(saved('bucket'), {
      seed: 1,
      random: sequenceRandom([0]),
      initialEventId: 'leak',
    });
    expect(equipped.resolveEvent({ kind: 'endure' })).toMatchObject({
      accepted: false,
      code: 'endure-unavailable',
    });

    const unequipped = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0]),
      initialEventId: 'leak',
    });
    expect(unequipped.resolveEvent({ kind: 'endure' })).toMatchObject({
      accepted: true,
      code: 'event-resolved',
      cue: 'none',
    });
  });

  it('guards dawn while an event is pending and exposes nightfall then dawn cues', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0.5, 0, 0.99]),
      initial: { day: 2 },
    });
    expect(session.perform('endDay').cue).toBe('nightfall');
    const pending = session.snapshot();
    expect(session.beginDawn()).toMatchObject({ accepted: false, code: 'event-pending' });
    expect(session.snapshot()).toEqual(pending);
    session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot().state).toBe('nightEvent');
    expect(session.beginDawn()).toMatchObject({ accepted: true, cue: 'dawn' });
  });

  it('cancels only an uncast attempt and restores its reserved action state', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0, 0, 0]),
      initial: { energy: 3 },
    });
    const first = beginFishing(session);

    expect(session.cancelFishing(first.snapshot().id)).toMatchObject({
      accepted: true,
      code: 'fishing-cancelled',
      deltas: { energy: 1 },
      cue: 'none',
    });
    expect(session.snapshot()).toMatchObject({
      energy: 3,
      actedToday: false,
    });
    expect(session.perform('eat')).toMatchObject({ accepted: false, code: 'no-food' });

    const cast = beginFishing(session);
    expect(cast.cast({ x: 4, z: -2 }).accepted).toBe(true);
    const beforeRejectedCancel = session.snapshot();
    expect(session.cancelFishing(cast.snapshot().id)).toMatchObject({
      accepted: false,
      code: 'fishing-already-cast',
    });
    expect(session.snapshot()).toEqual(beforeRejectedCancel);
  });

  it('opens Drifting Cargo from day 3 at the 35 percent dawn boundary', () => {
    const opens = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0.99, 0.349, 0, 0.499]),
      initial: { day: 2 },
    });
    expect(opens.perform('endDay').accepted).toBe(true);
    expect(opens.beginDawn()).toMatchObject({ accepted: true, code: 'dawn' });
    expect(opens.snapshot()).toMatchObject({
      day: 3,
      state: 'dayEvent',
      pendingEventId: 'drifting-supplies',
    });

    const misses = new SurvivalSession(saved(), {
      seed: 2,
      random: sequenceRandom([0.99, 0.35]),
      initial: { day: 2 },
    });
    misses.perform('endDay');
    misses.beginDawn();
    expect(misses.snapshot()).toMatchObject({
      day: 3,
      state: 'day',
      pendingEventId: null,
    });
  });

  it('rejects invalid fishing starts atomically', () => {
    const cases: Array<{ session: SurvivalSession; code: string }> = [
      {
        session: new SurvivalSession(saved(), { seed: 1, initial: { energy: 0 } }),
        code: 'not-enough-energy',
      },
      {
        session: new SurvivalSession(saved(), { seed: 1, initialEventId: 'shower-night' }),
        code: 'not-daytime',
      },
      {
        session: new SurvivalSession(saved(), { seed: 1, initial: { health: 0 } }),
        code: 'terminal',
      },
    ];
    for (const { session, code } of cases) {
      const before = session.snapshot();
      expect(session.beginFishing()).toMatchObject({ accepted: false, outcome: { code } });
      expect(session.snapshot()).toEqual(before);
    }

    const active = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0, 0]) });
    expect(active.beginFishing().accepted).toBe(true);
    const before = active.snapshot();
    expect(active.beginFishing()).toMatchObject({
      accepted: false,
      outcome: { code: 'fishing-in-progress' },
    });
    expect(active.snapshot()).toEqual(before);
  });

  it('locks ordinary actions, events, and day transitions during an active fishing transaction', () => {
    const session = new SurvivalSession(saved('cannedFood'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
      initial: { hunger: 80 },
    });
    beginFishing(session);
    const before = session.snapshot();

    const outcomes = [
      session.perform('eat'),
      session.endDay(),
      session.resolveEvent({ kind: 'endure' }),
      session.beginDawn(),
    ];

    expect(outcomes.every((outcome) => !outcome.accepted && outcome.code === 'fishing-in-progress')).toBe(true);
    expect(session.requestDayEvent().code).toBe('day-event-scheduled');
    expect(session.snapshot()).toEqual(before);
  });

  it('awards catalog food and consumes one captured recovered bait in existing resource order', () => {
    const cod = new SurvivalSession(saved('baitTin', 'baitTin'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
    });
    (cod as unknown as { bait: number }).bait = 3;
    const codAttempt = beginFishing(cod);
    const codResult = reelCatch(codAttempt);
    expect(cod.finishFishing(codAttempt.snapshot().id, codResult)).toMatchObject({
      accepted: true,
      code: 'fish-caught',
      deltas: { food: 1, bait: -1 },
      cue: 'none',
    });
    expect(cod.snapshot()).toMatchObject({ food: 1, bait: 2, recoveredBait: 1 });
    expect(cod.snapshot().inventory['baitTin-1']?.condition).toBe('consumed');
    expect(cod.snapshot().inventory['baitTin-2']?.condition).toBe('usable');

    const tuna = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, fishingRoll('tuna', 3)]),
      initial: { day: 3 },
    });
    const tunaAttempt = beginFishing(tuna);
    const tunaResult = reelCatch(tunaAttempt);
    expect(tunaResult).toMatchObject({ kind: 'catch', catch: { id: 'tuna', reward: { kind: 'food', amount: 2 } } });
    expect(tuna.finishFishing(tunaAttempt.snapshot().id, tunaResult)).toMatchObject({
      deltas: { food: 2 },
      cue: 'none',
    });
  });

  it('does not consume bait that was unavailable when the fishing attempt began', () => {
    const session = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0, 0]) });
    const attempt = beginFishing(session);
    (session as unknown as { bait: number }).bait = 1;
    const result = reelCatch(attempt);

    expect(session.finishFishing(attempt.snapshot().id, result).deltas).toEqual({ food: 1 });
    expect(session.snapshot().bait).toBe(1);
  });

  it('requires the matching attempt terminal state and exact stable result object', () => {
    const session = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0, 0]) });
    const attempt = beginFishing(session);
    const unresolved = session.snapshot();
    expect(session.finishFishing(attempt.snapshot().id, { kind: 'miss' })).toMatchObject({
      accepted: false,
      code: 'fishing-unresolved',
    });
    expect(session.snapshot()).toEqual(unresolved);

    const result = reelCatch(attempt);
    const beforeFinish = session.snapshot();
    expect(session.finishFishing('foreign-attempt', result)).toMatchObject({
      accepted: false,
      code: 'fishing-attempt-mismatch',
    });
    expect(session.finishFishing(attempt.snapshot().id, { ...result })).toMatchObject({
      accepted: false,
      code: 'fishing-result-mismatch',
    });
    expect(session.snapshot()).toEqual(beforeFinish);

    expect(session.finishFishing(attempt.snapshot().id, result).accepted).toBe(true);
    const finished = session.snapshot();
    expect(session.finishFishing(attempt.snapshot().id, result)).toMatchObject({
      accepted: false,
      code: 'no-fishing-attempt',
    });
    expect(session.snapshot()).toEqual(finished);
  });

  it('rejects a stale attempt ID without clearing the current transaction', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0, 0, 0.5, 0, 0]),
    });
    const first = beginFishing(session);
    const firstResult = reelCatch(first);
    expect(session.finishFishing(first.snapshot().id, firstResult).accepted).toBe(true);
    expect(session.endDay().code).toBe('quiet-night');
    expect(session.beginDawn().accepted).toBe(true);
    const second = beginFishing(session);
    const secondResult = reelCatch(second);
    const before = session.snapshot();

    expect(session.finishFishing(first.snapshot().id, secondResult)).toMatchObject({
      accepted: false,
      code: 'fishing-attempt-mismatch',
    });
    expect(session.snapshot()).toEqual(before);
    expect(session.finishFishing(second.snapshot().id, secondResult).accepted).toBe(true);
  });

  it('records start, fish, junk, and miss outcomes without the generic fish cue', () => {
    const cases = [
      { roll: 0, terminal: reelCatch, finishCode: 'fish-caught' },
      { roll: fishingRoll('seaweed'), terminal: reelCatch, finishCode: 'junk-caught' },
      { roll: 0, terminal: missCatch, finishCode: 'fish-missed' },
    ] as const;

    for (const testCase of cases) {
      const session = new SurvivalSession(saved(), {
        seed: 1,
        random: sequenceRandom([0, testCase.roll]),
      });
      const attempt = beginFishing(session);
      expect(session.snapshot().lastOutcome).toMatchObject({ code: 'fishing-started', cue: 'none' });
      const result = testCase.terminal(attempt);
      session.finishFishing(attempt.snapshot().id, result);
      expect(session.snapshot().lastOutcome).toMatchObject({ code: testCase.finishCode, cue: 'none' });
    }
  });

  it.each([
    [7, 3, 3, 93],
    [90, 3, 1, 10],
    [7, 1, 1, 33],
    [66, 3, 2, 34],
    [1, 4, 3, 99],
  ] as const)(
    'repairs hull %i with energy %i by spending %i and restoring %i',
    (hull, energy, energySpent, hullRestored) => {
    const session = new SurvivalSession(saved('ductTape'), {
      seed: 1,
      initial: { hull, energy },
    });

      expect(session.perform('repair')).toMatchObject({
        accepted: true,
        deltas: { energy: -energySpent, hull: hullRestored },
      });
      expect(session.snapshot()).toMatchObject({
        energy: energy - energySpent,
        hull: hull + hullRestored,
      });
      expect(session.snapshot().inventory['ductTape-1']?.condition).toBe('usable');
    },
  );

  it('starts at three energy and restores energy through End Day dawn tiers', () => {
    const recover = (hunger: number) => {
      const session = new SurvivalSession(saved(), {
        seed: 1,
        random: sequenceRandom([0, 0.5]),
        initial: { energy: 0, hunger },
      });
      expect(session.perform('endDay')).toMatchObject({ accepted: true, code: 'quiet-night' });
      expect(session.beginDawn()).toMatchObject({ accepted: true, cue: 'dawn' });
      return session.snapshot().energy;
    };

    expect(new SurvivalSession(saved(), { seed: 1 }).snapshot().energy).toBe(3);
    expect(recover(20)).toBe(3);
    expect(recover(53)).toBe(2);
    expect(recover(73)).toBe(1);
  });

  it('receives a radio signal from day five on a twenty-percent dawn roll', () => {
    const session = new SurvivalSession(saved('radio'), {
      seed: 1,
      random: sequenceRandom([0, 0.199]),
      initial: { day: 4, energy: 3 },
      initialEventId: 'shower-night',
    });

    session.resolveEvent({ kind: 'endure' });
    session.beginDawn();

    expect(session.snapshot()).toMatchObject({
      day: 5,
      radioSignalAvailable: true,
      radioSignalsSent: 0,
    });
  });

  it('answers a radio signal for one energy without consuming the radio', () => {
    const session = new SurvivalSession(saved('radio'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
      initial: { day: 4, energy: 3 },
      initialEventId: 'shower-night',
    });
    session.resolveEvent({ kind: 'endure' });
    session.beginDawn();

    expect(session.perform('answerRadio')).toMatchObject({
      accepted: true,
      deltas: { energy: -1, rescueLead: 2 },
    });
    expect(session.snapshot()).toMatchObject({
      rescueLead: 2,
      radioSignalAvailable: false,
      radioSignalsSent: 1,
    });
    expect(session.snapshot().inventory['radio-1']?.condition).toBe('usable');
    expect(session.perform('answerRadio')).toMatchObject({
      accepted: false,
      code: 'no-radio-signal',
    });
  });

  it('expires an unanswered radio signal', () => {
    const session = new SurvivalSession(saved('radio'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
      initial: { day: 4 },
      initialEventId: 'shower-night',
    });
    session.resolveEvent({ kind: 'endure' });
    session.beginDawn();

    expect(session.expireRadioSignal()).toBe(true);
    expect(session.snapshot().radioSignalAvailable).toBe(false);
    expect(session.perform('answerRadio')).toMatchObject({
      accepted: false,
      code: 'no-radio-signal',
    });
  });

  it('rejects every invalid action option before gates without mutating state', () => {
    const itemRepair = { kind: 'itemRepair', target: 'compass-1' } as const;
    const cases: Array<{
      action: Exclude<DayActionId, 'fish' | 'netFish'>;
      option: DayActionOption | null | undefined;
    }> = [
      { action: 'dive', option: itemRepair },
      { action: 'eat', option: itemRepair },
      { action: 'repair', option: itemRepair },
      { action: 'repairItem', option: undefined },
      { action: 'repairItem', option: null },
      { action: 'treat', option: itemRepair },
      { action: 'answerRadio', option: itemRepair },
      { action: 'useEnergyBar', option: itemRepair },
      { action: 'endDay', option: itemRepair },
    ];

    for (const { action, option } of cases) {
      const session = new SurvivalSession(saved(), { seed: 1, initial: { energy: 1 } });
      const before = session.snapshot();
      expect(session.perform(action, option as DayActionOption | undefined)).toMatchObject({
        accepted: false,
        code: 'invalid-option',
      });
      expect(session.snapshot()).toEqual(before);
    }
  });

  it('applies dawn hunger, energy tiers, starvation, and terminal states once', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0.99]),
      initial: { hunger: 95, health: 20, hull: 100, energy: 0 },
    });
    session.perform('endDay');
    session.beginDawn();
    expect(session.snapshot()).toMatchObject({ day: 2, hunger: 100, energy: 1, health: 13 });
    session.perform('endDay');
    expect(session.resolveEvent(choiceResponse('sleep')).accepted).toBe(true);
    session.beginDawn();
    expect(session.snapshot()).toMatchObject({ day: 3, health: 6, state: 'day' });
    session.perform('endDay');
    expect(session.resolveEvent(choiceResponse('sleep')).accepted).toBe(true);
    session.beginDawn();
    expect(session.snapshot().state).toBe('dead');
    const terminal = session.snapshot();
    expect(session.beginFishing()).toMatchObject({ accepted: false, outcome: { code: 'terminal' } });
    expect(session.snapshot()).toEqual(terminal);
  });

  it('rejects an unsuitable physical item atomically before random draws', () => {
    const random = { next: vi.fn(() => 0) };
    const session = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      random,
      initialEventId: 'shower-night',
    });
    const before = session.snapshot();

    expect(session.resolveEvent(itemResponse('anchor'))).toMatchObject({
      accepted: false,
      code: 'choice-unavailable',
    });
    expect(session.snapshot()).toEqual(before);
    expect(random.next).not.toHaveBeenCalled();
  });

  it('draws a night event, advances dawn, and applies increasing rescue chance', () => {
    const session = new SurvivalSession(saved(), { seed: 2, random: sequenceRandom([0.5, 0, 0.99, 0.99, 0.99, 0]) });
    session.perform('endDay');
    expect(session.snapshot().state).toBe('nightEvent');
    session.resolveEvent({ kind: 'endure' });
    session.beginDawn();
    expect(session.snapshot().state).toBe('day');
    expect(session.snapshot().day).toBe(2);
  });

  it('does not consume a rescue draw before rescue becomes possible', () => {
    const next = vi.fn(() => 0.99);
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: { next },
      initial: { day: 23, rescueLead: 8 },
      initialEventId: 'quiet-night',
    });
    session.resolveEvent(choiceResponse('sleep'));
    const beforeDawn = next.mock.calls.length;
    session.beginDawn();
    expect(next).toHaveBeenCalledTimes(beforeDawn + 1);
  });

  it('protects nested daytime and nighttime event records from snapshot mutation', () => {
    const session = new SurvivalSession(saved('bucket'), {
      seed: 9,
      random: sequenceRandom([0, 0.5, 0, 0]),
      initial: { day: 2 },
      initialEventId: 'drifting-supplies',
    });
    session.resolveEvent(choiceResponse('retrieve'));
    session.perform('endDay');
    session.resolveEvent(choiceResponse('sleep'));
    expect(session.beginDawn().accepted).toBe(true);
    const first = session.snapshot().journalEntries[0]!;
    const daytime = first.daytime;
    const nighttime = first.nighttime;
    if (daytime === null || 'kind' in daytime || nighttime.kind !== 'event') {
      throw new Error('Expected resolved day and night events.');
    }
    const daytimeTitle = daytime.eventId;
    const nighttimeTitle = nighttime.event.eventId;

    expect(() => {
      (daytime as { eventId: string }).eventId = 'Mutated daytime title';
    }).toThrow(TypeError);
    expect(() => {
      (nighttime.event as { eventId: string }).eventId = 'Mutated nighttime title';
    }).toThrow(TypeError);

    const fresh = session.snapshot().journalEntries[0]!;
    expect(fresh.daytime).toMatchObject({ eventId: daytimeTitle });
    expect(fresh.nighttime).toMatchObject({
      kind: 'event',
      event: { eventId: nighttimeTitle },
    });
  });

  it('finalizes the journal before a night consequence ends the run', () => {
    const session = new SurvivalSession(saved(), {
      seed: 12,
      random: sequenceRandom([0, 0]),
      initial: { hull: 5 },
      initialEventId: 'restless-waves',
    });
    session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot()).toMatchObject({
      state: 'sunk',
      journalEntries: [expect.objectContaining({ day: 1 })],
    });
  });

  it('breaks random eligible items without replacement during event resolution', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket', 'spyglass'), {
      seed: 16,
      random: sequenceRandom([0, 0, 0.99, 0]),
      initialEventId: 'windy-night',
    });
    session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'broken' },
      'bucket-1': { condition: 'usable' },
      'spyglass-1': { condition: 'broken' },
    });
  });

  it('limits a catastrophic Tornado outcome to one random lost item', () => {
    const session = new SurvivalSession(saved('bucket', 'map', 'spyglass'), {
      seed: 17,
      random: sequenceRandom([0.9, 0, 0.99, 0]),
      initialConditions: { 'map-1': 'broken' },
      initialEventId: 'tornado',
    });
    session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot().inventory).toMatchObject({
      'bucket-1': { condition: 'usable' },
      'map-1': { condition: 'broken' },
      'spyglass-1': { condition: 'lost' },
    });
  });

  it('loses the concrete Snatcher target and 30 Health after sleeping', () => {
    const session = new SurvivalSession(saved('anchor', 'fishingNet'), {
      seed: 18, random: sequenceRandom([0, 0]),
      initial: { health: 80 },
      initialEventId: 'snatcher',
    });
    expect(session.snapshot().pendingEventTargetId).toBe('anchor-1');
    const outcome = session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot()).toMatchObject({ pendingEventId: null, pendingEventTargetId: null });
    expect(outcome).toMatchObject({
      accepted: true,
      message: 'The tentacle steals a supply and wounds you.',
      deltas: { health: -30 },
    });
    expect(session.snapshot().health).toBe(50);
    expect(session.snapshot().inventory['anchor-1']?.condition).toBe('lost');
    expect(session.snapshot().inventory['fishingNet-1']?.condition).toBe('usable');
    expect(session.beginDawn().accepted).toBe(true);
    expect(session.snapshot().journalEntries[0]?.nighttime).toMatchObject({
      kind: 'event',
      event: {
        attemptedChoiceId: 'sleep',
        text: expect.objectContaining({ kind: 'eventResult' }),
        inventoryMutations: [{ kind: 'lose', instanceIds: ['anchor-1'] }],
      },
    });
  });

  it('keeps the Snatcher target pending after rejected choices and clears it after endurance', () => {
    const session = new SurvivalSession(saved('anchor'), {
      seed: 20, random: sequenceRandom([0, 0]), initialEventId: 'snatcher',
    });
    const pending = session.snapshot().pendingEventTargetId;
    expect(session.resolveEvent(itemResponse('fishingNet'))).toMatchObject({
      accepted: false,
      code: 'choice-unavailable',
    });
    expect(session.snapshot().pendingEventTargetId).toBe(pending);
    session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot().pendingEventTargetId).toBeNull();
  });

  it('rejects a broken choice item without consuming the outcome draw', () => {
    const session = new SurvivalSession(saved('bucket'), {
      seed: 21,
      random: sequenceRandom([0.99]),
      initialConditions: { 'bucket-1': 'broken' },
      initialEventId: 'shower-night',
    });
    const before = session.snapshot();
    expect(session.resolveEvent(itemResponse('bucket'))).toMatchObject({ accepted: false, code: 'item-unavailable' });
    expect(session.snapshot()).toEqual(before);
    expect(session.resolveEvent({ kind: 'endure' }).message).toBe('You wake with two energy.');
  });

  it('applies set, subtract, and add resource effects in authored order with clamps', () => {
    const session = new SurvivalSession(saved(), {
      seed: 24, random: sequenceRandom([0]), initial: { health: 50 }, initialEventId: 'shower-night',
    });
    const orderedEvent: SurvivalEventDefinition = {
      id: 'test-ordered', phase: 'night', title: 'Ordered', revealText: 'Several effects arrive.', prompt: 'Choose.',
      danger: 'dangerous', cue: 'impact', weight: 1, earliestDay: 1, cooldownDays: 0,
      choices: [{ id: 'sleep', label: 'Sleep', outcomes: [{
        resultId: 'test-ordered-result', weight: 1, message: 'Ordered effects.', effects: { resources: [
          { resource: 'health', operation: 'set', value: 10 },
          { resource: 'health', operation: 'subtract', value: 20 },
          { resource: 'health', operation: 'add', value: 5 },
        ] },
      }] }],
    };
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent = orderedEvent;
    expect(session.resolveEvent({ kind: 'endure' })).toMatchObject({ accepted: true, deltas: { health: -45 } });
    expect(session.snapshot().health).toBe(5);
  });

  it('records only concrete mutations when an earlier mutation makes a later one ineligible', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 25, random: sequenceRandom([0.99, 0.99]), initialEventId: 'thunderstorm',
    });
    session.resolveEvent(itemResponse('bucket'));
    expect(session.beginDawn().accepted).toBe(true);
    const record = session.snapshot().journalEntries[0]!.nighttime;
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('lost');
    expect(record.kind).toBe('event');
    expect(record.kind === 'event' ? record.event.inventoryMutations : []).toEqual([
      { kind: 'lose', instanceIds: ['bucket-1'] },
    ]);
  });

  it('reports Food and Health lost through a concrete Snatcher target', () => {
    const session = new SurvivalSession(saved('cannedFood', 'fishingNet'), {
      seed: 26, random: sequenceRandom([0, 0]), initialEventId: 'snatcher',
    });
    expect(session.snapshot()).toMatchObject({ food: 1, pendingEventTargetId: 'cannedFood-1' });

    const outcome = session.resolveEvent({ kind: 'endure' });

    expect(outcome.deltas).toEqual({ health: -30, food: -1 });
    expect(session.snapshot()).toMatchObject({ food: 0, recoveredFood: 0 });
    expect(session.snapshot().inventory['cannedFood-1']?.condition).toBe('lost');
  });

  it('reports one net Food delta when an authored loss and target loss both change the aggregate', () => {
    const session = new SurvivalSession(saved('cannedFood', 'cannedFood'), {
      seed: 28, random: sequenceRandom([0.99, 0]), initialEventId: 'snatcher',
    });
    expect(session.snapshot().pendingEventTargetId).toBe('cannedFood-2');
    const combinedEvent: SurvivalEventDefinition = {
      id: 'test-combined-food-loss', phase: 'day', title: 'Combined Loss', revealText: 'Food stores are threatened.', prompt: 'Choose.',
      danger: 'dangerous', cue: 'impact', weight: 1, earliestDay: 1, cooldownDays: 0,
      choices: [{ id: 'sleep', label: 'Sleep', outcomes: [{
        weight: 1,
        resultId: 'test-loss-result', message: 'Both food stores are gone.',
        effects: {
          resources: [{ resource: 'food', operation: 'subtract', value: 1 }],
          items: [{ kind: 'loseEventTarget', quantity: 1 }],
        },
      }] }],
    };
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent = combinedEvent;

    const outcome = session.resolveEvent({ kind: 'endure' });

    expect(outcome.deltas).toEqual({ food: -2 });
    expect(session.snapshot()).toMatchObject({ food: 0, recoveredFood: 0 });
    expect(session.snapshot().inventory).toMatchObject({
      'cannedFood-1': { condition: 'consumed' },
      'cannedFood-2': { condition: 'lost' },
    });
  });
});
