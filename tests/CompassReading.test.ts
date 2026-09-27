// Importance: 95/100. Compass pickup must not flip its rotation between adjacent frames.
import { Group, PerspectiveCamera, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { createEventItemUseSample, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';

describe('compass reading', () => {
  it.each([0, -0.35, 0.35])('turns smoothly from storage with camera pitch %s', (pitch) => {
    const items = [{ instanceId: 'compass-1', type: 'compass' }] as const;
    const models = createTestPropModels();
    const boat = new Group();
    const display = new BoatSupplyDisplay(models, boat, items);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0.88, 0.96);
    camera.rotation.x = pitch;
    boat.add(camera);
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(camera, effects);
    try {
      display.sync(new SurvivalSession(items, { seed: 1 }).snapshot());
      const actor = display.borrowEventActor('compass-1')!;
      adapter.begin(actor, 'compass', null);
      const sample = createEventItemUseSample();
      const previous = actor.root.getWorldQuaternion(new Quaternion());
      const current = new Quaternion();
      for (let frame = 0; frame <= 480; frame += 1) {
        sampleEventItemUse('compass-search', 'compass', frame / 480, sample);
        adapter.apply(sample);
        actor.root.getWorldQuaternion(current);
        expect(previous.angleTo(current), 'rotation step at frame ' + frame).toBeLessThan(0.1);
        previous.copy(current);
      }
    } finally {
      adapter.dispose();
      effects.dispose();
      display.dispose();
      models.dispose();
    }
  });
});
