// Importance: 95/100. Used items must stay visible until the covered scene clears.
import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { EventItemUseController } from '../src/survival/EventItemUseController';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  createEventItemUseSample, eventItemOutcomeDuration, eventItemUseDurationForItem,
  sampleEventItemOutcome, sampleEventItemUse, type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import { createTestPropModels } from './helpers/propModels';

function setup(itemId: ItemId, context: EventItemUseContext) {
  const instanceId: ItemInstanceId = `${itemId}-1`;
  const saved = [{ instanceId, type: itemId }];
  const models = createTestPropModels();
  const root = new Group();
  const supplies = new BoatSupplyDisplay(models, root, saved);
  const snapshot = new SurvivalSession(saved, { seed: 1 }).snapshot();
  supplies.sync(snapshot);
  const adapter = new EventItemUseAdapter(new PerspectiveCamera(), new EventItemEffects());
  const controller = new EventItemUseController(supplies, adapter);
  const target = new Group();
  target.position.set(2, 0.5, -3);
  const actor = supplies.borrowEventActor(instanceId)!;
  const position = actor.root.position.clone();
  const rotation = actor.root.quaternion.clone();
  const scale = actor.root.scale.clone();
  const consumed = {
    ...snapshot,
    inventory: {
      ...snapshot.inventory,
      [instanceId]: { ...snapshot.inventory[instanceId]!, condition: 'consumed' as const, charges: 0 },
    },
  };
  const result: EventOutcomePresentation = {
    outcome: { accepted: true, code: 'event-resolved', message: 'Done.', deltas: {}, cue: 'none' },
    resourceDeltas: {}, gainedInstanceIds: [], brokenInstanceIds: [], lostInstanceIds: [],
    consumedInstanceIds: [instanceId], selectedInstanceId: instanceId,
    selectedCondition: 'consumed', targetInstanceId: null,
  };
  return {
    root, supplies, adapter, controller, actor, position, rotation, scale, consumed, result, snapshot,
    play: () => controller.play({
      eventId: context === 'tape-secure' ? 'windy-night' : 'tentacle-attack',
      choiceId: itemId, instanceId, itemId, context, aimTarget: target,
    }),
    dispose: () => {
      controller.dispose();
      adapter.dispose();
      supplies.dispose();
      models.dispose();
    },
  };
}

describe('consumed item return', () => {
  // Importance: 95/100. Cleanup must not conceal an incorrect return destination.
  it.each([['fishingNet', 'net-scoop']] as const)('returns %s from %s to its pickup pose before cleanup', (itemId, context) => {
    const rig = setup(itemId, context);
    try {
      const target = new Group();
      target.position.set(2, 0.5, -3);
      rig.root.position.set(1, 0.4, -2);
      rig.root.rotation.set(0.04, 0.2, -0.03);
      const sample = createEventItemUseSample();
      rig.adapter.begin(rig.actor, itemId, target);
      sampleEventItemUse(context, itemId, 1, sample);
      rig.adapter.apply(sample);
      // Check just before completion, before actor release can reset its pose.
      sampleEventItemOutcome(context, itemId, 'recover', 0.9999, sample);
      rig.adapter.apply(sample);
      expect(rig.actor.root.position.distanceTo(rig.position)).toBeLessThan(0.001);
      expect(rig.actor.root.quaternion.angleTo(rig.rotation)).toBeLessThan(0.001);
      expect(rig.actor.root.scale.distanceTo(rig.scale)).toBeLessThan(0.001);
    } finally {
      rig.dispose();
    }
  });

  it.each([['shotgun', 'shotgun-fire'], ['flareGun', 'flare-target'], ['ductTape', 'tape-stretch']] as const)('keeps %s visible after %s until scene cleanup', async (itemId, context) => {
    const rig = setup(itemId, context);
    try {
      const use = rig.play();
      rig.controller.update(eventItemUseDurationForItem(context, itemId));
      await use;
      rig.supplies.sync(rig.consumed);
      const reaction = rig.controller.react(rig.result);
      const duration = eventItemOutcomeDuration(itemId, 'depart');
      rig.controller.update(duration * 0.9999);
      expect(rig.actor.root.position.distanceTo(rig.position)).toBeLessThan(0.001);
      expect(rig.actor.root.quaternion.angleTo(rig.rotation)).toBeLessThan(0.001);
      for (let frame = 0; frame <= 20; frame += 1) {
        rig.controller.update(duration / 20);
        expect(rig.actor.root.visible).toBe(true);
        expect(rig.actor.root.parent).toBe(rig.root);
      }
      await reaction;
      expect(rig.actor.root.position.distanceTo(rig.position)).toBeLessThan(1e-8);
      expect(rig.actor.root.quaternion.angleTo(rig.rotation)).toBeLessThan(1e-7);
      expect(rig.actor.root.scale.distanceTo(rig.scale)).toBeLessThan(1e-8);

      rig.supplies.sync(rig.consumed);
      rig.supplies.update(1);
      rig.controller.update(1);
      expect(rig.actor.root.visible).toBe(true);
      expect(rig.actor.root.parent).toBe(rig.root);

      // BoatWorld clears these only after the event fade covers the scene.
      rig.controller.clear('night');
      rig.supplies.clearEventMotion();
      rig.supplies.sync(rig.consumed);
      expect(rig.actor.root.parent).toBeNull();
      expect(rig.supplies.recordFor(itemId)!.root.visible).toBe(false);
    } finally {
      rig.dispose();
    }
  });

  it.each([['shotgun', 'shotgun-fire']] as const)('restores usable %s after previewing %s', async (itemId, context) => {
    const rig = setup(itemId, context);
    try {
      const use = rig.play();
      rig.controller.update(eventItemUseDurationForItem(context, itemId));
      await use;
      const recovery = rig.controller.recover();
      rig.controller.update(100);
      await recovery;
      expect(rig.actor.root.parent).toBeNull();
      expect(rig.supplies.recordFor(itemId)!.root.visible).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  it.each(['throw-target', 'trade-handover'] as const)(
    'releases consumed items that leave through %s', async (context) => {
      const rig = setup('medicalKit', context);
      try {
        const use = rig.play();
        rig.controller.update(eventItemUseDurationForItem(context, 'medicalKit'));
        await use;
        rig.supplies.sync(rig.consumed);
        const reaction = rig.controller.react(rig.result);
        rig.controller.update(100);
        await reaction;
        expect(rig.actor.root.parent).toBeNull();
        expect(rig.supplies.recordFor('medicalKit')!.root.visible).toBe(false);
      } finally {
        rig.dispose();
      }
    },
  );
});
