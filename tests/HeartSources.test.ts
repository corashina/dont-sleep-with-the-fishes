// Importance: 98/100. Protects source collection, rejected actions, and saved journal evidence.
import { expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

it.each(['fishingNet', 'bucket'] as const)('collects the Flowers piece with %s once', (tool) => {
  const instanceId = `${tool}-1` as const;
  const session = new SurvivalSession([{ type: tool, instanceId }], { seed: 41, initialEventId: 'flowers' });
  const response = { kind: 'item', choiceId: tool, instanceId } as const;
  const outcome = session.resolveEvent(response);
  expect(outcome.accepted).toBe(true);
  expect(session.snapshot().heartPieces.flowers).toBe(true);
  expect(outcome.rewardSummary).toEqual({ kind: 'bundle', rewards: [{ kind: 'heartPiece', id: 'flowers', quantity: 1 }] });
  expect(session.resolveEvent(response).accepted).toBe(false);
});

it('collects the Flowers piece without tools or extra loot', () => {
  const session = new SurvivalSession([], { seed: 41, initialEventId: 'flowers' });
  const before = session.snapshot();
  const result = session.resolveEvent({ kind: 'choice', choiceId: 'collect' });
  expect(result.accepted).toBe(true);
  expect(result.rewardSummary).toEqual({ kind: 'bundle', rewards: [{ kind: 'heartPiece', id: 'flowers', quantity: 1 }] });
  expect(session.snapshot().inventory).toEqual(before.inventory);
  expect(session.snapshot().food).toBe(before.food);
  expect(session.snapshot().bait).toBe(before.bait);
  expect(session.snapshot().heartPieces.flowers).toBe(true);
});

it('grants only the blood piece with scuba gear and keeps the pressure cost', () => {
  const session = new SurvivalSession([{ type: 'scubaSet', instanceId: 'scubaSet-1' }], {
    seed: 41, initial: { day: 12, pressure: 2 }, initialEventId: 'ocean-of-blood',
  });
  const before = session.snapshot();
  const result = session.resolveEvent({ kind: 'item', choiceId: 'scubaSet', instanceId: 'scubaSet-1' });
  expect(result.accepted).toBe(true);
  expect(result.deltas).toMatchObject({ pressure: 1 });
  expect(result.rewardSummary).toEqual({ kind: 'bundle', rewards: [{ kind: 'heartPiece', id: 'blood', quantity: 1 }] });
  expect(session.snapshot().food).toBe(before.food);
  expect(session.snapshot().bait).toBe(before.bait);
  expect(session.snapshot().inventory).toEqual(before.inventory);
  expect(session.snapshot().heartPieces.blood).toBe(true);
});

it.each(['flowers', 'ocean-of-blood'])('waiting at %s preserves another chance', (id) => {
  const session = new SurvivalSession([], { seed: 41, initial: { day: 20, pressure: 2 }, initialEventId: id });
  expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(true);
  expect(session.snapshot().heartPieces).toEqual({ flowers: false, blood: false, chest: false });
  expect(survivalEventById(id)?.maximumAppearances).toBeUndefined();
  expect(survivalEventById(id)?.latestDay).toBeUndefined();
});

it('records and restores the first chest piece without granting an ordinary tool', () => {
  const session = new SurvivalSession([], { seed: 41, initial: { energy: 3 }, initialChest: { state: 'closed', acquiredDay: 1 } });
  expect(session.perform('openChest')).toMatchObject({ accepted: true, deltas: { energy: -3 }, rewardSummary: { kind: 'heartPiece', id: 'chest', quantity: 1 } });
  expect(Object.keys(session.snapshot().inventory)).toHaveLength(0);
  const save = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() });
  const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(save)));
  expect(parsed?.checkpoint.session.heartPieces.chest).toBe(true);
  expect(parsed?.checkpoint.session.pendingJournalActions).toContainEqual({ kind: 'heartPiece', pieceId: 'chest', deltas: { energy: -3 } });
});

it('does not consume a chest or grant progress without enough energy', () => {
  const session = new SurvivalSession([], { seed: 41, initial: { energy: 2 }, initialChest: { state: 'closed', acquiredDay: 1 } });
  const before = session.snapshot();
  expect(session.perform('openChest').accepted).toBe(false);
  expect(session.snapshot()).toEqual(before);
});
