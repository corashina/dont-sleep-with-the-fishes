import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { FlowersPresentation } from '../src/survival/FlowersPresentation';
import { EMPTY_SURVIVAL_EVENT_MODELS } from '../src/survival/SurvivalEventModelLibrary';

describe('FlowersPresentation', () => {
  it('keeps visible space between every flower pad', () => {
    const presentation = new FlowersPresentation(
      EMPTY_SURVIVAL_EVENT_MODELS,
      new Group(),
    );
    presentation.stage();
    const field = presentation.root.getObjectByName('event-prop:flowers')!;

    for (let left = 0; left < field.children.length; left += 1) {
      for (let right = left + 1; right < field.children.length; right += 1) {
        const first = field.children[left]!.position;
        const second = field.children[right]!.position;
        expect(Math.hypot(
          first.x - second.x,
          first.z - second.z,
        )).toBeGreaterThan(1.9);
      }
    }

    presentation.dispose();
  });
});
