// Importance: 4/5. Protects deterministic Ghosts and Eerie Melody motion.
import { describe, expect, it } from 'vitest';
import {
  sampleSupernaturalItemUse,
  sampleSupernaturalReaction,
  sampleSupernaturalReveal,
  supernaturalItemUseDuration,
  supernaturalRevealDuration,
  type SupernaturalItemSample,
  type SupernaturalReactionSample,
  type SupernaturalRevealSample,
} from '../src/survival/supernaturalEventChoreography';

const revealSample = (): SupernaturalRevealSample => ({
  cameraX: 0, cameraY: 0, cameraZ: 0,
  cameraYaw: 0, cameraPitch: 0, cameraRoll: 0,
  ghostVisibility: 0,
  ghostDistances: [0, 0, 0, 0, 0],
  ghostSideOffsets: [0, 0, 0, 0, 0],
  flareFlash: 0,
  fogCurtain: 0,
  sirenHeadTurn: 0,
  sirenLunge: 0,
  melodyClarity: 0,
});

const itemSample = (): SupernaturalItemSample => ({
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
  scaleX: 1, scaleY: 1, scaleZ: 1, effect: 0,
  cameraYaw: 0, cameraPush: 0,
});

const reactionSample = (): SupernaturalReactionSample => ({
  cameraX: 0, cameraY: 0, cameraZ: 0,
  cameraYaw: 0, cameraPitch: 0, cameraRoll: 0,
  ghostVisibility: 0, ghostFocus: -1,
  flareFlash: 0, fogCurtain: 0,
  sirenLunge: 0, sirenStrike: 0,
});

const supportedPairs = [
  ['ghosts', 'flareGun'],
  ['ghosts', 'flashlight'],
  ['eerie-melody', 'bucket'],
  ['eerie-melody', 'spyglass'],
  ['eerie-melody', 'umbrella'],
  ['eerie-melody', 'ductTape'],
] as const;

describe('supernatural event choreography', () => {
  it('uses the authored reveal durations', () => {
    expect(supernaturalRevealDuration('ghosts')).toBe(4);
    expect(supernaturalRevealDuration('eerie-melody')).toBe(4.4);
  });

  it('brings five Ghosts in at distinct distances', () => {
    const output = revealSample();
    expect(sampleSupernaturalReveal('ghosts', 0.9, output)).toBe(true);
    expect(new Set(output.ghostDistances.map((value) => value.toFixed(3))).size).toBe(5);
    expect(output.ghostDistances[0]).toBeGreaterThan(0.9);
  });

  it('draws the fog curtain before the siren turns', () => {
    const beforeTurn = revealSample();
    const afterTurn = revealSample();
    sampleSupernaturalReveal('eerie-melody', 0.52, beforeTurn);
    sampleSupernaturalReveal('eerie-melody', 0.72, afterTurn);
    expect(beforeTurn.sirenHeadTurn).toBeLessThan(afterTurn.sirenHeadTurn);
    expect(afterTurn.melodyClarity).toBeGreaterThan(0.7);
  });

  it.each(['ghosts', 'eerie-melody'])('restores %s reveal identity at both ends', (eventId) => {
    const start = revealSample();
    const end = revealSample();
    expect(sampleSupernaturalReveal(eventId, 0, start)).toBe(true);
    expect(sampleSupernaturalReveal(eventId, 1, end)).toBe(true);
    expect(start).toEqual(revealSample());
    expect(end).toEqual(revealSample());
  });

  it.each(supportedPairs)('supports %s %s item motion', (eventId, choiceId) => {
    const start = itemSample();
    const middle = itemSample();
    const end = itemSample();
    expect(supernaturalItemUseDuration(eventId, choiceId)).toBeGreaterThan(1);
    expect(sampleSupernaturalItemUse(eventId, choiceId, 0, start)).toBe(true);
    expect(sampleSupernaturalItemUse(eventId, choiceId, 0.5, middle)).toBe(true);
    expect(sampleSupernaturalItemUse(eventId, choiceId, 1, end)).toBe(true);
    expect(start).toEqual(itemSample());
    expect(end).toEqual(itemSample());
    expect(JSON.stringify(middle)).not.toBe(JSON.stringify(itemSample()));
  });

  it('rejects unsupported event pairs and prototype keys', () => {
    expect(supernaturalRevealDuration('__proto__')).toBeNull();
    expect(sampleSupernaturalReveal('constructor', 0.5, revealSample())).toBe(false);
    expect(supernaturalItemUseDuration('ghosts', 'bucket')).toBeNull();
    expect(sampleSupernaturalItemUse('eerie-melody', 'constructor', 0.5, itemSample())).toBe(false);
  });

  it('keys safe fog and attacking siren reactions', () => {
    const safe = reactionSample();
    const attack = reactionSample();
    sampleSupernaturalReaction('eerie-melody', { deltas: {} }, undefined, 0.5, safe);
    sampleSupernaturalReaction('eerie-melody', { deltas: { hull: -30 } }, undefined, 0.5, attack);
    expect(safe.fogCurtain).toBeGreaterThan(0);
    expect(attack.sirenLunge).toBeGreaterThan(0);
    expect(attack.sirenStrike).toBeGreaterThan(0);
  });
});
