import { createInitialItemState, type ItemId, type ItemStatus } from './ItemState';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'success' | 'failure';

export interface ScavengeSnapshot {
  status: SessionStatus;
  remainingSeconds: number;
  savedCount: number;
  carriedItem: ItemId | null;
  items: Readonly<Record<ItemId, ItemStatus>>;
}

const RUN_SECONDS = 120;
const BOAT_CAPACITY = 5;

export class ScavengeSession {
  private status: SessionStatus = 'idle';
  private remainingSeconds = RUN_SECONDS;
  private readonly items = createInitialItemState();
  private carriedItem: ItemId | null = null;
  private savedCount = 0;

  start(): void {
    if (this.status === 'idle') this.status = 'running';
  }

  tick(deltaSeconds: number): void {
    if (this.status !== 'running') return;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - Math.max(0, deltaSeconds));
    if (this.remainingSeconds === 0) this.finish('failure');
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  resume(): void {
    if (this.status === 'paused') this.status = 'running';
  }

  pickUp(id: ItemId): boolean {
    if (this.status !== 'running' || this.carriedItem || this.items[id] !== 'available') return false;
    this.items[id] = 'carried';
    this.carriedItem = id;
    return true;
  }

  dropCarried(): ItemId | null {
    if (this.status !== 'running' || !this.carriedItem) return null;
    const id = this.carriedItem;
    this.items[id] = 'available';
    this.carriedItem = null;
    return id;
  }

  saveCarried(): boolean {
    if (this.status !== 'running' || !this.carriedItem || this.savedCount >= BOAT_CAPACITY) return false;
    const id = this.carriedItem;
    this.items[id] = 'saved';
    this.carriedItem = null;
    this.savedCount += 1;
    return true;
  }

  loseCarried(): boolean {
    if (this.status !== 'running' || !this.carriedItem) return false;
    const id = this.carriedItem;
    this.items[id] = 'lost';
    this.carriedItem = null;
    return true;
  }

  lose(id: ItemId): boolean {
    if (this.status !== 'running' || this.items[id] === 'saved' || this.items[id] === 'lost') return false;
    if (this.carriedItem === id) this.carriedItem = null;
    this.items[id] = 'lost';
    return true;
  }

  evacuate(): boolean {
    return this.status === 'running' && this.finish('success');
  }

  snapshot(): ScavengeSnapshot {
    return {
      status: this.status,
      remainingSeconds: this.remainingSeconds,
      savedCount: this.savedCount,
      carriedItem: this.carriedItem,
      items: { ...this.items },
    };
  }

  private finish(status: 'success' | 'failure'): boolean {
    if (this.status === 'success' || this.status === 'failure') return false;
    this.status = status;
    return true;
  }
}
