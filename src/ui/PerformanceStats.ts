export class PerformanceStats {
  private readonly element: HTMLOutputElement;
  private elapsed = 0;
  private frames = 0;
  private disposed = false;

  constructor(mount: HTMLElement) {
    this.element = document.createElement('output');
    this.element.className = 'performance-stats';
    this.element.dataset.performanceStats = '';
    this.element.textContent = 'FPS --';
    this.element.setAttribute('aria-label', 'Rendering performance: waiting for FPS data');
    mount.append(this.element);
  }

  recordFrame(deltaSeconds: number): void {
    if (this.disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (deltaSeconds > 0.25) {
      this.reset();
      return;
    }

    this.elapsed += deltaSeconds;
    this.frames += 1;
    if (this.elapsed < 0.5) return;

    const fps = Math.round(this.frames / this.elapsed);
    this.element.textContent = `FPS ${fps}`;
    this.element.setAttribute('aria-label', `Rendering performance: ${fps} frames per second`);
    this.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.remove();
  }

  private reset(): void {
    this.elapsed = 0;
    this.frames = 0;
  }
}
