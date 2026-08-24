import { describe, expect, it } from 'vitest';
import {
  CHEST_DIG_END_SECONDS,
  CHEST_RESULT_DURATION_SECONDS,
  CHEST_SEARCH_END_SECONDS,
  CHEST_STROKE_SECONDS,
  MONSTER_ATTACK_END_SECONDS,
  MONSTER_IMPACT_SECONDS,
  MONSTER_RESULT_DURATION_SECONDS,
  MONSTER_SCAN_LEFT_END_SECONDS,
  MONSTER_SCAN_RIGHT_END_SECONDS,
  MONSTER_TURN_BACK_END_SECONDS,
  chestCompletedStrokes,
  chestDigProgress,
  chestStrokeProgress,
  sampleChestStage,
  sampleMonsterStage,
} from '../src/survival/midnightTourChoreography';

describe('Midnight Tour chest choreography', () => {
  it('uses exact search, dig, and hold boundaries', () => {
    expect(CHEST_RESULT_DURATION_SECONDS).toBe(12);
    expect(sampleChestStage(0)).toMatchObject({ stage: 'search', progress: 0 });
    expect(sampleChestStage(3)).toMatchObject({ stage: 'dig', progress: 0 });
    expect(sampleChestStage(5)).toMatchObject({ stage: 'dig', stroke: 2 });
    expect(sampleChestStage(7)).toMatchObject({ stage: 'dig', stroke: 3 });
    expect(sampleChestStage(9)).toMatchObject({ stage: 'hold', progress: 0 });
    expect(sampleChestStage(12)).toMatchObject({ stage: 'hold', progress: 1 });
  });

  it('tracks the three two-second strokes with scalar helpers', () => {
    expect(CHEST_SEARCH_END_SECONDS).toBe(3);
    expect(CHEST_DIG_END_SECONDS).toBe(9);
    expect(CHEST_STROKE_SECONDS).toBe(2);
    expect(chestDigProgress(3)).toBe(0);
    expect(chestDigProgress(6)).toBe(0.5);
    expect(chestDigProgress(9)).toBe(1);
    expect(chestStrokeProgress(4)).toBe(0.5);
    expect(chestStrokeProgress(5)).toBe(0);
    expect(chestCompletedStrokes(4.999)).toBe(0);
    expect(chestCompletedStrokes(5)).toBe(1);
    expect(chestCompletedStrokes(7)).toBe(2);
    expect(chestCompletedStrokes(9)).toBe(3);
  });
});

describe('Midnight Tour monster choreography', () => {
  it('uses exact scan, rear turn, and attack boundaries', () => {
    expect(MONSTER_SCAN_LEFT_END_SECONDS).toBe(1.2);
    expect(MONSTER_SCAN_RIGHT_END_SECONDS).toBe(2.4);
    expect(MONSTER_TURN_BACK_END_SECONDS).toBe(3.6);
    expect(MONSTER_IMPACT_SECONDS - MONSTER_TURN_BACK_END_SECONDS).toBeCloseTo(1);
    expect(MONSTER_ATTACK_END_SECONDS).toBe(5);
    expect(MONSTER_RESULT_DURATION_SECONDS).toBe(5);
    expect(sampleMonsterStage(0)).toMatchObject({ stage: 'scan-left', progress: 0 });
    expect(sampleMonsterStage(1.2)).toMatchObject({ stage: 'scan-right', progress: 0 });
    expect(sampleMonsterStage(2.4)).toMatchObject({ stage: 'turn-back', progress: 0 });
    expect(sampleMonsterStage(3.6)).toMatchObject({ stage: 'attack', progress: 0 });
    expect(sampleMonsterStage(5)).toMatchObject({ stage: 'attack', progress: 1 });
  });

  it('clamps public samples to the result duration', () => {
    expect(sampleMonsterStage(-1)).toMatchObject({ stage: 'scan-left', progress: 0 });
    expect(sampleMonsterStage(12)).toMatchObject({ stage: 'attack', progress: 1 });
  });
});
