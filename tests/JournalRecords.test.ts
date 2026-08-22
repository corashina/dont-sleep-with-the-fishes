import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../src/survival/journal';
import {
  cloneJournalEntry,
  cloneJournalNight,
  journalSnapshot,
} from '../src/survival/journalRecords';

const entryFixture: JournalEntry = {
  day: 2,
  weather: 'overcast',
  actions: [{
    kind: 'carlitosDawn',
    before: {
      alive: true,
      energy: 3,
      hunger: 2,
      sickness: 1,
      unhappiness: 4,
      pettedToday: true,
      deathCause: null,
    },
    after: {
      alive: true,
      energy: 2,
      hunger: 3,
      sickness: 1,
      unhappiness: 4,
      pettedToday: false,
      deathCause: null,
    },
  }],
  daytime: null,
  nighttime: {
    kind: 'event',
    event: {
      phase: 'night',
      eventId: 'night-trader',
      title: 'Night Trader',
      prompt: 'A boat appears nearby.',
      attemptedChoiceId: 'trade',
      choiceLabel: 'Trade',
      attemptedItemId: null,
      outcomeCode: 'event-resolved',
      outcomeMessage: 'The trade succeeds.',
      inventoryMutations: [{
        kind: 'consume',
        instanceIds: ['baitTin-1'],
      }],
    },
  },
};

describe('journal records', () => {
  it('clones and freezes nested journal records', () => {
    const clone = cloneJournalEntry(entryFixture);
    if (clone.nighttime.kind !== 'event' || entryFixture.nighttime.kind !== 'event') {
      throw new Error('Expected event journal records.');
    }
    const cloneAction = clone.actions[0];
    const sourceAction = entryFixture.actions[0];
    if (cloneAction?.kind !== 'carlitosDawn' || sourceAction?.kind !== 'carlitosDawn') {
      throw new Error('Expected Carlitos dawn journal actions.');
    }
    const cloneMutation = clone.nighttime.event.inventoryMutations[0]!;
    const sourceMutation = entryFixture.nighttime.event.inventoryMutations[0]!;

    expect(clone).toEqual(entryFixture);
    expect(clone).not.toBe(entryFixture);
    expect(clone.nighttime).not.toBe(entryFixture.nighttime);
    expect(Object.isFrozen(clone.nighttime)).toBe(true);
    expect(clone.nighttime.event).not.toBe(entryFixture.nighttime.event);
    expect(Object.isFrozen(clone.nighttime.event)).toBe(true);
    expect(cloneMutation).not.toBe(sourceMutation);
    expect(Object.isFrozen(clone.nighttime.event.inventoryMutations)).toBe(true);
    expect(Object.isFrozen(cloneMutation)).toBe(true);
    expect(cloneMutation.instanceIds).not.toBe(sourceMutation.instanceIds);
    expect(Object.isFrozen(cloneMutation.instanceIds)).toBe(true);
    expect(cloneAction).not.toBe(sourceAction);
    expect(cloneAction.before).not.toBe(sourceAction.before);
    expect(cloneAction.after).not.toBe(sourceAction.after);
    expect(Object.isFrozen(cloneAction.before)).toBe(true);
    expect(Object.isFrozen(cloneAction.after)).toBe(true);
  });

  it('freezes a directly cloned journal night', () => {
    const clone = cloneJournalNight(entryFixture.nighttime);

    expect(clone).toEqual(entryFixture.nighttime);
    expect(clone).not.toBe(entryFixture.nighttime);
    expect(Object.isFrozen(clone)).toBe(true);
  });

  it('freezes the returned journal snapshot', () => {
    const snapshot = journalSnapshot([entryFixture]);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
  });
});
