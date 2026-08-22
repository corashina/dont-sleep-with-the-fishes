import { describe, expect, it } from 'vitest';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import {
  cloneJournalEntry,
  cloneJournalNight,
  createJournalCarlitosCareRecord,
  createJournalCarlitosDawnRecord,
  createJournalCarlitosDawnState,
  createJournalEntry,
  createJournalEventRecord,
  createJournalFishingRecord,
  createJournalNightEventRecord,
  createJournalSinkingShipRecord,
  createQuietJournalNightRecord,
  journalSnapshot,
} from '../src/survival/journalRecords';
import type {
  JournalEntry,
  JournalInventoryMutation,
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

  it('constructs independent immutable journal records', () => {
    const sourceMutation: JournalInventoryMutation = {
      kind: 'consume',
      instanceIds: ['baitTin-1'],
    };
    const event = createJournalEventRecord({
      phase: 'night',
      id: 'night-trader',
      title: 'Night Trader',
      prompt: 'A boat appears nearby.',
    }, 'trade', 'Trade', null, {
      code: 'event-resolved',
      message: 'The trade succeeds.',
    }, [sourceMutation]);
    const before = entryFixture.actions[0]!.kind === 'carlitosDawn'
      ? entryFixture.actions[0]!.before
      : undefined;
    const after = entryFixture.actions[0]!.kind === 'carlitosDawn'
      ? entryFixture.actions[0]!.after
      : undefined;
    if (before === undefined || after === undefined) throw new Error('Expected Carlitos dawn states.');

    const dawnState = createJournalCarlitosDawnState(before);
    const dawn = createJournalCarlitosDawnRecord(dawnState, after);
    const night = createJournalNightEventRecord(event);
    const fishing = createJournalFishingRecord('fish-2', {
      kind: 'catch',
      catch: FISHING_CATCHES[0]!,
    }, 1, true);
    const care = createJournalCarlitosCareRecord('pet');
    const sinkingShip = createJournalSinkingShipRecord();
    const actions = [fishing, care, dawn];
    const entry = createJournalEntry(
      2,
      'overcast',
      actions,
      sinkingShip,
      night,
    );

    expect(event).toMatchObject({ eventId: 'night-trader', inventoryMutations: [sourceMutation] });
    expect(event.inventoryMutations[0]).not.toBe(sourceMutation);
    expect(event.inventoryMutations[0]!.instanceIds).not.toBe(sourceMutation.instanceIds);
    expect(Object.isFrozen(event.inventoryMutations)).toBe(true);
    expect(Object.isFrozen(event.inventoryMutations[0]!.instanceIds)).toBe(true);
    expect(night).toEqual({ kind: 'event', event });
    expect(createQuietJournalNightRecord()).toEqual({ kind: 'quiet' });
    expect(fishing).toMatchObject({ kind: 'fishing', attemptId: 'fish-2', food: 1, baitConsumed: true });
    expect(care).toEqual({ kind: 'carlitosCare', action: 'pet' });
    expect(Object.isFrozen(fishing)).toBe(true);
    expect(Object.isFrozen(care)).toBe(true);
    expect(Object.isFrozen(sinkingShip)).toBe(true);
    expect(Object.isFrozen(entry.actions)).toBe(true);
    expect(entry.actions).not.toBe(actions);
    expect(entry.actions[0]).not.toBe(fishing);
    expect(Object.isFrozen(entry.actions[0]!)).toBe(true);
    expect(dawnState).not.toBe(before);
    expect(Object.isFrozen(dawnState)).toBe(true);
    expect(dawn.before).not.toBe(dawnState);
    expect(dawn.after).not.toBe(after);
    expect(Object.isFrozen(dawn.before)).toBe(true);
    expect(Object.isFrozen(dawn.after)).toBe(true);
    expect(Object.isFrozen(entry.daytime)).toBe(true);
  });
});
