import type { PlayerMotionSample } from '../player/PlayerController';
import type { AudioScope } from './AudioScope';

const STEP_DISTANCE = 1.35;

export class ScavengeAudio {
  private stepDistance = 0;
  private sinkingPlayed = false;
  private disposed = false;

  constructor(private readonly scope: AudioScope) {}

  start(): void {
    if (this.disposed) return;
    this.scope.startLoop('roomTone');
  }

  update(
    motion: Readonly<PlayerMotionSample> | null,
    movementActive: boolean,
  ): void {
    if (this.disposed) return;
    if (motion === null) return;
    if (motion.jumped) this.scope.play('jump');
    if (!movementActive || !motion.grounded) {
      this.stepDistance = 0;
      return;
    }
    this.stepDistance += motion.movedDistance;
    while (this.stepDistance >= STEP_DISTANCE) {
      this.stepDistance -= STEP_DISTANCE;
      this.scope.play('woodStep');
    }
  }

  itemHandled(): void {
    if (!this.disposed) this.scope.play('itemHandling');
  }

  deny(): void {
    if (!this.disposed) this.scope.play('denied');
  }

  setPaused(paused: boolean): void {
    if (!this.disposed) this.scope.setPaused(paused);
  }

  sink(): void {
    if (this.disposed || this.sinkingPlayed) return;
    this.sinkingPlayed = true;
    this.scope.play('sinkingEnding');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scope.dispose();
  }
}
