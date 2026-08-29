// Importance: 10/10 (scaled from 5/5). Protects survival item state.
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import { eligibleFishingCatches } from '../src/survival/fishingCatalog';
import { SurvivalInventoryState } from '../src/survival/inventory';
import { SurvivalSession } from '../src/survival/SurvivalSession';
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
  it('keeps Carlitos out of the session inventory', () => {
    const session = new SurvivalSession(saved('carlitos', 'cannedFood'), { seed: 1 });

    expect(session.snapshot().inventory).not.toHaveProperty('carlitos-1');
    expect(session.snapshot().inventory).toHaveProperty('cannedFood-1');
  });

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

  it('gains an absent item and reuses a consumed or lost stable slot', () => {
    const inventory = new SurvivalInventoryState([]);
    expect(inventory.gain('energyBar')).toBe('energyBar-1');
    inventory.consume('energyBar');
    expect(inventory.gain('energyBar')).toBe('energyBar-1');
    expect(inventory.snapshot()['energyBar-1']?.condition).toBe('usable');
  });

  it('does not gain over a usable or broken item', () => {
    const inventory = new SurvivalInventoryState(saved('bucket'));
    expect(inventory.gain('bucket')).toBeNull();
    inventory.break('bucket-1');
    expect(inventory.gain('bucket')).toBeNull();
  });

  it('gains a unique item directly in its declared condition', () => {
    const inventory = new SurvivalInventoryState([]);
    expect(inventory.gain('compass', 'broken')).toBe('compass-1');
    expect(inventory.snapshot()['compass-1']).toEqual({
      instanceId: 'compass-1', type: 'compass', condition: 'broken',
    });
    expect(inventory.gain('compass', 'usable')).toBeNull();
  });

  it('reuses consumed or lost unique slots without duplicating them', () => {
    const inventory = new SurvivalInventoryState(saved('ductTape', 'fishingNet'));
    inventory.consume('ductTape');
    inventory.lose('fishingNet-1');
    expect(inventory.gain('ductTape', 'usable')).toBe('ductTape-1');
    expect(inventory.gain('fishingNet', 'broken')).toBe('fishingNet-1');
    expect(Object.values(inventory.snapshot()).filter((item) => item?.type === 'fishingNet')).toHaveLength(1);
  });

  it('restores unique fishing eligibility only after loss or consumption', () => {
    const inventory = new SurvivalInventoryState(saved('compass', 'ductTape'));
    const activeIds = () => new Set(
      Object.values(inventory.snapshot())
        .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
        .map((item) => item!.type),
    );
    expect(eligibleFishingCatches(3, false, activeIds()).map(({ catch: entry }) => entry.id))
      .not.toEqual(expect.arrayContaining(['brokenCompass', 'wetDuctTape']));
    inventory.lose('compass-1');
    inventory.consume('ductTape');
    expect(eligibleFishingCatches(3, false, activeIds()).map(({ catch: entry }) => entry.id))
      .toEqual(expect.arrayContaining(['brokenCompass', 'wetDuctTape']));
  });

  it('keeps the wiki event-breakable roster stable', () => {
    expect(
      ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].breakable),
    ).toEqual([
      'compass', 'map', 'spyglass', 'fishingNet', 'knife', 'bucket',
      'scubaSet', 'anchor', 'umbrella', 'swimRing',
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
    const inventory = new SurvivalInventoryState(saved(
      'compass', 'flashlight', 'ductTape', 'carlitos',
    ));
    expect(inventory.break('compass-1')).toBe(true);
    expect(inventory.repair('compass-1')).toBe(true);
    expect(inventory.break('flashlight-1')).toBe(false);
    expect(inventory.break('carlitos-1')).toBe(false);
    expect(inventory.consume('carlitos')).toEqual([]);
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
    expect(SURVIVAL_BALANCE.start).toEqual({ health: 100, hunger: 0, energy: 3, hull: 100 });
    expect(SURVIVAL_BALANCE.dawn.normalEnergy).toBe(3);
    expect(SURVIVAL_BALANCE.actions.maximumEnergy).toBe(3);
    expect(SURVIVAL_BALANCE.actions.maximumStoredEnergy).toBe(4);
    expect(SURVIVAL_BALANCE.dawn.hungerIncrease).toBe(18);
    expect(SURVIVAL_BALANCE.rescue.firstEffectiveDay).toBe(33);
  });
});
