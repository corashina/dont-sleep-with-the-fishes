import type { AudioSystem, AudioLease } from '../audio/AudioSystem';
import { runCleanupSteps } from '../world/SceneResources';
import type { EventPresentationAdapter } from './EventPresentationAdapter';
import type { EventModelLibrary } from './EventModelLibrary';
import { EVENT_BUNDLE_SPECS } from './eventBundleManifest';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import type { SurvivalEventId } from './eventCatalog';

export interface EventPresenterHost {
  createEventPresentation(
    eventId: SurvivalEventId,
    dedicatedModels: EventModelLibrary,
    featuredModels: SurvivalEventModels,
  ): EventPresentationAdapter;
  attach(adapter: EventPresentationAdapter): void;
  detach(adapter: EventPresentationAdapter): void;
}

export interface EventBundleLoaderDependencies {
  readonly audio: Pick<AudioSystem, 'acquireEventAudio'>;
  readonly host: EventPresenterHost;
  readonly dedicatedModels: EventModelLibrary;
  readonly featuredModels: SurvivalEventModels;
}

export class EventBundleLoadError extends Error {
  constructor(readonly eventId: SurvivalEventId, message: string, options?: ErrorOptions) {
    super(`Event ${eventId}: ${message}`, options);
    this.name = 'EventBundleLoadError';
  }
}

export class EventBundle {
  private disposed = false;

  constructor(
    readonly eventId: SurvivalEventId,
    private readonly host: EventPresenterHost,
    private readonly adapter: EventPresentationAdapter,
    private readonly audio: AudioLease,
  ) {}

  attach(): void {
    if (this.disposed) throw new Error(`Event bundle is disposed: ${this.eventId}`);
    this.host.attach(this.adapter);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.host.detach(this.adapter),
      () => this.adapter.dispose(),
      () => this.audio.dispose(),
    ]);
  }
}

export class EventBundleLoader {
  constructor(private readonly dependencies: EventBundleLoaderDependencies) {}

  async load(eventId: SurvivalEventId): Promise<EventBundle> {
    let audio: AudioLease | undefined;
    try {
      // Phase ownership keeps these buffers decoded. This lease owns event voices.
      audio = await this.dependencies.audio.acquireEventAudio(EVENT_BUNDLE_SPECS[eventId].sounds);
      const adapter = this.dependencies.host.createEventPresentation(
        eventId, this.dependencies.dedicatedModels, this.dependencies.featuredModels,
      );
      return new EventBundle(eventId, this.dependencies.host, adapter, audio);
    } catch (cause) {
      try { audio?.dispose(); } catch { /* Preserve the construction error. */ }
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new EventBundleLoadError(eventId, message, { cause });
    }
  }
}
