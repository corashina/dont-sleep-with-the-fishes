import { onLanguageChange } from '../i18n/language';
import { systemText } from '../i18n/systemMessages';
export class PerformanceStats {
  private readonly element: HTMLOutputElement;
  private elapsed = 0;
  private frames = 0;
  private disposed = false;
  private lastFps: number | null = null;
  private readonly unsubscribeLanguage: () => void;

  constructor(mount: HTMLElement, visible = false) {
    this.element = document.createElement('output');
    this.element.className = 'performance-stats';
    this.element.dataset.performanceStats = '';
    this.element.hidden = !visible;
    this.element.textContent = 'FPS --';
    this.element.setAttribute('aria-label', systemText('fpsWait'));
    mount.append(this.element);
    this.unsubscribeLanguage = onLanguageChange(() => { this.element.setAttribute('aria-label', this.lastFps === null ? systemText('fpsWait') : systemText('fps', this.lastFps)); });
  }

  isVisible(): boolean {
    return !this.element.hidden;
  }

  setVisible(visible: boolean): void {
    if (this.disposed || visible === this.isVisible()) return;
    this.element.hidden = !visible;
    this.reset();
    if (visible) {
      this.lastFps = null;
      this.element.textContent = 'FPS --';
      this.element.setAttribute('aria-label', systemText('fpsWait'));
    }
  }

  recordFrame(deltaSeconds: number): void {
    if (
      this.disposed
      || !this.isVisible()
      || !Number.isFinite(deltaSeconds)
      || deltaSeconds <= 0
    ) return;
    if (deltaSeconds > 0.25) {
      this.reset();
      return;
    }

    this.elapsed += deltaSeconds;
    this.frames += 1;
    if (this.elapsed < 0.5) return;

    const fps = Math.round(this.frames / this.elapsed);
    this.lastFps = fps;
    this.element.textContent = `FPS ${fps}`;
    this.element.setAttribute('aria-label', systemText('fps', fps));
    this.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeLanguage();
    this.element.remove();
  }

  private reset(): void {
    this.elapsed = 0;
    this.frames = 0;
  }
}
