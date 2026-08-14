export interface QualityPreference<T extends string> {
  get(): T;
  set(value: T): void;
}

export interface QualityChoice<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface QualityControlOptions<T extends string> {
  readonly kind: string;
  readonly label: string;
  readonly note: string;
  readonly choices: readonly QualityChoice<T>[];
}

export class QualityControl<T extends string> {
  readonly element = document.createElement('fieldset');
  private readonly buttons: readonly HTMLButtonElement[];
  private readonly choices: readonly QualityChoice<T>[];
  private disposed = false;

  constructor(
    private readonly preference: QualityPreference<T>,
    options: Readonly<QualityControlOptions<T>>,
  ) {
    this.choices = options.choices;
    this.element.className = 'visual-quality-control';
    this.element.dataset.qualityControl = options.kind;
    this.element.innerHTML = `
      <legend class="ui-role-context">${options.label}</legend>
      <div class="visual-quality-control__choices">
        ${options.choices.map(({ value, label }) => `
          <button type="button" data-quality="${value}">${label}</button>
        `).join('')}
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
    const choice = this.choices.find(({ value: allowed }) => allowed === value);
    if (choice === undefined) return;
    this.preference.set(choice.value);
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
