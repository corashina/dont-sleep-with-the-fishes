import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

function session(withCarlitos = true): SurvivalSession {
  return new SurvivalSession(withCarlitos ? [{ type: 'carlitos', instanceId: 'carlitos-1' }] : [], {
    seed: 715,
    initialEventId: 'starry-night',
    initial: { day: 4, health: 14, hunger: 95, energy: 0, hull: 75, food: 0 },
    initialCarlitos: { rest: 'exhausted', hunger: 0, unhappiness: 10 },
  });
}

describe('Starry Night', () => {
  it('offers only the constellation and sleep on clear nights', () => {
    const event = survivalEventById('starry-night')!;
    expect(event.phase).toBe('night');
    expect(event.weather).toEqual(['calm']);
    expect(event.choices.map(({ id }) => id)).toEqual(['wish', 'sleep']);
    expect(event.choices.every(({ itemId, requirements }) => itemId === undefined && requirements === undefined)).toBe(true);
  });

  it.each([true, false])('restores the player with Carlitos present: %s', (withCarlitos) => {
    const run = session(withCarlitos);
    const outcome = run.resolveEvent({ kind: 'choice', choiceId: 'wish' });
    expect(outcome).toMatchObject({
      accepted: true,
      deltas: { health: 86, hunger: -95, energy: 4 },
      eventResult: { resultId: 'starry-night-miracle' },
    });
    expect(run.snapshot()).toMatchObject({ health: 100, hunger: 0, energy: 4, hull: 75, food: 0 });
    expect(run.snapshot().carlitos).toEqual(withCarlitos
      ? { rest: 'rested', hunger: 5, unhappiness: 0, pettedToday: false }
      : null);
    const restored = SurvivalSession.restore(run.exportCheckpoint());
    expect(restored.beginDawn().accepted).toBe(true);
    expect(restored.snapshot()).toMatchObject({ health: 100, hunger: 0, energy: 4 });
    expect(restored.snapshot().carlitos).toEqual(run.snapshot().carlitos);
    expect(restored.exportCheckpoint().crewRestorationAtDawn).toBe(false);
  });

  it('rejects a second click without awarding another miracle', () => {
    const run = session();
    run.resolveEvent({ kind: 'choice', choiceId: 'wish' });
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'choice', choiceId: 'wish' }).accepted).toBe(false);
    expect(run.snapshot()).toMatchObject({ health: before.health, hunger: before.hunger, energy: before.energy });
  });

  it('leaves normal sleep rules intact when ignored', () => {
    const run = session();
    expect(run.resolveEvent({ kind: 'choice', choiceId: 'sleep' })).toMatchObject({ accepted: true, deltas: {} });
    expect(run.snapshot()).toMatchObject({ health: 14, hunger: 95, energy: 0 });
    expect(run.snapshot().carlitos).toMatchObject({ rest: 'exhausted', hunger: 0, unhappiness: 10 });
    expect(run.beginDawn().accepted).toBe(true);
    expect(run.snapshot()).toMatchObject({
      hunger: 100,
      energy: SURVIVAL_BALANCE.dawn.starvingEnergy,
      health: 14-SURVIVAL_BALANCE.dawn.starvationDamage,
    });
  });

  it('round-trips the pending event and restoration flag in save data', () => {
    const run = session();
    const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: run.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
    expect(parsed).not.toBeNull();
    const restored = SurvivalSession.restore(parsed!.checkpoint.session);
    expect(restored.resolveEvent({ kind: 'choice', choiceId: 'wish' }).accepted).toBe(true);
    expect(restored.exportCheckpoint().crewRestorationAtDawn).toBe(true);
    const invalid = JSON.parse(JSON.stringify(document));
    invalid.checkpoint.session.crewRestorationAtDawn = 'yes';
    expect(parseSurvivalSaveDocument(invalid)).toBeNull();
  });
});
