// Importance: 95/100. Kept event items must remain visible at their original storage position.
import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { EventItemUseController } from '../src/survival/EventItemUseController';
import { resolveEventItemUseContext } from '../src/survival/eventItemUseChoreography';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';

const RETURN_CASES = [
  ['swarm-of-sharks', 'fishingNet', 'usable'],
  ['swarm-of-sharks', 'fishingNet', 'broken'],
  ['tentacle-attack', 'fishingNet', 'usable'],
  ['tentacle-attack', 'fishingNet', 'broken'],
  ['death-stare', 'fishingNet', 'broken'],
  ['dangerous-waters', 'spyglass', 'usable'],
  ['school-of-fish', 'spyglass', 'usable'],
  ['monster-in-the-fog', 'spyglass', 'usable'],
  ['eerie-melody', 'spyglass', 'usable'],
  ['face-on-the-moon', 'spyglass', 'usable'],
  ['ghost-ship', 'spyglass', 'usable'],
  ['other-people', 'radio', 'usable'],
] as const;

describe('event item return to storage', () => {
  it.each(RETURN_CASES)('returns %s %s (%s) to its visible storage pose', async (
    eventId, itemId, condition,
  ) => {
    const instanceId = `${itemId}-1` as const;
    const saved = [{ instanceId, type: itemId }];
    const models = createTestPropModels();
    const display = new BoatSupplyDisplay(models, new Group(), saved);
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(new PerspectiveCamera(), effects);
    const controller = new EventItemUseController(display, adapter);
    const before = new SurvivalSession(saved, { seed: 1 }).snapshot();
    const after = new SurvivalSession(saved, {
      seed: 1, initialConditions: { [instanceId]: condition },
    }).snapshot();
    try {
      display.sync(before);
      const storage = display.recordFor(itemId)!.root;
      const copy = storage.children[0]!;
      const position = copy.position.clone();
      const quaternion = copy.quaternion.clone();
      const scale = copy.scale.clone();
      const use = controller.play({
        eventId, choiceId: itemId, itemId, instanceId,
        context: resolveEventItemUseContext(eventId, itemId, itemId)!,
        aimTarget: null,
      });
      expect(storage.visible).toBe(false);
      controller.update(10);
      await use;

      // Ghost Ship observation returns to item selection without resolving the event.
      const reaction = eventId === 'ghost-ship' ? controller.recover() : controller.react({
        outcome: { accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none' },
        resourceDeltas: {}, gainedInstanceIds: [], lostInstanceIds: [], consumedInstanceIds: [],
        brokenInstanceIds: condition === 'broken' ? [instanceId] : [],
        selectedInstanceId: instanceId, selectedCondition: condition, targetInstanceId: null,
      });
      controller.update(10);
      await reaction;

      expect(storage.visible).toBe(true);
      expect(copy.visible).toBe(true);
      display.sync(after);
      controller.clear('night');
      expect(storage.visible).toBe(true);
      expect(copy.visible).toBe(true);
      expect(copy.position).toEqual(position);
      expect(copy.quaternion.toArray()).toEqual(quaternion.toArray());
      expect(copy.scale).toEqual(scale);
    } finally {
      controller.dispose();
      adapter.dispose();
      effects.dispose();
      display.dispose();
      models.dispose();
    }
  });
});
