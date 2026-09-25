import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { eventChoiceDecision } from '../src/survival/eventChoiceRules';
import { formatJournalEntry } from '../src/survival/journal';
import { sequenceRandom } from './helpers/random';

function game(event: string, items: ItemId[] = [], food = 0, bait = 0, roll = 0) {
  return new SurvivalSession(items.map((type, index) => ({
    type, instanceId: `${type}-${index + 1}` as ItemInstanceId,
  })), {
    seed: 41, initialEventId: event, random: sequenceRandom([roll]),
    initial: { day: 20, food, bait, energy: 0, hunger: 0 },
  });
}

function use(session: SurvivalSession, type: ItemId) {
  const item = Object.values(session.snapshot().inventory).find((entry) => entry?.type === type)!;
  return session.resolveEvent({ kind: 'item', choiceId: type, instanceId: item.instanceId });
}

// Importance: 98/100. Resource gates must charge exactly once and protect the run state.
describe('new night event choices', () => {
  it.each([0, 0.99])('spends one Food without a can and diverts sharks without damage, roll %s', (roll) => {
    const session = game('swarm-of-sharks', [], 1, 0, roll);
    const event = survivalEventById('swarm-of-sharks')!;
    const choice = event.choices.find(({ id }) => id === 'cannedFood')!;
    expect(eventChoiceDecision(event, choice, session.snapshot()).failures).toEqual([]);
    const result = session.resolveEvent({ kind: 'choice', choiceId: 'cannedFood' });
    expect(result.accepted).toBe(true);
    expect(session.snapshot()).toMatchObject({ food: 0, health: 100, hull: 100 });
    expect(() => session.snapshot().journalEntries.forEach(formatJournalEntry)).not.toThrow();
  });

  it.each(['swarm-of-sharks', 'tentacle-attack', 'death-stare', 'something-under-us'])('rejects unavailable Food in %s', (eventId) => {
    const session = game(eventId, ['bucket']);
    const before = session.snapshot();
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'cannedFood' }).accepted).toBe(false);
    expect(session.snapshot()).toEqual(before);
  });

  it('distracts the tentacle with Food and preserves its equipment target', () => {
    const session = game('tentacle-attack', ['bucket'], 1);
    const target = session.snapshot().pendingEventTargetId!;
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'cannedFood' }).accepted).toBe(true);
    expect(session.snapshot()).toMatchObject({ food: 0, health: 100, hull: 100 });
    expect(session.snapshot().inventory[target]?.condition).toBe('usable');
  });

  it('spends one Bait without a tin and gains two Food', () => {
    const session = game('school-of-fish', [], 0, 1);
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'baitTin' }).accepted).toBe(true);
    expect(session.snapshot()).toMatchObject({ bait: 0, food: 2 });
  });

  it('rejects missing fish bait without granting Food', () => {
    const session = game('school-of-fish');
    const before = session.snapshot();
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'baitTin' }).accepted).toBe(false);
    expect(session.snapshot()).toEqual(before);
  });

  it('keeps the Radio and charges one Energy at dawn', () => {
    const session = game('eerie-melody', ['radio']);
    expect(use(session, 'radio').accepted).toBe(true);
    expect(session.snapshot()).toMatchObject({ health: 100, hull: 100 });
    expect(session.snapshot().inventory['radio-1']?.condition).toBe('usable');
    session.beginDawn();
    expect(session.snapshot().energy).toBe(2);
  });

  it('spends the Flare Gun to repel Death Stare without damage', () => {
    const session = game('death-stare', ['flareGun']);
    expect(use(session, 'flareGun').accepted).toBe(true);
    expect(session.snapshot()).toMatchObject({ health: 100, hull: 100 });
    expect(session.snapshot().inventory['flareGun-1']?.condition).toBe('consumed');
  });

  it('spends Tape during waves, preserving cargo while the hull takes damage', () => {
    const session = game('restless-waves', ['ductTape', 'bucket']);
    expect(use(session, 'ductTape').accepted).toBe(true);
    expect(session.snapshot().hull).toBe(90);
    expect(session.snapshot().inventory['ductTape-1']?.condition).toBe('consumed');
    expect(session.snapshot().inventory['bucket-2']?.condition).toBe('usable');
  });
});
