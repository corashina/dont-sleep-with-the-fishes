import type { Skybox, StarryNightSkyPresentation } from '../world/Skybox';
import type { EventPresentationContext } from './eventPresentationTypes';

const REACTION_DURATION = 1;

export interface StarryNightPresentationEnvironment {
  readonly sky: Pick<Skybox, 'setStarryNight'>;
}

interface ActiveAnimation {
  elapsed: number;
  readonly duration: number;
  readonly fromStrength: number;
  readonly targetStrength: number;
  readonly resolve: () => void;
}

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

export class StarryNightPresentation {
  private readonly display: {
    strength: number;
    time: number;
    constellationStrength: number;
  } = {
    strength: 0,
    time: 0,
    constellationStrength: 0,
  } satisfies StarryNightSkyPresentation;
  private activeAnimation: ActiveAnimation | null = null;
  private strength = 0;
  private elapsed = 0;
  private constellation = false;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: StarryNightPresentationEnvironment) {}

  stage(context: EventPresentationContext): void {
    if (this.disposed) return;
    this.cancelAnimation();
    this.staged = context.eventId === 'starry-night'
      || context.eventId === 'constellation-night';
    this.constellation = context.eventId === 'constellation-night';
    this.resetValues();
    if (this.staged) this.strength = 1;
    this.apply();
  }

  reveal(): Promise<void> {
    return Promise.resolve();
  }

  react(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    return this.startAnimation(0, REACTION_DURATION);
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const step = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.elapsed += step;
    const animation = this.activeAnimation;
    if (animation !== null) {
      animation.elapsed = Math.min(animation.duration, animation.elapsed + step);
      const progress = smoothstep(animation.elapsed / animation.duration);
      this.strength = animation.fromStrength
        + (animation.targetStrength - animation.fromStrength) * progress;
      if (animation.elapsed >= animation.duration) this.finishAnimation();
    }
    this.apply();
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.activeAnimation === null) return;
    this.finishAnimation();
    this.apply();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelAnimation();
    this.staged = false;
    this.resetValues();
    this.apply();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  private startAnimation(targetStrength: number, duration: number): Promise<void> {
    this.cancelAnimation();
    return new Promise((resolve) => {
      this.activeAnimation = {
        elapsed: 0,
        duration,
        fromStrength: this.strength,
        targetStrength,
        resolve,
      };
    });
  }

  private finishAnimation(): void {
    const animation = this.activeAnimation;
    if (animation === null) return;
    this.activeAnimation = null;
    this.strength = animation.targetStrength;
    animation.resolve();
  }

  private cancelAnimation(): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    animation?.resolve();
  }

  private resetValues(): void {
    this.strength = 0;
    this.elapsed = 0;
  }

  private apply(): void {
    this.display.strength = this.strength;
    this.display.time = this.elapsed;
    this.display.constellationStrength = this.constellation ? this.strength : 0;
    this.environment.sky.setStarryNight(this.display);
  }
}
