import type { Object3D } from 'three';
import { runCleanupSteps } from '../world/SceneResources';
import type { EventPresentationCoordinator } from './EventPresentationCoordinator';
import type { EventPresentationLayer } from './EventPresentationLayer';
import type { FeaturedEventPresentations } from './FeaturedEventPresentations';
import type { SupernaturalEventAnimator } from './SupernaturalEventAnimator';
import type { WeatherEventAnimator } from './WeatherEventAnimator';
import type { SurvivalEventId } from './events';

interface PresenterRootBinding {
  readonly parent: Object3D;
  readonly root: Object3D;
}

export interface ActiveEventPresenterParts {
  readonly dedicated: EventPresentationCoordinator | null;
  readonly layer: EventPresentationLayer | null;
  readonly featured: FeaturedEventPresentations | null;
  readonly weather: WeatherEventAnimator | null;
  readonly supernatural: SupernaturalEventAnimator | null;
  readonly roots: readonly PresenterRootBinding[];
}

export class ActiveEventPresenter {
  readonly dedicated: EventPresentationCoordinator | null;
  readonly layer: EventPresentationLayer | null;
  readonly featured: FeaturedEventPresentations | null;
  readonly weather: WeatherEventAnimator | null;
  readonly supernatural: SupernaturalEventAnimator | null;
  private readonly roots: readonly PresenterRootBinding[];
  private attached = false;
  private disposed = false;

  constructor(
    readonly eventId: SurvivalEventId,
    parts: ActiveEventPresenterParts,
  ) {
    this.dedicated = parts.dedicated;
    this.layer = parts.layer;
    this.featured = parts.featured;
    this.weather = parts.weather;
    this.supernatural = parts.supernatural;
    this.roots = Object.freeze([...parts.roots]);
  }

  attach(): void {
    if (this.disposed) throw new Error('Event presenter is disposed.');
    if (this.attached) return;
    this.attached = true;
    for (const { parent, root } of this.roots) parent.add(root);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    for (const { root } of this.roots) root.removeFromParent();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.detach(),
      () => this.dedicated?.dispose(),
      () => this.layer?.dispose(),
      () => this.featured?.dispose(),
      () => this.weather?.dispose(),
      () => this.supernatural?.dispose(),
    ]);
  }
}
