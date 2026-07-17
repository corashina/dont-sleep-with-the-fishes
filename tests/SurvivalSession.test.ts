import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type {
  DayActionId,
  DayActionOption,
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

function stateAfterDawn(day: number, rescueProgress: number, rescueRoll: number) {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    random: sequenceRandom([0, 0, rescueRoll]),
    initial: { day, rescueProgress },
  });
  session.perform('endDay');
  session.beginDawn();
  return session.snapshot().state;
}

describe('SurvivalSession daytime actions', () => {
  it('reports applied rather than requested clamped deltas', () => {
    const eating = new SurvivalSession(saved('cannedFood'), { seed: 1, initial: { hunger: 20 } });
    expect(eating.perform('eat').deltas).toEqual({ hunger: -20, food: -1 });
    const treating = new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 90 } });
    expect(treating.perform('treat').deltas).toEqual({ health: 10 });
    const repairing = new SurvivalSession(saved(), { seed: 1, initial: { hull: 90, energy: 3 } });
    (repairing as unknown as { repairMaterial: number }).repairMaterial = 1;
    expect(repairing.perform('repair', { kind: 'hullRepair', material: 'repairMaterial' }).deltas)
      .toEqual({ energy: -2, hull: 10, repairMaterial: -1 });
  });

  it('rejects unowned or exhausted event items without changing the event', () => {
    const unowned = new SurvivalSession(saved(), { seed: 1, initialEventId: 'shower-night' });
    const before = unowned.snapshot();
    expect(unowned.resolveEvent('bucket')).toMatchObject({ accepted: false, code: 'item-unavailable' });
    expect(unowned.snapshot()).toEqual(before);
  });

  it('guards dawn while an event is pending and exposes nightfall then dawn cues', () => {
    const session = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0.5, 0, 0.99]) });
    expect(session.perform('endDay').cue).toBe('nightfall');
    const pending = session.snapshot();
    expect(session.beginDawn()).toMatchObject({ accepted: false, code: 'event-pending' });
    expect(session.snapshot()).toEqual(pending);
    session.resolveEvent(null);
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
    expect(dead.resolveEvent(null).cue).toBe('death');
    const sunk = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0.99, 0]), initial: { hull: 10 }, initialEventId: 'eerie-melody' });
    expect(sunk.resolveEvent(null).cue).toBe('sinking');
  });
  it('starts day one with frozen cloned supplies and one food per can', () => {
    const savedItems = saved('cannedFood', 'compass');
    const session = new SurvivalSession(savedItems, { seed: 9, random: sequenceRandom([0]) });
    savedItems.length = 0;
    const state = session.snapshot();
    expect(state).toMatchObject({
      state: 'day', day: 1, health: 100, hunger: 20, energy: 3, hull: 75, food: 1,
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

  it('fishes deterministically with rod and bait', () => {
    const session = new SurvivalSession(saved('fishingRod', 'baitTin'), {
      seed: 1,
      random: sequenceRandom([0.1, 0.1]),
    });
    expect(session.perform('fish', { kind: 'fishing', useBait: true })).toMatchObject({
      accepted: true,
      deltas: { energy: -2, food: 2, bait: -1 },
    });
    expect(session.snapshot()).toMatchObject({ energy: 1, food: 2, bait: 0, actedToday: true });
    expect(session.snapshot().inventory['baitTin-1']?.condition).toBe('consumed');
  });

  it('does not restore a consumed recovered can when diving finds loose food', () => {
    const session = new SurvivalSession(saved('cannedFood', 'scubaSet'), {
      seed: 1,
      random: sequenceRandom([0, 0.99, 0]),
      initial: { hunger: 80, energy: 3 },
    });

    session.perform('eat');
    expect(session.snapshot()).toMatchObject({ food: 0, recoveredFood: 0 });
    session.perform('dive');

    expect(session.snapshot()).toMatchObject({ food: 1, recoveredFood: 0 });
  });

  it('does not refill a used recovered bait tin when diving finds loose bait', () => {
    const session = new SurvivalSession(saved('fishingRod', 'baitTin', 'scubaSet', 'energyBar'), {
      seed: 1,
      random: sequenceRandom([0.99, 0, 0.99, 0.3]),
      initial: { energy: 3 },
    });

    session.perform('fish', { kind: 'fishing', useBait: true });
    expect(session.snapshot()).toMatchObject({ bait: 0, recoveredBait: 0 });
    session.perform('useEnergyBar');
    session.perform('dive');

    expect(session.snapshot()).toMatchObject({ bait: 1, recoveredBait: 0 });
  });

  it('requires a rod for fishing and scuba for diving', () => {
    expect(new SurvivalSession(saved(), { seed: 1 }).perform('fish')).toMatchObject({ code: 'no-fishing-rod' });
    expect(new SurvivalSession(saved(), { seed: 1 }).perform('dive')).toMatchObject({ code: 'no-scuba-set' });
    expect(new SurvivalSession(saved('fishingRod'), { seed: 1, random: sequenceRandom([0]) })
      .perform('fish').accepted).toBe(true);
    expect(new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0, 0, 0]) })
      .perform('dive').accepted).toBe(true);
  });

  it('applies diving risk and blocks diving in a squall', () => {
    const injured = new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0.9, 0.1]) });
    expect(injured.perform('dive')).toMatchObject({ accepted: true, deltas: { energy: -3, health: -10 } });
    const storm = new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0]), weather: 'squall' });
    expect(storm.perform('dive')).toMatchObject({ accepted: false, code: 'weather-blocked' });
  });

  it('eats, repairs, and treats using the documented resources', () => {
    const session = new SurvivalSession(saved('cannedFood', 'ductTape', 'medicalKit'), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { hunger: 80, health: 60, hull: 40, energy: 2 },
    });
    expect(session.perform('eat')).toMatchObject({ deltas: { hunger: -35, food: -1 } });
    expect(session.perform('repair', { kind: 'hullRepair', material: 'ductTape' }))
      .toMatchObject({ deltas: { energy: -2, hull: 15 } });
    expect(session.perform('treat')).toMatchObject({ deltas: { health: 30 } });
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

  it('uses the one Medkit charge and marks its instance consumed', () => {
    const session = new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 50 } });
    expect(session.perform('treat')).toMatchObject({ deltas: { health: 30 } });
    expect(session.snapshot().inventory['medicalKit-1']?.condition).toBe('consumed');
    expect(session.perform('treat').code).toBe('no-medical-kit');
  });

  it('uses Bottled Paper for one energy and fifteen rescue progress', () => {
    const session = new SurvivalSession(saved('bottledPaper'), { seed: 1, initial: { energy: 3 } });
    expect(session.perform('sendMessage')).toMatchObject({
      accepted: true,
      deltas: { energy: -1, rescueProgress: 15 },
    });
    expect(session.snapshot().inventory['bottledPaper-1']?.condition).toBe('consumed');
  });

  it('caps Energy Bar recovery at three energy', () => {
    const session = new SurvivalSession(saved('energyBar'), { seed: 1, initial: { energy: 1 } });
    expect(session.perform('useEnergyBar')).toMatchObject({ deltas: { energy: 2 } });
    expect(session.snapshot().energy).toBe(3);
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
      new SurvivalSession(saved('bottledPaper'), { seed: 1, initial: { energy: 3 } }),
      new SurvivalSession(saved('energyBar'), { seed: 1, initial: { energy: 1 } }),
    ] as const;
    const actions = ['eat', 'treat', 'sendMessage', 'useEnergyBar'] as const;

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
    const fishing = { kind: 'fishing', useBait: false } as const;
    const hullRepair = { kind: 'hullRepair', material: 'repairMaterial' } as const;
    const itemRepair = { kind: 'itemRepair', target: 'compass-1' } as const;
    const cases: Array<{
      action: DayActionId;
      option: DayActionOption | null | undefined;
    }> = [
      { action: 'fish', option: hullRepair },
      { action: 'dive', option: fishing },
      { action: 'eat', option: fishing },
      { action: 'repair', option: undefined },
      { action: 'repair', option: itemRepair },
      { action: 'repairItem', option: undefined },
      { action: 'repairItem', option: fishing },
      { action: 'treat', option: fishing },
      { action: 'sendMessage', option: fishing },
      { action: 'useEnergyBar', option: fishing },
      { action: 'endDay', option: fishing },
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
      random: sequenceRandom([0, 0.99, 0, 0.99]),
      initial: { hunger: 95, health: 20, hull: 5, energy: 0 },
    });
    session.perform('endDay');
    session.beginDawn();
    expect(session.snapshot()).toMatchObject({ day: 2, hunger: 100, energy: 1, health: 5 });
    session.perform('endDay');
    session.beginDawn();
    expect(session.snapshot().state).toBe('dead');
    const terminal = session.snapshot();
    expect(session.perform('fish').accepted).toBe(false);
    expect(session.snapshot()).toEqual(terminal);
  });

  it('opens one day event only after an action and resolves an authored choice once', () => {
    const session = new SurvivalSession(saved('fishingRod', 'map'), {
      seed: 2,
      random: sequenceRandom([0, 0, 0]),
      initial: { day: 2 },
    });
    expect(session.requestDayEvent().code).toBe('act-first');
    session.perform('fish');
    expect(session.requestDayEvent()).toMatchObject({ accepted: true, code: 'event-opened' });
    expect(session.snapshot().state).toBe('dayEvent');
    const first = session.resolveEvent('map');
    expect(first.accepted).toBe(true);
    const inventory = session.snapshot().inventory;
    expect(session.resolveEvent('map').accepted).toBe(false);
    expect(session.snapshot().inventory).toEqual(inventory);
  });

  it('routes a usable recovered item not authored for the event through its itemless outcome', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      random: sequenceRandom([0.99]),
      initialEventId: 'shower-night',
    });
    expect(session.resolveEvent('anchor')).toMatchObject({
      accepted: true,
      code: 'event-resolved',
      message: 'That item cannot help. You wake with two energy.',
      deltas: { energy: -1 },
    });
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'usable' },
      'bucket-1': { condition: 'usable' },
    });
    expect(session.snapshot().journalEntries[0]?.nighttime).toMatchObject({
      kind: 'event',
      event: {
        attemptedChoiceId: 'anchor',
        attemptedItemId: 'anchor',
        resolution: 'unsuitableItem',
        inventoryMutations: [],
      },
    });
  });

  it('protects the concretely attempted unsuitable item while applying random loss to another eligible item', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      random: sequenceRandom([0.99, 0, 0]),
      initialEventId: 'leak',
    });

    expect(session.resolveEvent('anchor')).toMatchObject({
      accepted: true,
      code: 'event-resolved',
      deltas: { hull: -5 },
    });
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'usable' },
      'bucket-1': { condition: 'lost' },
    });
    const daytime = (session as unknown as {
      pendingJournalDaytime: { inventoryMutations: readonly unknown[] };
    }).pendingJournalDaytime;
    expect(daytime.inventoryMutations).toEqual([
      { kind: 'lose', instanceIds: ['bucket-1'] },
    ]);
  });

  it('keeps the attempted unsuitable item unchanged when it is the only random-loss candidate', () => {
    const session = new SurvivalSession(saved('anchor'), {
      seed: 2,
      random: sequenceRandom([0.99, 0, 0]),
      initialEventId: 'leak',
    });

    expect(session.resolveEvent('anchor')).toMatchObject({
      accepted: true,
      code: 'event-resolved',
      deltas: { hull: -5 },
    });
    expect(session.snapshot().inventory['anchor-1']?.condition).toBe('usable');
    const daytime = (session as unknown as {
      pendingJournalDaytime: { inventoryMutations: readonly unknown[] };
    }).pendingJournalDaytime;
    expect(daytime.inventoryMutations).toEqual([]);
  });

  it('protects an unsuitable recovered supply while resource loss consumes another instance', () => {
    const session = new SurvivalSession(saved('cannedFood', 'cannedFood'), {
      seed: 2,
      random: sequenceRandom([0]),
      initialEventId: 'dangerous-waters',
    });
    const resourceLossEvent: SurvivalEventDefinition = {
      id: 'test-unsuitable-food-loss',
      phase: 'day',
      title: 'Food Loss',
      prompt: 'Choose.',
      danger: 'dangerous',
      cue: 'impact',
      weight: 1,
      earliestDay: 1,
      cooldownDays: 0,
      choices: [{
        id: 'sleep',
        label: 'Endure',
        outcomes: [{
          weight: 1,
          message: 'One food is lost.',
          effects: { resources: [{ resource: 'food', operation: 'subtract', value: 1 }] },
        }],
      }],
    };
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent = resourceLossEvent;

    expect(session.resolveEvent('cannedFood')).toMatchObject({
      accepted: true,
      deltas: { food: -1 },
    });
    expect(session.snapshot()).toMatchObject({ food: 1, recoveredFood: 1 });
    expect(session.snapshot().inventory).toMatchObject({
      'cannedFood-1': { condition: 'usable' },
      'cannedFood-2': { condition: 'consumed' },
    });
    const daytime = (session as unknown as {
      pendingJournalDaytime: { inventoryMutations: readonly unknown[] };
    }).pendingJournalDaytime;
    expect(daytime.inventoryMutations).toEqual([
      { kind: 'consume', instanceIds: ['cannedFood-2'] },
    ]);
  });

  it('clamps Food and Bait loss at the protected unsuitable recovered supply floor', () => {
    const cases = [
      { type: 'cannedFood' as const, resource: 'food' as const, recovered: 'recoveredFood' as const },
      { type: 'baitTin' as const, resource: 'bait' as const, recovered: 'recoveredBait' as const },
    ];
    for (const { type, resource, recovered } of cases) {
      const session = new SurvivalSession(saved(type), {
        seed: 2,
        random: sequenceRandom([0]),
        initialEventId: 'dangerous-waters',
      });
      const resourceLossEvent: SurvivalEventDefinition = {
        id: `test-unsuitable-${resource}-floor`,
        phase: 'day', title: 'Supply Loss', prompt: 'Choose.', danger: 'dangerous', cue: 'impact',
        weight: 1, earliestDay: 1, cooldownDays: 0,
        choices: [{ id: 'sleep', label: 'Endure', outcomes: [{
          weight: 1,
          message: 'One supply is lost.',
          effects: { resources: [{ resource, operation: 'subtract', value: 1 }] },
        }] }],
      };
      (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent = resourceLossEvent;

      expect(session.resolveEvent(type)).toMatchObject({ accepted: true, deltas: {} });
      expect(session.snapshot()).toMatchObject({ [resource]: 1, [recovered]: 1 });
      expect(session.snapshot().inventory[`${type}-1` as ItemInstanceId]?.condition).toBe('usable');
      const daytime = (session as unknown as {
        pendingJournalDaytime: { inventoryMutations: readonly unknown[] };
      }).pendingJournalDaytime;
      expect(daytime.inventoryMutations).toEqual([]);
    }
  });

  it('spends loose Food while preserving an unsuitable recovered can', () => {
    const session = new SurvivalSession(saved('cannedFood'), {
      seed: 2,
      random: sequenceRandom([0]),
      initialEventId: 'dangerous-waters',
    });
    (session as unknown as { food: number }).food = 2;
    const resourceLossEvent: SurvivalEventDefinition = {
      id: 'test-unsuitable-loose-food-loss',
      phase: 'day', title: 'Food Loss', prompt: 'Choose.', danger: 'dangerous', cue: 'impact',
      weight: 1, earliestDay: 1, cooldownDays: 0,
      choices: [{ id: 'sleep', label: 'Endure', outcomes: [{
        weight: 1,
        message: 'One food is lost.',
        effects: { resources: [{ resource: 'food', operation: 'subtract', value: 1 }] },
      }] }],
    };
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent = resourceLossEvent;

    expect(session.resolveEvent('cannedFood')).toMatchObject({ accepted: true, deltas: { food: -1 } });
    expect(session.snapshot()).toMatchObject({ food: 1, recoveredFood: 1 });
    expect(session.snapshot().inventory['cannedFood-1']?.condition).toBe('usable');
  });

  it('protects the attempted unsuitable item while random breakage selects another item', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      random: sequenceRandom([0, 0, 0]),
      initialEventId: 'windy-night',
    });

    expect(session.resolveEvent('anchor')).toMatchObject({ accepted: true, deltas: { hull: -10 } });
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'usable' },
      'bucket-1': { condition: 'broken' },
    });
    const nighttime = session.snapshot().journalEntries[0]?.nighttime;
    expect(nighttime?.kind).toBe('event');
    expect(nighttime?.kind === 'event' ? nighttime.event.inventoryMutations : []).toEqual([
      { kind: 'break', instanceIds: ['bucket-1'] },
    ]);
  });

  it('does not replace an excluded fixed event target', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      random: sequenceRandom([0, 0]),
      initialEventId: 'snatcher',
    });
    expect(session.snapshot().pendingEventTargetId).toBe('anchor-1');

    expect(session.resolveEvent('anchor')).toMatchObject({ accepted: true, deltas: {} });
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'usable' },
      'bucket-1': { condition: 'usable' },
    });
    const daytime = (session as unknown as {
      pendingJournalDaytime: { inventoryMutations: readonly unknown[] };
    }).pendingJournalDaytime;
    expect(daytime.inventoryMutations).toEqual([]);
  });

  it('still rejects arbitrary response strings and recovered but unusable items', () => {
    const invalid = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      initialEventId: 'shower-night',
    });
    const before = invalid.snapshot();
    expect(invalid.resolveEvent('not-an-event-response')).toMatchObject({
      accepted: false,
      code: 'choice-unavailable',
    });
    expect(invalid.snapshot()).toEqual(before);

    const broken = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 2,
      initialConditions: { 'anchor-1': 'broken' },
      initialEventId: 'shower-night',
    });
    expect(broken.resolveEvent('anchor')).toMatchObject({
      accepted: false,
      code: 'item-unavailable',
    });

    const suitable = new SurvivalSession(saved('bucket'), {
      seed: 2,
      random: sequenceRandom([0.99]),
      initialEventId: 'shower-night',
    });
    expect(suitable.resolveEvent('bucket')).toMatchObject({ accepted: true, code: 'event-resolved' });
    expect(suitable.snapshot().inventory['bucket-1']?.condition).toBe('broken');
  });

  it('draws a night event, advances dawn, and applies increasing rescue chance', () => {
    const session = new SurvivalSession(saved(), { seed: 2, random: sequenceRandom([0.5, 0, 0.99, 0.99, 0.99, 0]) });
    session.perform('endDay');
    expect(session.snapshot().state).toBe('nightEvent');
    session.resolveEvent(null);
    session.beginDawn();
    expect(session.snapshot().state).toBe('day');
    expect(session.snapshot().day).toBe(2);
  });

  it('honors an immediate rescue outcome and stays terminal', () => {
    const session = new SurvivalSession(saved(), { seed: 3, initialEventId: 'shower-night' });
    const rescueEvent: SurvivalEventDefinition = {
      id: 'test-rescue', phase: 'night', title: 'Rescue', prompt: 'Choose.',
      danger: 'safe', cue: 'sighting', weight: 1, earliestDay: 1, cooldownDays: 0,
      choices: [{
        id: 'sleep', label: 'Signal', outcomes: [{
          weight: 1, message: 'A ship answers.', effects: { rescue: true },
        }],
      }],
    };
    (session as unknown as { pendingEvent: SurvivalEventDefinition }).pendingEvent = rescueEvent;
    expect(session.resolveEvent(null)).toMatchObject({ accepted: true, cue: 'rescue' });
    expect(session.snapshot().state).toBe('rescued');
    const rescued = session.snapshot();
    expect(session.beginDawn().accepted).toBe(false);
    expect(session.snapshot()).toEqual(rescued);
  });

  it('validates the initial event seam and adopts its phase', () => {
    expect(() => new SurvivalSession(saved(), { seed: 1, initialEventId: 'missing-event' })).toThrow(/unknown/i);
    const session = new SurvivalSession(saved(), { seed: 1, initialEventId: 'shower-night' });
    expect(session.snapshot()).toMatchObject({ state: 'nightEvent', pendingEventId: 'shower-night' });
  });

  it('caps rescue probability at 0.85 after progress', () => {
    const rescued = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0, 0.849]),
      initial: { day: 20, rescueProgress: 100 },
      initialEventId: 'shower-night',
    });
    rescued.resolveEvent(null);
    rescued.beginDawn();
    expect(rescued.snapshot().state).toBe('rescued');

    const missed = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0, 0.851]),
      initial: { day: 20, rescueProgress: 100 },
      initialEventId: 'shower-night',
    });
    missed.resolveEvent(null);
    missed.beginDawn();
    expect(missed.snapshot().state).toBe('day');
  });

  it('starts rescue rolls at 5% on day 5', () => {
    expect(stateAfterDawn(4, 0, 0.049999)).toBe('rescued');
    expect(stateAfterDawn(4, 0, 0.050001)).toBe('day');
  });

  it('increases rescue chance by 8 percentage points on day 6', () => {
    expect(stateAfterDawn(5, 0, 0.129999)).toBe('rescued');
    expect(stateAfterDawn(5, 0, 0.130001)).toBe('day');
  });

  it('caps the base rescue chance at 60%', () => {
    expect(stateAfterDawn(19, 0, 0.599999)).toBe('rescued');
    expect(stateAfterDawn(19, 0, 0.600001)).toBe('day');
  });

  it('caps rescue-progress bonus at 25 percentage points', () => {
    expect(stateAfterDawn(4, 100, 0.299999)).toBe('rescued');
    expect(stateAfterDawn(4, 100, 0.300001)).toBe('day');
  });

  it('finalizes one journal entry with separate attempted and concrete facts', () => {
    const session = new SurvivalSession(saved('map'), {
      seed: 9,
      random: sequenceRandom([0, 0.5, 0, 0]),
      initial: { day: 2 },
      initialEventId: 'dangerous-waters',
    });
    session.resolveEvent('map');
    session.perform('endDay');
    session.resolveEvent(null);

    expect(session.snapshot().journalEntries).toEqual([expect.objectContaining({
      day: 2,
      weather: 'calm',
      daytime: expect.objectContaining({
        eventId: 'dangerous-waters',
        attemptedChoiceId: 'map',
        attemptedItemId: 'map',
        resolution: 'suitableItem',
        outcomeMessage: 'Nothing happens.',
        inventoryMutations: [],
      }),
      nighttime: {
        kind: 'event',
        event: expect.objectContaining({
          phase: 'night',
          attemptedChoiceId: null,
          attemptedItemId: null,
          resolution: 'endure',
        }),
      },
    })]);
  });

  it('records a quiet day and protects internal history from snapshot mutation', () => {
    const session = new SurvivalSession(saved(), {
      seed: 10,
      initialEventId: 'shower-night',
    });
    session.resolveEvent(null);
    const first = session.snapshot();
    expect(first.journalEntries).toHaveLength(1);
    expect(first.journalEntries[0]!.daytime).toBeNull();
    (first.journalEntries as unknown as Array<{ day: number }>)[0]!.day = 99;
    expect(session.snapshot().journalEntries[0]!.day).toBe(1);
    expect(session.resolveEvent(null).accepted).toBe(false);
    expect(session.snapshot().journalEntries).toHaveLength(1);
  });

  it('protects nested daytime and nighttime event records from snapshot mutation', () => {
    const session = new SurvivalSession(saved('map', 'bucket'), {
      seed: 9,
      random: sequenceRandom([0, 0.5, 0, 0]),
      initial: { day: 2 },
      initialEventId: 'dangerous-waters',
    });
    session.resolveEvent('map');
    session.perform('endDay');
    session.resolveEvent('bucket');
    const first = session.snapshot().journalEntries[0]!;
    const daytime = first.daytime;
    const nighttime = first.nighttime;
    if (daytime === null || nighttime.kind !== 'event') throw new Error('Expected resolved day and night events.');
    const daytimeTitle = daytime.title;
    const nighttimeTitle = nighttime.event.title;

    expect(() => {
      (daytime as { title: string }).title = 'Mutated daytime title';
    }).toThrow(TypeError);
    expect(() => {
      (nighttime.event as { title: string }).title = 'Mutated nighttime title';
    }).toThrow(TypeError);

    const fresh = session.snapshot().journalEntries[0]!;
    expect(fresh.daytime?.title).toBe(daytimeTitle);
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
    expect(first.daytime).toBeNull();
    expect(first.nighttime).toEqual({ kind: 'quiet' });

    (first.nighttime as { kind: string }).kind = 'event';

    expect(session.snapshot().journalEntries[0]!.nighttime).toEqual({ kind: 'quiet' });
  });

  it('records unsuitable item attempts without consuming the item', () => {
    const session = new SurvivalSession(saved('anchor'), {
      seed: 11,
      initialEventId: 'shower-night',
    });
    session.resolveEvent('anchor');
    expect(session.snapshot().journalEntries[0]!.nighttime).toMatchObject({
      kind: 'event',
      event: {
        attemptedChoiceId: 'anchor',
        attemptedItemId: 'anchor',
        resolution: 'unsuitableItem',
      },
    });
    expect(session.snapshot().inventory['anchor-1']?.condition).toBe('usable');
  });

  it('finalizes the journal before a night consequence ends the run', () => {
    const session = new SurvivalSession(saved(), {
      seed: 12,
      random: sequenceRandom([0, 0]),
      initial: { hull: 5 },
      initialEventId: 'restless-waves',
    });
    session.resolveEvent(null);
    expect(session.snapshot()).toMatchObject({
      state: 'sunk',
      journalEntries: [expect.objectContaining({ day: 1 })],
    });
  });

  it('finalizes a quiet night below the 25 percent threshold', () => {
    const session = new SurvivalSession(saved(), {
      seed: 21,
      random: sequenceRandom([0.249999]),
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

  it('opens a night event at the 25 percent threshold', () => {
    const session = new SurvivalSession(saved(), {
      seed: 22,
      random: sequenceRandom([0.25, 0]),
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
    expect(session.resolveEvent('bucket').accepted).toBe(true);
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('broken');
    session.beginDawn();
    expect(session.perform('repairItem', { kind: 'itemRepair', target: 'bucket-1' }).accepted).toBe(true);
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
  });

  it('consumes a one-use event item and rejects a consumed instance afterward', () => {
    const session = new SurvivalSession(saved('flareGun'), {
      seed: 14, random: sequenceRandom([0]), initialEventId: 'ghosts',
    });
    expect(session.resolveEvent('flareGun').accepted).toBe(true);
    expect(session.snapshot().inventory['flareGun-1']?.condition).toBe('consumed');

    const exhausted = new SurvivalSession(saved('flareGun'), {
      seed: 14, initialConditions: { 'flareGun-1': 'consumed' }, initialEventId: 'ghosts',
    });
    expect(exhausted.resolveEvent('flareGun')).toMatchObject({ accepted: false, code: 'item-unavailable' });
  });

  it('loses a matching durable item in stable instance order', () => {
    const session = new SurvivalSession(saved('map', 'map'), {
      seed: 15, random: sequenceRandom([0]), initialEventId: 'windy-night',
    });
    session.resolveEvent('map');
    expect(session.snapshot().inventory['map-1']?.condition).toBe('lost');
    expect(session.snapshot().inventory['map-2']?.condition).toBe('usable');
  });

  it('breaks random eligible items without replacement', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket', 'map', 'fishingRod'), {
      seed: 16,
      random: sequenceRandom([0, 0, 0.99, 0]),
      initialEventId: 'windy-night',
    });
    session.resolveEvent(null);
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'broken' },
      'bucket-1': { condition: 'usable' },
      'map-1': { condition: 'broken' },
      'fishingRod-1': { condition: 'usable' },
    });
  });

  it('loses random usable or broken items without replacement', () => {
    const session = new SurvivalSession(saved('anchor', 'map', 'fishingRod'), {
      seed: 17,
      random: sequenceRandom([0.9, 0, 0.99, 0]),
      initialConditions: { 'map-1': 'broken' },
      initialEventId: 'whirlpool',
    });
    session.resolveEvent(null);
    expect(session.snapshot().inventory).toMatchObject({
      'anchor-1': { condition: 'lost' },
      'map-1': { condition: 'lost' },
      'fishingRod-1': { condition: 'usable' },
    });
  });

  it('selects and loses the concrete Snatcher target while preserving the Fishing Net', () => {
    const session = new SurvivalSession(saved('anchor', 'fishingNet'), {
      seed: 18, random: sequenceRandom([0, 0]), initialEventId: 'snatcher',
    });
    expect(session.snapshot().pendingEventTargetId).toBe('anchor-1');
    session.resolveEvent('fishingNet');
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

  it('preserves Bait when submitted to a forced Snatcher event without a target', () => {
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
    expect(session.resolveEvent('baitTin')).toMatchObject({ accepted: true, deltas: {} });
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
    expect(session.resolveEvent('fishingNet')).toMatchObject({ accepted: true, deltas: {} });
    expect(session.snapshot().inventory['fishingNet-1']?.condition).toBe('usable');
  });

  it('keeps the Snatcher target pending after rejected choices and clears it after endurance', () => {
    const session = new SurvivalSession(saved('anchor'), {
      seed: 20, random: sequenceRandom([0, 0]), initialEventId: 'snatcher',
    });
    const pending = session.snapshot().pendingEventTargetId;
    expect(session.resolveEvent('fishingNet')).toMatchObject({ accepted: false, code: 'item-unavailable' });
    expect(session.snapshot().pendingEventTargetId).toBe(pending);
    session.resolveEvent(null);
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
    expect(session.resolveEvent('bucket')).toMatchObject({ accepted: false, code: 'item-unavailable' });
    expect(session.snapshot()).toEqual(before);
    expect(session.resolveEvent(null).message).toBe('You wake with two energy.');
  });

  it('consumes recovered Food and Bait before loose aggregate resources', () => {
    const food = new SurvivalSession(saved('cannedFood'), {
      seed: 22, random: sequenceRandom([0]), initialEventId: 'death-stare',
    });
    (food as unknown as { food: number }).food = 3;
    food.resolveEvent('cannedFood');
    expect(food.snapshot()).toMatchObject({ food: 1, recoveredFood: 0 });
    expect(food.snapshot().inventory['cannedFood-1']?.condition).toBe('consumed');

    const bait = new SurvivalSession(saved('baitTin'), {
      seed: 23, random: sequenceRandom([0]), initialEventId: 'swarm-of-anglerfish',
    });
    (bait as unknown as { bait: number }).bait = 3;
    bait.resolveEvent('baitTin');
    expect(bait.snapshot()).toMatchObject({ bait: 1, recoveredBait: 0 });
    expect(bait.snapshot().inventory['baitTin-1']?.condition).toBe('consumed');
  });

  it('applies set, subtract, and add resource effects in authored order with clamps', () => {
    const session = new SurvivalSession(saved(), {
      seed: 24, random: sequenceRandom([0]), initial: { health: 50 }, initialEventId: 'shower-night',
    });
    const orderedEvent: SurvivalEventDefinition = {
      id: 'test-ordered', phase: 'night', title: 'Ordered', prompt: 'Choose.',
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
    expect(session.resolveEvent(null)).toMatchObject({ accepted: true, deltas: { health: -45 } });
    expect(session.snapshot().health).toBe(5);
  });

  it('records only concrete mutations when an earlier mutation makes a later one ineligible', () => {
    const session = new SurvivalSession(saved('anchor', 'bucket'), {
      seed: 25, random: sequenceRandom([0.99, 0.99]), initialEventId: 'thunderstorm',
    });
    session.resolveEvent('bucket');
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

    const outcome = session.resolveEvent('fishingNet');

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
      id: 'test-combined-food-loss', phase: 'day', title: 'Combined Loss', prompt: 'Choose.',
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

    const outcome = session.resolveEvent(null);

    expect(outcome.deltas).toEqual({ food: -2 });
    expect(session.snapshot()).toMatchObject({ food: 0, recoveredFood: 0 });
    expect(session.snapshot().inventory).toMatchObject({
      'cannedFood-1': { condition: 'consumed' },
      'cannedFood-2': { condition: 'lost' },
    });
  });
});
