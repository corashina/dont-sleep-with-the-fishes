import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
  type ItemStatus,
} from './ItemState';
import { createScavengeItemInstances } from './scavengeCatalog';
import { SCAVENGE_DURATION_SECONDS } from './scavengeRules';
import type { ScavengeReading } from './runStatistics';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'success' | 'failure';

export interface ScavengeItemState extends ItemInstance {
  status: ItemStatus;
}

export interface ScavengeSnapshot {
  readonly pickupHistory: readonly ScavengeReading[];
  status: SessionStatus;
  remainingSeconds: number;
  savedCount: number;
  carriedWeight: number;
  carriedItems: readonly ItemInstance[];
  items: Readonly<Record<ItemInstanceId, ScavengeItemState>>;
  /** @deprecated Transitional type-keyed UI compatibility. */
  carriedItem: ItemId | null;
}

export interface ScavengeResult {
  savedItems: readonly ItemInstance[];
  elapsedSeconds: number;
}

const CARRY_CAPACITY = 3;

export class ScavengeSession {
  private status: SessionStatus = 'idle';
  private remainingSeconds = SCAVENGE_DURATION_SECONDS;
  private readonly items: Record<ItemInstanceId, ScavengeItemState>;
  private readonly carriedIds: ItemInstanceId[] = [];
  private savedCount = 0;
  private pickupHistory: readonly ScavengeReading[] = Object.freeze([
    Object.freeze({ seconds: 0, savedCount: 0 }),
  ]);
  private snapshotRevision = 0;
  private cachedSnapshotRevision = -1;
  private cachedSnapshot: Readonly<ScavengeSnapshot> | null = null;
  private cachedItems: ScavengeSnapshot['items'] | null = null;
  private cachedCarriedItems: readonly ItemInstance[] = Object.freeze([]);

  constructor(instances: readonly ItemInstance[] = createScavengeItemInstances()) {
    this.items = Object.fromEntries(instances.map((item) => [
      item.instanceId,
      { ...item, status: 'available' as const },
    ])) as Record<ItemInstanceId, ScavengeItemState>;
  }

  get carriedWeight(): number {
    return this.carriedIds.reduce(
      (sum, id) => sum + ITEM_DEFINITIONS[this.items[id]!.type].weight,
      0,
    );
  }

  start(): void {
    if (this.status === 'idle') {
      this.status = 'running';
      this.changed();
    }
  }

  tick(deltaSeconds: number, evacuateAtDeadline = false): void {
    if (this.status !== 'running') return;
    const remainingSeconds = Math.max(0, this.remainingSeconds - Math.max(0, deltaSeconds));
    if (remainingSeconds !== this.remainingSeconds) {
      this.remainingSeconds = remainingSeconds;
      this.changed();
    }
    if (this.remainingSeconds === 0) {
      this.finish(evacuateAtDeadline ? 'success' : 'failure');
    }
  }

  penalize(seconds: number): void {
    if (this.status !== 'running') return;
    const remainingSeconds = Math.max(0, this.remainingSeconds - Math.max(0, seconds));
    if (remainingSeconds !== this.remainingSeconds) {
      this.remainingSeconds = remainingSeconds;
      this.changed();
    }
    if (this.remainingSeconds === 0) this.finish('failure');
  }

  pause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
      this.changed();
    }
  }

  resume(): void {
    if (this.status === 'paused') {
      this.status = 'running';
      this.changed();
    }
  }

  pickUp(instanceId: ItemInstanceId): boolean;
  /** @deprecated Transitional type-keyed world compatibility. */
  pickUp(type: ItemId): boolean;
  pickUp(id: ItemInstanceId | ItemId): boolean {
    const instanceId = this.resolveAvailableId(id);
    const item = instanceId === null ? undefined : this.items[instanceId];
    if (this.status !== 'running' || !item || item.status !== 'available') return false;
    if (this.carriedWeight + ITEM_DEFINITIONS[item.type].weight > CARRY_CAPACITY) return false;
    item.status = 'carried';
    this.carriedIds.push(item.instanceId);
    this.changed(true);
    return true;
  }

  dropCarried(): ItemInstance | null {
    return this.releaseCarried('available');
  }

  saveCarried(): ItemInstance | null {
    return this.releaseCarried('saved');
  }

  saveCarriedBundle(): readonly Readonly<ItemInstance>[] | null {
    if (this.status !== 'running' || this.carriedIds.length === 0) return null;
    const instanceIds = this.carriedIds.splice(0);
    instanceIds.forEach((instanceId) => {
      this.items[instanceId]!.status = 'saved';
    });
    this.savedCount += instanceIds.length;
    this.changed(true);
    return Object.freeze(instanceIds.map((instanceId) => this.cloneInstance(instanceId)));
  }

  loseCarried(): ItemInstance | null {
    return this.releaseCarried('lost');
  }

  lose(instanceId: ItemInstanceId): boolean;
  /** @deprecated Transitional type-keyed world compatibility. */
  lose(type: ItemId): boolean;
  lose(id: ItemInstanceId | ItemId): boolean {
    if (this.status !== 'running') return false;
    const instanceId = this.resolveMutableId(id);
    if (instanceId === null) return false;
    const item = this.items[instanceId]!;
    if (item.status === 'saved' || item.status === 'lost') return false;
    const carriedIndex = this.carriedIds.lastIndexOf(instanceId);
    if (carriedIndex >= 0) this.carriedIds.splice(carriedIndex, 1);
    item.status = 'lost';
    this.changed(true);
    return true;
  }

  evacuate(): boolean {
    return this.status === 'running' && this.finish('success');
  }

  snapshot(): ScavengeSnapshot {
    if (
      this.cachedSnapshot !== null
      && this.cachedSnapshotRevision === this.snapshotRevision
    ) return this.cachedSnapshot;

    if (this.cachedItems === null) {
      this.cachedItems = Object.freeze(Object.fromEntries(Object.values(this.items).map((item) => [
        item.instanceId,
        Object.freeze({ ...item }),
      ])) as Record<ItemInstanceId, ScavengeItemState>);
      this.cachedCarriedItems = Object.freeze(this.carriedIds.map((id) => this.cloneInstance(id)));
    }
    const carriedItems = this.cachedCarriedItems;
    const carriedItem = carriedItems.at(-1)?.type ?? null;
    this.cachedSnapshot = Object.freeze({
      pickupHistory: this.pickupHistory,
      status: this.status,
      remainingSeconds: this.remainingSeconds,
      savedCount: this.savedCount,
      carriedWeight: this.carriedWeight,
      carriedItems,
      items: this.cachedItems,
      carriedItem,
    });
    this.cachedSnapshotRevision = this.snapshotRevision;
    return this.cachedSnapshot;
  }

  result(): Readonly<ScavengeResult> | null {
    if (this.status !== 'success') return null;
    const savedItems = Object.values(this.items)
      .filter((item) => item.status === 'saved')
      .map((item) => Object.freeze({ instanceId: item.instanceId, type: item.type }));
    return Object.freeze({
      savedItems: Object.freeze(savedItems),
      elapsedSeconds: SCAVENGE_DURATION_SECONDS - this.remainingSeconds,
    });
  }

  private releaseCarried(status: ItemStatus): ItemInstance | null {
    if (this.status !== 'running') return null;
    const instanceId = this.carriedIds.pop();
    if (instanceId === undefined) return null;
    this.items[instanceId]!.status = status;
    if (status === 'saved') this.savedCount += 1;
    this.changed(true);
    return this.cloneInstance(instanceId);
  }

  private cloneInstance(instanceId: ItemInstanceId): Readonly<ItemInstance> {
    const { type } = this.items[instanceId]!;
    return Object.freeze({ instanceId, type });
  }

  private resolveAvailableId(id: ItemInstanceId | ItemId): ItemInstanceId | null {
    if (id in this.items) return id as ItemInstanceId;
    return Object.values(this.items).find((item) => (
      item.type === id && item.status === 'available'
    ))?.instanceId ?? null;
  }

  private resolveMutableId(id: ItemInstanceId | ItemId): ItemInstanceId | null {
    if (id in this.items) return id as ItemInstanceId;
    return [...this.carriedIds].reverse().find((instanceId) => this.items[instanceId]!.type === id)
      ?? Object.values(this.items).find((item) => (
        item.type === id && item.status === 'available'
      ))?.instanceId
      ?? null;
  }

  private finish(status: 'success' | 'failure'): boolean {
    if (this.status === 'success' || this.status === 'failure') return false;
    this.status = status;
    this.recordPickups();
    this.changed();
    return true;
  }

  private changed(inventoryChanged = false): void {
    if (inventoryChanged) this.cachedItems = null;
    if (this.pickupHistory.at(-1)!.savedCount !== this.savedCount) this.recordPickups();
    this.snapshotRevision += 1;
  }

  private recordPickups(): void {
    this.pickupHistory = Object.freeze([...this.pickupHistory, Object.freeze({
      seconds: SCAVENGE_DURATION_SECONDS - this.remainingSeconds,
      savedCount: this.savedCount,
    })]);
  }
}
