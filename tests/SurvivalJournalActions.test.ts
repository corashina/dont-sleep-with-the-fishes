import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { formatJournalEntry } from '../src/survival/journal';
import { journalItemChanges } from '../src/survival/journalItemChanges';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

function saved(...types: ItemId[]): ItemInstance[] {
  return types.map((type) => ({ type, instanceId: `${type}-1` as ItemInstanceId }));
}

function finishDay(session: SurvivalSession) {
  expect(session.endDay().accepted).toBe(true);
  if (session.snapshot().pendingEventId !== null) {
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(true);
  }
  const entry = session.snapshot().journalEntries.at(-1)!;
  expect(entry).toBeDefined();
  return entry;
}

describe('ordinary day action journal', () => {
  it('records medicine once with its actual healing and consumed kit', () => {
    const session = new SurvivalSession(saved('medicalKit'), {
      seed: 1, random: sequenceRandom([0]), initial: { day: 2, health: 90 },
    });
    expect(session.perform('treat').deltas).toEqual({ health: 10 });
    expect(session.perform('treat').accepted).toBe(false);

    const entry = finishDay(session);
    expect(entry.actions).toEqual([{
      kind: 'dayAction', action: 'treat', deltas: { health: 10 },
      inventoryMutations: [{ kind: 'consume', instanceIds: ['medicalKit-1'] }],
    }]);
    const copy = formatJournalEntry(entry).daytime;
    expect(copy).toContain('I dressed my wounds with the medkit.');
    expect(copy).toContain('It brought some relief.');
    expect(copy).toContain('medkit was empty');
    expect(copy).not.toContain('Just water and sky');
  });

  it.each([
    [0.1, { food: 1 }, 'something to eat'],
    [0.5, { bait: 1 }, 'bait worth keeping'],
    [0.9, { rescueLead: 1 }, 'a clue'],
  ])('records a dive reward from roll %s and its energy cost', (roll, reward, text) => {
    const session = new SurvivalSession(saved('scubaSet'), {
      seed: 1,
      random: sequenceRandom([0, 0.99, roll, ...(roll < 0.75 ? [0] : []), 0.99]),
      initial: { day: 2, energy: 3 },
    });
    const outcome = session.perform('dive');
    expect(outcome).toMatchObject({ accepted: true, deltas: { energy: -3, ...reward } });
    expect(session.perform('dive').accepted).toBe(false);

    const entry = finishDay(session);
    expect(entry.actions).toEqual([{
      kind: 'dayAction', action: 'dive', deltas: outcome.deltas, inventoryMutations: [],
    }]);
    const copy = formatJournalEntry(entry).daytime;
    expect(copy).toContain('I put on the scuba gear');
    expect(journalItemChanges(entry).day.map(({ itemId, kind }) => ({ itemId, kind })))
      .toEqual('food' in reward ? [{ itemId: 'cannedFood', kind: 'gain' }]
        : 'bait' in reward ? [{ itemId: 'baitTin', kind: 'gain' }] : []);
    expect(copy).toContain('left me worn out');
    expect(copy).toContain(text);
    expect(copy).not.toContain('Just water and sky');
  });

  it('records both the reward and injury from the same dive', () => {
    const session = new SurvivalSession(saved('scubaSet'), {
      seed: 1, random: sequenceRandom([0, 0, 0.5, 0.6, 0, 0.99]), initial: { day: 2, energy: 3 },
    });
    expect(session.perform('dive').accepted).toBe(true);
    const entry = finishDay(session);
    expect(entry.actions).toEqual([{
      kind: 'dayAction', action: 'dive',
      deltas: { energy: -3, health: -30, bait: 1 }, inventoryMutations: [],
    }]);
    const copy = formatJournalEntry(entry).daytime;
    expect(copy).toContain('I came back hurt');
    expect(copy).toContain('bait worth keeping');
  });

  it('records an empty dive without inventing a reward', () => {
    const session = new SurvivalSession(saved('scubaSet'), {
      seed: 1, random: sequenceRandom([0.99, 0.99, 0.99]), initial: { day: 2, energy: 3 },
    });
    session.perform('dive');
    const entry = finishDay(session);
    expect(entry.actions).toEqual([{
      kind: 'dayAction', action: 'dive', deltas: { energy: -3 }, inventoryMutations: [],
    }]);
    expect(formatJournalEntry(entry).daytime).toContain('I came back empty-handed.');
  });

  it('appends scuba gear breakage after the completed dive', () => {
    const session = new SurvivalSession(saved('scubaSet'), {
      seed: 1, random: sequenceRandom([0.99, 0.99, 0]), initial: { day: 2, energy: 3 },
    });
    session.perform('dive');

    const entry = finishDay(session);
    expect(entry.actions).toEqual([{
      kind: 'dayAction', action: 'dive', deltas: { energy: -3 },
      inventoryMutations: [{ kind: 'break', instanceIds: ['scubaSet-1'] }],
    }]);
    expect(formatJournalEntry(entry).daytime).toContain('scuba gear damaged');
  });

  it('records energy-scaled hull repair without consuming Duct Tape', () => {
    const source = new SurvivalSession(saved('ductTape'), {
      seed: 1, initial: { day: 2, energy: 3, hull: 65 },
    });
    const session = SurvivalSession.restore(source.exportCheckpoint());
    expect(session.perform('repair').accepted).toBe(true);
    expect(session.perform('repair').accepted).toBe(false);

    const entry = finishDay(session);
    expect(entry.actions).toEqual([{
      kind: 'dayAction', action: 'repair', deltas: { energy: -2, hull: 35 },
      inventoryMutations: [],
    }]);
    const copy = formatJournalEntry(entry).daytime;
    expect(copy).toContain('The boat feels sounder now');
    expect(copy).not.toContain('Duct Tape');
    expect(session.snapshot().inventory['ductTape-1']?.condition).toBe('usable');
    expect(copy).not.toMatch(/repair material|repair timber/i);
  });

  it('records the repaired item and consumed Duct Tape once', () => {
    const session = new SurvivalSession(saved('ductTape', 'compass'), {
      seed: 1, random: sequenceRandom([0]), initial: { day: 2 },
      initialConditions: { 'compass-1': 'broken' },
    });
    const option = { kind: 'itemRepair', target: 'compass-1' } as const;
    expect(session.perform('repairItem', option).accepted).toBe(true);
    expect(session.perform('repairItem', option).accepted).toBe(false);

    const entry = finishDay(session);
    expect(entry.actions).toEqual([{
      kind: 'dayAction', action: 'repairItem', deltas: {}, inventoryMutations: [
        { kind: 'repair', instanceIds: ['compass-1'] },
        { kind: 'consume', instanceIds: ['ductTape-1'] },
      ],
    }]);
    const copy = formatJournalEntry(entry).daytime;
    expect(copy).toContain('compass working again');
    expect(copy).toContain('last of the duct tape');
  });

  it('keeps a quiet day quiet when all attempted actions were rejected', () => {
    const session = new SurvivalSession([], {
      seed: 1, random: sequenceRandom([0]), initial: { day: 2 },
    });
    expect(session.perform('treat').accepted).toBe(false);
    expect(session.perform('dive').accepted).toBe(false);
    expect(session.perform('repair').accepted).toBe(false);
    expect(session.perform('repairItem', { kind: 'itemRepair', target: 'compass-1' }).accepted).toBe(false);

    const entry = finishDay(session);
    expect(entry.actions).toEqual([]);
    expect(formatJournalEntry(entry).daytime).toBe('Just water and sky all day. I am starting to miss having something to complain about.');
  });

  it.each(['pending', 'finalized'] as const)('round-trips %s action records without repeating actions', (stage) => {
    const source = new SurvivalSession(saved('scubaSet', 'medicalKit', 'ductTape', 'compass'), {
      seed: 41, initial: { day: 2, health: 90, energy: 4, hull: 90 },
      initialConditions: { 'compass-1': 'broken' },
    });
    const session = SurvivalSession.restore(source.exportCheckpoint());
    expect(session.perform('treat').accepted).toBe(true);
    expect(session.perform('repairItem', { kind: 'itemRepair', target: 'compass-1' }).accepted).toBe(true);
    expect(session.perform('repair').accepted).toBe(true);
    expect(session.perform('dive').accepted).toBe(true);
    if (stage === 'finalized') {
      finishDay(session);
      expect(session.beginDawn().accepted).toBe(true);
    }

    const checkpoint = session.exportCheckpoint();
    const restored = SurvivalSession.restore(checkpoint);
    expect(restored.exportCheckpoint()).toEqual(checkpoint);
    const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: checkpoint });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
    expect(parsed).toEqual(document);
    const loaded = SurvivalSession.restore(parsed!.checkpoint.session);
    expect(loaded.snapshot()).toEqual(session.snapshot());

    const entry = stage === 'pending' ? finishDay(loaded) : loaded.snapshot().journalEntries[0]!;
    expect(entry.actions).toHaveLength(4);
    expect(entry.actions.map((record) => record.kind === 'dayAction' ? record.action : record.kind))
      .toEqual(['treat', 'repairItem', 'repair', 'dive']);
    expect(loaded.snapshot().inventory['compass-1']?.condition).toBe('usable');
    expect(loaded.snapshot().inventory['medicalKit-1']?.condition).toBe('consumed');
    expect(loaded.snapshot().inventory['ductTape-1']?.condition).toBe('consumed');
  });

  it('protects nested action records in checkpoints and journal snapshots', () => {
    const session = new SurvivalSession(saved('medicalKit'), {
      seed: 1, initial: { day: 2, health: 90 },
    });
    session.perform('treat');
    const pending = session.exportCheckpoint().pendingJournalActions[0]!;
    if (pending.kind !== 'dayAction') throw new Error('Expected treatment record.');
    expect(Reflect.set(pending.deltas, 'health', 99)).toBe(false);
    expect(Reflect.set(pending.inventoryMutations[0]!.instanceIds, '0', 'medicalKit-99')).toBe(false);

    const entry = finishDay(session);
    const record = entry.actions[0]!;
    if (record.kind !== 'dayAction') throw new Error('Expected treatment record.');
    expect(Reflect.set(record.deltas, 'health', 99)).toBe(false);
    expect(Reflect.set(record.inventoryMutations[0]!.instanceIds, '0', 'medicalKit-99')).toBe(false);
    expect(session.snapshot().journalEntries[0]!.actions[0]).toEqual(pending);
  });
});
