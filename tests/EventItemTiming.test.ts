// Importance: 4/5. Protects the approved slower event item pace.
import { describe, expect, it } from 'vitest';
import { GENERIC_EVENT_ITEM_USE_DURATION } from '../src/survival/BoatSupplyDisplay';
import { DANGEROUS_WATERS_ITEM_DURATION } from '../src/survival/DangerousWatersPresentation';
import {
  EVENT_ITEM_DURATION_MULTIPLIER,
  scaleEventItemDuration,
} from '../src/survival/eventItemTiming';
import { eventItemUseDuration } from '../src/survival/eventItemUseChoreography';
import { SWARM_ITEM_DURATION } from '../src/survival/events/anglerfishSwarmChoreography';
import { DEATH_STARE_ITEM_DURATION } from '../src/survival/events/deathStareChoreography';
import { LEAK_ITEM_DURATION } from '../src/survival/events/leakChoreography';
import { SCHOOL_ITEM_DURATION } from '../src/survival/events/schoolOfFishChoreography';
import { SNATCHER_ITEM_DURATION } from '../src/survival/events/snatcherChoreography';
import { WHIRLPOOL_ITEM_DURATION } from '../src/survival/events/whirlpoolChoreography';
import { supernaturalItemUseDuration } from '../src/survival/supernaturalEventChoreography';
import { weatherItemUseDuration } from '../src/survival/weatherEventChoreography';

describe('event item timing', () => {
  it('applies the same two-times duration to every item animation system', () => {
    expect(EVENT_ITEM_DURATION_MULTIPLIER).toBe(2);
    expect(scaleEventItemDuration(1)).toBe(2);
    expect(GENERIC_EVENT_ITEM_USE_DURATION).toBe(1.3);
    expect(DANGEROUS_WATERS_ITEM_DURATION).toBe(2.2);
    expect(eventItemUseDuration('throw-target')).toBe(2.7);
    expect(weatherItemUseDuration('shower-night', 'umbrella')).toBe(3);
    expect(supernaturalItemUseDuration('ghosts', 'flareGun')).toBe(2.4);
    expect(LEAK_ITEM_DURATION).toBe(2.2);
    expect(SCHOOL_ITEM_DURATION).toBe(2.5);
    expect(SNATCHER_ITEM_DURATION).toBe(2.3);
    expect(DEATH_STARE_ITEM_DURATION).toBe(2.5);
    expect(SWARM_ITEM_DURATION).toBe(2.4);
    expect(WHIRLPOOL_ITEM_DURATION).toBe(2.5);
  });
});
