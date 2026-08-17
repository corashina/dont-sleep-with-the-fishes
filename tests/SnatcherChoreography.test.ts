import { describe, expect, it } from 'vitest';
import {
  identitySnatcherSample,
  sampleSnatcherReveal,
} from '../src/survival/events/snatcherChoreography';

describe('snatcher reveal choreography', () => {
  it('raises the visible tentacle from below the water', () => {
    const sample = identitySnatcherSample();

    sampleSnatcherReveal(0.05, sample);
    const submergedY = sample.creatureY;
    expect(sample.fingerVisibility).toBeGreaterThan(0);
    expect(submergedY).toBeLessThan(-2);

    sampleSnatcherReveal(0.3, sample);
    expect(sample.creatureY).toBeGreaterThan(submergedY);
    expect(sample.creatureY).toBeLessThan(-0.5);

    sampleSnatcherReveal(1, sample);
    expect(sample.creatureY).toBeCloseTo(-0.16);
  });
});
