import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { drawMidnightCampItems } from '../src/survival/midnightCampLoot';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { formatJournalEntry } from '../src/survival/journal';
import { sequenceRandom } from './helpers/random';

describe('Midnight Tour camp rewards', () => {
  it.each([0, 0.5, 0.999])('awards exactly one missing backpack item, roll %s', (roll) => {
    const owned = new Set<ItemId>(ITEM_IDS.filter(id => id !== 'map'));
    expect(drawMidnightCampItems(owned, sequenceRandom([roll])))
      .toEqual([{ kind: 'gain', itemId: 'map', quantity: 1, fallbackFood: 1 }]);
  });

  it('does not duplicate items when the inventory is complete', () => {
    expect(drawMidnightCampItems(new Set(ITEM_IDS), sequenceRandom([0]))).toEqual([]);
  });

  it.each([0.6, 0.749, 0.75, 0.799])('gives the same backpack reward across the camp range, roll %s', (roll) => {
    const session = new SurvivalSession([], {
      seed: 41, initial: { day: 7 }, initialEventId: 'midnight-tour',
      random: sequenceRandom([roll, 0.5]),
    });
    const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'visit' });
    expect(outcome.accepted).toBe(true);
    expect(outcome.eventResult?.resultId).toBe('tour-camp');
    expect(outcome.rewardSummary).toMatchObject({ kind: 'bundle', rewards: [{ kind: 'item', quantity: 1 }] });
    if (outcome.rewardSummary?.kind !== 'bundle') throw new Error('Expected backpack contents');
    expect(outcome.rewardSummary.rewards).toHaveLength(1);
    expect(outcome.deltas.food ?? 0).toBe(0);
    expect(outcome.deltas.bait ?? 0).toBe(0);
    expect(session.snapshot().chest.state).toBe('none');
    const inventory = session.snapshot().inventory;
    expect(Object.values(inventory)).toHaveLength(1);
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'visit' }).accepted).toBe(false);
    expect(session.snapshot().inventory).toEqual(inventory);
    expect(session.beginDawn().accepted).toBe(true);
    expect(session.snapshot().inventory).toEqual(inventory);
    expect(formatJournalEntry(session.snapshot().journalEntries[0]!).nighttime).toContain('backpack');
  });

  it('restores the camp reward from a seeded save', () => {
    const session = new SurvivalSession([], { seed: 41, initialEventId: 'midnight-tour' });
    session.resolveEvent({ kind: 'choice', choiceId: 'visit', resultId: 'tour-camp' });
    session.beginDawn();
    expect(SurvivalSession.restore(session.exportCheckpoint()).snapshot()).toEqual(session.snapshot());
  });
});
