// Importance: 95/100. Feeding must take one can without hiding the remaining food pile.
import { PerspectiveCamera } from 'three';
import { expect, it } from 'vitest';
import { BoatWorld } from '../src/survival/BoatWorld';
import { CARLITOS_FEED_DURATION } from '../src/survival/CarlitosPresentation';
import { FOOD_SUPPLY_ACTOR_ID } from '../src/survival/resourceSupplyActors';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';

it.each([1, 3])('takes one can from a pile of %s while feeding', async (food) => {
  const items = [{ type: 'carlitos', instanceId: 'carlitos-1' }] as const;
  const session = new SurvivalSession(items, {
    seed: 1, initial: { food }, initialCarlitos: { hunger: 3 },
  });
  const models = createTestPropModels();
  const world = new BoatWorld(new PerspectiveCamera(), models, ...createTestSkyTextures(), items);
  try {
    world.syncInventory(session.snapshot());
    const pile = world.scene.getObjectByName('boat-supply:cannedFood')!;
    const positions = pile.children.slice(0, food - 1).map((can) => can.position.toArray());
    expect(session.perform('feedCarlitos')).toMatchObject({ accepted: true, deltas: { food: -1 } });
    const feed = world.playCarlitosAction('feedCarlitos');
    world.update(0, 1);
    await Promise.resolve();
    const thrown = world.scene.getObjectByName('boat-supply-event:' + FOOD_SUPPLY_ACTOR_ID)!;
    expect(thrown.visible).toBe(true);
    for (let frame = 1; frame <= 9; frame += 1) {
      world.update(frame * CARLITOS_FEED_DURATION / 10, CARLITOS_FEED_DURATION / 10);
      if (food > 1) expect(pile.visible).toBe(true);
      expect(pile.children.filter((can) => can.visible)).toHaveLength(food - 1);
      expect(pile.children.slice(0, food - 1).map((can) => can.position.toArray())).toEqual(positions);
    }
    world.update(CARLITOS_FEED_DURATION * 1.1, CARLITOS_FEED_DURATION * 0.2);
    await feed;
    world.syncInventory(session.snapshot());
    expect(thrown.parent).toBeNull();
    expect(session.snapshot().food).toBe(food - 1);
    expect(pile.visible).toBe(food > 1);
    expect(pile.children.filter((can) => can.visible)).toHaveLength(food - 1);
  } finally {
    world.dispose();
    models.dispose();
  }
});
