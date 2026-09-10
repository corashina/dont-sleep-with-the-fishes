// Importance: 10/10 (scaled from 5/5). Protects deterministic event outcomes.
import { describe,expect,it } from 'vitest';
import { resolveWeightedOutcome } from '../src/survival/eventResolver';
import type { EventChoiceDefinition } from '../src/survival/survivalTypes';
import { sequenceRandom } from './helpers/random';

const choice = (overrides: Partial<EventChoiceDefinition> = {}): EventChoiceDefinition => ({
  id: 'test',
  label: 'Test',
  outcomes: [
    { weight: 1, message: 'first', effects: {} },
    {
      weight: 3,
      message: 'second',
      effects: {
        resources: [
          { resource: 'health', operation: 'set', value: { min: 2, max: 4 } },
          { resource: 'hull', operation: 'add', value: { min: 5, max: 7 } },
          { resource: 'energy', operation: 'subtract', value: 1 },
        ],
        items: [
          { kind: 'consume', itemId: 'flareGun', quantity: 1 },
          { kind: 'break', itemId: 'bucket', quantity: 1 },
          { kind: 'lose', itemId: 'map', quantity: 1 },
          { kind: 'breakRandom', quantity: 2 },
          { kind: 'loseRandom', quantity: 2 },
          { kind: 'loseEventTarget', quantity: 1 },
        ],
      },
    },
  ],
  ...overrides,
});

describe('resolveWeightedOutcome', () => {

  it('excludes outcomes that require an earlier appearance', () => {
    const gated = choice({
      outcomes: [
        { weight: 1, message: 'common', effects: {} },
        {
          weight: 100,
          message: 'rare',
          presentationKey: 'check-the-back.bad',
          minimumPriorAppearances: 1,
          effects: {},
        },
      ],
    });

    expect(resolveWeightedOutcome(gated, sequenceRandom([0.99]), 0).message).toBe('common');
    expect(resolveWeightedOutcome(gated, sequenceRandom([0.99]), 1).message).toBe('rare');
  });

  it('draws ranges inclusively and preserves set versus add and subtract operations', () => {
    const resolved = resolveWeightedOutcome(choice(), sequenceRandom([0.25, 0.999999, 0]));
    expect(resolved.effects.resources).toEqual([
      { resource: 'health', operation: 'set', value: 4 },
      { resource: 'hull', operation: 'add', value: 5 },
      { resource: 'energy', operation: 'subtract', value: 1 },
    ]);
  });

  it('is deterministic and does not mutate its choice or catalog outcome', () => {
    const source = choice();
    const before = structuredClone(source);
    const first = resolveWeightedOutcome(source, sequenceRandom([0.25, 0.5, 0.5]));
    const second = resolveWeightedOutcome(source, sequenceRandom([0.25, 0.5, 0.5]));
    expect(first).toEqual(second);
    expect(source).toEqual(before);
  });
});
