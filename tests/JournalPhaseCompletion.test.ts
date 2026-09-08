import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { sequenceRandom } from './helpers/random';

describe('journal phase completion', () => {
  it('publishes the day at nightfall and a quiet night only at dawn', () => {
    const session = new SurvivalSession([], { seed: 1, random: sequenceRandom([0]) });
    expect(session.snapshot().journalEntries).toEqual([]);
    session.endDay();
    const day = session.snapshot().journalEntries[0]!;
    expect(day).toMatchObject({ day: 1, weather: 'calm', nightWeather: null, nighttime: { kind: 'pending' } });
    session.beginDawn();
    expect(session.snapshot().journalEntries).toHaveLength(1);
    expect(session.snapshot().journalEntries[0]).toMatchObject({
      ...day, nightWeather: 'calm', nighttime: { kind: 'quiet' },
    });
    expect(session.beginDawn().accepted).toBe(false);
    expect(session.snapshot().journalEntries).toHaveLength(1);
  });

  it('keeps night outcomes pending until dawn and preserves phase weather through save/load', () => {
    const session = new SurvivalSession([], {
      seed: 1, initial: { day: 2 }, initialEventId: 'shower-night',
    });
    session.resolveEvent({ kind: 'endure' });
    expect(session.snapshot().journalEntries[0]?.nighttime).toEqual({ kind: 'pending' });
    const restored = SurvivalSession.restore(session.exportCheckpoint());
    expect(restored.beginDawn().accepted).toBe(true);
    expect(restored.snapshot().journalEntries[0]).toMatchObject({
      weather: 'calm', nightWeather: 'rain', nighttime: { kind: 'event', event: { eventId: 'shower-night' } },
    });
    expect(restored.snapshot().journalEntries[0]?.daytime).toEqual(session.snapshot().journalEntries[0]?.daytime);
    const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 0, session: restored.exportCheckpoint() });
    expect(parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it('saves the completed day while its night event is still open', () => {
    const session = new SurvivalSession([], {
      seed: 1, initial: { day: 2 }, initialEventId: 'wreckage',
      initialChest: { state: 'mimic', acquiredDay: 1 },
    });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'leave' }).accepted).toBe(true);
    expect(session.endDay().accepted).toBe(true);
    expect(session.snapshot().journalEntries[0]).toMatchObject({ weather: 'calm', nightWeather: null });
    const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 0, session: session.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
    expect(parsed).toEqual(document);
    const restored = SurvivalSession.restore(parsed!.checkpoint.session);
    expect(restored.resolveEvent({ kind: 'choice', choiceId: 'attack' }).accepted).toBe(true);
    expect(restored.beginDawn().accepted).toBe(true);
    expect(restored.snapshot().journalEntries[0]).toMatchObject({ weather: 'calm', nightWeather: 'waves' });
  });
});
