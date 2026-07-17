import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { SurvivalInventoryState } from '../src/survival/inventory';
import { mulberry32 } from '../src/survival/random';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';
import { sequenceRandom } from './helpers/random';

const saved = (...types: ItemId[]): ItemInstance[] => {
  const counts = new Map<ItemId, number>();
  return types.map((type) => {
    const number = (counts.get(type) ?? 0) + 1;
    counts.set(type, number);
    return { instanceId: `${type}-${number}` as ItemInstanceId, type };
  });
};

describe('survival foundations', () => {
  it('creates one usable record per saved physical instance', () => {
    const inventory = new SurvivalInventoryState(saved(
      'cannedFood', 'cannedFood', 'baitTin', 'compass', 'ductTape',
    ));
    expect(Object.values(inventory.snapshot())).toEqual([
      { instanceId: 'cannedFood-1', type: 'cannedFood', condition: 'usable' },
      { instanceId: 'cannedFood-2', type: 'cannedFood', condition: 'usable' },
      { instanceId: 'baitTin-1', type: 'baitTin', condition: 'usable' },
      { instanceId: 'compass-1', type: 'compass', condition: 'usable' },
      { instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' },
    ]);
  });

  it('consumes duplicate resources deterministically by instance number', () => {
    const inventory = new SurvivalInventoryState(saved('cannedFood', 'cannedFood', 'cannedFood'));
    expect(inventory.consume('cannedFood', 2)).toEqual(['cannedFood-1', 'cannedFood-2']);
    expect(inventory.snapshot()['cannedFood-3']?.condition).toBe('usable');
  });

  it('consumes only an exact eligible charged instance', () => {
    const inventory = new SurvivalInventoryState(saved('cannedFood', 'cannedFood', 'compass'));

    expect(inventory.consumeInstance('cannedFood-2')).toBe(true);
    expect(inventory.snapshot()['cannedFood-1']?.condition).toBe('usable');
    expect(inventory.snapshot()['cannedFood-2']?.condition).toBe('consumed');
    expect(inventory.consumeInstance('cannedFood-2')).toBe(false);
    expect(inventory.consumeInstance('cannedFood-3')).toBe(false);
    expect(inventory.consumeInstance('compass-1')).toBe(false);
  });

  it('allows only catalog-approved break and repair transitions', () => {
    const inventory = new SurvivalInventoryState(saved('compass', 'flashlight', 'ductTape'));
    expect(inventory.break('compass-1')).toBe(true);
    expect(inventory.repair('compass-1')).toBe(true);
    expect(inventory.break('flashlight-1')).toBe(false);
    inventory.consume('ductTape');
    expect(inventory.repair('ductTape-1')).toBe(false);
  });

  it('never repairs consumed or lost items', () => {
    const inventory = new SurvivalInventoryState(saved('map', 'energyBar'));
    inventory.lose('map-1');
    inventory.consume('energyBar');
    expect(inventory.repair('map-1')).toBe(false);
    expect(inventory.repair('energyBar-1')).toBe(false);
  });

  it('counts exact conditions and reports only usable ownership', () => {
    const inventory = new SurvivalInventoryState(saved('map', 'cannedFood', 'cannedFood'));
    inventory.break('map-1');
    inventory.consume('cannedFood');

    expect(inventory.hasUsable('map')).toBe(false);
    expect(inventory.hasUsable('cannedFood')).toBe(true);
    expect(inventory.count('cannedFood')).toBe(2);
    expect(inventory.count('cannedFood', 'usable')).toBe(1);
    expect(inventory.count('cannedFood', 'consumed')).toBe(1);
  });

  it('draws sorted random mutation candidates without replacement', () => {
    const inventory = new SurvivalInventoryState(saved(
      'compass', 'map', 'spyglass', 'flashlight', 'energyBar',
    ));

    expect(inventory.breakRandom(2, sequenceRandom([0.999999, 0]))).toEqual([
      'spyglass-1', 'compass-1',
    ]);
    expect(inventory.breakRandom(10, sequenceRandom([0]))).toEqual(['map-1']);
    expect(inventory.loseRandom(2, sequenceRandom([0, 0.999999]))).toEqual([
      'compass-1', 'spyglass-1',
    ]);
    expect(inventory.snapshot()['compass-1']?.condition).toBe('lost');
    expect(inventory.snapshot()['spyglass-1']?.condition).toBe('lost');
  });

  it('returns detached frozen snapshots and rejects ineligible identities', () => {
    const inventory = new SurvivalInventoryState(saved('compass', 'flashlight', 'energyBar'));
    const first = inventory.snapshot();

    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.values(first).every(Object.isFrozen)).toBe(true);
    expect(inventory.break('energyBar-1')).toBe(false);
    expect(inventory.break('compass-2')).toBe(false);
    expect(inventory.lose('flashlight-1')).toBe(true);
    expect(inventory.lose('flashlight-1')).toBe(false);
    expect(inventory.consume('flashlight')).toEqual([]);
    expect(inventory.consume('energyBar', 0)).toEqual([]);
    expect(inventory.snapshot()['flashlight-1']?.condition).toBe('lost');
    expect(inventory.snapshot()['compass-1']).not.toBe(first['compass-1']);
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
    expect(SURVIVAL_BALANCE.start).toEqual({ health: 100, hunger: 20, energy: 3, hull: 75 });
    expect(SURVIVAL_BALANCE.dawn.normalEnergy).toBe(3);
    expect(SURVIVAL_BALANCE.actions.maximumEnergy).toBe(3);
    expect(SURVIVAL_BALANCE.dawn.hungerIncrease).toBe(18);
    expect(SURVIVAL_BALANCE.rescue.firstDay).toBe(5);
  });
});
