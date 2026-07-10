import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { ITEM_IDS } from '../src/game/ItemState';
import { createLifeboat } from '../src/world/Lifeboat';
import { createProp } from '../src/world/PropFactory';
import { createShip } from '../src/world/Ship';

describe('procedural world builders', () => {
  it.each(ITEM_IDS)('builds a visible mesh for %s', (id) => {
    const prop = createProp(id);
    let meshCount = 0;
    prop.traverse((object) => {
      if (object instanceof Mesh) meshCount += 1;
    });
    expect(prop.userData.itemId).toBe(id);
    expect(meshCount).toBeGreaterThan(0);
  });

  it('builds the two-zone ship contract', () => {
    const ship = createShip();
    expect(ship.itemSpawnPoints).toHaveLength(8);
    expect(ship.colliders.length).toBeGreaterThanOrEqual(10);
    expect(ship.playerStart.y).toBeGreaterThan(2);
    expect(ship.evacuationPoint.x).toBeGreaterThan(3);
  });

  it('builds exactly five lifeboat supply slots', () => {
    const lifeboat = createLifeboat();
    expect(lifeboat.slots).toHaveLength(5);
    expect(lifeboat.acceptanceBox.min.y).toBeLessThan(lifeboat.acceptanceBox.max.y);
  });
});
