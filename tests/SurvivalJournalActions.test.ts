import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { SurvivalSession } from '../src/survival/SurvivalSession';

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
