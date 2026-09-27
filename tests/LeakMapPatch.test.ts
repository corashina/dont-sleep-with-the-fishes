// Importance: 95/100. The map must cover the leak when sealing starts, including on a moving boat.
import { expect, it } from 'vitest';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { LeakPresentation } from '../src/survival/events/LeakPresentation';
import type { DedicatedEventEnvironment } from '../src/survival/eventPresentationTypes';
import { createEventItemUseSample, MAP_PATCH_CONTACT_PROGRESS, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';

it.each([0, 0.18])('presses the map against the leak at contact with boat roll %s', (roll) => {
  const items = [{ instanceId: 'map-1', type: 'map' }] as const;
  const models = createTestPropModels();
  const boat = new Group();
  boat.position.set(1, 0.4, -2);
  boat.rotation.set(0.06, 0.3, roll);
  const display = new BoatSupplyDisplay(models, boat, items);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0.88, 0.96);
  boat.add(camera);
  const effects = new EventItemEffects();
  const adapter = new EventItemUseAdapter(camera, effects);
  const leak = new LeakPresentation({} as DedicatedEventEnvironment);
  boat.add(leak.boatRoot);
  try {
    display.sync(new SurvivalSession(items, { seed: 1 }).snapshot());
    const actor = display.borrowEventActor('map-1')!;
    adapter.begin(actor, 'map', leak.itemAimTarget, true);
    const sample = createEventItemUseSample();
    const position = new Vector3();
    const target = new Vector3();
    const previous = actor.root.getWorldPosition(new Vector3());
    for (let frame = 0; frame <= 100; frame++) {
      const progress = frame / 100;
      sampleEventItemUse('map-leak-patch', 'map', progress, sample);
      adapter.apply(sample);
      actor.root.getWorldPosition(position);
      expect(position.distanceTo(previous), 'map step at progress ' + progress).toBeLessThan(0.2);
      previous.copy(position);
      if (progress < MAP_PATCH_CONTACT_PROGRESS) continue;
      leak.itemAimTarget.getWorldPosition(target);
      expect(position.distanceTo(target), 'map gap at progress ' + progress).toBeLessThan(0.001);
    }
  } finally {
    adapter.dispose();
    effects.dispose();
    leak.dispose();
    display.dispose();
    models.dispose();
  }
});
