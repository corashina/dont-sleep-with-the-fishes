import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { applyInventoryMutation } from '../src/survival/inventory';
import { sequenceRandom } from '../src/survival/random';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { ITEM_USE_ENERGY_COST, type RandomSource, type SurvivalInventory } from '../src/survival/survivalTypes';

const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

function mutableInventory(session: SurvivalSession): SurvivalInventory {
  return (session as unknown as { inventory: SurvivalInventory }).inventory;
}

describe('wiki item actions', () => {
  it.each([
    [2, 2],
    [0, 4],
    [6, -2],
  ])('sets energy from %i to four and consumes the energy bar', (energy, applied) => {
    const session = new SurvivalSession(saved('energyBar'), { seed: 1, initial: { energy } });

    expect(session.useItem('energyBar')).toMatchObject({
      accepted: true,
      code: 'energy-bar-used',
      deltas: { energy: applied },
    });
    expect(session.snapshot().inventory.energyBar).toMatchObject({ owned: false, charges: 0 });
  });

  it('consumes duct tape to repair only the selected broken instance', () => {
    const session = new SurvivalSession(saved('ductTape', 'fishingNet', 'fishingNet'), { seed: 1 });
    const inventory = mutableInventory(session);
    for (const instance of inventory.fishingNet.instances) {
      applyInventoryMutation(inventory, {
        kind: 'break', itemId: 'fishingNet', quantity: 1, instanceId: instance.instanceId,
      });
    }
    const [first, selected] = inventory.fishingNet.instances;

    expect(session.useItem('ductTape', selected!.instanceId)).toMatchObject({
      accepted: true,
      code: 'item-repaired',
    });
    expect(session.snapshot().inventory.fishingNet.instances.map(({ instanceId, condition }) => (
      { instanceId, condition }
    ))).toEqual([
      { instanceId: first!.instanceId, condition: 'broken' },
      { instanceId: selected!.instanceId, condition: 'usable' },
    ]);
    expect(session.snapshot().inventory.ductTape).toMatchObject({ owned: false, charges: 0 });
  });

  it('rejects a missing or non-broken repair target without consuming duct tape', () => {
    const session = new SurvivalSession(saved('ductTape', 'fishingNet'), { seed: 1 });
    const before = session.snapshot();

    expect(session.availableItemReason('ductTape')).toMatch(/choose.*broken/i);
    expect(session.useItem('ductTape')).toMatchObject({ accepted: false, code: 'repair-target-required' });
    expect(session.useItem('ductTape', 'fishingNet-1')).toMatchObject({
      accepted: false,
      code: 'repair-target-unavailable',
    });
    expect(session.snapshot()).toEqual(before);
  });

  it('uses the built-in repair kit for the preserved boat repair action', () => {
    const session = new SurvivalSession(saved(), { seed: 1, initial: { hull: 50, energy: 4 } });

    expect(session.snapshot().inventory.repairKit.instances).toHaveLength(0);
    expect(session.availableItemReason('repairKit')).toBeNull();
    expect(session.useItem('repairKit')).toMatchObject({
      accepted: true,
      code: 'repaired',
      deltas: { energy: -2, hull: 25 },
    });
    expect(session.snapshot().inventory.repairKit.instances).toHaveLength(0);
  });

  it('keeps repair-kit energy validation failure-atomic', () => {
    const session = new SurvivalSession(saved(), { seed: 1, initial: { hull: 50, energy: 1 } });
    const before = session.snapshot();

    expect(session.useItem('repairKit')).toMatchObject({ accepted: false, code: 'not-enough-energy' });
    expect(session.snapshot()).toEqual(before);
  });

  it('delegates the numbered repair action to the built-in repair kit', () => {
    const session = new SurvivalSession(saved(), { seed: 1, initial: { hull: 50, energy: 4 } });

    expect(session.availableReason('repair')).toBeNull();
    expect(session.perform('repair')).toMatchObject({
      accepted: true,
      code: 'repaired',
      deltas: { energy: -2, hull: 25 },
    });
  });

  it('uses the preserved medkit healing amount and consumes one charge', () => {
    const session = new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 60 } });

    expect(session.useItem('medicalKit')).toMatchObject({
      accepted: true,
      code: 'treated',
      deltas: { health: 30 },
    });
    expect(session.snapshot().inventory.medicalKit.charges).toBe(1);
  });

  it('exposes fishing and diving through their canonical recovered items', () => {
    expect(new SurvivalSession(saved(), { seed: 1 }).availableItemReason('fishingRod')).toMatch(/recovered fishing rod/i);
    expect(new SurvivalSession(saved(), { seed: 1 }).availableItemReason('scubaSet')).toMatch(/recovered scuba set/i);

    const fishing = new SurvivalSession(saved('fishingRod'), {
      seed: 1,
      random: sequenceRandom([0.99]),
    });
    expect(fishing.useItem('fishingRod')).toMatchObject({
      accepted: true,
      code: 'fish-missed',
      deltas: { energy: -2 },
    });

    const diving = new SurvivalSession(saved('scubaSet'), {
      seed: 1,
      random: sequenceRandom([0.99, 0.99]),
    });
    expect(diving.useItem('scubaSet')).toMatchObject({
      accepted: true,
      code: 'dive-empty',
      deltas: { energy: -3 },
    });
  });

  it('rejects unsupported and unowned direct item use without mutation', () => {
    const session = new SurvivalSession(saved('map'), { seed: 1 });
    const before = session.snapshot();

    expect(session.useItem('map')).toMatchObject({ accepted: false, code: 'item-not-usable' });
    expect(session.useItem('energyBar')).toMatchObject({ accepted: false, code: 'item-unavailable' });
    expect(session.snapshot()).toEqual(before);
  });

  it('previews the chest energy cost but keeps it failure-atomic without a documented pool', () => {
    let randomCalls = 0;
    const random: RandomSource = { next: () => { randomCalls += 1; return 0; } };
    expect(ITEM_USE_ENERGY_COST.chest).toBe(3);

    const tired = new SurvivalSession(saved('chest'), { seed: 1, random, initial: { energy: 2 } });
    const tiredBefore = tired.snapshot();
    expect(tired.availableItemReason('chest')).toMatch(/requires three energy/i);
    expect(tired.useItem('chest')).toMatchObject({ accepted: false, code: 'not-enough-energy' });
    expect(tired.snapshot()).toEqual(tiredBefore);

    const ready = new SurvivalSession(saved('chest'), { seed: 1, random, initial: { energy: 3 } });
    const readyBefore = ready.snapshot();
    expect(ready.availableItemReason('chest')).toMatch(/wiki.*utility pool/i);
    expect(ready.useItem('chest')).toMatchObject({ accepted: false, code: 'chest-pool-undocumented' });
    expect(ready.snapshot()).toEqual(readyBefore);
    expect(randomCalls).toBe(0);
  });
});
