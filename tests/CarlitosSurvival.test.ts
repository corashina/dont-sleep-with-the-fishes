import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

const saved = [{ type: 'carlitos', instanceId: 'carlitos-1' }] as const;
afterEach(() => vi.restoreAllMocks());

describe('Carlitos survival integration', () => {

  it.each(['tired', 'exhausted'] as const)('blocks all event help while %s without spending resources', (rest) => {
    const unavailableReason = rest === 'tired'
      ? 'Carlitos is tired. Keep him fed and happy before nightfall. He will recover after one good night.'
      : 'Carlitos is exhausted. Keep him fed and happy before nightfall. He needs two good nights to recover.';
    for (const eventId of ['guarded-sleep', 'drifting-supplies', 'drifting-chest']) {
      const session = new SurvivalSession([...saved], {
        seed: 1, initialEventId: eventId, initialCarlitos: { rest },
      });
      const before = session.exportCheckpoint();
      expect(session.companionEventActionAvailability({ id: eventId === 'guarded-sleep' ? 'watchCarlitos' : 'delegateCarlitos' }))
        .toMatchObject({ visible: true, unavailableReason });
      const result = session.resolveEvent({ kind: 'choice', choiceId: eventId === 'guarded-sleep' ? 'watch' : 'delegate-carlitos' });
      expect(result.accepted).toBe(false);
      expect(result.message).toBe(unavailableReason);
      const after = session.exportCheckpoint();
      expect(after.carlitos).toEqual(before.carlitos);
      expect(after.randomState).toEqual(before.randomState);
      expect(after.pendingEventId).toEqual(before.pendingEventId);
      expect(after.energy).toBe(before.energy);
      expect(after.food).toBe(before.food);
      expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(true);
    }
  });

  it('never schedules Guarded Sleep while exhausted', () => {
    let restedAppearances = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const exhausted = new SurvivalSession([...saved], {
        seed, initial: { day: 7 }, initialCarlitos: { rest: 'exhausted' },
      });
      exhausted.endDay();
      expect(exhausted.snapshot().pendingEventId).not.toBe('guarded-sleep');

      const rested = new SurvivalSession([...saved], {
        seed, initial: { day: 7 }, initialCarlitos: { rest: 'rested' },
      });
      rested.endDay();
      if (rested.snapshot().pendingEventId === 'guarded-sleep') restedAppearances += 1;
    }
    expect(restedAppearances).toBeGreaterThan(0);
  });

  it.each(['exhausted'] as const)('restores %s and care state from a save', (rest) => {
    const session = new SurvivalSession([...saved], {
      seed: 1, initialCarlitos: { rest, hunger: 0, unhappiness: 10 },
    });
    const value = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(value)));
    expect(parsed).not.toBeNull();
    expect(parsed?.checkpoint.session.carlitos).toEqual(session.snapshot().carlitos);
  });

  it.each([{ rest: 'awake' }, { unhappiness: 11 }])('rejects an invalid companion save: %j', (invalid) => {
    const session = new SurvivalSession([...saved], { seed: 1 });
    const value = JSON.parse(JSON.stringify(createSurvivalSaveDocument({
      scavengeElapsedSeconds: 8, session: session.exportCheckpoint(),
    })));
    Object.assign(value.checkpoint.session.carlitos, invalid);
    expect(parseSurvivalSaveDocument(value)).toBeNull();
  });
});
