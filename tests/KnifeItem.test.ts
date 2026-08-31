import { describe, expect, it } from 'vitest';
import { survivalEventById } from '../src/survival/eventCatalog';
import {
  createEventItemUseSample,
  resolveEventItemUseContext,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

describe('Knife survival item', () => {

  it('can save a Tentacle Attack target with an 80 percent success chance', () => {
    const choice = survivalEventById('snatcher')?.choices.find(({ id }) => id === 'knife');

    expect(choice).toEqual({
      id: 'knife',
      label: 'Use Knife',
      itemId: 'knife',
      outcomes: [
        {
          weight: 80,
          message: 'You cut the tentacle and save the snatched supply.',
          effects: {},
        },
        {
          weight: 20,
          message: 'The knife breaks and the snatched supply is lost.',
          effects: {
            items: [
              { kind: 'break', itemId: 'knife', quantity: 1 },
              { kind: 'loseEventTarget', quantity: 1 },
            ],
          },
        },
      ],
    });
  });

  it('can repel the shark swarm with an 80 percent success chance', () => {
    const choice = survivalEventById('swarm-of-sharks')?.choices.find(
      ({ id }) => id === 'knife',
    );

    expect(choice).toEqual({
      id: 'knife',
      label: 'Use Knife',
      itemId: 'knife',
      outcomes: [
        {
          weight: 80,
          message: 'You drive the sharks away from the boat.',
          effects: {},
        },
        {
          weight: 20,
          message: 'The knife breaks as a shark bites you.',
          effects: {
            resources: [{ operation: 'subtract', resource: 'health', value: 20 }],
            items: [{ kind: 'break', itemId: 'knife', quantity: 1 }],
          },
        },
      ],
    });
  });

  it('uses a visible one-handed slash', () => {
    expect(resolveEventItemUseContext('snatcher', 'knife', 'knife')).toBe('knife-slash');
    expect(resolveEventItemUseContext('swarm-of-sharks', 'knife', 'knife'))
      .toBe('knife-slash');

    const ready = createEventItemUseSample();
    const strike = createEventItemUseSample();
    sampleEventItemUse('knife-slash', 'knife', 0.4, ready);
    sampleEventItemUse('knife-slash', 'knife', 0.7, strike);

    expect(strike.itemVisible).toBe(true);
    expect(ready.targetBlend).toBe(0);
    expect(strike.targetBlend).toBe(0);
    expect(Math.abs(strike.yaw - ready.yaw)).toBeGreaterThan(0.4);
    expect(Math.abs(strike.roll - ready.roll)).toBeGreaterThan(0.4);
  });
});
