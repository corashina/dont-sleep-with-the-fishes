// Importance: 4/5. Protects the close camera pass, hidden model, and screen-mask transition.
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

function sample(progress: number) {
  const output = createEventItemUseSample();
  sampleEventItemUse('binocular-look', 'spyglass', progress, output);
  return output;
}

describe('binocular item-use animation', () => {
  it('moves close to the camera, passes behind it, then hides the model', () => {
    const raised = sample(0.34);
    const close = sample(0.52);
    const behind = sample(0.67);
    const hidden = sample(0.68);

    expect(raised.viewZ).toBeCloseTo(-0.72);
    expect(close.viewZ).toBeCloseTo(-0.1);
    expect(close.scaleX).toBeCloseTo(1.35);
    expect(behind.viewZ).toBeGreaterThan(0);
    expect(behind.itemVisible).toBe(true);
    expect(hidden.itemVisible).toBe(false);
  });

  it('replaces world lenses with a full screen mask and zoom transition', () => {
    const beforeMask = sample(0.5);
    const looking = sample(0.68);
    const held = sample(1);

    expect(beforeMask.effectKind).toBe('none');
    expect(looking.effectKind).toBe('binocular-mask');
    expect(looking.primaryEffect).toBe(1);
    expect(looking.fovScale).toBeCloseTo(0.76);
    expect(looking.cameraTargetBlend).toBeGreaterThan(0);
    expect(held.itemVisible).toBe(false);
    expect(held.primaryEffect).toBe(1);
    expect(held.cameraTargetBlend).toBe(1);

    const returning = createEventItemUseSample();
    sampleEventItemOutcome('binocular-look', 'spyglass', 'recover', 0, returning);
    expect(returning.cameraTargetBlend).toBe(1);
    const returned = createEventItemUseSample();
    sampleEventItemOutcome('binocular-look', 'spyglass', 'recover', 1, returned);
    expect(returned.effectKind).toBe('none');
    expect(returned.primaryEffect).toBe(0);
    expect(returned.fovScale).toBe(1);
    expect(returned.cameraTargetBlend).toBe(0);
    expect(returned.itemVisible).toBe(false);
  });
});
