import { expect, it } from 'vitest';
import {
  clampSurvivalResources,
  eventResourceDelta,
  resolveIntegerValue,
} from '../src/survival/eventOutcomeRules';

it('resolves bounded values through the provided random source', () => {
  expect(resolveIntegerValue({ min: 2, max: 4 }, { next: () => 0 })).toBe(2);
  expect(resolveIntegerValue({ min: 2, max: 4 }, { next: () => 0.999 })).toBe(4);
});

it('converts add, subtract, and set operations to deltas', () => {
  expect(eventResourceDelta(
    { resource: 'energy', operation: 'add', value: 2 }, 1,
  )).toBe(2);
  expect(eventResourceDelta(
    { resource: 'energy', operation: 'subtract', value: 2 }, 3,
  )).toBe(-2);
  expect(eventResourceDelta(
    { resource: 'energy', operation: 'set', value: 2 }, 3,
  )).toBe(-1);
});

it('clamps survival resources to their current limits', () => {
  expect(clampSurvivalResources({ health: 120, hunger: -2, energy: 4, hull: 150 }))
    .toEqual({ health: 100, hunger: 0, energy: 3, hull: 100 });
});
