import type { Object3D } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { ignoreCleanupError, runCleanupSteps } from '../world/SceneResources';
import type {
  EventPresentationAdapter,
  EventPresentationContext,
  EventPresentationReaction,
} from './EventPresentationAdapter';
import type { SurvivalEventId } from './eventCatalog';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
} from './FocusedEventPresentation';

const EMPTY_INTERACTION_TARGETS: readonly FocusedEventInteractionTarget[] = Object.freeze([]);

export class EventPresentationHost {
  private active: EventPresentationAdapter | null = null;
  private activeCleared = false;
  private disposed = false;

  attach(adapter: EventPresentationAdapter): void {
    if (this.disposed) throw new Error('Event presentation host is disposed.');
    if (this.active !== null) throw new Error('Event presentation is already attached.');

    let attachedRootCount = 0;
    let attemptedRoot: EventPresentationAdapter['roots'][number] | null = null;
    let attemptedRootWasAttached = false;
    try {
      for (const root of adapter.roots) {
        attemptedRoot = root;
        attemptedRootWasAttached = root.root.parent === root.parent;
        root.parent.add(root.root);
        attachedRootCount += 1;
        attemptedRoot = null;
      }
    } catch (error) {
      const rollbackSteps: Array<() => void> = [];
      const failedRoot = attemptedRoot;
      if (
        failedRoot !== null
        && !attemptedRootWasAttached
        && failedRoot.root.parent === failedRoot.parent
      ) {
        rollbackSteps.push(
          () => ignoreCleanupError(() => failedRoot.root.removeFromParent()),
        );
      }
      for (let index = attachedRootCount - 1; index >= 0; index -= 1) {
        const root = adapter.roots[index];
        if (root !== undefined) {
          rollbackSteps.push(() => ignoreCleanupError(() => root.root.removeFromParent()));
        }
      }
      runCleanupSteps(rollbackSteps);
      throw error;
    }

    this.active = adapter;
    this.activeCleared = false;
  }

  detach(adapter: EventPresentationAdapter): void {
    const active = this.active;
    if (active === null) return;
    if (active !== adapter) throw new Error('Cannot detach an inactive event presentation.');

    this.active = null;
    runCleanupSteps(this.detachSteps(active));
  }

  activeEventId(): SurvivalEventId | null {
    return this.active?.eventId ?? null;
  }

  stage(context: EventPresentationContext): void {
    const active = this.active;
    if (active === null) return;
    this.activeCleared = false;
    active.stage(context);
  }

  reveal(): Promise<void> {
    return this.active?.reveal() ?? Promise.resolve();
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    return this.active?.playChoice(choice) ?? Promise.resolve();
  }

  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean> {
    return this.active?.playItemUse(choiceId, instanceId) ?? Promise.resolve(false);
  }

  itemAimTarget(): Object3D | null {
    return this.active?.itemAimTarget() ?? null;
  }

  interactionTargets(): readonly FocusedEventInteractionTarget[] {
    return this.active?.interactionTargets() ?? EMPTY_INTERACTION_TARGETS;
  }

  interactionRoot(id: string): Object3D | null {
    return this.active?.interactionRoot(id) ?? null;
  }

  resultRoot(id: string): Object3D | null {
    return this.active?.resultRoot(id) ?? null;
  }

  react(reaction: EventPresentationReaction): Promise<void> {
    return this.active?.react(reaction) ?? Promise.resolve();
  }

  update(time: number, delta: number): void {
    this.active?.update(time, delta);
  }

  settleForVisibilityChange(): void {
    this.active?.settleForVisibilityChange();
  }

  clear(): void {
    const active = this.active;
    if (active === null || this.activeCleared) return;
    this.activeCleared = true;
    active.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const active = this.active;
    this.active = null;
    if (active === null) return;
    const clearPending = !this.activeCleared;
    this.activeCleared = true;
    runCleanupSteps([
      ...(clearPending ? [() => active.clear()] : []),
      ...this.detachSteps(active),
    ]);
  }

  private detachSteps(adapter: EventPresentationAdapter): Array<() => void> {
    const steps: Array<() => void> = [];
    for (let index = adapter.roots.length - 1; index >= 0; index -= 1) {
      const root = adapter.roots[index];
      if (root !== undefined) steps.push(() => root.root.removeFromParent());
    }
    return steps;
  }
}
