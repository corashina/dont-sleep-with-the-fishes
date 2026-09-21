import { Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { createEventItemUseSample, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { SchoolOfFishPresentation } from '../src/survival/events/SchoolOfFishPresentation';
import { LIFEBOAT_GUNWALE_SURFACE_Y, lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';

// Importance: 95/100. Prevents binoculars from showing the hull instead of the fish water.
describe('school of fish binocular view', () => {
  it.each([0, 7, 42])('keeps the water visible after waiting with seed %s', (seed) => {
    const presentation = new SchoolOfFishPresentation({
      eventModels: { create: () => ({ root: new Group(), dispose: vi.fn() }) },
      sampleWorldWaveInto: () => {},
    } as never);
    const camera = new PerspectiveCamera(60);
    camera.position.set(0, 0.88, 0.96);
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const instanceId = 'spyglass-1' as ItemInstanceId;
    const actor = {
      instanceId, root: new Group(), applyPose: vi.fn(),
      release: vi.fn(), releaseOnNextSync: vi.fn(),
    };
    const sample = createEventItemUseSample();
    const direction = new Vector3();
    const point = new Vector3();
    try {
      for (const time of [0, 3, 12, 30, 90]) {
        presentation.stage({ eventId: 'school-of-fish', targetInstanceId: null, variantSeed: seed });
        expect(presentation.itemAimTarget.parent).toBe(
          presentation.worldRoot.getObjectByName('school-fish-1'),
        );
        presentation.reveal();
        presentation.settleForVisibilityChange();
        presentation.update(time, 0);
        adapter.begin(actor, 'spyglass', presentation.itemAimTarget);
        presentation.playItemUse('spyglass', instanceId);
        for (let frame = 0; frame < 20; frame += 1) {
          presentation.update(time + frame * 0.1, 0.1);
          sampleEventItemUse('binocular-look', 'spyglass', 0.9, sample);
          adapter.apply(sample);
          camera.getWorldDirection(direction);
          expect(direction.y).toBeLessThan(0);
          // Trace the view through the hull footprint to the water.
          const waterDistance = (0.08 - camera.position.y) / direction.y;
          for (let step = 1; step <= 100; step += 1) {
            point.copy(camera.position).addScaledVector(direction, waterDistance * step / 100);
            const halfWidth = lifeboatHullHalfWidthAt(point.z);
            if (halfWidth !== null && Math.abs(point.x) <= halfWidth) {
              expect(point.y).toBeGreaterThan(LIFEBOAT_GUNWALE_SURFACE_Y);
            }
          }
        }
        adapter.clear();
        expect(camera.fov).toBe(60);
        expect(camera.rotation.x).toBeCloseTo(0);
        expect(camera.rotation.y).toBeCloseTo(0);
      }
    } finally {
      adapter.dispose();
      presentation.dispose();
    }
  });
});
