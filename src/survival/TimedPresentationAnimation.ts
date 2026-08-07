export interface TimedAnimationResults<Result> {
  readonly complete: Result;
  readonly cancel: Result;
}

type Sample<Kind extends string> = (
  kind: Kind,
  time: number,
  progress: number,
) => void;

type Finish<Kind extends string> = (kind: Kind) => void;

interface MutableTimedAnimation<Kind extends string> {
  kind: Kind | null;
  elapsed: number;
  duration: number;
  resolve: ((value: unknown) => void) | null;
  completeValue: unknown;
  cancelValue: unknown;
}

const NO_RESULTS: TimedAnimationResults<void> = Object.freeze({
  complete: undefined,
  cancel: undefined,
});

const NO_FINISH = (): void => undefined;

export class TimedPresentationAnimation<Kind extends string> {
  private readonly state: MutableTimedAnimation<Kind> = {
    kind: null,
    elapsed: 0,
    duration: 0,
    resolve: null,
    completeValue: undefined,
    cancelValue: undefined,
  };

  constructor(
    private readonly sample: Sample<Kind>,
    private readonly finish: Finish<Kind> = NO_FINISH,
  ) {}

  get active(): boolean {
    return this.state.resolve !== null;
  }

  start(kind: Kind, duration: number): Promise<void>;
  start<Result>(
    kind: Kind,
    duration: number,
    results: TimedAnimationResults<Result>,
  ): Promise<Result>;
  start<Result>(
    kind: Kind,
    duration: number,
    results: TimedAnimationResults<Result> = NO_RESULTS as TimedAnimationResults<Result>,
  ): Promise<Result> {
    if (!Number.isFinite(duration) || duration < 0) {
      throw new RangeError('Animation duration must be finite and non-negative.');
    }
    this.cancel();
    this.state.kind = kind;
    this.state.elapsed = 0;
    this.state.duration = duration;
    this.state.completeValue = results.complete;
    this.state.cancelValue = results.cancel;
    const promise = new Promise<Result>((resolve) => {
      this.state.resolve = resolve as (value: unknown) => void;
    });
    return promise;
  }

  update(time: number, delta: number): void {
    const { kind, resolve } = this.state;
    if (kind === null || resolve === null) return;
    this.state.elapsed = Math.min(
      this.state.duration,
      this.state.elapsed + Math.max(0, delta),
    );
    const progress = this.state.duration === 0
      ? 1
      : this.state.elapsed / this.state.duration;
    this.sample(kind, time, progress);
    if (progress === 1) this.complete(kind, resolve);
  }

  settle(time = 0): void {
    const { kind, resolve } = this.state;
    if (kind === null || resolve === null) return;
    this.sample(kind, time, 1);
    this.complete(kind, resolve);
  }

  cancel(): void {
    const resolve = this.state.resolve;
    if (resolve === null) return;
    const value = this.state.cancelValue;
    this.state.resolve = null;
    this.state.kind = null;
    resolve(value);
  }

  private complete(kind: Kind, resolve: (value: unknown) => void): void {
    const value = this.state.completeValue;
    this.state.resolve = null;
    this.state.kind = null;
    this.finish(kind);
    resolve(value);
  }
}
