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
    const promise = this.loader.load(eventId).then((bundle) => {
      if (this.disposed || generation !== this.generation) bundle.dispose();
      return bundle;
    });
    this.pending = { eventId, generation, promise };
    return promise;
  }

  async activate(eventId: SurvivalEventId): Promise<EventBundle> {
    if (this.disposed) throw new Error('Event bundle manager is disposed.');
    if (this.active?.eventId === eventId) return this.active;
    const pending = this.pending;
    if (pending === null || pending.eventId !== eventId) {
      throw new Error(`Event bundle is not loading: ${eventId}`);
    }
    try {
      const bundle = await pending.promise;
      if (
        this.disposed
        || pending.generation !== this.generation
        || this.pending !== pending
      ) {
        if (!this.disposed && pending.generation === this.generation) {
          bundle.dispose();
        }
        throw new Error(`Event bundle activation was cancelled: ${eventId}`);
      }
      try {
        bundle.attach();
      } catch (error) {
        ignoreCleanupError(() => bundle.dispose());
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
    if (this.pending === null) return;
    this.generation += 1;
    this.pending = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.pending = null;
    this.releaseActive();
  }
}
