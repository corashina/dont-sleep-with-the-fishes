import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';

describe('Seagull Theft', () => {
  it('takes one food once and returns to the same day', () => {
    const session = new SurvivalSession([], {
      seed: 42, initial: { day: 4, food: 2 }, initialEventId: 'seagull-theft',
    });
    const before = session.snapshot();
    const result = session.resolveEvent({ kind: 'choice', choiceId: 'steal' });
    expect(result.accepted).toBe(true);
    expect(result.deltas).toMatchObject({ food: -1 });
    expect(session.snapshot()).toMatchObject({ state: 'day', day: 4, food: 1, energy: before.energy });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'steal' }).accepted).toBe(false);
    expect(session.snapshot().food).toBe(1);
    expect(session.exportCheckpoint().pendingJournalDaytime).toMatchObject({
      eventId: 'seagull-theft', attemptedChoiceId: 'steal', deltas: { food: -1 },
    });
    const restored = SurvivalSession.restore(session.exportCheckpoint());
    expect(restored.snapshot()).toMatchObject({ food: 1, day: 4, state: 'day', pendingEventId: null });
    expect(restored.resolveEvent({ kind: 'choice', choiceId: 'steal' }).accepted).toBe(false);
  });
});
