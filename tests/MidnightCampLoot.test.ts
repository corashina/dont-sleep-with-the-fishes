import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { drawMidnightCampItems } from '../src/survival/midnightCampLoot';
import { survivalEventById } from '../src/survival/eventCatalog';
import { resolveWeightedOutcome } from '../src/survival/eventResolver';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { formatJournalEntry } from '../src/survival/journal';
import { sequenceRandom } from './helpers/random';

const visit = survivalEventById('midnight-tour')!.choices.find(({ id }) => id === 'visit')!;

describe('Midnight Tour camp rewards', () => {
  it.each([
    [0, 'tour-chest'], [0.39999, 'tour-chest'],
    [0.6, 'tour-camp'], [0.74999, 'tour-camp'],
    [0.75, 'tour-camp-backpack'], [0.79999, 'tour-camp-backpack'],
    [0.8, 'tour-attack'], [0.99999, 'tour-attack'],
  ])('selects the expected outcome at %s', (roll, resultId) => {
    expect(resolveWeightedOutcome(visit, sequenceRandom([roll])).resultId).toBe(resultId);
  });

  it.each([0, 1, 2])('can grant %i food independently from bait', (quantity) => {
    const resolved = resolveWeightedOutcome(visit, sequenceRandom([quantity / 3, (2 - quantity) / 3]), 0, 'tour-camp');
    expect(resolved.effects.resources).toEqual([
      { resource: 'food', operation: 'add', value: quantity },
      { resource: 'bait', operation: 'add', value: 2 - quantity },
    ]);
  });

  it('rolls each common item separately and permits an empty camp', () => {
    expect(drawMidnightCampItems(new Set(), sequenceRandom([0.5, 0.5]), false)).toEqual([]);
    expect(drawMidnightCampItems(new Set(), sequenceRandom([0.49, 0.5]), false))
      .toEqual([{ kind: 'gain', itemId: 'energyBar', quantity: 1, fallbackFood: 1 }]);
    expect(drawMidnightCampItems(new Set(), sequenceRandom([0.5, 0.49]), false))
      .toEqual([{ kind: 'gain', itemId: 'ductTape', quantity: 1, fallbackFood: 1 }]);
  });

  it('reserves common finds before drawing the backpack contents', () => {
    const owned = new Set<ItemId>(ITEM_IDS.filter(id => !['energyBar', 'ductTape', 'map'].includes(id)));
    const rewards = drawMidnightCampItems(owned, sequenceRandom([0, 0, 0]), true);
    expect(rewards.map(reward => 'itemId' in reward && reward.itemId)).toEqual(['energyBar', 'ductTape', 'map']);
    expect(drawMidnightCampItems(new Set(ITEM_IDS), sequenceRandom([0]), true)).toEqual([]);
  });

  it('applies camp loot once, records the backpack, and permits dawn', () => {
    const session = new SurvivalSession([], {
      seed: 41, initial: { day: 7 }, initialEventId: 'midnight-tour',
      random: sequenceRandom([0.999, 0.5, 0, 0.9, 0.999]),
    });
    const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'visit', resultId: 'tour-camp-backpack' });
    expect(outcome.accepted).toBe(true);
    expect(outcome.deltas).toMatchObject({ food: 2, bait: 1 });
    expect(session.snapshot().chest.state).toBe('none');
    const before = session.snapshot();
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'visit' }).accepted).toBe(false);
    expect(session.snapshot().food).toBe(before.food);
    expect(session.beginDawn().accepted).toBe(true);
    const journal = formatJournalEntry(session.snapshot().journalEntries[0]!).nighttime;
    expect(journal).toContain('backpack');
    expect(journal).toContain('energy bar');
  });

  it('restores the camp result and its rewards from a seeded save', () => {
    const session = new SurvivalSession([], { seed: 41, initialEventId: 'midnight-tour' });
    session.resolveEvent({ kind: 'choice', choiceId: 'visit', resultId: 'tour-camp-backpack' });
    session.beginDawn();
    expect(SurvivalSession.restore(session.exportCheckpoint()).snapshot()).toEqual(session.snapshot());
  });

  it('keeps food and bait within 0–2 when the backpack also awards an item', () => {
    const session = new SurvivalSession([], {
      seed: 1, initialEventId: 'midnight-tour',
      random: sequenceRandom([0.999, 0.999, 0.9, 0.9, 0]),
    });
    const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'visit', resultId: 'tour-camp-backpack' });
    expect(outcome.deltas).toMatchObject({ food: 2, bait: 2 });
    expect(outcome.message).toContain('backpack');
  });
});
