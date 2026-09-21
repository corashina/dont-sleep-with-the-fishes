import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  sampleEventItemOutcome, sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

describe('event option motion', () => {
  // Importance: 90/100. Return changes must leave the deployed leak patch in place.
  it('keeps the Map on the leak during the result', () => {
    const use = createEventItemUseSample();
    const outcome = createEventItemUseSample();
    sampleEventItemUse('map-leak-patch', 'map', 1, use);
    for (const progress of [0, 0.5, 1]) {
      sampleEventItemOutcome('map-leak-patch', 'map', 'recover', progress, outcome);
      expect(outcome).toEqual(use);
    }
  });
});
