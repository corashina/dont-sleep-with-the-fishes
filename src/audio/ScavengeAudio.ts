import type { PlayerMotionSample } from '../player/PlayerController';
import type { AudioVoice } from './AudioBackend';
import type { AudioScope } from './AudioScope';

const STEP_DISTANCE = 1.35;
const COUNTDOWN_START_SECONDS = 50;

export class ScavengeAudio {
  private stepDistance = 0;
  private sinkingPlayed = false;
  private crashPlayed = false;
  private chase: AudioVoice | null = null;
  private countdown: AudioVoice | null = null;
  private countdownStarted = false;
  private runBegun = false;
  private disposed = false;

  constructor(private readonly scope: AudioScope) {}

  start(): void {
    if (this.disposed) return;
    this.scope.startLoop('roomTone');
  }

  beginRun(): void {
    if (this.disposed || this.runBegun) return;
    this.runBegun = true;
    this.scope.startLoop('shipAlarm');
    this.chase = this.scope.play('scavengeChase');
    this.chase?.onEnded(() => {
      this.chase = null;
    });
  }

  update(
    motion: Readonly<PlayerMotionSample> | null,
    movementActive: boolean,
    elapsedSeconds = 0,
  ): void {
    if (this.disposed) return;
    if (!this.countdownStarted && elapsedSeconds >= COUNTDOWN_START_SECONDS) {
      this.countdownStarted = true;
      this.chase?.stop(0.08);
      this.chase = null;
      this.countdown = this.scope.play('scavengeCountdown');
      this.countdown?.onEnded(() => {
        this.countdown = null;
      });
    }
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
    this.stopShipAlarm();
    this.chase?.stop(0.12);
    this.chase = null;
    this.countdown?.stop(0.12);
    this.countdown = null;
    this.scope.play('sinkingEnding');
  }

  complete(): void {
    if (this.disposed || !this.runBegun) return;
    this.runBegun = false;
    this.stopShipAlarm();
  }

  crash(): void {
    if (this.disposed || this.crashPlayed) return;
    this.crashPlayed = true;
    this.scope.play('shipCrash');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scope.dispose();
  }

  private stopShipAlarm(): void {
    this.scope.stopLoop('shipAlarm', 0.12);
  }
}
