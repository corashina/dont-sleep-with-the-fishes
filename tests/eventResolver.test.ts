import { describe, expect, it } from 'vitest';
import { resolveWeightedOutcome } from '../src/survival/eventResolver';
import { sequenceRandom } from '../src/survival/random';
import type { EventChoiceDefinition } from '../src/survival/survivalTypes';

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
  it('selects the next outcome when a roll lands exactly on a cumulative boundary', () => {
    expect(resolveWeightedOutcome(choice(), sequenceRandom([0.25, 0, 0])).message).toBe('second');
  });

  it('sums only positive outcome weights', () => {
    const weighted = choice({ outcomes: [
      { weight: 1, message: 'first', effects: {} },
      { weight: -10, message: 'ignored', effects: {} },
      { weight: 1, message: 'last', effects: {} },
    ] });
    expect(resolveWeightedOutcome(weighted, sequenceRandom([0.75])).message).toBe('last');
  });

  it('draws ranges inclusively and preserves set versus add and subtract operations', () => {
    const resolved = resolveWeightedOutcome(choice(), sequenceRandom([0.25, 0.999999, 0]));
    expect(resolved.effects.resources).toEqual([
      { resource: 'health', operation: 'set', value: 4 },
      { resource: 'hull', operation: 'add', value: 5 },
      { resource: 'energy', operation: 'subtract', value: 1 },
    ]);
  });

  it('clones consume, break, lose, target loss, and random quantities for later without-replacement application', () => {
    const source = choice();
    const resolved = resolveWeightedOutcome(source, sequenceRandom([0.25, 0, 0]));
    expect(resolved.effects.items).toEqual([
      { kind: 'consume', itemId: 'flareGun', quantity: 1 },
      { kind: 'break', itemId: 'bucket', quantity: 1 },
      { kind: 'lose', itemId: 'map', quantity: 1 },
      { kind: 'breakRandom', quantity: 2 },
      { kind: 'loseRandom', quantity: 2 },
      { kind: 'loseEventTarget', quantity: 1 },
    ]);
    expect(resolved).not.toBe(source.outcomes[1]);
    expect(resolved.effects).not.toBe(source.outcomes[1]!.effects);
    expect(resolved.effects.items).not.toBe(source.outcomes[1]!.effects.items);
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
