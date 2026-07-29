export type BinaryQuality = 'low' | 'high';

export interface BinaryQualityPreference {
  get(): BinaryQuality;
  set(value: BinaryQuality): void;
}

export interface BinaryQualityControlOptions {
  kind: string;
  label: string;
  note: string;
}

export class BinaryQualityControl {
  readonly element = document.createElement('fieldset');
  private readonly buttons: readonly HTMLButtonElement[];
  private disposed = false;

  constructor(
    private readonly preference: BinaryQualityPreference,
    options: Readonly<BinaryQualityControlOptions>,
  ) {
    this.element.className = 'visual-quality-control';
    this.element.dataset.qualityControl = options.kind;
    this.element.innerHTML = `
      <legend class="ui-role-context">${options.label}</legend>
      <div class="visual-quality-control__choices">
        <button type="button" data-quality="low">LOW</button>
        <button type="button" data-quality="high">HIGH</button>
      </div>
      <p class="ui-role-narrative">${options.note}</p>
    `;
    this.buttons = [
      ...this.element.querySelectorAll<HTMLButtonElement>('[data-quality]'),
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
      '[data-quality]',
    );
    const value = button?.dataset.quality;
    if (value !== 'low' && value !== 'high') return;
    this.preference.set(value);
    this.sync();
  };

  private sync(): void {
    const selected = this.preference.get();
    this.buttons.forEach((button) => {
      const active = button.dataset.quality === selected;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
  }
}
