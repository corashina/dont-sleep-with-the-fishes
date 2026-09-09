// Importance: 9/10. Protects drifting-supply staging and retrieval motion.

import { Group, Vector3 } from 'three';
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

function createPresentation(player = new Group()): DriftingItemPresentation {
  const stern = new Group();
  stern.position.set(1.5, 0.8, 2.25);
  return new DriftingItemPresentation({
    barrel: new Group(),
    chest: new Group(),
    lifeboat: new Group(),
    lifeboatCooler: new Group(),
    shippingContainer: new Group(),
  }, stern, player, flatWater());
}

describe('DriftingItemPresentation', () => {

  it('detaches the cooler, opens it at the player, and removes the empty lifeboat', async () => {
    const presentation = createPresentation();
    presentation.stage('drifting-supplies', seedFor('lifeboat', 'far'));

    const retrieval = presentation.retrieve();
    presentation.update(1, 2);
    await retrieval;

    const cooler = presentation.root.getObjectByName('drifting-supplies:lifeboat-cooler')!;
    expect(cooler.parent).toBe(presentation.root);
    expect(cooler.position.toArray()).toEqual([0, -0.2, -0.65]);
    expect(cooler.visible).toBe(false);
    expect(presentation.root.getObjectByName('drifting-supplies:lifeboat')?.visible)
      .toBe(false);
    presentation.dispose();
  });

  it.each(['barrel', 'lifeboat', 'container'] as const)(
    'brings %s to the moving player and hides it before retrieval resolves', async (kind) => {
      const player = new Group();
      const playerRig = new Group();
      playerRig.position.set(2, 0.4, -1);
      playerRig.rotation.set(0.1, 0.5, -0.08);
      playerRig.add(player);
      player.position.set(0, 1.2, 0);
      const presentation = createPresentation(player);
      presentation.root.position.set(-2, 0.3, 1);
      presentation.root.rotation.y = -0.3;
      presentation.stage('drifting-supplies', seedFor(kind, 'far'));
      const initialAim = presentation.itemAimTarget()!.getWorldPosition(new Vector3());
      let finished = false;
      const retrieval = presentation.retrieve().then(() => {
        expect(presentation.resultRoot()!.visible).toBe(false);
        finished = true;
      });
      const cargo = presentation.resultRoot()!;
      const start = cargo.getWorldPosition(new Vector3());
      presentation.update(0.5, 0.5);
      await Promise.resolve();
      expect(finished).toBe(false);
      expect(cargo.visible).toBe(true);
      expect(cargo.getWorldPosition(new Vector3()).distanceTo(start)).toBeGreaterThan(0.1);
      expect(presentation.itemAimTarget()!.getWorldPosition(new Vector3()).distanceTo(initialAim))
        .toBeLessThan(1e-8);

      playerRig.position.x += 0.2;
      presentation.update(3, 3);
      await retrieval;
      const contact = player.worldToLocal(cargo.getWorldPosition(new Vector3()));
      expect(contact.x).toBeCloseTo(0);
      expect(contact.y).toBeCloseTo(-0.2);
      expect(contact.z).toBeCloseTo(-0.65);
      presentation.update(4, 1);
      expect(cargo.visible).toBe(false);
      presentation.clear();
      presentation.stage('drifting-supplies', seedFor(kind, 'near'));
      expect(presentation.resultRoot()!.visible).toBe(true);
      presentation.dispose();
    },
  );

  it.each(['barrel', 'lifeboat', 'container'] as const)(
    'settles %s contact when visibility changes', async (kind) => {
      const presentation = createPresentation();
      presentation.stage('drifting-supplies', seedFor(kind, 'near'));
      const retrieval = presentation.retrieve();
      presentation.update(0.2, 0.2);
      presentation.settleForVisibilityChange();
      await retrieval;
      expect(presentation.resultRoot()!.visible).toBe(false);
      expect(presentation.resultRoot()!.position.toArray()).toEqual([0, -0.2, -0.65]);
      presentation.dispose();
    },
  );

  it('keeps the chest visible at the stern', async () => {
    const presentation = createPresentation();
    presentation.stage('drifting-chest');
    const retrieval = presentation.retrieve();
    presentation.update(2, 2);
    await retrieval;
    expect(presentation.resultRoot()!.visible).toBe(true);
    expect(presentation.resultRoot()!.position.toArray()).toEqual([1.5, 0.8, 2.25]);
    presentation.dispose();
  });
});
