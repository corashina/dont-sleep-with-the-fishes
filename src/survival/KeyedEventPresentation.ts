import { Group, type Object3D } from 'three';
import type { EventPresentationKey } from './survivalTypes';
import type { FeaturedEventPresentation } from './FeaturedEventPresentation';
import type { TimedAnimation } from './animationMath';

export abstract class KeyedEventPresentation implements FeaturedEventPresentation {
  readonly root = new Group();
  protected readonly subject = new Group();
  protected settledKind = 'staged';
  private active: TimedAnimation<string> | null = null;
  private disposed = false;

  protected constructor(name: string) {
    this.root.name = name;
    this.subject.name = `${name}:subject`;
    this.root.add(this.subject);
    this.root.visible = false;
  }

  stage(): void {
    if (this.disposed) return;
    this.cancel();
    this.settledKind = 'staged';
    this.root.visible = true;
    this.subject.visible = true;
    this.reset();
    this.applyIdle(0);
  }

  reveal(): Promise<void> {
    return this.start('reveal', this.revealDuration());
  }

  react(key: EventPresentationKey): Promise<void> {
    return this.start(key, this.reactionDuration(key));
  }

  interactionRoot(): Object3D | null {
    return this.disposed || !this.root.visible ? null : this.subject;
  }

  resultRoot(): Object3D | null {
    return this.disposed || !this.root.visible ? null : this.subject;
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.root.visible) return;
    if (this.active === null) {
      this.applyIdle(time);
      return;
    }
    const animation = this.active;
    animation.elapsed = Math.min(animation.duration, animation.elapsed + Math.max(0, delta));
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    this.applyAnimation(animation.kind, time, progress);
    if (progress < 1) return;
    this.active = null;
    this.settledKind = animation.kind;
    this.finishAnimation(animation.kind);
    animation.resolve();
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.active === null) return;
    const animation = this.active;
    this.active = null;
    this.applyAnimation(animation.kind, 0, 1);
    this.settledKind = animation.kind;
    this.finishAnimation(animation.kind);
    animation.resolve();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancel();
    this.settledKind = 'staged';
    this.reset();
    this.subject.visible = false;
    this.root.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.root.removeFromParent();
    this.disposeOwned();
  }

  protected revealDuration(): number {
    return 0.85;
  }

  protected reactionDuration(_key: EventPresentationKey): number {
    return 0.9;
  }

  protected finishAnimation(_kind: string): void {}

  protected disposeOwned(): void {}

  protected abstract reset(): void;
  protected abstract applyIdle(time: number): void;
  protected abstract applyAnimation(kind: string, time: number, progress: number): void;

  private start(kind: string, duration: number): Promise<void> {
    if (this.disposed || !this.root.visible) return Promise.resolve();
    this.cancel();
    this.prepareAnimation(kind);
    return new Promise((resolve) => {
      this.active = { kind, elapsed: 0, duration, resolve };
      this.applyAnimation(kind, 0, 0);
    });
  }

  protected prepareAnimation(_kind: string): void {}

  private cancel(): void {
    const active = this.active;
    this.active = null;
    active?.resolve();
  }
}
