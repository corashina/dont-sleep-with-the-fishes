import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

describe.each(['drifting-supplies', 'drifting-chest'] as const)(
  'day actions during %s', (eventId) => {
    function session(quietNight = false): SurvivalSession {
      return new SurvivalSession([{ instanceId: 'energyBar-1', type: 'energyBar' }], {
        seed: 72,
        ...(quietNight ? { random: sequenceRandom([0.99]) } : {}),
        initial: { day: 4, energy: 3, hull: 95 },
        initialEventId: eventId,
      });
    }

    it('keeps loot pending through repair and fishing, then allows collection', () => {
      const run = session();
      expect(run.perform('repair').accepted).toBe(true);
      expect(run.snapshot()).toMatchObject({ hull: 100, state: 'dayEvent', pendingEventId: eventId });

      const fishing = run.beginFishing();
      expect(fishing.accepted).toBe(true);
      if (!fishing.accepted) throw new Error('Fishing was blocked by pending loot.');
      expect(run.cancelFishing(fishing.attempt.snapshot().id).accepted).toBe(true);
      expect(run.snapshot().pendingEventId).toBe(eventId);

      const restored = SurvivalSession.restore(run.exportCheckpoint());
      expect(restored.snapshot().pendingEventId).toBe(eventId);
      expect(restored.perform('useEnergyBar').accepted).toBe(true);
      const choiceId = 'retrieve';
      expect(restored.resolveEvent({ kind: 'choice', choiceId }).accepted).toBe(true);
      expect(restored.snapshot()).toMatchObject({ state: 'day', pendingEventId: null });
    });

    it('leaves uncollected loot at nightfall and records it before dawn', () => {
      const run = session(true);
      expect(run.perform('endDay').accepted).toBe(true);
      expect(run.snapshot()).toMatchObject({
        state: 'nightEvent',
        pendingEventId: null,
        journalEntries: [expect.objectContaining({
          daytime: expect.objectContaining({
            eventId,
            attemptedChoiceId: 'sleep',
          }),
        })],
      });
      expect(run.beginDawn().accepted).toBe(true);
      expect(run.snapshot().day).toBe(5);
    });
  },
);
