// Importance: 5/5. Protects deterministic chest rewards and mimic timing.
import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import {
  drawChestReward,
  shouldBecomeMimic,
} from '../src/survival/chest';
import { sequenceRandom } from './helpers/random';

describe('chest rules', () => {
  it('falls back to two food when every item reward is active', () => {
    expect(drawChestReward(new Set(ITEM_IDS), sequenceRandom([0.8]))).toEqual({
      kind: 'resource',
      resource: 'food',
      quantity: 2,
    });
  });

  it('waits two nights before the mimic roll', () => {
    expect(shouldBecomeMimic(4, 5, sequenceRandom([0]))).toBe(false);
    expect(shouldBecomeMimic(4, 6, sequenceRandom([0.34]))).toBe(true);
    expect(shouldBecomeMimic(4, 6, sequenceRandom([0.35]))).toBe(false);
  });
});
