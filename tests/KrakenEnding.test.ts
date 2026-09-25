// Importance: 100/100. Protects ending timing, save integrity, and the full collection route.
import { expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { COMPLETE_HEART } from '../src/survival/heartOfTheSea';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { SURVIVAL_EVENTS } from '../src/survival/eventCatalog';
import { eligibleEvents } from '../src/survival/eventSelection';

it('schedules Kraken before a mimic and ends only after returning the heart', () => {
  const session = new SurvivalSession([], { seed: 41, initialHeartPieces: COMPLETE_HEART,
    initialChest: { state: 'mimic', acquiredDay: 1 } });
  expect(session.endDay().accepted).toBe(true);
  expect(session.snapshot()).toMatchObject({ pendingEventId: 'kraken', ending: null });
  expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(false);
  expect(session.resolveEvent({ kind: 'choice', choiceId: 'return-heart' })).toMatchObject({ accepted: true, cue: 'none' });
  expect(session.snapshot()).toMatchObject({ state: 'rescued', ending: { id: 'kraken' } });
  expect(session.snapshot().journalEntries.at(-1)?.nighttime).toMatchObject({ kind: 'event', event: { eventId: 'kraken' } });
  expect(session.resolveEvent({ kind: 'choice', choiceId: 'return-heart' }).accepted).toBe(false);
});

it('cannot offer an incomplete heart, including a malformed pending save', () => {
  const incomplete = new SurvivalSession([], { seed: 41, initialEventId: 'kraken' });
  expect(incomplete.resolveEvent({ kind: 'choice', choiceId: 'return-heart' }).accepted).toBe(false);
  const save = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: incomplete.exportCheckpoint() });
  expect(parseSurvivalSaveDocument(save)).toBeNull();
  const complete = new SurvivalSession([], { seed: 41, initialHeartPieces: COMPLETE_HEART });
  complete.endDay();
  const valid = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: complete.exportCheckpoint() });
  expect(parseSurvivalSaveDocument(valid)?.checkpoint.session.pendingEventId).toBe('kraken');
});

it('excludes Kraken from every ordinary draw', () => {
  expect(eligibleEvents(SURVIVAL_EVENTS, { phase: 'night', day: 40, weather: 'calm', pressure: 10,
    lastEventId: null, lastSeenDay: new Map(), targetableItemIds: new Set(), appearanceCounts: new Map(),
    inventoryItemIds: new Set(), rescueLead: 100,
  }).some((event) => event.id === 'kraken')).toBe(false);
});

it('collects each source, restores progress, crosses dawn, then reaches the Kraken ending', () => {
  let session = new SurvivalSession([{ type: 'scubaSet', instanceId: 'scubaSet-1' }], {
    seed: 41, radioSignalsEnabled: false, initial: { day: 3, energy: 3, pressure: 2 },
    initialChest: { state: 'closed', acquiredDay: 3 },
  });
  session.perform('openChest');
  session.endDay();
  session = SurvivalSession.restore({ ...session.exportCheckpoint(), state: 'nightEvent', pendingEventId: 'flowers', pendingEventTargetId: null });
  expect(session.resolveEvent({ kind: 'choice', choiceId: 'collect' }).accepted).toBe(true);
  session.beginDawn();
  const save = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() });
  session = SurvivalSession.restore(parseSurvivalSaveDocument(JSON.parse(JSON.stringify(save)))!.checkpoint.session);
  session.endDay();
  session = SurvivalSession.restore({ ...session.exportCheckpoint(), state: 'nightEvent', pendingEventId: 'ocean-of-blood', pendingEventTargetId: null });
  expect(session.resolveEvent({ kind: 'item', choiceId: 'scubaSet', instanceId: 'scubaSet-1' }).accepted).toBe(true);
  expect(session.snapshot().pendingEventId).toBeNull();
  session.beginDawn();
  expect(session.snapshot()).toMatchObject({ state: 'day', pendingEventId: null, heartPieces: COMPLETE_HEART, ending: null });
  session.endDay();
  expect(session.snapshot().pendingEventId).toBe('kraken');
  session.resolveEvent({ kind: 'choice', choiceId: 'return-heart' });
  expect(session.snapshot().ending?.id).toBe('kraken');
  expect(session.snapshot().journalEntries.map((entry) => entry.nighttime.kind === 'event' ? entry.nighttime.event.eventId : null))
    .toEqual(['flowers', 'ocean-of-blood', 'kraken']);
});

it('suppresses certain dawn rescue after the last night piece, but preserves fatal hull wear', () => {
  for (const hull of [100, 1]) {
    const session = new SurvivalSession([{ type: 'scubaSet', instanceId: 'scubaSet-1' }], {
      seed: 41, initial: { day: 101, hull }, initialEventId: 'ocean-of-blood',
      initialHeartPieces: { flowers: true, chest: true, blood: false },
    });
    session.resolveEvent({ kind: 'item', choiceId: 'scubaSet', instanceId: 'scubaSet-1' });
    session.beginDawn();
    expect(session.snapshot().ending?.id ?? null).toBe(hull === 1 ? 'sinking' : null);
  }
});
