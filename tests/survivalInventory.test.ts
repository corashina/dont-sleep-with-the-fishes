import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import {
  applyInventoryMutation,
  createSurvivalInventory,
  usableInstances,
} from '../src/survival/inventory';
import { mulberry32, sequenceRandom } from '../src/survival/random';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';

const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

describe('survival foundations', () => {
  it('maps only saved items to their documented charges', () => {
    const inventory = createSurvivalInventory(saved('flareGun', 'baitTin', 'medicalKit', 'flashlight'));
    expect(inventory.flareGun).toMatchObject({ owned: true, charges: 1, durable: false });
    expect(inventory.baitTin).toMatchObject({ owned: true, charges: 3, durable: false });
    expect(inventory.medicalKit).toMatchObject({ owned: true, charges: 2, durable: false });
    expect(inventory.flashlight).toMatchObject({ owned: true, charges: null, durable: true });
    expect(inventory.fishingRod.owned).toBe(false);
    expect(inventory.cannedFood.charges).toBe(0);
  });

  it('adds charges for duplicate instances and one food per can', () => {
    const inventory = createSurvivalInventory(saved('waterJug', 'waterJug', 'cannedFood', 'cannedFood'));
    expect(inventory.waterJug.charges).toBe(6);
    expect(inventory.cannedFood.charges).toBe(2);
  });

  it('tracks duplicate instances independently through break, repair, loss, and consumption', () => {
    const inventory = createSurvivalInventory(saved('fishingNet', 'fishingNet', 'ductTape'));
    const [first, second] = usableInstances(inventory, 'fishingNet');
    applyInventoryMutation(inventory, {
      kind: 'break', itemId: 'fishingNet', instanceId: first!.instanceId, quantity: 1,
    });
    expect(usableInstances(inventory, 'fishingNet').map(({ instanceId }) => instanceId)).toEqual([
      second!.instanceId,
    ]);
    applyInventoryMutation(inventory, {
      kind: 'repair', itemId: 'fishingNet', instanceId: first!.instanceId, quantity: 1,
    });
    expect(usableInstances(inventory, 'fishingNet')).toHaveLength(2);
    applyInventoryMutation(inventory, {
      kind: 'lose', itemId: 'fishingNet', instanceId: second!.instanceId, quantity: 1,
    });
    applyInventoryMutation(inventory, { kind: 'consume', itemId: 'ductTape', quantity: 1 });
    expect(inventory.fishingNet.instances.map(({ condition }) => condition)).toEqual(['usable', 'lost']);
    expect(inventory.ductTape.instances[0]!.condition).toBe('consumed');
  });

  it('uses the oldest eligible instance, aggregates remaining charges, and gives gains stable IDs', () => {
    const inventory = createSurvivalInventory(saved('waterJug', 'waterJug'));

    applyInventoryMutation(inventory, { kind: 'consume', itemId: 'waterJug', quantity: 4 });
    expect(inventory.waterJug.instances.map(({ condition, charges }) => ({ condition, charges }))).toEqual([
      { condition: 'consumed', charges: 0 },
      { condition: 'usable', charges: 2 },
    ]);
    expect(inventory.waterJug).toMatchObject({ owned: true, charges: 2, durable: false });

    applyInventoryMutation(inventory, { kind: 'gain', itemId: 'waterJug', quantity: 2 });
    expect(inventory.waterJug.instances.map(({ instanceId }) => instanceId)).toEqual([
      'waterJug-1', 'waterJug-2', 'waterJug-3', 'waterJug-4',
    ]);
    expect(inventory.waterJug.charges).toBe(8);
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
