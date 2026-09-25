// Importance: 98/100. Protects source collection, rejected actions, and saved journal evidence.
import { expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { drawWeightedEvent, eligibleEvents, type EventEligibility } from '../src/survival/eventSelection';

const nightEligibility = (day: number): EventEligibility => ({
  phase: 'night', day, weather: 'calm', pressure: 2, rescueLead: 0,
  lastEventId: null, lastSeenDay: new Map(), appearanceCounts: new Map(),
  targetableItemIds: new Set(), inventoryItemIds: new Set(),
});

// Importance: 98/100. Quest events must unlock late and remain random rather than forced.
it.each([['flowers', 8], ['ocean-of-blood', 18]] as const)(
  'offers %s only after day %i with a higher but non-guaranteed draw chance', (id, lastBlockedDay) => {
    const event = survivalEventById(id)!;
    const quiet = survivalEventById('quiet-night')!;
    const criteria = nightEligibility(lastBlockedDay + 1);
    expect(eligibleEvents([event], { ...criteria, day: lastBlockedDay })).toEqual([]);
    expect(eligibleEvents([event], criteria)).toEqual([event]);
    expect(eligibleEvents([event], { ...criteria, phase: 'day' })).toEqual([]);
    if (id === 'ocean-of-blood') {
      expect(eligibleEvents([event], { ...criteria, pressure: 1 })).toEqual([]);
    }
    let selected = 0;
    for (let draw = 0; draw < 100; draw += 1) {
      const result = drawWeightedEvent({ next: () => (draw + 0.5) / 100 }, [event, quiet], criteria);
      if (result.id === id) selected += 1;
    }
    expect(selected).toBeGreaterThan(50);
    expect(selected).toBeLessThan(100);
  },
);

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
    seed: 41, initial: { day: 19, pressure: 2 }, initialEventId: 'ocean-of-blood',
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

// Importance: 98/100. Declining the only encounter must remain final after saving and loading.
it.each(['flowers', 'ocean-of-blood'])('waiting at %s permanently misses its piece, including after loading', (id) => {
  const session = new SurvivalSession([], { seed: 41, initial: { day: 20, pressure: 2 }, initialEventId: id });
  expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(true);
  expect(session.snapshot().heartPieces).toEqual({ flowers: false, blood: false, chest: false });
  expect(session.beginDawn().accepted).toBe(true);
  const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() });
  const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
  expect(parsed).not.toBeNull();
  const restored = SurvivalSession.restore(parsed!.checkpoint.session).exportCheckpoint();
  expect(restored.appearanceCounts[id]).toBe(1);
  expect(eligibleEvents([survivalEventById(id)!], {
    ...nightEligibility(100),
    appearanceCounts: new Map(Object.entries(restored.appearanceCounts)),
    lastSeenDay: new Map(Object.entries(restored.lastSeenDays)),
  })).toEqual([]);
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
