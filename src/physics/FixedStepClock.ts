export type FixedStepCallback = (
  stepSeconds: number,
  stepIndex: number,
  stepCount: number,
) => void;

export class FixedStepClock {
  private accumulator = 0;

  constructor(
    readonly stepSeconds = 1 / 60,
    readonly maxSubsteps = 3,
  ) {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      throw new Error('Fixed step must be finite and positive');
    }
    if (!Number.isInteger(maxSubsteps) || maxSubsteps <= 0) {
      throw new Error('Maximum substeps must be a positive integer');
    }
  }

  advance(deltaSeconds: number, step: FixedStepCallback): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
    this.accumulator += deltaSeconds;
    const available = Math.floor(this.accumulator / this.stepSeconds);
    const stepCount = Math.min(available, this.maxSubsteps);
    if (available > this.maxSubsteps) {
      this.accumulator = 0;
    } else {
      this.accumulator -= stepCount * this.stepSeconds;
    }
    for (let index = 0; index < stepCount; index += 1) {
      step(this.stepSeconds, index, stepCount);
    }
    return stepCount;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
