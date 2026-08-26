// Importance: 10/10 (scaled from 5/5). Protects core survival rules and state.
import { describe, expect, it, vi } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { mulberry32, restoreMulberry32 } from '../src/survival/random';
import {
  nightlyHullWearDamage,
  radioRescueLeadForSignal,
} from '../src/survival/survivalBalance';
import { formatJournalEntry } from '../src/survival/journal';
import type { FishingSession, FishingTerminalResult } from '../src/survival/FishingSession';
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

it('restores the next Mulberry32 value', () => {
  const random = mulberry32(41);
  random.next();
  const restored = restoreMulberry32(random.exportState());

  expect(restored.next()).toBe(random.next());
});

it('round-trips a stable pending event checkpoint', () => {
  const source = new SurvivalSession(saved('carlitos', 'compass', 'cannedFood'), {
    seed: 41,
    initial: { day: 8, pressure: 2, energy: 2 },
    initialEventId: 'man-in-the-fog',
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
      initial: { day: 23, rescueLead: 8 },
      initialEventId: 'night-calm-fallback',
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

function stateAfterRescueDawn(day: number, rescueLead: number, roll: number) {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    random: sequenceRandom([0, roll, 0.99]),
    initial: { day, rescueLead },
    initialEventId: 'night-calm-fallback',
  });
  session.resolveEvent(choiceResponse('sleep'));
  session.beginDawn();
  return session.snapshot().state;
}

it('keeps a night energy result through the next dawn', () => {
  const session = new SurvivalSession(saved(), {
    seed: 31,
    random: sequenceRandom([0]),
    initialEventId: 'bad-sleep',
  });

  const result = session.resolveEvent({ kind: 'endure' });

  expect(result).toMatchObject({ nextDawnEnergy: 2, deltas: {} });
  session.beginDawn();
  expect(session.snapshot().energy).toBe(2);
});

it.each(['starry-night', 'constellation-night'] as const)(
  'grants four dawn energy after %s binoculars',
  (initialEventId) => {
  const session = new SurvivalSession(saved('spyglass'), {
    seed: 1,
    initial: { energy: 1 },
    initialEventId,
  });
  expect(session.resolveEvent(itemResponse('spyglass'))).toMatchObject({
    accepted: true,
    nextDawnEnergy: 4,
  });
  session.beginDawn();
  expect(session.snapshot().energy).toBe(4);
  },
);

it.each(['starry-night', 'constellation-night'] as const)(
  'grants rescue lead and three dawn energy after %s compass use',
  (initialEventId) => {
  const session = new SurvivalSession(saved('compass'), {
    seed: 1,
    initial: { energy: 1, rescueLead: 0 },
    initialEventId,
  });
  expect(session.resolveEvent(itemResponse('compass'))).toMatchObject({
    accepted: true,
    deltas: { rescueLead: 1 },
    nextDawnEnergy: 3,
  });
  session.beginDawn();
  expect(session.snapshot()).toMatchObject({ energy: 3, rescueLead: 1 });
  },
);

it.each(['starry-night', 'constellation-night'] as const)(
  'grants three dawn energy after sleeping through %s',
  (initialEventId) => {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    initial: { energy: 1 },
    initialEventId,
  });
  session.resolveEvent(choiceResponse('sleep'));
  session.beginDawn();
  expect(session.snapshot().energy).toBe(3);
  },
);

it('keeps a pressure reduction after a non-threshold dawn', () => {
  const session = new SurvivalSession(saved('compass'), {
    seed: 32,
    random: sequenceRandom([0]),
    initial: { day: 8, pressure: 2 },
    initialEventId: 'man-in-the-fog',
  });

  session.resolveEvent(itemResponse('compass'));
  expect(session.snapshot().pressure).toBe(1);
  session.beginDawn();
  expect(session.snapshot().pressure).toBe(1);
});

it('applies three hull wear after four of every five nights', () => {
  expect(Array.from({ length: 10 }, (_, index) => nightlyHullWearDamage(index + 1)))
    .toEqual([3, 3, 3, 3, 0, 3, 3, 3, 3, 0]);

  const worn = new SurvivalSession(saved(), {
    seed: 1,
    initial: { day: 4 },
    initialEventId: 'night-calm-fallback',
  });
  worn.resolveEvent(choiceResponse('sleep'));
  expect(worn.beginDawn()).toMatchObject({
    accepted: true,
    deltas: { hull: -3 },
  });

  const respite = new SurvivalSession(saved(), {
    seed: 1,
    initial: { day: 5 },
    initialEventId: 'night-calm-fallback',
  });
  respite.resolveEvent(choiceResponse('sleep'));
  expect(respite.beginDawn().deltas).not.toHaveProperty('hull');
});

it('can sink from overnight hull wear', () => {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    initial: { hull: 3 },
    initialEventId: 'night-calm-fallback',
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

function driftingCargoSession(random: readonly number[], energy = 3, items: ItemId[] = []): SurvivalSession {
  return new SurvivalSession(saved(...items), {
    seed: 1,
    random: sequenceRandom(random),
    initial: { energy },
    initialEventId: 'drifting-barrel',
  });
}

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
  attempt.advance(attempt.snapshot().biteDelaySeconds + 2);
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
        outcomes: [{ weight: 1, message: 'Handled.', effects }],
      })),
      {
        id: 'sleep',
        label: 'Endure',
        outcomes: [{ weight: 1, message: 'Endured.', effects: {} }],
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

function itemChoiceResponse(
  choiceId: string,
  itemId: ItemId,
  number = 1,
): EventResponse {
  return {
    kind: 'item',
    choiceId,
    instanceId: `${itemId}-${number}` as ItemInstanceId,
  };
}

function itemlessEvent(
  effects: SurvivalEventDefinition['choices'][number]['outcomes'][number]['effects'],
): SurvivalEventDefinition {
  return {
    id: 'test-itemless-choice',
    phase: 'night',
    title: 'Itemless Choice',
    revealText: 'Choose without an item.',
    prompt: 'Choose.',
    danger: 'uncertain',
    cue: 'none',
    weight: 1,
    earliestDay: 1,
    cooldownDays: 0,
    choices: [{ id: 'sleep', label: 'Sleep', outcomes: [{ weight: 1, message: 'Handled.', effects }] }],
  };
}

function choiceResponse(choiceId: string): EventResponse {
  return { kind: 'choice', choiceId };
}

it('records signal-assisted rescue once', () => {
  const session = new SurvivalSession(saved('radio'), {
    seed: 20,
    random: sequenceRandom([0, 0]),
    initial: { day: 23, rescueLead: 8 },
    initialEventId: 'night-calm-fallback',
  });
  session.resolveEvent(choiceResponse('sleep'));
  session.beginDawn();
  expect(session.snapshot().ending).toEqual({
    id: 'rescue', day: 24, savedPickupCount: 1, signalAssisted: true,
  });
  const ending = session.snapshot().ending;
  expect(session.beginDawn().accepted).toBe(false);
  expect(session.snapshot().ending).toBe(ending);
});

it('records starvation and diving causes', () => {
  const starving = new SurvivalSession(saved(), {
    seed: 21,
    initial: { day: 10, hunger: 100, health: 15 },
    initialEventId: 'night-calm-fallback',
  });
  starving.resolveEvent(choiceResponse('sleep'));
  starving.beginDawn();
  expect(starving.snapshot().ending).toMatchObject({
    id: 'death', cause: { kind: 'starvation' },
  });

  const diving = new SurvivalSession(saved('scubaSet'), {
    seed: 22,
    random: sequenceRandom([0.99, 0, 0]),
    initial: { health: 10, energy: 3 },
  });
  diving.perform('dive');
  expect(diving.snapshot().ending).toMatchObject({
    id: 'death', cause: { kind: 'diving' },
  });
});

it('records the final event for death and sinking', () => {
  const death = new SurvivalSession(saved(), {
    seed: 23,
    random: sequenceRandom([0.5, 0.5]),
    initial: { health: 60 },
    initialEventId: 'death-stare',
  });
  death.resolveEvent(choiceResponse('sleep'));
  expect(death.snapshot().ending).toMatchObject({
    id: 'death', cause: { kind: 'event', eventId: 'death-stare' },
  });

  const sinking = new SurvivalSession(saved(), {
    seed: 23,
    random: sequenceRandom([0, 0]),
    initial: { hull: 20 },
    initialEventId: 'restless-waves',
  });
  sinking.resolveEvent(choiceResponse('sleep'));
  expect(sinking.snapshot().ending).toMatchObject({
    id: 'sinking', cause: { eventId: 'restless-waves' },
  });
});

describe('SurvivalSession Carlitos events', () => {
  it('uses exact Shadow Figure damage boundaries', () => {
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
    flare.resolveEvent({ kind: 'item', choiceId: 'flareGun', instanceId: 'flareGun-1' });
    expect(flare.snapshot()).toMatchObject({
      state: 'nightEvent', health: 50, ending: null,
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

  it('delegates Drifting Cargo at sufficient wellness and spends Carlitos energy', () => {
    const session = new SurvivalSession(saved('carlitos'), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { energy: 1 },
      initialCarlitos: { hunger: 5, energy: 3 },
      initialEventId: 'drifting-barrel',
    });
    const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' });
    expect(outcome).toMatchObject({
      accepted: true,
      deltas: { food: 2 },
      rewardSummary: { kind: 'resource', id: 'food', quantity: 2 },
    });
    expect(session.snapshot().energy).toBe(1);
    expect(session.snapshot().carlitos?.energy).toBe(0);
  });

  it('resolves Wreckage surface costs without scuba gear', () => {
    const session = new SurvivalSession(saved(), {
      seed: 71,
      random: sequenceRandom([0]),
      initial: { day: 4, energy: 3 },
      initialEventId: 'wreckage',
    });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'search' }))
      .toMatchObject({ accepted: true, deltas: { energy: -2, repairMaterial: 2 } });
  });

  it('requires usable scuba gear and three energy for the Wreckage dive', () => {
    const noScuba = new SurvivalSession(saved(), {
      seed: 72, initial: { day: 4, energy: 3 }, initialEventId: 'wreckage',
    });
    expect(noScuba.resolveEvent({
      kind: 'item', choiceId: 'dive', instanceId: 'scubaSet-1',
    })).toMatchObject({ accepted: false, code: 'item-unavailable' });

    const collapse = new SurvivalSession(saved('scubaSet'), {
      seed: 73,
      random: sequenceRandom([0.55, 0.5]),
      initial: { day: 4, energy: 3, health: 100 },
      initialEventId: 'wreckage',
    });
    expect(collapse.resolveEvent({
      kind: 'item', choiceId: 'dive', instanceId: 'scubaSet-1',
    })).toMatchObject({ accepted: true, deltas: { energy: -3 } });
    expect(collapse.snapshot().inventory['scubaSet-1']?.condition).toBe('broken');
  });

  it('lets Carlitos search Wreckage for three Carlitos energy', () => {
    const session = new SurvivalSession(saved('carlitos'), {
      seed: 74,
      random: sequenceRandom([0]),
      initial: { day: 4, energy: 1 },
      initialCarlitos: { hunger: 5, energy: 3 },
      initialEventId: 'wreckage',
    });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' }))
      .toMatchObject({ accepted: true, deltas: { repairMaterial: 2 } });
    expect(session.snapshot()).toMatchObject({ energy: 1, carlitos: { energy: 0 } });
  });

  it('rejects Drifting Cargo delegation without Carlitos energy', () => {
    const session = new SurvivalSession(saved('carlitos'), {
      seed: 7,
      initialCarlitos: { energy: 0 },
      initialEventId: 'drifting-barrel',
    });

    expect(session.companionEventActionAvailability('delegateCarlitos')).toEqual({
      visible: true,
      energyCost: 3,
      availableEnergy: 0,
      unavailableReason: 'Carlitos needs 3 energy; he has 0.',
    });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' })).toMatchObject({
      accepted: false,
      code: 'companion-action-unavailable',
    });
    expect(session.snapshot().carlitos?.energy).toBe(0);
  });

  it('rejects Drifting Cargo delegation with a status label', () => {
    const session = new SurvivalSession(saved('carlitos'), {
      seed: 1,
      initialCarlitos: { hunger: 3, sickness: 1 },
      initialEventId: 'drifting-barrel',
    });
    const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' });
    expect(outcome).toMatchObject({ accepted: false, code: 'companion-action-unavailable' });
    expect(outcome.message).toContain('Hungry');
    expect(outcome.message).not.toMatch(/\b[0-9]+\b/);
    expect(session.snapshot().pendingEventId).toBe('drifting-barrel');
  });

  it.each([
    {
      label: 'absent',
      items: [] as ItemId[],
      state: {},
      expected: {
        visible: false,
        energyCost: 0,
        availableEnergy: 0,
        unavailableReason: 'Carlitos is not aboard.',
      },
    },
    {
      label: 'dead',
      items: ['carlitos'] as ItemId[],
      state: { alive: false, deathCause: 'sickness' as const },
      expected: {
        visible: false,
        energyCost: 0,
        availableEnergy: 0,
        unavailableReason: 'Carlitos cannot retrieve the loot.',
      },
    },
    {
      label: 'Hungry',
      items: ['carlitos'] as ItemId[],
      state: { hunger: 3 },
      expected: {
        visible: true,
        energyCost: 3,
        availableEnergy: 3,
        unavailableReason: 'Carlitos is Hungry and cannot retrieve the loot.',
      },
    },
    {
      label: 'Sick',
      items: ['carlitos'] as ItemId[],
      state: { hunger: 5, sickness: 2 },
      expected: {
        visible: true,
        energyCost: 3,
        availableEnergy: 3,
        unavailableReason: 'Carlitos is Sick and cannot retrieve the loot.',
      },
    },
    {
      label: 'Lonely',
      items: ['carlitos'] as ItemId[],
      state: { hunger: 5, unhappiness: 5 },
      expected: {
        visible: true,
        energyCost: 3,
        availableEnergy: 3,
        unavailableReason: 'Carlitos is Lonely and cannot retrieve the loot.',
      },
    },
    {
      label: 'wellness four',
      items: ['carlitos'] as ItemId[],
      state: { hunger: 4 },
      expected: { visible: true, energyCost: 3, availableEnergy: 3, unavailableReason: null },
    },
  ])('owns exact Drifting Cargo delegation availability for $label', ({
    items,
    state,
    expected,
  }) => {
    const session = new SurvivalSession(saved(...items), {
      seed: 1,
      initialCarlitos: state,
      initialEventId: 'drifting-barrel',
    });

    expect(session.companionEventActionAvailability('delegateCarlitos')).toEqual(expected);
  });
});

describe('SurvivalSession daytime actions', () => {
  it('applies fishing luck only while Carlitos is alive', () => {
    const options = { seed: 7, random: sequenceRandom([0, 0.36]) };
    const living = new SurvivalSession(saved('carlitos'), options);
    const dead = new SurvivalSession(saved('carlitos'), {
      ...options,
      random: sequenceRandom([0, 0.36]),
      initialCarlitos: { alive: false, deathCause: 'sickness' },
    });
    const absent = new SurvivalSession(saved(), {
      ...options,
      random: sequenceRandom([0, 0.36]),
    });

    expect(reelCatch(beginFishing(living))).toMatchObject({ kind: 'catch', catch: { id: 'clownfish' } });
    expect(reelCatch(beginFishing(dead))).toMatchObject({ kind: 'catch', catch: { id: 'seaweed' } });
    expect(reelCatch(beginFishing(absent))).toMatchObject({ kind: 'catch', catch: { id: 'seaweed' } });
  });

  it('hands Carlitos from saved items to companion state', () => {
    const session = new SurvivalSession(saved('carlitos', 'cannedFood', 'medicalKit'), { seed: 7 });
    const snapshot = session.snapshot();

    expect(snapshot.carlitos).toMatchObject({ alive: true, hunger: 5 });
    expect(snapshot.inventory['carlitos-1']).toBeUndefined();
    expect(snapshot.savedItems.some(({ type }) => type === 'carlitos')).toBe(false);
  });

  it('has no companion state when Carlitos was not saved', () => {
    const session = new SurvivalSession(saved('cannedFood'), { seed: 7 });

    expect(session.snapshot().carlitos).toBeNull();
  });

  it('returns immutable Carlitos snapshots', () => {
    const session = new SurvivalSession(saved('carlitos'), { seed: 7 });
    const snapshot = session.snapshot();

    expect(Object.isFrozen(snapshot.carlitos)).toBe(true);
    expect(() => {
      (snapshot.carlitos as { hunger: number }).hunger = 0;
    }).toThrow();
    expect(session.snapshot().carlitos?.hunger).toBe(5);
  });

  it('cares for Carlitos during the day without using energy', () => {
    const session = new SurvivalSession(saved('carlitos', 'cannedFood', 'medicalKit'), {
      seed: 7,
      initialCarlitos: { hunger: 2, sickness: 2, unhappiness: 5 },
    });

    expect(session.perform('petCarlitos')).toMatchObject({
      accepted: true, code: 'carlitos-petted', deltas: {}, cue: 'none',
    });
    expect(session.perform('feedCarlitos')).toMatchObject({
      accepted: true, code: 'carlitos-fed', deltas: { food: -1 }, cue: 'none',
    });
    expect(session.perform('treatCarlitos')).toMatchObject({
      accepted: true, code: 'carlitos-treated', deltas: {}, cue: 'none',
    });
    expect(session.snapshot()).toMatchObject({
      energy: 3,
      carlitos: { hunger: 5, sickness: 0, unhappiness: 1, pettedToday: true },
    });
    expect(session.snapshot().inventory).toMatchObject({
      'cannedFood-1': { condition: 'consumed' },
      'medicalKit-1': { condition: 'consumed' },
    });
  });

  it('rejects unavailable Carlitos care actions', () => {
    const healthy = new SurvivalSession(saved('carlitos'), { seed: 7 });
    expect(healthy.perform('feedCarlitos')).toMatchObject({ code: 'carlitos-not-hungry' });
    expect(healthy.perform('treatCarlitos')).toMatchObject({ code: 'carlitos-healthy' });
    expect(healthy.perform('petCarlitos')).toMatchObject({ code: 'carlitos-happy' });

    const bored = new SurvivalSession(saved('carlitos'), {
      seed: 7,
      initialCarlitos: { unhappiness: 3 },
    });
    expect(bored.perform('petCarlitos').accepted).toBe(true);
    expect(bored.perform('petCarlitos')).toMatchObject({ code: 'already-petted' });

    const noSupplies = new SurvivalSession(saved('carlitos'), {
      seed: 7,
      initialCarlitos: { hunger: 2, sickness: 1 },
    });
    expect(noSupplies.perform('feedCarlitos')).toMatchObject({ code: 'no-food' });
    expect(noSupplies.perform('treatCarlitos')).toMatchObject({ code: 'no-medical-kit' });

    const dead = new SurvivalSession(saved('carlitos'), {
      seed: 7,
      initialCarlitos: { alive: false, deathCause: 'sickness' },
    });
    expect(dead.perform('petCarlitos')).toMatchObject({ code: 'carlitos-dead' });

    const absent = new SurvivalSession(saved(), { seed: 7 });
    expect(absent.perform('petCarlitos')).toMatchObject({ code: 'no-carlitos' });

    healthy.perform('endDay');
    expect(healthy.perform('petCarlitos')).toMatchObject({ code: 'not-daytime' });

    const fishing = new SurvivalSession(saved('carlitos'), { seed: 7 });
    expect(fishing.beginFishing().accepted).toBe(true);
    expect(fishing.perform('petCarlitos')).toMatchObject({ code: 'fishing-in-progress' });
  });

  it('records Carlitos care and dawn results in the journal', () => {
    const caredFor = new SurvivalSession(saved('carlitos'), {
      seed: 7,
      random: sequenceRandom([0, 0, 0.99, 0]),
      initialCarlitos: { energy: 0, sickness: 1, unhappiness: 3 },
    });
    caredFor.perform('endDay');
    caredFor.beginDawn();
    const caredForEntry = caredFor.snapshot().journalEntries[0]!;

    expect(caredForEntry.actions).toEqual([
      {
        kind: 'carlitosDawn',
        before: expect.objectContaining({ alive: true, energy: 0, hunger: 5, sickness: 1, unhappiness: 3 }),
        after: expect.objectContaining({ alive: true, energy: 1, hunger: 4, sickness: 0, unhappiness: 4 }),
      },
    ]);
    expect(formatJournalEntry(caredForEntry).daytime).toContain(
      'Carlitos: hunger 5 to 4; sickness 1 to 0; unhappiness 3 to 4; energy 0 to 1.',
    );

    const died = new SurvivalSession(saved('carlitos'), {
      seed: 7,
      random: sequenceRandom([0]),
      initialCarlitos: { hunger: 1 },
    });
    died.perform('endDay');
    died.beginDawn();

    expect(formatJournalEntry(died.snapshot().journalEntries[0]!).daytime)
      .toContain('Carlitos died during the night.');

    died.perform('endDay');
    died.beginDawn();
    const secondDay = died.snapshot().journalEntries[1]!;
    expect(secondDay.actions).not.toContainEqual(expect.objectContaining({ kind: 'carlitosDawn' }));
    expect(formatJournalEntry(secondDay).daytime).not.toContain('Carlitos died during the night.');
  });

  it('reuses an immutable snapshot until an action changes state', () => {
    const session = new SurvivalSession(saved(), { seed: 1 });
    const initial = session.snapshot();

    expect(session.snapshot()).toBe(initial);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.inventory)).toBe(true);

    expect(session.perform('endDay').accepted).toBe(true);
    expect(session.snapshot()).not.toBe(initial);
  });

  it('keeps snapshot identity after a rejected action', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      initial: { energy: 0 },
    });
    const initial = session.snapshot();

    expect(session.perform('dive').accepted).toBe(false);
    expect(session.snapshot()).toBe(initial);
  });

  it('raises scheduled pressure at dawn', () => {
    const pressure = new SurvivalSession(saved(), {
      seed: 7,
      random: sequenceRandom([0, 0.99, 0.99]),
      initial: { day: 7 },
    });
    pressure.perform('endDay');
    expect(pressure.beginDawn().deltas.pressure).toBe(1);
    expect(pressure.snapshot().pressure).toBe(1);

    const increased = new SurvivalSession(saved('spyglass'), {
      seed: 12,
      random: sequenceRandom([0]),
      initial: { day: 6 },
      initialEventId: 'man-in-the-fog',
    });
    expect(increased.resolveEvent(itemResponse('spyglass')).deltas.pressure).toBe(1);
  });

  it('opens a recovered chest and prefers a missing durable item', () => {
    const session = new SurvivalSession(saved(), {
      seed: 9,
      random: sequenceRandom([0]),
      initialChest: { state: 'closed', acquiredDay: 1 },
    });

    expect(session.perform('openChest')).toMatchObject({
      accepted: true,
      code: 'chest-opened',
      cue: 'none',
      deltas: { energy: -3 },
      rewardSummary: { kind: 'item', id: 'compass', quantity: 1 },
    });
    expect(session.snapshot().chest).toEqual({ state: 'none', acquiredDay: null });
    expect(session.snapshot().inventory['compass-1']).toMatchObject({ condition: 'usable' });
  });

  it('turns an old chest into a mimic and lets a net bind it', () => {
    const session = new SurvivalSession(saved('fishingNet'), {
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
    expect(session.resolveEvent(itemResponse('fishingNet'))).toMatchObject({
      accepted: true,
      deltas: {},
    });
    expect(session.snapshot().chest).toEqual({ state: 'closed', acquiredDay: 3 });
  });

  it('publishes stable results for Chest Attack and Midnight Tour', () => {
    const bound = new SurvivalSession(saved('fishingNet'), {
      seed: 9,
      random: sequenceRandom([0]),
      initialChest: { state: 'mimic', acquiredDay: 1 },
      initialEventId: 'chest-attack',
    });
    expect(bound.resolveEvent(itemResponse('fishingNet')).eventResult?.resultId).toBe('chest-bound');

    const chestAttacked = new SurvivalSession(saved(), {
      seed: 10,
      random: sequenceRandom([0]),
      initialChest: { state: 'mimic', acquiredDay: 1 },
      initialEventId: 'chest-attack',
    });
    expect(chestAttacked.resolveEvent(choiceResponse('attack'))).toMatchObject({
      deltas: { health: -40 },
      eventResult: { resultId: 'chest-attack' },
    });
    expect(chestAttacked.snapshot().chest.state).toBe('none');

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

  it.each([
    {
      resultId: 'tour-chest',
      random: [0.99, 0.5],
      expectedChest: 'closed',
    },
    {
      resultId: 'tour-attack',
      random: [0, 0.5],
      expectedChest: 'none',
    },
  ])('forces the $resultId Midnight Tour test result', ({
    resultId,
    random,
    expectedChest,
  }) => {
    const session = new SurvivalSession(saved(), {
      seed: 103,
      random: sequenceRandom(random),
      initial: { health: 100 },
      initialEventId: 'midnight-tour',
    });

    const resolution = session.resolveEvent({
      kind: 'choice',
      choiceId: 'visit',
      resultId,
    });

    expect(resolution.eventResult?.resultId).toBe(resultId);
    expect(session.snapshot().chest.state).toBe(expectedChest);
  });

  it.each([
    { resultId: 'tour-chest', random: [0, 0.99] },
    { resultId: 'tour-attack', random: [0.99, 0.5, 0.99] },
  ])('keeps the $resultId Midnight Tour result on the normal dawn path', ({
    resultId,
    random,
  }) => {
    const session = new SurvivalSession(saved(), {
      seed: 103,
      random: sequenceRandom(random),
      initial: { health: 100 },
      initialEventId: 'midnight-tour',
    });

    const resolution = session.resolveEvent(choiceResponse('visit'));

    expect(resolution.accepted).toBe(true);
    expect(resolution.eventResult?.resultId).toBe(resultId);
    expect(session.snapshot().state).toBe('nightEvent');
    expect(session.beginDawn()).toMatchObject({ accepted: true, code: 'dawn' });
    expect(session.snapshot().state).toBe('day');
  });

  it('records the Flowers event without granting a survival reward', () => {
    const session = new SurvivalSession(saved('bucket'), {
      seed: 11,
      random: sequenceRandom([0]),
      initial: { day: 4 },
      initialEventId: 'flowers',
    });

    expect(session.resolveEvent(itemResponse('bucket'))).toMatchObject({
      accepted: true,
      deltas: {},
    });
    expect(session.snapshot().journalEntries[0]?.nighttime).toMatchObject({
      kind: 'event',
      event: { eventId: 'flowers', attemptedItemId: 'bucket' },
    });
  });

  it('resolves the damaging anglerfish outcome at the top of the Check the Back roll', () => {
    const session = new SurvivalSession(saved(), {
      seed: 105,
      random: sequenceRandom([0.999]),
      initial: { day: 2 },
      initialEventId: 'check-the-back',
      initialAppearanceCounts: { 'check-the-back': 1 },
    });
    expect(session.resolveEvent(choiceResponse('check'))).toMatchObject({
      eventPresentationKey: 'check-the-back.bad',
      deltas: { health: -25 },
    });
    expect(session.snapshot().health).toBe(75);
  });

  it('enforces contextual requirements without mutating the session', () => {
    const session = new SurvivalSession(saved(), {
      seed: 104, random: sequenceRandom([0]), initial: { day: 3, energy: 2 }, initialEventId: 'drifting-barrel',
    });
    const before = session.snapshot();
    expect(session.resolveEvent(choiceResponse('retrieve'))).toMatchObject({
      accepted: false, code: 'requirements-unmet', deltas: {},
    });
    expect(session.snapshot()).toEqual(before);
  });

  it('charges the full Drifting Cargo retrieval cost on success', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1041,
      random: sequenceRandom([0]),
      initial: { day: 3, energy: 3 },
      initialEventId: 'drifting-barrel',
    });

    expect(session.resolveEvent(choiceResponse('retrieve'))).toMatchObject({
      accepted: true,
      message: 'You recover two food.',
      deltas: { energy: -3, food: 2 },
    });
    expect(session.snapshot()).toMatchObject({ energy: 0, food: 2 });
  });

  it.each([
    ['spyglass', 'flashlight'], ['flashlight', 'spyglass'],
    ['flareGun', 'shotgun'], ['shotgun', 'flareGun'],
    ['medicalKit', 'scubaSet'],
    ['fishingNet', 'bucket'], ['bucket', 'fishingNet'],
    ['ductTape', 'energyBar'], ['energyBar', 'ductTape'],
    ['swimRing', 'radio'],
    ['anchor', 'chest'],
  ] as const)('trades Handyman %s for %s', (source, reward) => {
    const session = new SurvivalSession(saved(source), {
      seed: 105,
      random: sequenceRandom([0]),
      initial: { day: 20, pressure: 2 },
      initialEventId: 'handyman',
    });

    expect(session.resolveEvent(itemResponse(source))).toMatchObject({
      accepted: true,
      eventResult: { resultId: 'handyman-reward' },
    });
    if (reward === 'chest') {
      expect(session.snapshot().chest).toEqual({ state: 'closed', acquiredDay: 20 });
    }
    else {
      expect(session.snapshot().inventory[`${reward}-1` as ItemInstanceId]).toMatchObject({ condition: 'usable' });
    }
  });

  it('trades a closed Chest for an Anchor without exposing it otherwise', () => {
    const noChest = new SurvivalSession(saved(), {
      seed: 106,
      random: sequenceRandom([0]),
      initial: { day: 20, pressure: 2 },
      initialEventId: 'handyman',
    });
    expect(noChest.resolveEvent(choiceResponse('chest'))).toMatchObject({
      accepted: false,
      code: 'chest-state-unavailable',
    });

    const session = new SurvivalSession(saved(), {
      seed: 106,
      random: sequenceRandom([0]),
      initial: { day: 20, pressure: 2 },
      initialChest: { state: 'closed', acquiredDay: 18 },
      initialEventId: 'handyman',
    });
    expect(session.resolveEvent(choiceResponse('chest'))).toMatchObject({
      accepted: true,
      eventResult: { resultId: 'handyman-reward' },
    });
    expect(session.snapshot()).toMatchObject({
      chest: { state: 'none', acquiredDay: null },
      inventory: { 'anchor-1': { condition: 'usable' } },
    });
  });

  it('publishes the Handyman Food fallback result for a duplicate reward', () => {
    const session = new SurvivalSession(saved('spyglass', 'flashlight'), {
      seed: 106,
      random: sequenceRandom([0]),
      initial: { day: 20 },
      initialEventId: 'handyman',
    });

    expect(session.resolveEvent(itemResponse('spyglass')).eventResult?.resultId)
      .toBe('handyman-food-fallback');
    expect(session.snapshot().food).toBe(1);
  });

  it.each([
    [0, -30],
    [0.999999, -60],
  ] as const)('resolves Touch the Hand with bounded hull damage at roll %s', (roll, hullDelta) => {
    const session = new SurvivalSession(saved(), {
      seed: 1061,
      random: sequenceRandom([0, roll]),
      initial: { day: 20 },
      initialEventId: 'handyman',
    });

    expect(session.resolveEvent(choiceResponse('touch'))).toMatchObject({
      accepted: true,
      deltas: { hull: hullDelta, health: -60 },
    });
    expect(session.snapshot()).toMatchObject({
      hull: 100 + hullDelta,
      health: 40,
    });
  });

  it('executes Night Trader resource and Other People signal choices deterministically', () => {
    const trader = new SurvivalSession(saved('cannedFood'), {
      seed: 107, random: sequenceRandom([0]), initial: { day: 10 }, initialEventId: 'night-trader',
    });
    expect(trader.resolveEvent(itemChoiceResponse('food', 'cannedFood')))
      .toMatchObject({ accepted: true, deltas: { food: -1 } });
    expect(trader.snapshot()).toMatchObject({ food: 0, inventory: { 'ductTape-1': { condition: 'usable' } } });

    const flare = new SurvivalSession(saved('flareGun'), {
      seed: 110, random: sequenceRandom([0]), initial: { day: 15, rescueLead: 2 }, initialEventId: 'other-people',
    });
    expect(flare.resolveEvent(itemResponse('flareGun'))).toMatchObject({
      accepted: true,
      deltas: { rescueLead: 6 },
      eventResult: { resultId: 'people-signaled' },
    });
    expect(flare.snapshot()).toMatchObject({
      state: 'nightEvent',
      rescueLead: 8,
      inventory: { 'flareGun-1': { condition: 'consumed' } },
    });
  });

  it('turns Plane signals into smaller rescue leads', () => {
    const flashlight = new SurvivalSession(saved('flashlight'), {
      seed: 1110,
      random: sequenceRandom([0]),
      initial: { day: 15, rescueLead: 2 },
      initialEventId: 'plane',
    });
    expect(flashlight.resolveEvent(itemResponse('flashlight'))).toMatchObject({
      accepted: true,
      deltas: { rescueLead: 2 },
      eventResult: { resultId: 'plane-signaled' },
    });
    expect(flashlight.snapshot()).toMatchObject({
      state: 'nightEvent',
      rescueLead: 4,
      inventory: { 'flashlight-1': { condition: 'usable' } },
    });

    const flare = new SurvivalSession(saved('flareGun'), {
      seed: 1111,
      random: sequenceRandom([0]),
      initial: { day: 15, rescueLead: 2 },
      initialEventId: 'plane',
    });
    expect(flare.resolveEvent(itemResponse('flareGun'))).toMatchObject({
      accepted: true,
      deltas: { rescueLead: 4 },
      eventResult: { resultId: 'plane-signaled' },
    });
    expect(flare.snapshot()).toMatchObject({
      state: 'nightEvent',
      rescueLead: 6,
      inventory: { 'flareGun-1': { condition: 'consumed' } },
    });

    const pass = new SurvivalSession(saved('flashlight'), {
      seed: 1112,
      random: sequenceRandom([0]),
      initial: { day: 15, rescueLead: 2 },
      initialEventId: 'plane',
    });
    expect(pass.resolveEvent({ kind: 'endure' })).toMatchObject({
      accepted: true,
      eventResult: {
        eventId: 'plane',
        choiceId: 'sleep',
        resultId: 'plane-pass',
      },
    });
    expect(pass.snapshot()).toMatchObject({
      rescueLead: 2,
      inventory: { 'flashlight-1': { condition: 'usable' } },
    });
  });

  it.each([
    ['without a signal item', []],
    ['with a Flashlight', ['flashlight']],
    ['with a Flare Gun', ['flareGun']],
  ] as const)('lets Other People pass through Endure %s', (_label, items) => {
    const session = new SurvivalSession(saved(...items), {
      seed: 1101,
      random: sequenceRandom([0]),
      initial: { day: 15, rescueLead: 2 },
      initialEventId: 'other-people',
    });

    expect(session.resolveEvent({ kind: 'endure' })).toMatchObject({
      accepted: true,
      code: 'event-resolved',
      message: 'You let the other boat pass.',
      eventResult: {
        eventId: 'other-people',
        choiceId: 'sleep',
        resultId: 'people-pass',
      },
    });
    expect(session.snapshot()).toMatchObject({
      state: 'nightEvent',
      pendingEventId: null,
    });
  });

  it.each([
    ['food', ['cannedFood'], 'ductTape', { food: -1 }],
    ['bait', ['baitTin'], 'energyBar', { bait: -1 }],
    ['map', ['map'], 'compass', {}],
    ['umbrella', ['umbrella'], 'medicalKit', {}],
    ['swimRing', ['swimRing'], 'radio', {}],
  ] as const)('trades Night Trader %s for %s', (choiceId, inventory, reward, deltas) => {
    const session = new SurvivalSession(saved(...inventory), {
      seed: 111,
      random: sequenceRandom([0]),
      initial: { day: 10 },
      initialEventId: 'night-trader',
    });
    const response = choiceId === 'food'
      ? itemChoiceResponse(choiceId, 'cannedFood')
      : choiceId === 'bait'
        ? itemChoiceResponse(choiceId, 'baitTin')
        : itemResponse(choiceId);

    expect(session.resolveEvent(response)).toMatchObject({
      accepted: true,
      deltas,
      eventResult: { resultId: 'trader-reward' },
    });
    expect(session.snapshot().inventory[`${reward}-1` as ItemInstanceId]).toMatchObject({ condition: 'usable' });
  });

  it('reports Food when a Night Trader reward slot is occupied', () => {
    const session = new SurvivalSession(saved('cannedFood', 'ductTape'), {
      seed: 112,
      random: sequenceRandom([0]),
      initial: { day: 10 },
      initialEventId: 'night-trader',
    });

    expect(session.resolveEvent(itemChoiceResponse('food', 'cannedFood'))).toMatchObject({
      deltas: {},
      eventResult: { resultId: 'trader-food-fallback' },
    });
    expect(session.snapshot().food).toBe(1);
  });

  it('retains Death Stare outcomes alongside the expansion', () => {
    const session = new SurvivalSession(saved(), {
      seed: 111, random: sequenceRandom([0]), initial: { day: 9 }, initialEventId: 'death-stare',
    });
    expect(session.resolveEvent(choiceResponse('sleep'))).toMatchObject({
      accepted: true, message: 'The shape loses interest and sinks away.', deltas: {},
    });
    expect(session.snapshot()).toMatchObject({ health: 100, hull: 100, state: 'nightEvent' });
  });
  it('resolves a named itemless event choice', () => {
    const session = new SurvivalSession(saved(), { seed: 1, initialEventId: 'shower-night' });
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent =
      itemlessEvent({ resources: [{ resource: 'repairMaterial', operation: 'add', value: 1 }] });

    expect(session.resolveEvent(choiceResponse('sleep'))).toMatchObject({ accepted: true, code: 'event-resolved' });
    expect(session.snapshot().repairMaterial).toBe(1);
  });

  it('rejects a response that requires another Chest state', () => {
    const session = new SurvivalSession(saved(), { seed: 1, initialEventId: 'shower-night' });
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent = {
      ...itemlessEvent({}),
      choices: [{
        id: 'sleep',
        label: 'Sleep',
        requiredChestState: 'closed',
        outcomes: [{ weight: 1, message: 'Handled.', effects: {} }],
      }],
    };

    expect(session.resolveEvent(choiceResponse('sleep'))).toMatchObject({
      accepted: false,
      code: 'chest-state-unavailable',
    });
  });

  it('gains an event item and falls back to food when its stable slot is occupied', () => {
    const gained = new SurvivalSession(saved(), { seed: 1, initialEventId: 'shower-night' });
    (gained as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent =
      itemlessEvent({
        items: [{ kind: 'gain', itemId: 'energyBar', quantity: 1, fallbackFood: 1 }],
      });

    expect(gained.resolveEvent(choiceResponse('sleep')).accepted).toBe(true);
    expect(gained.snapshot().inventory['energyBar-1']?.condition).toBe('usable');

    const fallback = new SurvivalSession(saved('energyBar'), { seed: 1, initialEventId: 'shower-night' });
    (fallback as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent =
      itemlessEvent({
        items: [{ kind: 'gain', itemId: 'energyBar', quantity: 1, fallbackFood: 1 }],
      });

    expect(fallback.resolveEvent(choiceResponse('sleep'))).toMatchObject({
      deltas: { food: 1 },
      message: 'The item slot is occupied, so you receive one food instead.',
    });
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

  it('breaks anchor-2 at dawn instead of anchor-1', () => {
    const session = new SurvivalSession(saved('anchor', 'anchor'), {
      seed: 1,
      random: sequenceRandom([0]),
      initialEventId: 'shower-night',
    });
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent =
      physicalItemEvent(['anchor'], {
        items: [{ kind: 'break', itemId: 'anchor', quantity: 1 }],
      });

    expect(session.resolveEvent({
      kind: 'item',
      choiceId: 'anchor',
      instanceId: 'anchor-2',
    }).accepted).toBe(true);
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'usable' },
      'anchor-2': { condition: 'usable' },
    });
    session.beginDawn();
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'usable' },
      'anchor-2': { condition: 'broken' },
    });
  });

  it('uses cannedFood-2 first for a choice-targeted recovered food loss', () => {
    const session = new SurvivalSession(saved('cannedFood', 'cannedFood'), {
      seed: 1,
      random: sequenceRandom([0]),
      initialEventId: 'shower-night',
    });
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent =
      physicalItemEvent(['cannedFood'], {
        resources: [{ resource: 'food', operation: 'subtract', value: 1 }],
      });

    expect(session.resolveEvent({
      kind: 'item',
      choiceId: 'cannedFood',
      instanceId: 'cannedFood-2',
    }).accepted).toBe(true);
    expect(session.snapshot().inventory).toMatchObject({
      'cannedFood-1': { condition: 'usable' },
      'cannedFood-2': { condition: 'consumed' },
    });
  });

  it('reports applied rather than requested clamped deltas', () => {
    const eating = new SurvivalSession(saved('cannedFood'), { seed: 1, initial: { hunger: 20 } });
    expect(eating.perform('eat').deltas).toEqual({ hunger: -20, food: -1 });
    const treating = new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 90 } });
    expect(treating.perform('treat').deltas).toEqual({ health: 10 });
    const repairing = new SurvivalSession(saved(), { seed: 1, initial: { hull: 90, energy: 3 } });
    (repairing as unknown as { repairMaterial: number }).repairMaterial = 1;
    expect(repairing.perform('repair', { kind: 'hullRepair', material: 'repairMaterial' }).deltas)
      .toEqual({ energy: -1, hull: 10, repairMaterial: -1 });
  });

  it('rejects unowned or exhausted event items without changing the event', () => {
    const unowned = new SurvivalSession(saved(), { seed: 1, initialEventId: 'shower-night' });
    const before = unowned.snapshot();
    expect(unowned.resolveEvent(itemResponse('bucket'))).toMatchObject({ accepted: false, code: 'item-unavailable' });
    expect(unowned.snapshot()).toEqual(before);
  });

  it('breaks the exact selected item at dawn', () => {
    const session = new SurvivalSession(saved('bucket', 'bucket'), {
      seed: 1,
      random: sequenceRandom([0.99]),
      initialEventId: 'leak',
    });

    expect(session.resolveEvent({
      kind: 'item',
      choiceId: 'bucket',
      instanceId: 'bucket-2',
    })).toMatchObject({ accepted: true, cue: 'none' });
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
    expect(session.snapshot().inventory['bucket-2']?.condition).toBe('usable');
    session.beginDawn();
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
    expect(session.snapshot().inventory['bucket-2']?.condition).toBe('broken');
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
    const session = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0.5, 0, 0.99]) });
    expect(session.perform('endDay').cue).toBe('nightfall');
    const pending = session.snapshot();
    expect(session.beginDawn()).toMatchObject({ accepted: false, code: 'event-pending' });
    expect(session.snapshot()).toEqual(pending);
    session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot().state).toBe('nightEvent');
    expect(session.beginDawn()).toMatchObject({ accepted: true, cue: 'dawn' });
  });

  it('requires a completed night before beginning dawn', () => {
    const session = new SurvivalSession(saved(), { seed: 1, initial: { energy: 0 } });
    const before = session.snapshot();

    expect(session.beginDawn()).toMatchObject({ accepted: false, code: 'not-nighttime' });
    expect(session.snapshot()).toEqual(before);
  });

  it('selects terminal cues from the resulting real state', () => {
    const dead = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0.99, 0]), initial: { health: 5 }, initialEventId: 'eerie-melody' });
    expect(dead.resolveEvent({ kind: 'endure' }).cue).toBe('death');
    const sunk = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0.99, 0]), initial: { hull: 10 }, initialEventId: 'eerie-melody' });
    expect(sunk.resolveEvent({ kind: 'endure' }).cue).toBe('sinking');
  });
  it('starts day one with frozen cloned supplies and one food per can', () => {
    const savedItems = saved('cannedFood', 'compass');
    const session = new SurvivalSession(savedItems, { seed: 9, random: sequenceRandom([0]) });
    savedItems.length = 0;
    const state = session.snapshot();
    expect(state).toMatchObject({
      state: 'day', day: 1, health: 100, hunger: 0, energy: 3, hull: 100, food: 1,
    });
    expect(state.inventory['cannedFood-1']).toEqual({
      instanceId: 'cannedFood-1', type: 'cannedFood', condition: 'usable',
    });
    expect(state.inventory['compass-1']).toEqual({
      instanceId: 'compass-1', type: 'compass', condition: 'usable',
    });
    expect(state.savedItems).toEqual(saved('cannedFood', 'compass'));
    expect(state.savedItems).not.toBe(savedItems);
    expect(Object.isFrozen(state.savedItems)).toBe(true);
    expect(state.savedItems.every(Object.isFrozen)).toBe(true);
  });

  it('charges one Energy for fishing and captures bait through the injected random source', () => {
    const draws = [0.25, 0];
    let drawIndex = 0;
    const session = new SurvivalSession(saved('baitTin'), {
      seed: 1,
      random: { next: () => draws[drawIndex++] ?? 0 },
    });

    const begun = session.beginFishing();

    expect(begun).toMatchObject({
      accepted: true,
      outcome: { code: 'fishing-started', deltas: { energy: -1 }, cue: 'none' },
      attempt: {},
    });
    if (!begun.accepted) throw new Error('Expected fishing to begin.');
    expect(begun.attempt.snapshot()).toMatchObject({
      id: 'fishing-1-1',
      capturedBait: true,
      biteDelaySeconds: 4,
    });
    expect(begun.attempt.snapshot().id).toBe(begun.attempt.snapshot().id);
    expect(drawIndex).toBe(2);
    expect(session.snapshot()).toMatchObject({ energy: 2, bait: 1, actedToday: true });
    expect(new SurvivalSession(saved(), { seed: 10, initial: { energy: 0 } }).beginFishing())
      .toMatchObject({ accepted: false, outcome: { code: 'not-enough-energy' } });
  });

  it('rejects fishing when no Energy remains', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0]),
      initial: { energy: 1 },
    });

    const attempt = beginFishing(session);
    const result = reelCatch(attempt);
    expect(session.finishFishing(attempt.snapshot().id, result).accepted).toBe(true);
    expect(session.snapshot().energy).toBe(0);

    expect(session.beginFishing()).toMatchObject({
      accepted: false,
      outcome: { code: 'not-enough-energy' },
    });
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

  it('allows fishing and other actions while energy remains', () => {
    const afterOther = new SurvivalSession(saved('energyBar'), {
      seed: 1,
      initial: { energy: 1 },
    });
    expect(afterOther.perform('useEnergyBar').accepted).toBe(true);
    expect(afterOther.beginFishing().accepted).toBe(true);

    const afterFishing = new SurvivalSession(saved('cannedFood', 'ductTape'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
      initial: { energy: 3, hunger: 80, hull: 90 },
    });
    const attempt = beginFishing(afterFishing);
    expect(afterFishing.finishFishing(attempt.snapshot().id, reelCatch(attempt)).accepted).toBe(true);
    expect(afterFishing.perform('eat').accepted).toBe(true);
    expect(afterFishing.perform('repair', {
      kind: 'hullRepair',
      material: 'ductTape',
    }).accepted).toBe(true);
    expect(afterFishing.snapshot()).toMatchObject({ energy: 1, state: 'day' });
    expect(afterFishing.perform('endDay').accepted).toBe(true);
  });

  it('does not expose a post-action daytime event after fishing', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0]),
    });
    const attempt = beginFishing(session);
    session.finishFishing(attempt.snapshot().id, reelCatch(attempt));

    expect(session.requestDayEvent()).toMatchObject({
      accepted: false,
      code: 'day-event-scheduled',
    });
    expect(session.snapshot()).toMatchObject({ state: 'day', pendingEventId: null });
  });

  it('opens Drifting Cargo from day 3 at the 25 percent dawn boundary', () => {
    const opens = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0.249, 0, 0.499]),
      initial: { day: 2 },
    });
    expect(opens.perform('endDay').accepted).toBe(true);
    expect(opens.beginDawn()).toMatchObject({ accepted: true, code: 'dawn' });
    expect(opens.snapshot()).toMatchObject({
      day: 3,
      state: 'dayEvent',
      pendingEventId: 'drifting-barrel',
    });

    const misses = new SurvivalSession(saved(), {
      seed: 2,
      random: sequenceRandom([0, 0.25]),
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

  it('does not roll drifting cargo before day 3', () => {
    const next = vi.fn(() => 0);
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: { next },
      initial: { day: 1 },
    });
    session.perform('endDay');
    const beforeDawn = next.mock.calls.length;
    session.beginDawn();
    expect(next).toHaveBeenCalledTimes(beforeDawn);
    expect(session.snapshot().pendingEventId).toBeNull();
  });

  it('opens Drifting Chest as a separate day event', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { day: 3 },
      initialEventId: 'drifting-chest',
    });

    expect(session.snapshot()).toMatchObject({
      state: 'dayEvent',
      pendingEventId: 'drifting-chest',
    });
  });

  it('acquires a closed chest from a directly launched Drifting Chest event', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { day: 3, energy: 3 },
      initialEventId: 'drifting-chest',
    });

    expect(session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' })).toMatchObject({
      accepted: true,
      deltas: { energy: -3 },
    });
    expect(session.snapshot().chest).toEqual({ state: 'closed', acquiredDay: 3 });
  });

  it('acquires a closed chest from Drifting Chest during a normal run', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0.249, 0.5, 0]),
      initial: { day: 2 },
    });

    expect(session.perform('endDay').accepted).toBe(true);
    expect(session.beginDawn().accepted).toBe(true);
    expect(session.snapshot().pendingEventId).toBe('drifting-chest');
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' }).accepted).toBe(true);
    expect(session.snapshot().chest).toEqual({ state: 'closed', acquiredDay: 3 });
  });

  it('does not open or grant the contents of a retrieved Drifting Chest', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { day: 3, energy: 3 },
      initialEventId: 'drifting-chest',
    });

    const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' });

    expect(outcome).toMatchObject({
      accepted: true,
      deltas: { energy: -3 },
      eventPresentationKey: 'drifting-chest.retrieve',
    });
    expect(outcome.rewardSummary).toBeUndefined();
    expect(session.snapshot()).toMatchObject({
      food: 0,
      bait: 0,
      repairMaterial: 0,
      chest: { state: 'closed', acquiredDay: 3 },
    });
  });

  it('records every applied Drifting Cargo reward without parsing its message', () => {
    const cases = [
      [0, { kind: 'resource', id: 'food', quantity: 2 }],
      [0.45, { kind: 'resource', id: 'bait', quantity: 2 }],
      [0.7, { kind: 'resource', id: 'repairMaterial', quantity: 2 }],
      [0.9, { kind: 'item', id: 'energyBar', quantity: 1 }],
    ] as const;

    for (const [roll, rewardSummary] of cases) {
      const outcome = driftingCargoSession([roll]).resolveEvent({ kind: 'choice', choiceId: 'retrieve' });
      expect(outcome).toMatchObject({
        accepted: true,
        deltas: { energy: -3 },
        rewardSummary,
      });
    }
  });

  it('reports the food fallback when the Drifting Cargo energy-bar slot is occupied', () => {
    const outcome = driftingCargoSession([0.9], 3, ['energyBar'])
      .resolveEvent({ kind: 'choice', choiceId: 'retrieve' });

    expect(outcome).toMatchObject({
      accepted: true,
      rewardSummary: { kind: 'resource', id: 'food', quantity: 1 },
    });
  });

  it('clears the drifting cargo event on resolution', () => {
    const session = driftingCargoSession([0]);
    expect(session.snapshot().pendingEventId).toBe('drifting-barrel');

    expect(session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' })).toMatchObject({
      accepted: true,
      rewardSummary: { kind: 'resource', id: 'food', quantity: 2 },
    });
    expect(session.snapshot().pendingEventId).toBeNull();
  });

  it('does not expose post-action day-event draws', () => {
    const session = new SurvivalSession(saved('energyBar'), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { day: 3, energy: 2 },
    });

    expect(session.perform('useEnergyBar').accepted).toBe(true);
    expect(session.requestDayEvent()).toMatchObject({
      accepted: false,
      code: 'day-event-scheduled',
    });
    expect(session.snapshot().pendingEventId).toBeNull();
  });

  it('does not add a reward summary when Drifting Cargo is allowed to drift', () => {
    const outcome = driftingCargoSession([0]).resolveEvent({ kind: 'choice', choiceId: 'sleep' });

    expect(outcome).toMatchObject({ accepted: true, deltas: {} });
    expect(outcome.rewardSummary).toBeUndefined();
  });

  it.each([
    [0, { energy: 0, food: 1, bait: 0 }],
    [0.999, { energy: 0, food: 0, bait: 1 }],
  ] as const)('searches Empty Lifeboat with roll %s', (roll, resources) => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([roll]),
      initial: { energy: 1 },
      initialEventId: 'empty-lifeboat',
    });

    expect(session.resolveEvent({ kind: 'choice', choiceId: 'search' })).toMatchObject({
      accepted: true,
      deltas: roll === 0 ? { energy: -1, food: 1 } : { energy: -1, bait: 1 },
      rewardSummary: roll === 0
        ? { kind: 'resource', id: 'food', quantity: 1 }
        : { kind: 'resource', id: 'bait', quantity: 1 },
      eventPresentationKey: 'empty-lifeboat.search',
    });
    expect(session.snapshot()).toMatchObject(resources);
  });

  it('rejects Empty Lifeboat search without changing resources', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      initialEventId: 'empty-lifeboat',
      initial: { energy: 0 },
    });
    const before = session.snapshot();

    expect(session.resolveEvent({ kind: 'choice', choiceId: 'search' }))
      .toMatchObject({ accepted: false });
    expect(session.snapshot()).toEqual(before);
  });

  it('rejects insufficient-energy Drifting Cargo retrieval atomically', () => {
    const session = driftingCargoSession([0], 2);
    const before = session.snapshot();

    expect(session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' })).toMatchObject({
      accepted: false,
      code: 'requirements-unmet',
    });
    expect(session.snapshot()).toEqual(before);
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
      random: sequenceRandom([0, 44 / 422]),
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

  it.each([
    ['bait', 396 / 422, {}, { bait: 1 }, undefined],
    ['wetDuctTape', 401 / 422, {}, {}, ['ductTape-1', 'usable']],
    ['brokenCompass', 406 / 422, {}, {}, ['compass-1', 'broken']],
    ['tornFishingNet', 411 / 422, {}, {}, ['fishingNet-1', 'broken']],
    ['energyBar', 414 / 422, {}, {}, ['energyBar-1', 'usable']],
  ] as const)('applies the %s utility reward', (
    catchId, catchRoll, deltas, snapshotMatch, item,
  ) => {
    const session = new SurvivalSession([], {
      seed: 1,
      initial: { day: 3 },
      random: sequenceRandom([0, catchRoll]),
    });
    const attempt = beginFishing(session);
    const result = reelCatch(attempt);
    expect(result).toMatchObject({ kind: 'catch', catch: { id: catchId, kind: 'utility' } });
    const outcome = session.finishFishing(attempt.snapshot().id, result);
    expect(outcome).toMatchObject({
      accepted: true, code: 'utility-caught', deltas,
    });
    if (result.kind !== 'catch') throw new Error('Expected utility fishing catch.');
    expect(outcome.message).toBe(`You reeled in ${result.catch.label.toLocaleLowerCase('en-US')}.`);
    expect(session.snapshot()).toMatchObject(snapshotMatch);
    if (item) {
      expect(session.snapshot().inventory[item[0]]?.condition).toBe(item[1]);
    }
  });

  it('does not spend captured bait when bait itself is caught', () => {
    const session = new SurvivalSession(
      saved('baitTin', 'ductTape', 'compass', 'fishingNet', 'energyBar'),
      {
        seed: 1,
        initial: { day: 3 },
        random: sequenceRandom([0, 574 / 579]),
      },
    );
    const attempt = beginFishing(session);
    const result = reelCatch(attempt);
    expect(result).toMatchObject({ kind: 'catch', catch: { id: 'bait' } });
    expect(session.finishFishing(attempt.snapshot().id, result)).toMatchObject({
      code: 'utility-caught',
      deltas: { bait: 1 },
    });
    expect(session.snapshot()).toMatchObject({ bait: 2, recoveredBait: 1 });
  });

  it.each([
    ['usable', undefined],
    ['broken', { 'compass-1': 'broken' }],
  ] as const)('excludes a %s owned unique fishing utility before selection', (
    _condition, initialConditions,
  ) => {
    const session = new SurvivalSession(saved('compass'), {
      seed: 1,
      initial: { day: 3 },
      initialConditions,
      random: sequenceRandom([0, 401 / 417]),
    });
    const attempt = beginFishing(session);
    expect(reelCatch(attempt)).toMatchObject({ kind: 'catch', catch: { id: 'wetDuctTape' } });
  });

  it('does not consume bait that was unavailable when the fishing attempt began', () => {
    const session = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0, 0]) });
    const attempt = beginFishing(session);
    (session as unknown as { bait: number }).bait = 1;
    const result = reelCatch(attempt);

    expect(session.finishFishing(attempt.snapshot().id, result).deltas).toEqual({ food: 1 });
    expect(session.snapshot().bait).toBe(1);
  });

  it('awards no food and consumes no bait for junk or a miss', () => {
    const junk = new SurvivalSession(saved('baitTin'), {
      seed: 1,
      random: sequenceRandom([0, 494 / 531]),
    });
    const junkAttempt = beginFishing(junk);
    const junkResult = reelCatch(junkAttempt);
    expect(junkResult).toMatchObject({ kind: 'catch', catch: { id: 'fishBones', kind: 'junk' } });
    expect(junk.finishFishing(junkAttempt.snapshot().id, junkResult)).toMatchObject({
      accepted: true,
      code: 'junk-caught',
      deltas: {},
      cue: 'none',
    });
    expect(junk.snapshot()).toMatchObject({ food: 0, bait: 1, recoveredBait: 1 });

    const missed = new SurvivalSession(saved('baitTin'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
    });
    const missedAttempt = beginFishing(missed);
    const missedResult = missCatch(missedAttempt);
    expect(missed.finishFishing(missedAttempt.snapshot().id, missedResult)).toMatchObject({
      accepted: true,
      code: 'fish-missed',
      deltas: {},
      cue: 'none',
    });
    expect(missed.snapshot()).toMatchObject({ food: 0, bait: 1, recoveredBait: 1 });
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
      { roll: 0.7, terminal: reelCatch, finishCode: 'junk-caught' },
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

  it('does not restore a consumed recovered can when diving finds loose food', () => {
    const session = new SurvivalSession(saved('cannedFood', 'scubaSet', 'energyBar'), {
      seed: 1,
      random: sequenceRandom([0, 0.99, 0]),
      initial: { hunger: 80, energy: 3 },
    });

    session.perform('eat');
    expect(session.snapshot()).toMatchObject({ food: 0, recoveredFood: 0 });
    session.perform('useEnergyBar');
    session.perform('dive');

    expect(session.snapshot()).toMatchObject({ food: 1, recoveredFood: 0 });
  });

  it('does not refill a used recovered bait tin when diving finds loose bait', () => {
    const session = new SurvivalSession(saved('baitTin', 'scubaSet', 'energyBar'), {
      seed: 1,
      random: sequenceRandom([0, 0, 0, 0, 0, 0.3]),
      initial: { energy: 3 },
    });

    const attempt = beginFishing(session);
    const result = reelCatch(attempt);
    session.finishFishing(attempt.snapshot().id, result);
    expect(session.snapshot()).toMatchObject({ bait: 0, recoveredBait: 0 });
    session.perform('endDay');
    session.beginDawn();
    session.perform('dive');

    expect(session.snapshot()).toMatchObject({ bait: 1, recoveredBait: 0 });
  });

  it('reports fishing availability from the interactive start contract and still requires scuba for diving', () => {
    expect(new SurvivalSession(saved(), { seed: 1 }).availableReason('fish')).toBeNull();
    expect(new SurvivalSession(saved(), { seed: 1, initial: { energy: 0 } }).availableReason('fish'))
      .toBe('Fishing requires one energy.');
    expect(new SurvivalSession(saved(), { seed: 1 }).perform('dive')).toMatchObject({ code: 'no-scuba-set' });
    expect(new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0, 0, 0]) })
      .perform('dive').accepted).toBe(true);
  });

  it.each([
    ['eat', undefined, 'No food remains.'],
    ['repair', { kind: 'hullRepair', material: 'repairMaterial' }, 'No repair material remains.'],
    ['treat', undefined, 'No medical-kit charges remain.'],
    ['answerRadio', undefined, 'The radio has no active signal.'],
    ['useEnergyBar', undefined, 'No energy bar remains.'],
    ['openChest', undefined, 'There is no closed chest to open.'],
  ] satisfies ReadonlyArray<readonly [Exclude<DayActionId, 'fish'>, DayActionOption | undefined, string]>) (
    'uses the delegated %s rejection in availability and performance',
    (action, option, message) => {
      const session = new SurvivalSession(saved(), {
        seed: 1,
        initial: { hunger: 50, health: 50, hull: 50, energy: 2 },
      });

      expect(session.availableReason(action, option)).toBe(message);
      expect(session.perform(action, option)).toMatchObject({ accepted: false, message });
    },
  );

  it('keeps public fishing and end-day daytime rejection messages', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      initialEventId: 'bad-sleep',
    });

    const fishing = session.beginFishing();
    expect(fishing.accepted).toBe(false);
    if (fishing.accepted) throw new Error('Expected fishing to be unavailable.');
    expect(fishing.outcome.message).toBe('Fishing is only available during the day.');
    expect(session.endDay().message).toBe('The day cannot end while an event is unresolved.');
  });

  it('applies diving risk and blocks diving in a squall', () => {
    const injured = new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0.9, 0.1]) });
    expect(injured.perform('dive')).toMatchObject({ accepted: true, deltas: { energy: -3, health: -50 } });
    const storm = new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0]), weather: 'squall' });
    expect(storm.perform('dive')).toMatchObject({ accepted: false, code: 'weather-blocked' });
  });

  it('eats for free, then repairs and treats using the documented resources', () => {
    const session = new SurvivalSession(saved('cannedFood', 'ductTape', 'medicalKit'), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { hunger: 80, health: 60, hull: 40, energy: 2 },
    });
    expect(session.perform('eat')).toMatchObject({
      deltas: { hunger: -35, food: -1 },
    });
    expect(session.snapshot().energy).toBe(2);
    expect(session.perform('repair', { kind: 'hullRepair', material: 'ductTape' }))
      .toMatchObject({ deltas: { energy: -1, hull: 15 } });
    expect(session.perform('treat')).toMatchObject({ deltas: { health: 30 } });
  });

  it('eats with no energy', () => {
    const session = new SurvivalSession(saved('cannedFood'), {
      seed: 1,
      initial: { hunger: 80, energy: 0 },
    });

    expect(session.perform('eat')).toMatchObject({
      accepted: true,
      deltas: { hunger: -35, food: -1 },
    });
    expect(session.snapshot().energy).toBe(0);
  });

  it.each([
    [99, 1],
    [67, 1],
    [66, 1],
    [34, 1],
    [33, 1],
    [1, 1],
  ] as const)('charges one repair energy at %i hull', (hull, energyCost) => {
    const session = new SurvivalSession(saved('ductTape'), {
      seed: 1,
      initial: { hull, energy: 3 },
    });

    expect(session.perform('repair', { kind: 'hullRepair', material: 'ductTape' }))
      .toMatchObject({ accepted: true, deltas: { energy: -energyCost } });
  });

  it('rejects full-hull repairs and repairs without energy', () => {
    const full = new SurvivalSession(saved('ductTape'), {
      seed: 1,
      initial: { hull: 100, energy: 3 },
    });
    const fullSnapshot = full.snapshot();
    expect(full.perform('repair', { kind: 'hullRepair', material: 'ductTape' }))
      .toMatchObject({ accepted: false, code: 'hull-full' });
    expect(full.snapshot()).toEqual(fullSnapshot);

    const exhausted = new SurvivalSession(saved('ductTape'), {
      seed: 1,
      initial: { hull: 33, energy: 0 },
    });
    expect(exhausted.perform('repair', { kind: 'hullRepair', material: 'ductTape' }))
      .toMatchObject({
        accepted: false,
        code: 'not-enough-energy',
        message: 'Repairing requires one energy.',
      });
  });

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

  it('keeps normal dawns calm without drawing random weather', () => {
    const next = vi.fn(() => 0);
    const session = new SurvivalSession(saved(), { seed: 1, random: { next } });

    session.perform('endDay');
    const drawsBeforeDawn = next.mock.calls.length;
    expect(session.beginDawn()).toMatchObject({ accepted: true, cue: 'dawn' });

    expect(next).toHaveBeenCalledTimes(drawsBeforeDawn);
    expect(session.snapshot()).toMatchObject({ weather: 'calm' });
  });

  it('uses the one Medkit charge and marks its instance consumed', () => {
    const session = new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 50 } });
    expect(session.perform('treat')).toMatchObject({ deltas: { health: 30 } });
    expect(session.snapshot().inventory['medicalKit-1']?.condition).toBe('consumed');
    expect(session.perform('treat').code).toBe('no-medical-kit');
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

  it('uses diminishing hidden radio rescue lead', () => {
    expect([0, 1, 2, 3, 4, 5].map(radioRescueLeadForSignal))
      .toEqual([2, 1, 1, 1, 1, 1]);
  });

  it('caps Energy Bar recovery at three energy', () => {
    const session = new SurvivalSession(saved('energyBar'), { seed: 1, initial: { energy: 1 } });
    expect(session.perform('useEnergyBar')).toMatchObject({ deltas: { energy: 2 } });
    expect(session.snapshot().energy).toBe(3);
  });

  it('spends bonus energy and restores only the standard limit', () => {
    const session = new SurvivalSession(saved('energyBar', 'ductTape'), {
      seed: 1,
      initial: { energy: 4, hull: 75 },
    });

    expect(session.perform('repair', {
      kind: 'hullRepair',
      material: 'ductTape',
    })).toMatchObject({ accepted: true, deltas: { energy: -1 } });
    expect(session.snapshot().energy).toBe(3);
    expect(session.perform('useEnergyBar')).toMatchObject({
      accepted: false,
      code: 'energy-full',
    });
  });

  it('spends the only Duct Tape to repair one broken item', () => {
    const session = new SurvivalSession(saved('ductTape', 'compass'), {
      seed: 1,
      initialConditions: { 'compass-1': 'broken' },
    });
    expect(session.perform('repairItem', {
      kind: 'itemRepair', target: 'compass-1',
    })).toMatchObject({ accepted: true, code: 'item-repaired' });
    expect(session.snapshot().inventory['compass-1']?.condition).toBe('usable');
    expect(session.snapshot().inventory['ductTape-1']?.condition).toBe('consumed');
  });

  it('synchronizes recovered food instances in stable order without consuming loose food', () => {
    const session = new SurvivalSession(saved('cannedFood', 'cannedFood'), {
      seed: 1,
      initial: { hunger: 100 },
    });

    session.perform('eat');
    expect(session.snapshot().inventory['cannedFood-1']?.condition).toBe('consumed');
    expect(session.snapshot().inventory['cannedFood-2']?.condition).toBe('usable');
    session.perform('eat');
    expect(session.snapshot().inventory['cannedFood-2']?.condition).toBe('consumed');
  });

  it('marks every accepted non-end-day action as acted today', () => {
    const cases = [
      new SurvivalSession(saved('cannedFood'), { seed: 1, initial: { hunger: 50 } }),
      new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 50 } }),
      new SurvivalSession(saved('radio'), {
        seed: 1,
        random: sequenceRandom([0, 0]),
        initial: { day: 4, energy: 3 },
        initialEventId: 'shower-night',
      }),
      new SurvivalSession(saved('energyBar'), { seed: 1, initial: { energy: 1 } }),
    ] as const;
    cases[2].resolveEvent({ kind: 'endure' });
    cases[2].beginDawn();
    const actions = ['eat', 'treat', 'answerRadio', 'useEnergyBar'] as const;

    actions.forEach((action, index) => {
      expect(cases[index]!.perform(action).accepted).toBe(true);
      expect(cases[index]!.snapshot().actedToday).toBe(true);
    });
  });

  it('rejects unknown or illegal initial instance conditions', () => {
    expect(() => new SurvivalSession(saved('compass'), {
      seed: 1,
      initialConditions: { 'compass-2': 'broken' },
    })).toThrow(/unknown instance/i);
    expect(() => new SurvivalSession(saved('energyBar'), {
      seed: 1,
      initialConditions: { 'energyBar-1': 'broken' },
    })).toThrow(/illegal condition/i);
  });

  it('applies a consumed initial condition to the exact duplicate instance', () => {
    const session = new SurvivalSession(saved('cannedFood', 'cannedFood'), {
      seed: 1,
      initialConditions: { 'cannedFood-2': 'consumed' },
    });

    expect(session.snapshot().inventory['cannedFood-1']?.condition).toBe('usable');
    expect(session.snapshot().inventory['cannedFood-2']?.condition).toBe('consumed');
    expect(session.snapshot()).toMatchObject({ food: 1, recoveredFood: 1 });
  });

  it('rejects every invalid action option before gates without mutating state', () => {
    const hullRepair = { kind: 'hullRepair', material: 'repairMaterial' } as const;
    const itemRepair = { kind: 'itemRepair', target: 'compass-1' } as const;
    const cases: Array<{
      action: Exclude<DayActionId, 'fish'>;
      option: DayActionOption | null | undefined;
    }> = [
      { action: 'dive', option: hullRepair },
      { action: 'eat', option: hullRepair },
      { action: 'repair', option: undefined },
      { action: 'repair', option: itemRepair },
      { action: 'repairItem', option: undefined },
      { action: 'repairItem', option: hullRepair },
      { action: 'treat', option: hullRepair },
      { action: 'answerRadio', option: hullRepair },
      { action: 'useEnergyBar', option: hullRepair },
      { action: 'endDay', option: hullRepair },
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
      random: sequenceRandom([0, 0]),
      initial: { hunger: 95, health: 20, hull: 5, energy: 0 },
    });
    session.perform('endDay');
    session.beginDawn();
    expect(session.snapshot()).toMatchObject({ day: 2, hunger: 100, energy: 1, health: 5 });
    session.perform('endDay');
    session.beginDawn();
    expect(session.snapshot().state).toBe('dead');
    const terminal = session.snapshot();
    expect(session.beginFishing()).toMatchObject({ accepted: false, outcome: { code: 'terminal' } });
    expect(session.snapshot()).toEqual(terminal);
  });

  it('keeps the day open after an action until the lantern ends it', () => {
    const session = new SurvivalSession(saved('map', 'cannedFood'), {
      seed: 2,
      random: sequenceRandom([0, 0, 0]),
      initial: { day: 4, hunger: 80 },
    });
    expect(session.requestDayEvent().code).toBe('day-event-scheduled');
    expect(session.perform('eat').accepted).toBe(true);
    expect(session.requestDayEvent().code).toBe('day-event-scheduled');
    expect(session.snapshot()).toMatchObject({ state: 'day', pendingEventId: null });
    expect(session.endDay().code).toBe('quiet-night');
    const journal = session.snapshot().journalEntries[0]!;
    expect(journal).toMatchObject({
      daytime: null,
      actions: [],
    });
    expect(Object.isFrozen(journal.actions)).toBe(true);
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
  it('still rejects arbitrary response strings and recovered but unusable items', () => {
    const invalid = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      initialEventId: 'shower-night',
    });
    const before = invalid.snapshot();
    expect(invalid.resolveEvent({
      kind: 'item',
      choiceId: 'not-an-event-response',
      instanceId: 'anchor-1',
    })).toMatchObject({
      accepted: false,
      code: 'choice-unavailable',
    });
    expect(invalid.snapshot()).toEqual(before);

    const broken = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      initialConditions: { 'bucket-1': 'broken' },
      initialEventId: 'shower-night',
    });
    expect(broken.resolveEvent(itemResponse('bucket'))).toMatchObject({
      accepted: false,
      code: 'item-unavailable',
    });

    const suitable = new SurvivalSession(saved('bucket'), {
      seed: 2,
      random: sequenceRandom([0.99]),
      initialEventId: 'shower-night',
    });
    expect(suitable.resolveEvent(itemResponse('bucket'))).toMatchObject({
      accepted: true,
      code: 'event-resolved',
      message: 'The bucket keeps the rain under control.',
    });
    expect(suitable.snapshot().inventory['bucket-1']?.condition).toBe('usable');
    suitable.beginDawn();
    expect(suitable.snapshot().inventory['bucket-1']?.condition).toBe('broken');
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

  it('validates the initial event seam and adopts its phase', () => {
    expect(() => new SurvivalSession(saved(), { seed: 1, initialEventId: 'missing-event' })).toThrow(/unknown/i);
    const session = new SurvivalSession(saved(), { seed: 1, initialEventId: 'shower-night' });
    expect(session.snapshot()).toMatchObject({ state: 'nightEvent', pendingEventId: 'shower-night' });
  });

  it('does not rescue before real day 24', () => {
    expect(stateAfterRescueDawn(22, 8, 0)).not.toBe('rescued');
  });

  it('does not consume a rescue draw before real day 24', () => {
    const next = vi.fn(() => 0.99);
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: { next },
      initial: { day: 22, rescueLead: 8 },
      initialEventId: 'night-calm-fallback',
    });
    session.resolveEvent(choiceResponse('sleep'));
    const beforeDawn = next.mock.calls.length;
    session.beginDawn();
    expect(next).toHaveBeenCalledTimes(beforeDawn + 1);
  });

  it('uses one percent on real day 24 without lead', () => {
    expect(stateAfterRescueDawn(23, 0, 0.009999)).toBe('rescued');
    expect(stateAfterRescueDawn(23, 0, 0.010001)).toBe('day');
  });

  it('uses six percent on real day 24 with eight lead', () => {
    expect(stateAfterRescueDawn(23, 8, 0.059999)).toBe('rescued');
    expect(stateAfterRescueDawn(23, 8, 0.060001)).toBe('day');
  });

  it('caps rescue-trace dive gains after two finds', () => {
    const session = new SurvivalSession(saved('scubaSet'), {
      seed: 3,
      random: sequenceRandom([0, 0.99, 0.99]),
      initial: { energy: 3, rescueLead: 2 },
      initialRescueTraceFinds: 2,
    });
    expect(session.perform('dive').deltas).not.toHaveProperty('rescueLead');
    expect(session.snapshot()).toMatchObject({ rescueLead: 2, rescueTraceFinds: 2 });
  });

  it('turns Other People into a persistent signal instead of rescue', () => {
    const flashlight = new SurvivalSession(saved('flashlight'), {
      seed: 4,
      initial: { day: 20, rescueLead: 2 },
      initialEventId: 'other-people',
    });
    expect(flashlight.resolveEvent(itemResponse('flashlight'))).toMatchObject({
      deltas: { rescueLead: 4 },
      eventResult: { resultId: 'people-signaled' },
    });
    expect(flashlight.snapshot()).toMatchObject({ state: 'nightEvent', rescueLead: 6 });

    const flare = new SurvivalSession(saved('flareGun'), {
      seed: 5,
      initial: { day: 20, rescueLead: 2 },
      initialEventId: 'other-people',
    });
    expect(flare.resolveEvent(itemResponse('flareGun'))).toMatchObject({
      deltas: { rescueLead: 6 },
    });
    expect(flare.snapshot().inventory['flareGun-1']?.condition).toBe('consumed');
  });

  it.each([
    ['map safe', ['map'], itemResponse('map'), [0], {}, 8],
    ['map collision', ['map'], itemResponse('map'), [0.99, 0], { hull: -5, pressure: 1 }, 8],
    ['compass safe', ['compass'], itemResponse('compass'), [0], {}, 8],
    ['compass collision', ['compass'], itemResponse('compass'), [0.99, 0], { hull: -5, pressure: 1 }, 8],
    ['sleep collision', [], choiceResponse('sleep'), [0, 0], { hull: -25, pressure: 1 }, 8],
  ] as const)(
    'aligns Dangerous Waters for %s',
    (_name, itemIds, response, rolls, deltas, rescueLead) => {
      const session = new SurvivalSession(saved(...itemIds), {
        seed: 31,
        random: sequenceRandom(rolls),
        initial: { day: 2, rescueLead },
        initialEventId: 'dangerous-waters',
      });

      expect(session.snapshot()).toMatchObject({ state: 'nightEvent' });

      expect(session.resolveEvent(response)).toMatchObject({
        accepted: true,
        deltas,
      });
      expect(session.snapshot()).toMatchObject({
        rescueLead,
      });
      for (const itemState of Object.values(session.snapshot().inventory)) {
        expect(itemState?.condition).toBe('usable');
      }
    },
  );

  it('finalizes one journal entry with separate attempted and concrete facts', () => {
    const session = new SurvivalSession(saved('bucket'), {
      seed: 9,
      random: sequenceRandom([0, 0.5, 0, 0]),
      initial: { day: 2 },
      initialEventId: 'drifting-barrel',
    });
    session.resolveEvent(choiceResponse('sleep'));
    session.perform('endDay');
    session.resolveEvent(choiceResponse('sleep'));

    expect(session.snapshot().journalEntries).toEqual([expect.objectContaining({
      day: 2,
      weather: 'calm',
      daytime: expect.objectContaining({
        eventId: 'drifting-barrel',
        attemptedChoiceId: 'sleep',
        outcomeMessage: 'The barrel drifts out of reach.',
        inventoryMutations: [],
      }),
      nighttime: {
        kind: 'event',
        event: expect.objectContaining({
          phase: 'night',
          attemptedChoiceId: 'sleep',
          attemptedItemId: null,
          choiceLabel: 'Sleep',
        }),
      },
    })]);
  });

  it('records an item action without claiming it helped', () => {
    const session = new SurvivalSession(saved('flashlight'), {
      seed: 40,
      random: sequenceRandom([0.99]),
      initialEventId: 'death-stare',
    });

    session.resolveEvent(itemResponse('flashlight'));
    const page = formatJournalEntry(session.snapshot().journalEntries[0]!);

    expect(page.nighttime).toContain('I used the flashlight.');
    expect(page.nighttime).toContain('The flashlight is lost.');
    expect(page.nighttime).not.toContain('it helped');
  });

  it('records the selected contextual label and actual result', () => {
    const session = new SurvivalSession(saved(), {
      seed: 41,
      random: sequenceRandom([0]),
      initialEventId: 'midnight-tour',
    });

    session.resolveEvent(choiceResponse('sleep'));
    const page = formatJournalEntry(session.snapshot().journalEntries[0]!);

    expect(page.nighttime).toContain('I chose \u201cSail On\u201d.');
    expect(page.nighttime).toContain('The island disappears into the dark.');
  });

  it('records a quiet day and protects internal history from snapshot mutation', () => {
    const session = new SurvivalSession(saved(), {
      seed: 10,
      initialEventId: 'shower-night',
    });
    session.resolveEvent({ kind: 'endure' });
    const first = session.snapshot();
    expect(first.journalEntries).toHaveLength(1);
    expect(first.journalEntries[0]!.daytime).toEqual({ kind: 'sinkingShip' });
    expect(() => {
      (first.journalEntries as unknown as Array<{ day: number }>)[0]!.day = 99;
    }).toThrow(TypeError);
    expect(session.snapshot().journalEntries[0]!.day).toBe(1);
    expect(session.resolveEvent({ kind: 'endure' }).accepted).toBe(false);
    expect(session.snapshot().journalEntries).toHaveLength(1);
  });

  it('protects nested daytime and nighttime event records from snapshot mutation', () => {
    const session = new SurvivalSession(saved('bucket'), {
      seed: 9,
      random: sequenceRandom([0, 0.5, 0, 0]),
      initial: { day: 2 },
      initialEventId: 'drifting-barrel',
    });
    session.resolveEvent(choiceResponse('sleep'));
    session.perform('endDay');
    session.resolveEvent(choiceResponse('sleep'));
    const first = session.snapshot().journalEntries[0]!;
    const daytime = first.daytime;
    const nighttime = first.nighttime;
    if (daytime === null || 'kind' in daytime || nighttime.kind !== 'event') {
      throw new Error('Expected resolved day and night events.');
    }
    const daytimeTitle = daytime.title;
    const nighttimeTitle = nighttime.event.title;

    expect(() => {
      (daytime as { title: string }).title = 'Mutated daytime title';
    }).toThrow(TypeError);
    expect(() => {
      (nighttime.event as { title: string }).title = 'Mutated nighttime title';
    }).toThrow(TypeError);

    const fresh = session.snapshot().journalEntries[0]!;
    expect(fresh.daytime).toMatchObject({ title: daytimeTitle });
    expect(fresh.nighttime).toMatchObject({
      kind: 'event',
      event: { title: nighttimeTitle },
    });
  });

  it('protects quiet-night records from snapshot mutation', () => {
    const session = new SurvivalSession(saved(), {
      seed: 10,
      random: sequenceRandom([0]),
    });
    expect(session.perform('endDay').code).toBe('quiet-night');
    const first = session.snapshot().journalEntries[0]!;
    expect(first.daytime).toEqual({ kind: 'sinkingShip' });
    expect(first.nighttime).toEqual({ kind: 'quiet' });

    expect(() => {
      (first.nighttime as { kind: string }).kind = 'event';
    }).toThrow(TypeError);

    expect(session.snapshot().journalEntries[0]!.nighttime).toEqual({ kind: 'quiet' });
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

  it('finalizes a quiet night below the 30 percent threshold', () => {
    const session = new SurvivalSession(saved(), {
      seed: 21,
      random: sequenceRandom([0.299999]),
    });

    expect(session.perform('endDay')).toMatchObject({
      accepted: true,
      code: 'quiet-night',
      cue: 'nightfall',
    });
    expect(session.snapshot()).toMatchObject({
      state: 'nightEvent',
      pendingEventId: null,
      journalEntries: [{ day: 1, nighttime: { kind: 'quiet' } }],
    });
  });

  it('opens a night event at the 30 percent threshold', () => {
    const session = new SurvivalSession(saved(), {
      seed: 22,
      random: sequenceRandom([0.30, 0]),
    });

    expect(session.perform('endDay')).toMatchObject({
      accepted: true,
      code: 'event-opened',
      cue: 'nightfall',
    });
    expect(session.snapshot()).toMatchObject({
      state: 'nightEvent',
      pendingEventId: expect.any(String),
      journalEntries: [],
    });
  });

  it('breaks and repairs a durable event item', () => {
    const session = new SurvivalSession(saved('bucket', 'ductTape'), {
      seed: 13,
      random: sequenceRandom([0.99, 0.99]),
      initialEventId: 'shower-night',
    });
    expect(session.resolveEvent(itemResponse('bucket')).accepted).toBe(true);
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
    session.beginDawn();
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('broken');
    expect(session.perform('repairItem', { kind: 'itemRepair', target: 'bucket-1' }).accepted).toBe(true);
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
  });

  it('consumes a one-use event item and rejects a consumed instance afterward', () => {
    const session = new SurvivalSession(saved('flareGun'), {
      seed: 14, random: sequenceRandom([0]), initialEventId: 'ghosts',
    });
    expect(session.resolveEvent(itemResponse('flareGun')).accepted).toBe(true);
    expect(session.snapshot().inventory['flareGun-1']?.condition).toBe('consumed');

    const exhausted = new SurvivalSession(saved('flareGun'), {
      seed: 14, initialConditions: { 'flareGun-1': 'consumed' }, initialEventId: 'ghosts',
    });
    expect(exhausted.resolveEvent(itemResponse('flareGun'))).toMatchObject({ accepted: false, code: 'item-unavailable' });
  });

  it('loses a matching durable item in stable instance order', () => {
    const session = new SurvivalSession(saved('map', 'map'), {
      seed: 15, random: sequenceRandom([0]), initialEventId: 'windy-night',
    });
    session.resolveEvent(itemResponse('map'));
    expect(session.snapshot().inventory['map-1']?.condition).toBe('lost');
    expect(session.snapshot().inventory['map-2']?.condition).toBe('usable');
  });

  it('breaks random eligible items without replacement at dawn', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket', 'spyglass'), {
      seed: 16,
      random: sequenceRandom([0, 0, 0.99, 0]),
      initialEventId: 'windy-night',
    });
    session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'usable' },
      'bucket-1': { condition: 'usable' },
      'spyglass-1': { condition: 'usable' },
    });
    session.beginDawn();
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

  it('selects and loses the concrete Snatcher target while preserving the Fishing Net', () => {
    const session = new SurvivalSession(saved('anchor', 'fishingNet'), {
      seed: 18, random: sequenceRandom([0, 0]), initialEventId: 'snatcher',
    });
    expect(session.snapshot().pendingEventTargetId).toBe('anchor-1');
    session.resolveEvent(itemResponse('fishingNet'));
    expect(session.snapshot()).toMatchObject({ pendingEventId: null, pendingEventTargetId: null });
    expect(session.snapshot().inventory['anchor-1']?.condition).toBe('lost');
    expect(session.snapshot().inventory['fishingNet-1']?.condition).toBe('usable');
  });

  it('targets broken items but excludes consumed and lost Snatcher candidates', () => {
    const session = new SurvivalSession(saved('anchor', 'map', 'fishingNet'), {
      seed: 19,
      random: sequenceRandom([0]),
      initialConditions: { 'anchor-1': 'broken', 'map-1': 'lost' },
      initialEventId: 'snatcher',
    });
    expect(session.snapshot().pendingEventTargetId).toBe('anchor-1');
  });

  it('never targets unsupported Bait or Fishing Net instances', () => {
    const session = new SurvivalSession(saved('baitTin', 'fishingNet'), {
      seed: 19,
      random: sequenceRandom([0]),
      initialEventId: 'snatcher',
    });

    expect(session.snapshot().pendingEventTargetId).toBeNull();
  });

  it('rejects unsupported Bait for Snatcher without changing the physical supply', () => {
    const session = new SurvivalSession(saved('baitTin'), {
      seed: 19,
      random: sequenceRandom([0]),
      initialEventId: 'snatcher',
    });

    expect(session.snapshot()).toMatchObject({
      pendingEventTargetId: null,
      bait: 1,
      recoveredBait: 1,
    });
    expect(session.resolveEvent(itemResponse('baitTin'))).toMatchObject({
      accepted: false,
      code: 'choice-unavailable',
      deltas: {},
    });
    expect(session.snapshot()).toMatchObject({ bait: 1, recoveredBait: 1 });
    expect(session.snapshot().inventory['baitTin-1']?.condition).toBe('usable');
  });

  it('protects Fishing Net when Snatcher has no canonical target', () => {
    const session = new SurvivalSession(saved('fishingNet'), {
      seed: 19,
      random: sequenceRandom([0, 0]),
      initialEventId: 'snatcher',
    });

    expect(session.snapshot().pendingEventTargetId).toBeNull();
    expect(session.resolveEvent(itemResponse('fishingNet'))).toMatchObject({ accepted: true, deltas: {} });
    expect(session.snapshot().inventory['fishingNet-1']?.condition).toBe('usable');
  });

  it('keeps the Snatcher target pending after rejected choices and clears it after endurance', () => {
    const session = new SurvivalSession(saved('anchor'), {
      seed: 20, random: sequenceRandom([0, 0]), initialEventId: 'snatcher',
    });
    const pending = session.snapshot().pendingEventTargetId;
    expect(session.resolveEvent(itemResponse('fishingNet'))).toMatchObject({ accepted: false, code: 'item-unavailable' });
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

  it('consumes recovered Food and Bait before loose aggregate resources', () => {
    const food = new SurvivalSession(saved('cannedFood'), {
      seed: 22, random: sequenceRandom([0]), initialEventId: 'death-stare',
    });
    (food as unknown as { food: number }).food = 3;
    food.resolveEvent(itemResponse('cannedFood'));
    expect(food.snapshot()).toMatchObject({ food: 1, recoveredFood: 0 });
    expect(food.snapshot().inventory['cannedFood-1']?.condition).toBe('consumed');

    const bait = new SurvivalSession(saved('baitTin'), {
      seed: 23, random: sequenceRandom([0]), initialEventId: 'swarm-of-sharks',
    });
    (bait as unknown as { bait: number }).bait = 3;
    bait.resolveEvent(itemResponse('baitTin'));
    expect(bait.snapshot()).toMatchObject({ bait: 1, recoveredBait: 0 });
    expect(bait.snapshot().inventory['baitTin-1']?.condition).toBe('consumed');
  });

  it('applies set, subtract, and add resource effects in authored order with clamps', () => {
    const session = new SurvivalSession(saved(), {
      seed: 24, random: sequenceRandom([0]), initial: { health: 50 }, initialEventId: 'shower-night',
    });
    const orderedEvent: SurvivalEventDefinition = {
      id: 'test-ordered', phase: 'night', title: 'Ordered', revealText: 'Several effects arrive.', prompt: 'Choose.',
      danger: 'dangerous', cue: 'impact', weight: 1, earliestDay: 1, cooldownDays: 0,
      choices: [{ id: 'sleep', label: 'Sleep', outcomes: [{
        weight: 1, message: 'Ordered effects.', effects: { resources: [
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
    const record = session.snapshot().journalEntries[0]!.nighttime;
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('lost');
    expect(record.kind).toBe('event');
    expect(record.kind === 'event' ? record.event.inventoryMutations : []).toEqual([
      { kind: 'lose', instanceIds: ['bucket-1'] },
    ]);
  });

  it('reports Food lost through a concrete Snatcher target in the net outcome deltas', () => {
    const session = new SurvivalSession(saved('cannedFood', 'fishingNet'), {
      seed: 26, random: sequenceRandom([0, 0]), initialEventId: 'snatcher',
    });
    expect(session.snapshot()).toMatchObject({ food: 1, pendingEventTargetId: 'cannedFood-1' });

    const outcome = session.resolveEvent(itemResponse('fishingNet'));

    expect(outcome.deltas).toEqual({ food: -1 });
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
        message: 'Both food stores are gone.',
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
