import { settingsText } from '../i18n/settingsMessages';
import type { PostProcessingControls } from '../rendering/postProcessingControls';

export class PosterizationControl {
  readonly element = document.createElement('div');
  private readonly checkbox: HTMLInputElement;
  private readonly slider: HTMLInputElement;
  private readonly output: HTMLOutputElement;

  constructor(private readonly controls: PostProcessingControls) {
    this.element.className = 'settings-menu__group';
    this.element.innerHTML = `
      <label class="settings-menu__toggle">
        <span id="posterization-name" data-settings-copy="posterization">${settingsText('posterization')}</span>
        <input type="checkbox" data-posterization-enabled>
      </label>
      <label class="settings-menu__slider">
        <span id="posterization-strength" data-settings-copy="posterizationStrength">${settingsText('posterizationStrength')}</span>
        <input type="range" min="0" max="1" step="0.05" data-posterization-strength
          aria-labelledby="posterization-name posterization-strength">
        <output data-posterization-output></output>
      </label>
    `;
    this.checkbox = this.element.querySelector<HTMLInputElement>('[data-posterization-enabled]')!;
    this.slider = this.element.querySelector<HTMLInputElement>('[data-posterization-strength]')!;
    this.output = this.element.querySelector<HTMLOutputElement>('[data-posterization-output]')!;
    this.checkbox.addEventListener('change', this.handleChange);
    this.slider.addEventListener('input', this.handleInput);
    this.refresh();
  }

  refresh(): void {
    const setting = this.controls.getState().posterization;
    this.checkbox.checked = setting.enabled;
    this.slider.value = String(setting.strength);
    this.slider.disabled = !setting.enabled;
    this.output.value = `${Math.round(setting.strength * 100)}%`;
  }

  dispose(): void {
    this.checkbox.removeEventListener('change', this.handleChange);
    this.slider.removeEventListener('input', this.handleInput);
    this.element.remove();
  }

  private readonly handleChange = (): void => {
    this.controls.setPosterization({ ...this.controls.getState().posterization, enabled: this.checkbox.checked });
    this.refresh();
  };

  private readonly handleInput = (): void => {
    this.controls.setPosterization({ ...this.controls.getState().posterization, strength: Number(this.slider.value) });
    this.refresh();
  };
}
