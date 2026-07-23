import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type {
  ItemCondition,
  RandomSource,
  SurvivalInventorySnapshot,
  SurvivalItemState,
} from './survivalTypes';

export class SurvivalInventoryState {
  private readonly items = new Map<ItemInstanceId, SurvivalItemState>();

  constructor(savedItems: readonly ItemInstance[]) {
    for (const item of savedItems) {
      this.items.set(item.instanceId, { ...item, condition: 'usable' });
    }
  }

  hasUsable(type: ItemId): boolean {
    return this.count(type, 'usable') > 0;
  }

  count(type: ItemId, condition?: ItemCondition): number {
    let count = 0;
    for (const item of this.items.values()) {
      if (item.type === type && (condition === undefined || item.condition === condition)) count += 1;
    }
    return count;
  }

  consume(
    type: ItemId,
    quantity = 1,
    excludedInstanceIds: ReadonlySet<ItemInstanceId> = new Set(),
  ): ItemInstanceId[] {
    if (ITEM_DEFINITIONS[type]?.charges == null) return [];
    const candidates = this.candidates((item) => (
      item.type === type
      && item.condition === 'usable'
      && !excludedInstanceIds.has(item.instanceId)
    ));
    const consumed = candidates.slice(0, this.quantity(quantity, candidates.length));
    for (const instanceId of consumed) this.setCondition(instanceId, 'consumed');
    return consumed;
  }

  consumeInstance(instanceId: ItemInstanceId): boolean {
    const item = this.items.get(instanceId);
    if (item === undefined || item.condition !== 'usable' || ITEM_DEFINITIONS[item.type].charges === null) {
      return false;
    }
    this.setCondition(instanceId, 'consumed');
    return true;
  }

  consumePreferred(
    type: ItemId,
    quantity = 1,
    preferredInstanceId: ItemInstanceId | null = null,
    excludedInstanceIds: ReadonlySet<ItemInstanceId> = new Set(),
  ): ItemInstanceId[] {
    const consumed: ItemInstanceId[] = [];
    const preferred = preferredInstanceId === null ? undefined : this.items.get(preferredInstanceId);
    if (
      quantity > 0
      && preferred?.type === type
      && !excludedInstanceIds.has(preferredInstanceId!)
      && this.consumeInstance(preferredInstanceId!)
    ) {
      consumed.push(preferredInstanceId!);
    }
    if (consumed.length >= quantity) return consumed;

    const exclusions = new Set(excludedInstanceIds);
    for (const instanceId of consumed) exclusions.add(instanceId);
    consumed.push(...this.consume(type, quantity - consumed.length, exclusions));
    return consumed;
  }

  break(instanceId: ItemInstanceId): boolean {
    const item = this.items.get(instanceId);
    if (item === undefined || item.condition !== 'usable' || !ITEM_DEFINITIONS[item.type]?.breakable) {
      return false;
    }
    this.setCondition(instanceId, 'broken');
    return true;
  }

  lose(instanceId: ItemInstanceId): boolean {
    const item = this.items.get(instanceId);
    if (item === undefined || (item.condition !== 'usable' && item.condition !== 'broken')) return false;
    this.setCondition(instanceId, 'lost');
    return true;
  }

  repair(instanceId: ItemInstanceId): boolean {
    const item = this.items.get(instanceId);
    if (item === undefined || item.condition !== 'broken') return false;
    this.setCondition(instanceId, 'usable');
    return true;
  }

  breakRandom(
    quantity: number,
    random: RandomSource,
    excludedInstanceIds: ReadonlySet<ItemInstanceId> = new Set(),
  ): ItemInstanceId[] {
    return this.mutateRandom(
      quantity,
      random,
      (item) => (
        item.condition === 'usable'
        && ITEM_DEFINITIONS[item.type]?.breakable === true
        && !excludedInstanceIds.has(item.instanceId)
      ),
      (instanceId) => this.break(instanceId),
    );
  }

  loseRandom(
    quantity: number,
    random: RandomSource,
    excludedInstanceIds: ReadonlySet<ItemInstanceId> = new Set(),
  ): ItemInstanceId[] {
    return this.mutateRandom(
      quantity,
      random,
      (item) => (
        (item.condition === 'usable' || item.condition === 'broken')
        && !excludedInstanceIds.has(item.instanceId)
      ),
      (instanceId) => this.lose(instanceId),
    );
  }

  snapshot(): SurvivalInventorySnapshot {
    const snapshot = Object.fromEntries(Array.from(this.items, ([instanceId, item]) => [
      instanceId,
      Object.freeze({ ...item }),
    ])) as Partial<Record<ItemInstanceId, Readonly<SurvivalItemState>>>;
    return Object.freeze(snapshot);
  }

  private candidates(predicate: (item: SurvivalItemState) => boolean): ItemInstanceId[] {
    return Array.from(this.items.values())
      .filter(predicate)
      .map(({ instanceId }) => instanceId)
      .sort();
  }

  private mutateRandom(
    quantity: number,
    random: RandomSource,
    predicate: (item: SurvivalItemState) => boolean,
    mutate: (instanceId: ItemInstanceId) => boolean,
  ): ItemInstanceId[] {
    const candidates = this.candidates(predicate);
    const selected: ItemInstanceId[] = [];
    const limit = this.quantity(quantity, candidates.length);
    while (selected.length < limit) {
      const roll = random.next();
      const index = Number.isFinite(roll)
        ? Math.min(candidates.length - 1, Math.max(0, Math.floor(roll * candidates.length)))
        : 0;
      const [instanceId] = candidates.splice(index, 1);
      if (instanceId !== undefined && mutate(instanceId)) selected.push(instanceId);
    }
    return selected;
  }

  private quantity(requested: number, available: number): number {
    if (Number.isNaN(requested) || requested <= 0) return 0;
    return Math.min(Math.floor(requested), available);
  }

  private setCondition(instanceId: ItemInstanceId, condition: ItemCondition): void {
    const item = this.items.get(instanceId);
    if (item !== undefined) this.items.set(instanceId, { ...item, condition });
  }
}
