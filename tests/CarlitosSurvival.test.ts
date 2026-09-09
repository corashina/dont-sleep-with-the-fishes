import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

const saved = [{ type: 'carlitos', instanceId: 'carlitos-1' }] as const;

describe('Carlitos survival integration', () => {
  it('allows a hungry companion to retrieve supplies with enough energy', () => {
    const session = new SurvivalSession([...saved], {
      seed: 1, initialEventId: 'drifting-supplies', initialCarlitos: { hunger: 3 },
    });
    expect(session.snapshot().carlitos?.energy).toBe(2);
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' }).accepted).toBe(true);
    expect(session.snapshot().carlitos?.energy).toBe(0);
  });

  it('rejects watch at zero energy without changing the event or resources', () => {
    const session = new SurvivalSession([...saved], {
      seed: 1, initialEventId: 'guarded-sleep', initialCarlitos: { energy: 0 },
    });
    const before = session.exportCheckpoint();
    expect(session.companionEventActionAvailability({ id: 'watchCarlitos', energyCost: 1 }))
      .toMatchObject({ visible: true, availableEnergy: 0, unavailableReason: 'Carlitos needs 1 energy; he has 0.' });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'watch' }).accepted).toBe(false);
    const after = session.exportCheckpoint();
    expect(after.carlitos).toEqual(before.carlitos);
    expect(after.randomState).toEqual(before.randomState);
    expect(after.pendingEventId).toEqual(before.pendingEventId);
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(true);
  });

  it('charges Carlitos one energy to keep watch', () => {
    const session = new SurvivalSession([...saved], {
      seed: 1, initialEventId: 'guarded-sleep', initialCarlitos: { hunger: 2 },
    });
    const playerEnergy = session.snapshot().energy;
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'watch' }).accepted).toBe(true);
    expect(session.snapshot().carlitos?.energy).toBe(0);
    expect(session.snapshot().energy).toBe(playerEnergy);
  });

  it('restores an exhausted companion and his care state from a save', () => {
    const session = new SurvivalSession([...saved], {
      seed: 1, initialCarlitos: { hunger: 0, unhappiness: 10 },
    });
    const value = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(value)));
    expect(parsed).not.toBeNull();
    expect(parsed?.checkpoint.session.carlitos).toEqual(session.snapshot().carlitos);
  });

  it.each([
    { energy: 3, hunger: 0 },
    { unhappiness: 11 },
  ])('rejects an invalid companion save: %j', (invalid) => {
    const session = new SurvivalSession([...saved], { seed: 1 });
    const value = JSON.parse(JSON.stringify(createSurvivalSaveDocument({
      scavengeElapsedSeconds: 8, session: session.exportCheckpoint(),
    })));
    Object.assign(value.checkpoint.session.carlitos, invalid);
    expect(parseSurvivalSaveDocument(value)).toBeNull();
  });
});
