import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import * as fishingCatalog from '../src/survival/fishingCatalog';

const saved = [{ type: 'carlitos', instanceId: 'carlitos-1' }] as const;
afterEach(() => vi.restoreAllMocks());

describe('Carlitos survival integration', () => {
  it.each(['drifting-supplies', 'drifting-chest'])('retrieves %s only when rested, then becomes exhausted', (eventId) => {
    const session = new SurvivalSession([...saved], {
      seed: 1, initialEventId: eventId, initialCarlitos: { rest: 'rested' },
    });
    const playerEnergy = session.snapshot().energy;
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' }).accepted).toBe(true);
    expect(session.snapshot().carlitos?.rest).toBe('exhausted');
    expect(session.snapshot().energy).toBe(playerEnergy);
  });

  it.each(['tired', 'exhausted'] as const)('blocks all event help while %s without spending resources', (rest) => {
    for (const eventId of ['guarded-sleep', 'drifting-supplies', 'drifting-chest']) {
      const session = new SurvivalSession([...saved], {
        seed: 1, initialEventId: eventId, initialCarlitos: { rest },
      });
      const before = session.exportCheckpoint();
      expect(session.companionEventActionAvailability({ id: eventId === 'guarded-sleep' ? 'watchCarlitos' : 'delegateCarlitos' }))
        .toMatchObject({ visible: true, unavailableReason: `Carlitos is ${rest}. He must rest before helping.` });
      const result = session.resolveEvent({ kind: 'choice', choiceId: eventId === 'guarded-sleep' ? 'watch' : 'delegate-carlitos' });
      expect(result.accepted).toBe(false);
      expect(result.message).toBe(`Carlitos is ${rest}. He must rest before helping.`);
      const after = session.exportCheckpoint();
      expect(after.carlitos).toEqual(before.carlitos);
      expect(after.randomState).toEqual(before.randomState);
      expect(after.pendingEventId).toEqual(before.pendingEventId);
      expect(after.energy).toBe(before.energy);
      expect(after.food).toBe(before.food);
      expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(true);
    }
  });

  it('becomes tired after keeping watch', () => {
    const session = new SurvivalSession([...saved], { seed: 1, initialEventId: 'guarded-sleep' });
    const playerEnergy = session.snapshot().energy;
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'watch' }).accepted).toBe(true);
    expect(session.snapshot().carlitos?.rest).toBe('tired');
    expect(session.snapshot().energy).toBe(playerEnergy);
  });

  it.each(['rested', 'tired', 'exhausted'] as const)('applies the fishing bonus only when rested: %s', (rest) => {
    const select = vi.spyOn(fishingCatalog, 'selectFishingCatch');
    for (const gear of ['rod', 'net'] as const) {
      const session = new SurvivalSession([...saved, { type: 'fishingNet', instanceId: 'fishingNet-1' }], {
        seed: 1, initialCarlitos: { rest }, initial: { energy: 4 },
      });
      expect(session.beginFishing(gear).accepted).toBe(true);
      expect(select.mock.lastCall?.[4]).toBe(rest === 'rested' ? 1.01 : undefined);
      expect(session.snapshot().carlitos?.rest).toBe(rest);
    }
  });

  it.each(['rested', 'tired', 'exhausted'] as const)('restores %s and care state from a save', (rest) => {
    const session = new SurvivalSession([...saved], {
      seed: 1, initialCarlitos: { rest, hunger: 0, unhappiness: 10 },
    });
    const value = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(value)));
    expect(parsed).not.toBeNull();
    expect(parsed?.checkpoint.session.carlitos).toEqual(session.snapshot().carlitos);
  });

  it.each([{ rest: 'awake' }, { rest: 3 }, { rest: undefined, energy: 3 }, { unhappiness: 11 }])('rejects an invalid companion save: %j', (invalid) => {
    const session = new SurvivalSession([...saved], { seed: 1 });
    const value = JSON.parse(JSON.stringify(createSurvivalSaveDocument({
      scavengeElapsedSeconds: 8, session: session.exportCheckpoint(),
    })));
    Object.assign(value.checkpoint.session.carlitos, invalid);
    expect(parseSurvivalSaveDocument(value)).toBeNull();
  });
});
