import {
  type VisualQuality,
  type VisualQualityPreference,
} from '../rendering/visualQuality';

export class VisualQualityControl {
  readonly element = document.createElement('fieldset');
  private readonly buttons: readonly HTMLButtonElement[];
  private disposed = false;

  constructor(private readonly preference: VisualQualityPreference) {
    this.element.className = 'visual-quality-control';
    this.element.innerHTML = `
      <legend class="ui-role-context">VISUAL QUALITY</legend>
      <div class="visual-quality-control__choices">
        <button type="button" data-visual-quality="low">LOW</button>
        <button type="button" data-visual-quality="high">HIGH</button>
      </div>
      <p class="ui-role-narrative">High sharpens contact depth.</p>
    `;
    this.buttons = [
      ...this.element.querySelectorAll<HTMLButtonElement>('[data-visual-quality]'),
    ];
    this.element.addEventListener('click', this.handleClick);
    this.sync();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.removeEventListener('click', this.handleClick);
    this.element.remove();
  }

  private readonly handleClick = (event: Event): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '[data-visual-quality]',
    );
    const value = button?.dataset.visualQuality;
    if (value !== 'low' && value !== 'high') return;
    this.preference.set(value);
    this.sync();
  };

  private sync(): void {
    const selected = this.preference.get();
    this.buttons.forEach((button) => {
      const active = button.dataset.visualQuality === selected;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
  }
}
