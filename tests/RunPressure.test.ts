// Importance: 5/5. Protects run pacing and shared event gates.
import { describe, expect, it } from 'vitest';
import { eligibleEvents } from '../src/survival/events';
import {
  nightDamageMultiplier,
  pressureIncreaseForDay,
} from '../src/survival/RunPressure';
import type { SurvivalEventDefinition } from '../src/survival/survivalTypes';

const event = (overrides: Partial<SurvivalEventDefinition>): SurvivalEventDefinition => ({
  id: 'gated',
  phase: 'night',
  title: 'Gated',
  revealText: 'A gated event appears.',
  prompt: 'Choose.',
  danger: 'uncertain',
  earliestDay: 1,
  weight: 1,
  cooldownDays: 0,
  choices: [{
    id: 'sleep',
    label: 'Sleep',
    outcomes: [{ weight: 1, message: 'Done.', effects: {} }],
  }],
  cue: 'none',
  ...overrides,
});

const eligible = (
  definition: SurvivalEventDefinition,
  pressure: number,
  chestState: 'none' | 'closed' | 'mimic',
) => eligibleEvents([definition], {
  phase: 'night',
  day: 20,
  weather: 'calm',
  lastEventId: null,
  lastSeenDay: new Map(),
  targetableItemIds: new Set(),
  appearanceCounts: new Map(),
  inventoryItemIds: new Set(),
  rescueProgress: 0,
  pressure,
  chestState,
});

describe('run pressure', () => {
  it('adds pressure only on the four threshold days', () => {
    expect([1, 8, 9, 15, 16, 25, 40, 80].map(pressureIncreaseForDay))
      .toEqual([0, 1, 0, 1, 0, 1, 1, 0]);
    expect(nightDamageMultiplier(49)).toBe(1);
    expect(nightDamageMultiplier(50)).toBe(2);
  });

  it('applies pressure and chest gates together', () => {
    const definition = event({
      minimumPressure: 2,
      maximumPressure: 3,
      allowedChestStates: ['closed'],
    });

    expect(eligible(definition, 2, 'closed')).toHaveLength(1);
    expect(eligible(definition, 1, 'closed')).toHaveLength(0);
    expect(eligible(definition, 4, 'closed')).toHaveLength(0);
    expect(eligible(definition, 2, 'none')).toHaveLength(0);
  });
});
