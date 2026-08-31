// Importance: 9/10. Protects drifting-supply staging and retrieval motion.

import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DriftingItemPresentation } from '../src/survival/DriftingItemPresentation';
import type { DriftingWater } from '../src/survival/DriftingWaveMotion';
import {
  driftingSupplyDistanceFromSeed,
  driftingSupplyKindFromSeed,
  type DriftingSupplyDistance,
  type DriftingSupplyKind,
} from '../src/survival/driftingSupplies';

function flatWater(): DriftingWater {
  return {
    sampleWaveInto: vi.fn((sample) => {
      sample.height = 0;
      sample.displacementX = 0;
      sample.displacementZ = 0;
      sample.normal.x = 0;
      sample.normal.y = 1;
      sample.normal.z = 0;
      return sample;
    }),
    readAmplitudeScale: vi.fn(() => 1),
  };
}

function seedFor(
  kind: DriftingSupplyKind,
  distance: DriftingSupplyDistance,
): number {
  const seed = Array.from({ length: 1_000 }, (_, index) => index).find((candidate) => (
    driftingSupplyKindFromSeed(candidate) === kind
    && driftingSupplyDistanceFromSeed(candidate) === distance
  ));
  if (seed === undefined) throw new Error(`Missing ${kind}/${distance} seed.`);
  return seed;
}

function createPresentation(): DriftingItemPresentation {
  const stern = new Group();
  stern.position.set(1.5, 0.8, 2.25);
  return new DriftingItemPresentation({
    barrel: new Group(),
    chest: new Group(),
    lifeboat: new Group(),
    lifeboatCooler: new Group(),
    shippingContainer: new Group(),
  }, stern, flatWater());
}

describe('DriftingItemPresentation', () => {

  it('detaches the cooler, stores it, and removes the empty lifeboat', async () => {
    const presentation = createPresentation();
    presentation.stage('drifting-supplies', seedFor('lifeboat', 'far'));

    const retrieval = presentation.retrieve();
    presentation.update(1, 2);
    await retrieval;

    const cooler = presentation.root.getObjectByName('drifting-supplies:lifeboat-cooler')!;
    expect(cooler.parent).toBe(presentation.root);
    expect(cooler.position.toArray()).toEqual([1.5, 0.8, 2.25]);
    expect(presentation.root.getObjectByName('drifting-supplies:lifeboat')?.visible)
      .toBe(false);
  });

  it('does not move the shipping container during retrieval', async () => {
    const presentation = createPresentation();
    presentation.stage('drifting-supplies', seedFor('container', 'middle'));
    const container = presentation.root.getObjectByName('drifting-supplies:container')!;
    const position = container.position.clone();

    await presentation.retrieve();
    presentation.update(1, 2);

    expect(container.position.toArray()).toEqual(position.toArray());
    expect(container.visible).toBe(true);
  });
});
