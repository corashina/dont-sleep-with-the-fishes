import {
  createItemInstances,
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
  type ItemStatus,
} from './ItemState';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'success' | 'failure';

export interface ScavengeItemState extends ItemInstance {
  status: ItemStatus;
}

export interface ScavengeSnapshot {
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

const RUN_SECONDS = 120;
const CARRY_CAPACITY = 3;

export class ScavengeSession {
  private status: SessionStatus = 'idle';
  private remainingSeconds = RUN_SECONDS;
  private readonly items: Record<ItemInstanceId, ScavengeItemState>;
  private readonly carriedIds: ItemInstanceId[] = [];
  private savedCount = 0;

  constructor(instances: readonly ItemInstance[] = createItemInstances()) {
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
    if (this.status === 'idle') this.status = 'running';
  }

  tick(deltaSeconds: number): void {
    if (this.status !== 'running') return;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - Math.max(0, deltaSeconds));
    if (this.remainingSeconds === 0) this.finish('failure');
  }

  penalize(seconds: number): void {
    if (this.status !== 'running') return;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - Math.max(0, seconds));
    if (this.remainingSeconds === 0) this.finish('failure');
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  resume(): void {
    if (this.status === 'paused') this.status = 'running';
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
    return true;
  }

  evacuate(): boolean {
    return this.status === 'running' && this.finish('success');
  }

  snapshot(): ScavengeSnapshot {
    const items = Object.fromEntries(Object.values(this.items).map((item) => [
      item.instanceId,
      Object.freeze({ ...item }),
    ])) as Record<ItemInstanceId, ScavengeItemState>;
    const carriedItems = this.carriedIds.map((id) => this.cloneInstance(id));
    const carriedItem = carriedItems.at(-1)?.type ?? null;
    return {
      status: this.status,
      remainingSeconds: this.remainingSeconds,
      savedCount: this.savedCount,
      carriedWeight: this.carriedWeight,
      carriedItems: Object.freeze(carriedItems),
      items: Object.freeze(items),
      carriedItem,
    };
  }

  result(): Readonly<ScavengeResult> | null {
    if (this.status !== 'success') return null;
    const savedItems = Object.values(this.items)
      .filter((item) => item.status === 'saved')
      .map((item) => Object.freeze({ instanceId: item.instanceId, type: item.type }));
    return Object.freeze({
      savedItems: Object.freeze(savedItems),
      elapsedSeconds: RUN_SECONDS - this.remainingSeconds,
    });
  }

  private releaseCarried(status: ItemStatus): ItemInstance | null {
    if (this.status !== 'running') return null;
    const instanceId = this.carriedIds.pop();
    if (instanceId === undefined) return null;
    this.items[instanceId]!.status = status;
    if (status === 'saved') this.savedCount += 1;
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
    return true;
  }
}
