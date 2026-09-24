/** Fixed-step foam time. Render interpolation uses the two latest completed steps. */
export class OceanFoamClock {
  readonly stepSeconds = 1 / 30;
  steps = 0;
  firstStepTime = 0;
  mix = 0;
  resetRequired = true;
  private lastTime = NaN;
  private simulationTime = 0;

  advance(timeSeconds: number): void {
    if (!Number.isFinite(timeSeconds)) throw new RangeError('Foam time must be finite');
    const gap = timeSeconds - this.lastTime;
    this.resetRequired = !Number.isFinite(this.lastTime) || gap < 0 || gap > 0.25;
    this.lastTime = timeSeconds;
    if (this.resetRequired) {
      this.simulationTime = timeSeconds;
      this.firstStepTime = timeSeconds;
      this.steps = 1;
      this.mix = 1;
      return;
    }
    const requested = Math.floor((timeSeconds - this.simulationTime + 1e-9) / this.stepSeconds);
    this.steps = Math.min(4, requested);
    this.firstStepTime = this.simulationTime + this.stepSeconds;
    this.simulationTime += this.steps * this.stepSeconds;
    if (requested > 4) this.simulationTime = timeSeconds;
    this.mix = Math.min(1, Math.max(0, (timeSeconds - this.simulationTime) / this.stepSeconds));
  }

  reset(): void { this.lastTime = NaN; }
}
