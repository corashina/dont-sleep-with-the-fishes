import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { DriftingCargoPresentation } from '../src/survival/DriftingCargoPresentation';
import type { DriftingWater } from '../src/survival/DriftingWaveMotion';
import type { DriftingCargoKind } from '../src/survival/survivalTypes';

function createPresentation(): DriftingCargoPresentation {
  const water: DriftingWater = {
    sampleWaveInto: (sample) => {
      sample.height = 0;
      sample.displacementX = 0;
      sample.displacementZ = 0;
      sample.normal.x = 0;
      sample.normal.y = 1;
      sample.normal.z = 0;
      return sample;
    },
    readAmplitudeScale: () => 1,
  };
  return new DriftingCargoPresentation(
    { barrel: new Group(), chest: new Group() },
    new Group(),
    water,
  );
}

describe('DriftingCargoPresentation', () => {
  it.each([
    ['barrel', 'drifting-barrel:model'],
    ['chest', 'drifting-chest:model'],
  ] as const)('stages the %s on either seeded side', (variant, modelName) => {
    const presentation = createPresentation();
    const model = presentation.root.getObjectByName(modelName)!;

    presentation.stage(variant, 8);
    expect(model.position.x).toBe(-3);

    presentation.stage(variant, 9);
    expect(model.position.x).toBe(3);

    presentation.dispose();
  });

  it.each([
    ['barrel', 8, -1],
    ['barrel', 9, 1],
    ['chest', 8, -1],
    ['chest', 9, 1],
  ] as const)(
    'moves the %s farther out from seeded side %s',
    async (variant: DriftingCargoKind, seed, direction) => {
      const presentation = createPresentation();
      const modelName = variant === 'barrel'
        ? 'drifting-barrel:model'
        : 'drifting-chest:model';
      const model = presentation.root.getObjectByName(modelName)!;
      presentation.stage(variant, seed);

      const recede = presentation.recede();
      presentation.update(1, 0.4);
      expect(Math.sign(model.position.x)).toBe(direction);
      expect(Math.abs(model.position.x)).toBeGreaterThan(3);
      presentation.update(2, 0.4);
      await recede;

      presentation.dispose();
    },
  );
});
