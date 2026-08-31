import { describe, expect, it } from 'vitest';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { SCAVENGE_DURATION_SECONDS } from '../src/game/scavengeRules';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

describe('run statistics history', () => {
  it('keeps one last reading per day and preserves earlier snapshots', () => {
    const session = new SurvivalSession([], { seed: 77, initialEventId: 'bad-sleep' });
    const first = session.snapshot();
    session.resolveEvent({ kind: 'choice', choiceId: 'sleep' });
    const night = session.snapshot();
    expect(night.history).toHaveLength(1);
    expect(night.history[0]).toEqual({ day: 1, health: night.health, hunger: night.hunger, hull: night.hull });
    expect(session.beginDawn().accepted).toBe(true);
    const dawn = session.snapshot();
    expect(dawn.history).toEqual([
      night.history[0],
      { day: 2, health: dawn.health, hunger: dawn.hunger, hull: dawn.hull },
    ]);
    expect(first.history).toEqual([{ day: 1, health: 100, hunger: 0, hull: 100 }]);
    expect(Object.isFrozen(dawn.history)).toBe(true);
    expect(Object.isFrozen(dawn.history[0])).toBe(true);
  });

  it('round-trips readings through saved JSON and continues them after resume', () => {
    const source = new SurvivalSession([], { seed: 77, initialEventId: 'bad-sleep' });
    source.resolveEvent({ kind: 'choice', choiceId: 'sleep' });
    source.beginDawn();
    const save = createSurvivalSaveDocument({ scavengeElapsedSeconds: 80, session: source.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(save)));
    expect(parsed).not.toBeNull();
    const restored = SurvivalSession.restore(parsed!.checkpoint.session);
    expect(restored.snapshot().history).toEqual(source.snapshot().history);
    expect(restored.snapshot()).toEqual(source.snapshot());
  });

  it('records the fatal dawn instead of the last living state', () => {
    const session = new SurvivalSession([], {
      seed: 77, initialEventId: 'bad-sleep', initial: { health: 1, hunger: 100 },
    });
    session.resolveEvent({ kind: 'choice', choiceId: 'sleep' });
    session.beginDawn();
    const ending = session.snapshot();
    expect(ending.ending?.id).toBe('death');
    expect(ending.history.at(-1)).toEqual({ day: ending.day, health: 0, hunger: 100, hull: ending.hull });
  });

  it.each([
    undefined,
    [],
    [{ day: 1, health: Number.NaN, hunger: 0, hull: 100 }],
    [{ day: 1, health: 101, hunger: 0, hull: 100 }],
    [{ day: 2, health: 100, hunger: 0, hull: 100 }],
    [{ day: 1, health: 100, hunger: 0, hull: 100 }, { day: 1, health: 90, hunger: 0, hull: 100 }],
  ])('rejects missing, invalid, or unordered saved history: %j', (history) => {
    const session = new SurvivalSession([], { seed: 1 });
    const save = createSurvivalSaveDocument({ scavengeElapsedSeconds: 30, session: session.exportCheckpoint() });
    expect(parseSurvivalSaveDocument({
      ...save, checkpoint: { ...save.checkpoint, session: { ...save.checkpoint.session, history } },
    })).toBeNull();
  });

  it('records actual pickup times and the ship ending without per-frame history entries', () => {
    const session = new ScavengeSession([{ instanceId: 'cannedFood-1', type: 'cannedFood' }]);
    session.start();
    session.tick(10);
    const before = session.snapshot();
    session.pickUp('cannedFood-1');
    session.saveCarriedBundle();
    session.tick(5);
    expect(session.snapshot().pickupHistory).toEqual([
      { seconds: 0, savedCount: 0 }, { seconds: 10, savedCount: 1 },
    ]);
    session.tick(SCAVENGE_DURATION_SECONDS);
    expect(session.snapshot().pickupHistory.at(-1)).toEqual({ seconds: SCAVENGE_DURATION_SECONDS, savedCount: 1 });
    expect(before.pickupHistory).toEqual([{ seconds: 0, savedCount: 0 }]);
  });
});
