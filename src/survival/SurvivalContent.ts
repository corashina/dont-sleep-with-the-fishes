import type { Object3D } from 'three';
import { runCleanupSteps } from '../world/SceneResources';
import { EventModelLibrary } from './EventModelLibrary';
import { SurvivalEventModelLibrary } from './SurvivalEventModelLibrary';
import { FishingModelLibrary } from './FishingModelLibrary';
import { EVENT_MODEL_IDS, SURVIVAL_EVENT_MODEL_IDS } from './eventModelManifest';

/** Templates belong to the game. Event and catch instances belong to their phase. */
export class SurvivalContent {
  private disposed = false;

  private constructor(
    readonly events: EventModelLibrary,
    readonly featured: SurvivalEventModelLibrary,
    readonly fishing: FishingModelLibrary,
  ) {}

  static async load(): Promise<SurvivalContent> {
    const results = await Promise.allSettled([
      EventModelLibrary.load(EVENT_MODEL_IDS),
      SurvivalEventModelLibrary.load(SURVIVAL_EVENT_MODEL_IDS),
      FishingModelLibrary.load(),
    ] as const);
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      try {
        runCleanupSteps(results.map(result => () => {
          if (result.status === 'fulfilled') result.value.dispose();
        }));
      } catch { /* Preserve the load error. */ }
      throw failed.reason;
    }
    return new SurvivalContent(
      (results[0] as PromiseFulfilledResult<EventModelLibrary>).value,
      (results[1] as PromiseFulfilledResult<SurvivalEventModelLibrary>).value,
      (results[2] as PromiseFulfilledResult<FishingModelLibrary>).value,
    );
  }

  *preparationRoots(): Iterable<Object3D> {
    yield* this.events.preparationRoots();
    yield* this.featured.preparationRoots();
    yield* this.fishing.preparationRoots();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.events.dispose(),
      () => this.featured.dispose(),
      () => this.fishing.dispose(),
    ]);
  }
}
