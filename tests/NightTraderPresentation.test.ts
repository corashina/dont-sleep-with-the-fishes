// @vitest-environment jsdom
import { Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { NightTraderPresentation } from '../src/survival/NightTraderPresentation';
import { nightTraderOffers } from '../src/survival/nightTraderTrades';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import { createTestPropModels } from './helpers/propModels';

describe('Night Trader sign', () => {
  it.each([0, 1])('shows the sampled offers facing the player on side seed %i', (seed) => {
    const propModels = createTestPropModels();
    const presentation = new NightTraderPresentation({
      camera: new PerspectiveCamera(), cameraRig: new Group(), propModels, waves: [],
      supplyDisplay: { releaseEventActor: vi.fn(), clearEventPose: vi.fn() },
    } as unknown as FocusedEventPresentationDependencies);
    presentation.stage(seed);
    presentation.root.updateMatrixWorld(true);
    const sign = presentation.root.getObjectByName('night-trader-sign')!;
    expect(sign.userData.offers).toEqual(nightTraderOffers(seed).map(({ id, payment, reward }) => ({ id, payment, reward })));
    const position = sign.getWorldPosition(new Vector3());
    const normal = sign.getWorldDirection(new Vector3());
    expect(normal.dot(new Vector3(-position.x, 0, -position.z).normalize())).toBeGreaterThan(0.999);
    let vertices = 0;
    sign.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const attribute = object.geometry.getAttribute('position');
      vertices += attribute.count;
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      if (object.parent?.name === 'night-trader-sign-drawings') {
        const normal = object.geometry.getAttribute('normal');
        const facing = Array.from({ length: normal.count }, (_, index) => normal.getZ(index));
        expect(facing.some((z) => z < -0.99)).toBe(true);
        expect(facing.every((z) => z <= 0)).toBe(true);
      }
    });
    expect(vertices).toBeGreaterThan(1000);
    presentation.stage(seed + 2);
    expect(sign.userData.offers).toHaveLength(5);
    presentation.dispose();
    propModels.dispose();
  });
});
