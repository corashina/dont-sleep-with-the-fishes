import type { AudioSystem, EventAudioLease } from '../audio/AudioSystem';
import { runCleanupSteps } from '../world/SceneResources';
import { ActiveEventPresenter } from './ActiveEventPresenter';
import { EventModelLibrary } from './EventModelLibrary';
import {
  EVENT_MODEL_IDS,
  SURVIVAL_EVENT_MODEL_IDS,
  type EventModelId,
  type SurvivalEventModelId,
} from './eventModelManifest';
import { EVENT_BUNDLE_SPECS } from './eventBundleManifest';
import {
  SurvivalEventModelLibrary,
  type SurvivalEventModels,
} from './SurvivalEventModelLibrary';
import type { SurvivalEventId } from './events';

function preservePrimaryErrorCleanup(steps: Array<() => void>): void {
  try {
    runCleanupSteps(steps);
  } catch {
    // The resource load or presenter construction error remains primary.
  }
}

export interface EventPresenterHost {
  createEventPresenter(
    eventId: SurvivalEventId,
    dedicatedModels: EventModelLibrary,
    featuredModels: SurvivalEventModels,
  ): ActiveEventPresenter;
  attachEventPresenter(presenter: ActiveEventPresenter): void;
  detachEventPresenter(presenter: ActiveEventPresenter): void;
}

export interface EventBundleLoaderDependencies {
  readonly audio: Pick<AudioSystem, 'acquireEventAudio'>;
  readonly host: EventPresenterHost;
  readonly loadDedicatedModels?: (
    ids: readonly EventModelId[],
  ) => Promise<EventModelLibrary>;
  readonly loadFeaturedModels?: (
    ids: readonly SurvivalEventModelId[],
  ) => Promise<SurvivalEventModelLibrary>;
}

export class EventBundleLoadError extends Error {
  constructor(
    readonly eventId: SurvivalEventId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`Event ${eventId}: ${message}`, options);
    this.name = 'EventBundleLoadError';
  }
}

export class EventBundle {
  private disposed = false;

  constructor(
    readonly eventId: SurvivalEventId,
    private readonly host: EventPresenterHost,
    private readonly presenter: ActiveEventPresenter,
    private readonly featuredModels: SurvivalEventModelLibrary,
    private readonly dedicatedModels: EventModelLibrary,
    private readonly audio: EventAudioLease,
  ) {}

  attach(): void {
    if (this.disposed) throw new Error(`Event bundle is disposed: ${this.eventId}`);
    this.host.attachEventPresenter(this.presenter);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.host.detachEventPresenter(this.presenter),
      () => this.presenter.dispose(),
      () => this.featuredModels.dispose(),
      () => this.dedicatedModels.dispose(),
      () => this.audio.dispose(),
    ]);
  }
}

const dedicatedModelIds = new Set<string>(EVENT_MODEL_IDS);
const featuredModelIds = new Set<string>(SURVIVAL_EVENT_MODEL_IDS);

function isDedicatedModelId(id: string): id is EventModelId {
  return dedicatedModelIds.has(id);
}

function isFeaturedModelId(id: string): id is SurvivalEventModelId {
  return featuredModelIds.has(id);
}

export class EventBundleLoader {
  private readonly loadDedicatedModels: (
    ids: readonly EventModelId[],
  ) => Promise<EventModelLibrary>;
  private readonly loadFeaturedModels: (
    ids: readonly SurvivalEventModelId[],
  ) => Promise<SurvivalEventModelLibrary>;

  constructor(private readonly dependencies: EventBundleLoaderDependencies) {
    this.loadDedicatedModels = dependencies.loadDedicatedModels
      ?? ((ids) => EventModelLibrary.load(ids));
    this.loadFeaturedModels = dependencies.loadFeaturedModels
      ?? ((ids) => SurvivalEventModelLibrary.load(ids));
  }

  async load(eventId: SurvivalEventId): Promise<EventBundle> {
    const spec = EVENT_BUNDLE_SPECS[eventId];
    const dedicatedIds = spec.models.filter(isDedicatedModelId);
    const featuredIds = spec.models.filter(isFeaturedModelId);
    if (dedicatedIds.length + featuredIds.length !== spec.models.length) {
      throw new EventBundleLoadError(eventId, 'manifest contains an unknown model ID');
    }

    const results = await Promise.allSettled([
      this.dependencies.audio.acquireEventAudio(spec.sounds),
      this.loadDedicatedModels(dedicatedIds),
      this.loadFeaturedModels(featuredIds),
    ] as const);
    const [audioResult, dedicatedResult, featuredResult] = results;
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure !== undefined) {
      preservePrimaryErrorCleanup([
        () => {
          if (featuredResult.status === 'fulfilled') featuredResult.value.dispose();
        },
        () => {
          if (dedicatedResult.status === 'fulfilled') dedicatedResult.value.dispose();
        },
        () => {
          if (audioResult.status === 'fulfilled') audioResult.value.dispose();
        },
      ]);
      const message = failure.reason instanceof Error
        ? failure.reason.message
        : String(failure.reason);
      throw new EventBundleLoadError(eventId, message, { cause: failure.reason });
    }

    const audio = (audioResult as PromiseFulfilledResult<EventAudioLease>).value;
    const dedicated = (
      dedicatedResult as PromiseFulfilledResult<EventModelLibrary>
    ).value;
    const featured = (
      featuredResult as PromiseFulfilledResult<SurvivalEventModelLibrary>
    ).value;
    let presenter: ActiveEventPresenter;
    try {
      presenter = this.dependencies.host.createEventPresenter(
        eventId,
        dedicated,
        featured,
      );
    } catch (cause) {
      preservePrimaryErrorCleanup([
        () => featured.dispose(),
        () => dedicated.dispose(),
        () => audio.dispose(),
      ]);
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new EventBundleLoadError(eventId, message, { cause });
    }
    return new EventBundle(
      eventId,
      this.dependencies.host,
      presenter,
      featured,
      dedicated,
      audio,
    );
  }
}
