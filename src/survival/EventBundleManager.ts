import type { EventBundle } from './EventBundle';
import type { SurvivalEventId } from './eventCatalog';
import { ignoreCleanupError } from '../world/SceneResources';

export interface EventBundleLoaderLike {
  load(eventId: SurvivalEventId): Promise<EventBundle>;
}

interface PendingBundle {
  readonly eventId: SurvivalEventId;
  readonly generation: number;
  readonly promise: Promise<EventBundle>;
  activation: Promise<EventBundle> | null;
  bundle: EventBundle | null;
  cancelled: boolean;
  bundleDisposed: boolean;
}

export class EventBundleManager {
  private pending: PendingBundle | null = null;
  private active: EventBundle | null = null;
  private generation = 0;
  private disposed = false;

  constructor(private readonly loader: EventBundleLoaderLike) {}

  beginLoad(eventId: SurvivalEventId): Promise<EventBundle> {
    if (this.disposed) throw new Error('Event bundle manager is disposed.');
    if (this.pending !== null) {
      if (this.pending.eventId === eventId) return this.pending.promise;
      throw new Error(`Event bundle ${this.pending.eventId} is already loading.`);
    }
    const generation = this.generation;
    let pending!: PendingBundle;
    const promise = this.loader.load(eventId).then((bundle) => {
      pending.bundle = bundle;
      if (this.disposed || pending.cancelled || generation !== this.generation) {
        ignoreCleanupError(() => this.disposePendingBundle(pending));
      }
      return bundle;
    });
    pending = {
      eventId,
      generation,
      promise,
      activation: null,
      bundle: null,
      cancelled: false,
      bundleDisposed: false,
    };
    this.pending = pending;
    return pending.promise;
  }

  activate(eventId: SurvivalEventId): Promise<EventBundle> {
    if (this.disposed) return Promise.reject(new Error('Event bundle manager is disposed.'));
    if (this.active?.eventId === eventId) return Promise.resolve(this.active);
    const pending = this.pending;
    if (pending === null || pending.eventId !== eventId) {
      return Promise.reject(new Error(`Event bundle is not loading: ${eventId}`));
    }
    if (pending.activation !== null) return pending.activation;
    pending.activation = this.activatePending(pending);
    return pending.activation;
  }

  private async activatePending(pending: PendingBundle): Promise<EventBundle> {
    const { eventId } = pending;
    try {
      const bundle = await pending.promise;
      if (
        this.disposed
        || pending.cancelled
        || pending.generation !== this.generation
        || this.pending !== pending
      ) {
        ignoreCleanupError(() => this.disposePendingBundle(pending));
        throw new Error(`Event bundle activation was cancelled: ${eventId}`);
      }
      try {
        bundle.attach();
      } catch (error) {
        ignoreCleanupError(() => this.disposePendingBundle(pending));
        throw error;
      }
      this.active = bundle;
      return bundle;
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }

  releaseActive(): void {
    const active = this.active;
    this.active = null;
    active?.dispose();
  }

  cancelPendingActivation(): void {
    const pending = this.pending;
    if (pending === null) return;
    this.generation += 1;
    this.pending = null;
    pending.cancelled = true;
    this.disposePendingBundle(pending);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    const pending = this.pending;
    this.pending = null;
    if (pending !== null) pending.cancelled = true;
    let firstError: unknown;
    let failed = false;
    try {
      if (pending !== null) this.disposePendingBundle(pending);
    } catch (error) {
      firstError = error;
      failed = true;
    }
    try {
      this.releaseActive();
    } catch (error) {
      if (!failed) {
        firstError = error;
        failed = true;
      }
    }
    if (failed) throw firstError;
  }

  private disposePendingBundle(pending: PendingBundle): void {
    if (pending.bundle === null || pending.bundleDisposed) return;
    pending.bundleDisposed = true;
    pending.bundle.dispose();
  }
}
