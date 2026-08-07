import { Group, type Object3D } from 'three';
import type { EventPresentationKey } from './survivalTypes';
import type { FeaturedEventPresentation } from './FeaturedEventPresentation';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

export abstract class KeyedEventPresentation implements FeaturedEventPresentation {
  readonly root = new Group();
  protected readonly subject = new Group();
  protected settledKind = 'staged';
  private readonly animation: TimedPresentationAnimation<string>;
  private disposed = false;

  protected constructor(name: string) {
    this.animation = new TimedPresentationAnimation(
      (kind, time, progress) => this.applyAnimation(kind, time, progress),
      (kind) => {
        this.settledKind = kind;
        this.finishAnimation(kind);
      },
    );
    this.root.name = name;
    this.subject.name = `${name}:subject`;
    this.root.add(this.subject);
    this.root.visible = false;
  }

  stage(): void {
    if (this.disposed) return;
    this.animation.cancel();
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

  itemAimTarget(): Object3D | null {
    return this.disposed || !this.root.visible ? null : this.subject;
  }

  interactionRoot(): Object3D | null {
    return this.disposed || !this.root.visible ? null : this.subject;
  }

  resultRoot(): Object3D | null {
    return this.disposed || !this.root.visible ? null : this.subject;
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.root.visible) return;
    if (this.animation.active) this.animation.update(time, delta);
    else this.applyIdle(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle();
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.settledKind = 'staged';
    this.reset();
    this.subject.visible = false;
    this.root.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.animation.cancel();
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
    this.animation.cancel();
    this.prepareAnimation(kind);
    const animation = this.animation.start(kind, duration);
    this.applyAnimation(kind, 0, 0);
    return animation;
  }

  protected prepareAnimation(_kind: string): void {}
}
