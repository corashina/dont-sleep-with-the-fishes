import type { Object3D } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { ignoreCleanupError, runCleanupSteps } from '../world/SceneResources';
import type {
  EventPresentationAdapter,
  EventPresentationContext,
  EventPresentationReaction,
} from './EventPresentationAdapter';
import type { SurvivalEventId } from './eventCatalog';
import type { EventChoicePresentation } from './FocusedEventPresentation';

export class EventPresentationHost {
  private active: EventPresentationAdapter | null = null;
  private disposed = false;

  attach(adapter: EventPresentationAdapter): void {
    if (this.disposed) throw new Error('Event presentation host is disposed.');
    if (this.active !== null) throw new Error('Event presentation is already attached.');

    let attachedRootCount = 0;
    try {
      for (const { parent, root } of adapter.roots) {
        parent.add(root);
        attachedRootCount += 1;
      }
    } catch (error) {
      const rollbackSteps: Array<() => void> = [];
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
    this.active?.stage(context);
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
    this.active?.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const active = this.active;
    this.active = null;
    if (active === null) return;
    runCleanupSteps([
      () => active.clear(),
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
