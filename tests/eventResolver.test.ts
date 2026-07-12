import { describe, expect, it } from 'vitest';
import { createItemInstances } from '../src/game/ItemState';
import {
  drawWeightedEvent,
  eligibleEvents,
  resolveEventOutcome,
} from '../src/survival/outcomeResolver';
import { createSurvivalInventory } from '../src/survival/inventory';
import { sequenceRandom } from '../src/survival/random';
import type {
  CanonicalEventDefinition,
  EventChoiceDefinition,
  EventHistory,
  WeightedEventOutcome,
} from '../src/survival/survivalTypes';

const weightedDefinition: CanonicalEventDefinition = {
  id: 'test',
  phase: 'night',
  title: 'Test',
  prompt: 'Choose.',
  cue: 'impact',
  weight: 10,
  minDay: 2,
  maxDay: 5,
  cooldownDays: 20,
  maxAppearances: 1,
  dangerMin: 1,
  choices: [{
    id: 'sleep',
    label: 'Sleep',
    outcomes: [
      {
        weight: 80,
        message: 'Hit.',
        effects: {
          resources: [{
            resource: 'hull',
            operation: 'subtract',
            value: { min: 44, max: 66 },
          }],
        },
      },
      { weight: 35, message: 'Safe.', effects: {} },
    ],
  }],
};

function inventory(...itemIds: Parameters<typeof createSurvivalInventory>[0][number]['type'][]) {
  const instances = createItemInstances();
  return createSurvivalInventory(itemIds.map((itemId) => instances.find(({ type }) => type === itemId)!));
}

function criteria(overrides: Partial<Parameters<typeof eligibleEvents>[1]> = {}) {
  return {
    phase: 'night' as const,
    day: 2,
    danger: 1,
    inventory: inventory(),
    route: null,
    history: new Map<string, EventHistory>(),
    ...overrides,
  };
}

describe('event outcome resolver', () => {
  it('resolves an automatic event outcome without fabricating a choice', () => {
    const automatic: CanonicalEventDefinition = {
      id: 'automatic',
      phase: 'night',
      title: 'Automatic',
      prompt: 'Too late.',
      cue: 'sinking',
      weight: 1,
      minDay: 1,
      cooldownDays: 0,
      maxAppearances: 1,
      dangerMin: 0,
      automatic: true,
      automaticOutcome: {
        weight: 1,
        message: 'The boat breaks apart.',
        effects: {
          resources: [{ resource: 'hull', operation: 'subtract', value: 10 }],
          items: [
            { kind: 'lose', itemId: 'map', quantity: 1 },
            { kind: 'gain', itemId: 'swimRing', quantity: 1 },
          ],
        },
      },
    };

    expect(resolveEventOutcome(automatic.automaticOutcome, sequenceRandom([0]))).toEqual({
      message: 'The boat breaks apart.',
      resourceDeltas: { hull: -10 },
      resourceSets: {},
      itemMutations: [
        { kind: 'lose', itemId: 'map', quantity: 1 },
        { kind: 'gain', itemId: 'swimRing', quantity: 1 },
      ],
    });
  });

  it('uses relative outcome weights and resolves inclusive positive damage ranges', () => {
    const choice = weightedDefinition.choices[0]!;

    expect(resolveEventOutcome(choice, sequenceRandom([0, 0]))).toMatchObject({
      message: 'Hit.',
      resourceDeltas: { hull: -44 },
      resourceSets: {},
    });
    expect(resolveEventOutcome(choice, sequenceRandom([79.999 / 115, 0.999999]))).toMatchObject({
      message: 'Hit.',
      resourceDeltas: { hull: -66 },
    });
    expect(resolveEventOutcome(choice, sequenceRandom([80 / 115]))).toMatchObject({
      message: 'Safe.',
      resourceDeltas: {},
    });
  });

  it('resolves generic sleep and yes/no choices without item coupling', () => {
    const choices: readonly EventChoiceDefinition[] = [
      { id: 'sleep', label: 'Sleep', outcomes: [{ weight: 1, message: 'Rest.', effects: {} }] },
      { id: 'yes', label: 'Yes', outcomes: [{ weight: 1, message: 'Agreed.', effects: {} }] },
      { id: 'no', label: 'No', outcomes: [{ weight: 1, message: 'Refused.', effects: {} }] },
    ];

    expect(choices.map((choice) => resolveEventOutcome(choice, sequenceRandom([0])).message)).toEqual([
      'Rest.', 'Agreed.', 'Refused.',
    ]);
  });

  it('returns resource deltas, set values, item mutations, and route changes', () => {
    const choice: EventChoiceDefinition = {
      id: 'use-kit',
      label: 'Use kit',
      itemId: 'medicalKit',
      outcomes: [{
        weight: 1,
        message: 'Changed.',
        effects: {
          resources: [
            { resource: 'health', operation: 'add', value: 5 },
            { resource: 'food', operation: 'subtract', value: 2 },
            { resource: 'energy', operation: 'set', value: 1 },
            { resource: 'danger', operation: 'add', value: 2 },
          ],
          items: [
            { kind: 'consume', itemId: 'medicalKit', quantity: 1 },
            { kind: 'break', itemId: 'fishingRod', quantity: 1 },
            { kind: 'lose', itemId: 'map', quantity: 1 },
            { kind: 'gain', itemId: 'chest', quantity: 1 },
          ],
          route: 'left',
        },
      }],
    };

    expect(resolveEventOutcome(choice, sequenceRandom([0]))).toEqual({
      message: 'Changed.',
      resourceDeltas: { health: 5, food: -2, danger: 2 },
      resourceSets: { energy: 1 },
      itemMutations: [
        { kind: 'consume', itemId: 'medicalKit', quantity: 1 },
        { kind: 'break', itemId: 'fishingRod', quantity: 1 },
        { kind: 'lose', itemId: 'map', quantity: 1 },
        { kind: 'gain', itemId: 'chest', quantity: 1 },
      ],
      route: 'left',
    });
  });

  it('normalizes invalid outcome weights and preserves weighted boundaries', () => {
    const choice: EventChoiceDefinition = {
      id: 'weighted',
      label: 'Weighted',
      outcomes: [
        { weight: -10, message: 'Invalid.', effects: {} },
        { weight: 20, message: 'Second.', effects: {} },
        { weight: 30, message: 'Third.', effects: {} },
      ],
    };
    expect(resolveEventOutcome(choice, sequenceRandom([19.999 / 50])).message).toBe('Second.');
    expect(resolveEventOutcome(choice, sequenceRandom([20 / 50])).message).toBe('Third.');

    const allInvalid: EventChoiceDefinition = {
      id: 'invalid',
      label: 'Invalid',
      outcomes: [
        { weight: Number.NaN, message: 'First.', effects: {} },
        { weight: Number.POSITIVE_INFINITY, message: 'Second.', effects: {} },
        { weight: -1, message: 'Third.', effects: {} },
      ],
    };
    expect(resolveEventOutcome(allInvalid, sequenceRandom([0.99])).message).toBe('First.');
  });

  it('rejects mixed set and delta operations for the same resource', () => {
    const outcome: WeightedEventOutcome = {
      weight: 1,
      message: 'Ambiguous.',
      effects: {
        resources: [
          { resource: 'energy', operation: 'set', value: 1 },
          { resource: 'energy', operation: 'add', value: 2 },
        ],
      },
    };

    expect(() => resolveEventOutcome(outcome, sequenceRandom([0]))).toThrow(
      'Event outcome cannot mix set and add/subtract effects for resource "energy".',
    );
  });
});

describe('event eligibility', () => {
  it('enforces minDay and maxDay only for a first occurrence', () => {
    expect(eligibleEvents([weightedDefinition], criteria({ day: 1 }))).toEqual([]);
    expect(eligibleEvents([weightedDefinition], criteria({ day: 5 }))).toEqual([weightedDefinition]);
    expect(eligibleEvents([weightedDefinition], criteria({ day: 6 }))).toEqual([]);

    const appeared = new Map<string, EventHistory>([
      ['test', { appearances: 1, firstDay: 2, lastDay: 2 }],
    ]);
    const repeatable = { ...weightedDefinition, maxAppearances: 2 };
    expect(eligibleEvents([repeatable], criteria({ day: 22, history: appeared }))).toEqual([repeatable]);
  });

  it('enforces cooldowns and positive appearance caps while zero means unlimited', () => {
    const history = new Map<string, EventHistory>([
      ['test', { appearances: 1, firstDay: 2, lastDay: 2 }],
    ]);
    const repeatable = { ...weightedDefinition, maxAppearances: 2 };

    expect(eligibleEvents([repeatable], criteria({ day: 21, history }))).toEqual([]);
    expect(eligibleEvents([repeatable], criteria({ day: 22, history }))).toEqual([repeatable]);
    expect(eligibleEvents([repeatable], criteria({
      day: 42,
      history: new Map([['test', { appearances: 2, firstDay: 2, lastDay: 22 }]]),
    }))).toEqual([]);

    const unlimited = { ...weightedDefinition, cooldownDays: 0, maxAppearances: 0 };
    expect(eligibleEvents([unlimited], criteria({ day: 30, history }))).toEqual([unlimited]);
  });

  it('checks all-of and at-least-one inventory prerequisites and danger minimums', () => {
    const gated: CanonicalEventDefinition = {
      ...weightedDefinition,
      requiredItems: ['map', 'compass'],
      requiredAnyItems: ['bucket', 'fishingNet'],
      dangerMin: 3,
    };

    expect(eligibleEvents([gated], criteria({
      danger: 3,
      inventory: inventory('map', 'compass', 'bucket'),
    }))).toEqual([gated]);
    expect(eligibleEvents([gated], criteria({
      danger: 3,
      inventory: inventory('map', 'bucket'),
    }))).toEqual([]);
    expect(eligibleEvents([gated], criteria({
      danger: 3,
      inventory: inventory('map', 'compass'),
    }))).toEqual([]);
    expect(eligibleEvents([gated], criteria({
      danger: 2,
      inventory: inventory('map', 'compass', 'bucket'),
    }))).toEqual([]);
  });

  it('filters by phase', () => {
    expect(eligibleEvents([weightedDefinition], criteria({ phase: 'day' }))).toEqual([]);
  });
});

describe('weighted event selection', () => {
  it('applies route-specific bonuses before drawing with canonical weighted boundaries', () => {
    const first: CanonicalEventDefinition = {
      ...weightedDefinition,
      id: 'first',
      weight: 10,
      routeWeightBonuses: { left: 20 },
    };
    const second: CanonicalEventDefinition = {
      ...weightedDefinition,
      id: 'second',
      weight: 10,
      routeWeightBonuses: { right: 20 },
    };

    expect(drawWeightedEvent([first, second], sequenceRandom([29.999 / 40]), 'left')?.id).toBe('first');
    expect(drawWeightedEvent([first, second], sequenceRandom([30 / 40]), 'left')?.id).toBe('second');
    expect(drawWeightedEvent([first, second], sequenceRandom([9.999 / 40]), 'right')?.id).toBe('first');
    expect(drawWeightedEvent([first, second], sequenceRandom([10 / 40]), 'right')?.id).toBe('second');
    expect(drawWeightedEvent([], sequenceRandom([0]), null)).toBeUndefined();
  });

  it('normalizes non-finite event weights and chooses the first when all are zero', () => {
    const invalid = [
      { ...weightedDefinition, id: 'first', weight: Number.NaN },
      { ...weightedDefinition, id: 'second', weight: Number.POSITIVE_INFINITY },
      { ...weightedDefinition, id: 'third', weight: -1 },
    ];
    expect(drawWeightedEvent(invalid, sequenceRandom([0.99]), null)?.id).toBe('first');
  });
});
