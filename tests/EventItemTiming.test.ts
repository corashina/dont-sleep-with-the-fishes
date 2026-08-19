// Importance: 8/10 (scaled from 4/5). Protects the approved slower event item pace.
import { describe, expect, it } from 'vitest';
import { GENERIC_EVENT_ITEM_USE_DURATION } from '../src/survival/BoatSupplyDisplay';
import { DANGEROUS_WATERS_ITEM_DURATION } from '../src/survival/DangerousWatersPresentation';
import {
  EVENT_ITEM_DURATION_MULTIPLIER,
  scaleEventItemDuration,
  scaleThrownItemDuration,
  THROWN_ITEM_SPEED_MULTIPLIER,
} from '../src/survival/eventItemTiming';
import {
  eventItemUseDuration,
  eventItemUseDurationForItem,
} from '../src/survival/eventItemUseChoreography';
import { SWARM_ITEM_DURATION, swarmItemDuration } from '../src/survival/events/anglerfishSwarmChoreography';
import { DEATH_STARE_ITEM_DURATION, deathStareItemDuration } from '../src/survival/events/deathStareChoreography';
import { LEAK_ITEM_DURATION } from '../src/survival/events/leakChoreography';
import { SCHOOL_ITEM_DURATION, schoolItemDuration } from '../src/survival/events/schoolOfFishChoreography';
import { SNATCHER_ITEM_DURATION, snatcherItemDuration } from '../src/survival/events/snatcherChoreography';
import { TORNADO_ITEM_DURATION } from '../src/survival/events/tornadoChoreography';
import { supernaturalItemUseDuration } from '../src/survival/supernaturalEventChoreography';
import { weatherItemUseDuration } from '../src/survival/weatherEventChoreography';

describe('event item timing', () => {
  it('keeps the standard pace and speeds thrown items up by 25 percent', () => {
    expect(EVENT_ITEM_DURATION_MULTIPLIER).toBe(4);
    expect(scaleEventItemDuration(1)).toBe(4);
    expect(THROWN_ITEM_SPEED_MULTIPLIER).toBe(1.25);
    expect(scaleThrownItemDuration(1)).toBe(3.2);
    expect(GENERIC_EVENT_ITEM_USE_DURATION).toBe(2.6);
    expect(DANGEROUS_WATERS_ITEM_DURATION).toBe(4.4);
    expect(eventItemUseDuration('throw-target')).toBeCloseTo(4.32);
    expect(eventItemUseDuration('net-scoop')).toBe(6.6);
    expect(eventItemUseDuration('bucket-scoop')).toBe(6.6);
    expect(weatherItemUseDuration('shower-night', 'umbrella')).toBe(6);
    expect(supernaturalItemUseDuration('ghosts', 'flareGun')).toBe(4.8);
    expect(LEAK_ITEM_DURATION).toBe(4.4);
    expect(SCHOOL_ITEM_DURATION).toBe(5);
    expect(schoolItemDuration('fishingNet')).toBe(4);
    expect(SNATCHER_ITEM_DURATION).toBe(4.6);
    expect(snatcherItemDuration('swimRing')).toBeCloseTo(3.68);
    expect(DEATH_STARE_ITEM_DURATION).toBe(5);
    expect(deathStareItemDuration('food')).toBe(4);
    expect(SWARM_ITEM_DURATION).toBe(4.8);
    expect(swarmItemDuration('baitTin')).toBeCloseTo(3.84);
    expect(TORNADO_ITEM_DURATION).toBe(4);
  });

  it('throws medium items fifteen percent slower than light items', () => {
    const lightDuration = eventItemUseDurationForItem('throw-target', 'cannedFood');

    expect(lightDuration).toBe(eventItemUseDuration('throw-target'));
    expect(eventItemUseDurationForItem('throw-target', 'medicalKit'))
      .toBeCloseTo(lightDuration * 1.15);
    expect(eventItemUseDurationForItem('throw-target', 'swimRing'))
      .toBeCloseTo(lightDuration * 1.15);
  });
});
