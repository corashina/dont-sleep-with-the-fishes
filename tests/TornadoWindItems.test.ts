// Importance: 95/100. Tornado must visibly carry away only the selected item, without a reward.
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import { BoatWorld } from '../src/survival/BoatWorld';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  eventItemUseDuration, WIND_ITEM_FLIGHT_DURATION,
} from '../src/survival/eventItemUseChoreography';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';

describe.each(['map', 'umbrella'] as const)('Tornado %s', (itemType) => {
  const firstId = `${itemType}-1` as const;
  const selectedId = `${itemType}-2` as const;
  const items: ItemInstance[] = [
    { instanceId: firstId, type: itemType },
    { instanceId: selectedId, type: itemType },
  ];

  function session(roll = 0) {
    return new SurvivalSession(items, {
      seed: 1, initialEventId: 'tornado', random: { next: () => roll },
    });
  }

  function use(game: SurvivalSession) {
    return game.resolveEvent({ kind: 'item', choiceId: itemType, instanceId: selectedId });
  }

  it.each([0, 0.49, 0.5, 0.999])('loses only the selected item without food, roll %s', (roll) => {
    const game = session(roll);
    const food = game.snapshot().food;
    expect(use(game).accepted).toBe(true);
    expect(game.snapshot().inventory[selectedId]?.condition).toBe('lost');
    expect(game.snapshot().inventory[firstId]?.condition).toBe('usable');
    expect(game.snapshot().food).toBe(food);
    game.beginDawn();
    expect(game.snapshot().inventory[selectedId]?.condition).toBe('lost');
  });

  it('holds the item, then completes the shared wind flight before removing its actor', async () => {
    const game = session();
    const models = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(camera, models, ...createTestSkyTextures(), items);
    try {
      world.syncInventory(game.snapshot());
      world.stageEvent('tornado');
      world.setPresentationWeather('wind');
      world.setEventSelectedItem(selectedId);
      const useAnimation = world.playEventItemUse('tornado', itemType, selectedId);
      const duration = eventItemUseDuration(itemType === 'map' ? 'map-wind' : 'umbrella-overhead');
      world.update(duration, duration);
      await useAnimation;
      const actor = world.scene.getObjectByName(`boat-supply-event:${selectedId}`)!;
      expect(actor).toBeDefined();
      const held = actor.getWorldPosition(new Vector3());
      const outcome = use(game);
      expect(outcome.accepted).toBe(true);
      world.syncInventory(game.snapshot());
      const presentation: EventOutcomePresentation = {
        outcome, resourceDeltas: {}, gainedInstanceIds: [], brokenInstanceIds: [],
        lostInstanceIds: [selectedId], consumedInstanceIds: [], selectedInstanceId: selectedId,
        selectedCondition: 'lost', targetInstanceId: null,
      };
      let finished = false;
      const reaction = world.reactToEventOutcome('tornado', outcome, {
        choiceId: itemType, instanceId: selectedId, condition: 'lost',
      }, presentation).then(() => { finished = true; });
      expect(actor.getWorldPosition(new Vector3()).distanceTo(held)).toBeLessThan(1e-6);
      const flightTime = WIND_ITEM_FLIGHT_DURATION - 0.1;
      world.update(duration + flightTime, flightTime);
      await Promise.resolve();
      expect(finished).toBe(false);
      expect(actor.visible).toBe(true);
      expect(actor.parent).not.toBeNull();
      expect(actor.getWorldPosition(new Vector3()).distanceTo(held)).toBeGreaterThan(25);
      world.update(duration + WIND_ITEM_FLIGHT_DURATION + 0.1, 0.2);
      await reaction;
      expect(actor.parent).toBeNull();
      world.clearEvent();
      game.beginDawn();
      world.syncInventory(game.snapshot());
      expect(world.scene.getObjectByName(`boat-supply-event:${selectedId}`)).toBeUndefined();
      expect(game.snapshot().inventory[firstId]?.condition).toBe('usable');
    } finally {
      world.dispose();
      models.dispose();
    }
  });
});
