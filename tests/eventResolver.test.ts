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
});
