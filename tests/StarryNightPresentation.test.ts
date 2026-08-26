import { describe, expect, it, vi } from 'vitest';
import { StarryNightPresentation } from '../src/survival/StarryNightPresentation';

describe('StarryNightPresentation', () => {
  it('stages complete stars, twinkles, reacts, and resets without allocations', async () => {
    const setStarryNight = vi.fn();
    const presentation = new StarryNightPresentation({ sky: { setStarryNight } });

    presentation.stage({
      eventId: 'starry-night',
      targetInstanceId: null,
      variantSeed: 7,
    });
    expect(setStarryNight.mock.calls.at(-1)?.[0]).toEqual({
      strength: 1,
      time: 0,
      constellationStrength: 0,
    });
    const display = setStarryNight.mock.calls.at(-1)?.[0];
    const reveal = presentation.reveal();
    presentation.update(1, 1);
    await reveal;
    expect(setStarryNight.mock.calls.at(-1)?.[0]).toBe(display);
    expect(setStarryNight.mock.calls.at(-1)?.[0]).toMatchObject({
      strength: 1,
      time: 1,
    });

    const reaction = presentation.react();
    presentation.update(1.5, 0.5);
    expect(setStarryNight.mock.calls.at(-1)?.[0].strength).toBeCloseTo(0.5);
    presentation.update(2, 0.5);
    await reaction;
    expect(setStarryNight.mock.calls.at(-1)?.[0].strength).toBe(0);

    presentation.clear();
    expect(setStarryNight.mock.calls.at(-1)?.[0]).toEqual({
      strength: 0,
      time: 0,
      constellationStrength: 0,
    });
    presentation.stage({
      eventId: 'starry-night',
      targetInstanceId: null,
      variantSeed: 9,
    });
    void presentation.reveal();
    presentation.update(2.5, 0.5);
    presentation.dispose();
    expect(setStarryNight.mock.calls.at(-1)?.[0]).toEqual({
      strength: 0,
      time: 0,
      constellationStrength: 0,
    });
    presentation.dispose();
  });

  it('keeps staged stars complete after a visibility change', async () => {
    const setStarryNight = vi.fn();
    const presentation = new StarryNightPresentation({ sky: { setStarryNight } });
    presentation.stage({ eventId: 'starry-night', targetInstanceId: null, variantSeed: 0 });
    const reveal = presentation.reveal();
    presentation.settleForVisibilityChange();
    await reveal;
    expect(setStarryNight.mock.calls.at(-1)?.[0].strength).toBe(1);
  });

  it('stages Orion only for Constellation Night', () => {
    const setStarryNight = vi.fn();
    const presentation = new StarryNightPresentation({ sky: { setStarryNight } });
    presentation.stage({
      eventId: 'constellation-night',
      targetInstanceId: null,
      variantSeed: 0,
    });
    expect(setStarryNight.mock.calls.at(-1)?.[0]).toEqual({
      strength: 1,
      time: 0,
      constellationStrength: 1,
    });
  });
});
