import { Group } from 'three';
import type { Object3D } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { runCleanupSteps } from '../world/SceneResources';
import type { DedicatedEventId } from './eventPresentationRoutes';
import type {
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from './eventPresentationTypes';

export class EventPresentationCoordinator {
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();

  private readonly presentations =
    new Map<DedicatedEventId, DedicatedEventPresentation>();
  private activePresentation: DedicatedEventPresentation | null = null;
  private disposed = false;

  constructor(presentations: readonly DedicatedEventPresentation[]) {
    this.worldRoot.name = 'dedicated-event-world';
    this.boatRoot.name = 'dedicated-event-boat';

    for (const presentation of presentations) {
      if (this.presentations.has(presentation.eventId)) {
        throw new Error(`Duplicate dedicated event presentation: ${presentation.eventId}`);
      }
      this.presentations.set(presentation.eventId, presentation);
    }
    for (const presentation of this.presentations.values()) {
      this.worldRoot.add(presentation.worldRoot);
      this.boatRoot.add(presentation.boatRoot);
    }
  }

  handles(eventId: string): eventId is DedicatedEventId {
    return !this.disposed && this.presentations.has(eventId as DedicatedEventId);
  }

  stage(context: EventSceneContext): boolean {
    if (this.disposed) return false;
    const presentation = this.presentations.get(context.eventId);
    if (presentation === undefined) return false;
    this.activePresentation?.clear();
    this.activePresentation = presentation;
    presentation.stage(context);
    return true;
  }

  reveal(): Promise<void> {
    return this.activePresentation?.reveal() ?? Promise.resolve();
  }

  playChoice(choiceId: string): Promise<void> {
    return this.activePresentation?.playChoice?.(choiceId) ?? Promise.resolve();
  }

  skip(): void {
    this.activePresentation?.skip();
  }

  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean> {
    return this.activePresentation?.playItemUse(choiceId, instanceId)
      ?? Promise.resolve(false);
  }

  itemAimTarget(): Object3D | null {
    return this.activePresentation?.itemAimTarget ?? null;
  }

  react(result: EventOutcomePresentation): Promise<void> {
    return this.activePresentation?.react(result) ?? Promise.resolve();
  }

  update(time: number, delta: number): void {
    this.activePresentation?.update(time, delta);
  }

  settleForVisibilityChange(): void {
    this.activePresentation?.settleForVisibilityChange();
  }

  clear(): void {
    const presentation = this.activePresentation;
    if (presentation === null) return;
    this.activePresentation = null;
    presentation.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.activePresentation;
    this.activePresentation = null;
    const steps: Array<() => void> = [];
    if (active !== null) steps.push(() => active.clear());
    for (const presentation of this.presentations.values()) {
      steps.push(() => presentation.dispose());
    }
    steps.push(
      () => this.worldRoot.clear(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.removeFromParent(),
      () => this.boatRoot.removeFromParent(),
    );
    runCleanupSteps(steps);
  }
}
