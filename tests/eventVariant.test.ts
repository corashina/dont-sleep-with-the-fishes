import { describe, expect, it } from 'vitest';
import { eventSideFromSeed } from '../src/survival/eventVariant';

describe('eventSideFromSeed', () => {
  it('returns a stable signed side', () => {
    expect(eventSideFromSeed(8)).toBe(-1);
    expect(eventSideFromSeed(9)).toBe(1);
    expect(eventSideFromSeed(9)).toBe(1);
  });
});
