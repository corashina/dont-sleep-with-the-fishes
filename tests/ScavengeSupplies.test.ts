import { expect, it } from 'vitest';
import { createScavengeItemInstances } from '../src/game/scavengeCatalog';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { mulberry32 } from '../src/survival/random';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { assignShipItems } from '../src/world/ShipItemPlacement';
import { createShipRouteMetric } from '../src/world/ShipNavigation';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import { createTestShip } from './helpers/shipFurniture';

it('places the expanded inventory with clear spacing across 32 random layouts', () => {
  const ship = createTestShip();
  const zone = SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!;
  const context = {
    routeMetric: createShipRouteMetric(SHIP_LAYOUT),
    deposit: [(zone.bounds.minX + zone.bounds.maxX) / 2,
      (zone.bounds.minZ + zone.bounds.maxZ) / 2] as const,
  };
  const items = createScavengeItemInstances();
  try {
    for (let seed = 0; seed < 32; seed += 1) {
      const random = mulberry32(seed);
      const placements = assignShipItems(items, ship.itemSurfaces, () => random.next(), ship.colliders, context);
      expect(placements.size, `seed ${seed}`).toBe(28);
      const positions = [...placements.values()].map(({ position }) => position);
      positions.forEach((position, index) => {
        for (const other of positions.slice(index + 1)) {
          expect(Math.hypot(position.x - other.x, position.z - other.z)).toBeGreaterThanOrEqual(1.25 - 1e-6);
        }
      });
    }
  } finally {
    ship.dispose();
  }
}, 30_000);

it('collects all seven food cans and four bait tins and saves them for survival', () => {
  const scavenge = new ScavengeSession();
  scavenge.start();
  const supplies = createScavengeItemInstances().filter(({ type }) => type === 'cannedFood' || type === 'baitTin');
  for (const item of supplies) {
    expect(scavenge.pickUp(item.instanceId)).toBe(true);
    scavenge.saveCarriedBundle();
  }
  scavenge.tick(60, true);
  const survival = new SurvivalSession(scavenge.result()!.savedItems, { seed: 1 });
  expect(survival.snapshot()).toMatchObject({ food: 7, bait: 4 });
  const checkpoint = { scavengeElapsedSeconds: 0, session: survival.exportCheckpoint() };
  expect(parseSurvivalSaveDocument(createSurvivalSaveDocument(checkpoint))).not.toBeNull();
});
