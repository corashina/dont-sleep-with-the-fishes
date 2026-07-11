import { describe, expect, it } from 'vitest';
import { createSurvivalInventory } from '../src/survival/inventory';
import { mulberry32, sequenceRandom } from '../src/survival/random';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';

describe('survival foundations', () => {
  it('maps only saved items to their documented charges', () => {
    const inventory = createSurvivalInventory(['flareGun', 'baitTin', 'medicalKit', 'flashlight']);
    expect(inventory.flareGun).toEqual({ owned: true, charges: 1, durable: false });
    expect(inventory.baitTin).toEqual({ owned: true, charges: 3, durable: false });
    expect(inventory.medicalKit).toEqual({ owned: true, charges: 2, durable: false });
    expect(inventory.flashlight).toEqual({ owned: true, charges: null, durable: true });
    expect(inventory.fishingRod.owned).toBe(false);
    expect(inventory.cannedFood.charges).toBe(0);
  });

  it('deduplicates copied saved item IDs', () => {
    const inventory = createSurvivalInventory(['waterJug', 'waterJug']);
    expect(inventory.waterJug.charges).toBe(3);
  });

  it('produces repeatable seeded values and clamped test sequences', () => {
    const first = mulberry32(421);
    const second = mulberry32(421);
    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(), second.next(), second.next(),
    ]);
    const fixed = sequenceRandom([-1, 0.4, 2]);
    expect([fixed.next(), fixed.next(), fixed.next(), fixed.next()]).toEqual([0, 0.4, 0.999999, 0]);
  });

  it('exposes the approved starting balance', () => {
    expect(SURVIVAL_BALANCE.start).toEqual({ health: 100, hunger: 20, energy: 4, hull: 75 });
    expect(SURVIVAL_BALANCE.dawn.hungerIncrease).toBe(18);
    expect(SURVIVAL_BALANCE.rescue.firstDay).toBe(5);
  });
});
