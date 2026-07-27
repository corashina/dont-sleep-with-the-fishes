import type { ItemAmbientOcclusionMode } from '../rendering/ItemAmbientOcclusion';
import {
  formatPostProcessingValue,
  POST_PROCESSING_SLIDERS,
  type PostProcessingControlState,
  type PostProcessingControls,
  type PostProcessingNumericSetting,
} from '../rendering/postProcessingControls';

const PANEL_ID = 'post-processing-console-panel';

export class PostProcessingConsole {
  readonly element = document.createElement('aside');
  private readonly panel: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private disposed = false;

  constructor(
    mount: HTMLElement,
    private readonly controls: PostProcessingControls,
  ) {
    const state = controls.getState();
    this.element.className = 'post-processing-console';
    this.element.dataset.open = 'false';
    this.element.innerHTML = `
      <button
        type="button"
        class="post-processing-console__toggle"
        data-post-processing-toggle
        aria-expanded="false"
        aria-controls="${PANEL_ID}"
      >POST FX <kbd>\`</kbd></button>
      <section
        id="${PANEL_ID}"
        class="post-processing-console__panel"
        data-post-processing-panel
        aria-label="Post-processing console"
        hidden
      >
        <header>
          <strong>POST FX CONSOLE</strong>
          <button type="button" data-post-processing-close aria-label="Close post-processing console">×</button>
        </header>
        <label class="post-processing-console__switch">
          <input type="checkbox" data-post-processing-grade>
          <span>Color grade enabled</span>
        </label>
        <label class="post-processing-console__select">
          <span>Ambient occlusion</span>
          <select data-post-processing-ao-mode>
            <option value="composite">COMPOSITE</option>
            <option value="debug">DEBUG BUFFER</option>
            <option value="off">OFF</option>
          </select>
        </label>
        <div class="post-processing-console__sliders" data-post-processing-sliders></div>
      </section>
    `;
    this.panel = this.requireElement('[data-post-processing-panel]');
    this.toggleButton = this.requireElement('[data-post-processing-toggle]');
    const grade = this.requireElement<HTMLInputElement>('[data-post-processing-grade]');
    const aoMode = this.requireElement<HTMLSelectElement>('[data-post-processing-ao-mode]');
    grade.checked = state.gradeEnabled;
    aoMode.value = state.ambientOcclusionMode;
    aoMode.disabled = !state.ambientOcclusionAvailable;
    this.buildSliders(state);
    this.element.addEventListener('click', this.handleClick);
    this.element.addEventListener('change', this.handleChange);
    this.element.addEventListener('input', this.handleInput);
    window.addEventListener('keydown', this.handleKeyDown);
    mount.append(this.element);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.removeEventListener('click', this.handleClick);
    this.element.removeEventListener('change', this.handleChange);
    this.element.removeEventListener('input', this.handleInput);
    this.element.dataset.open = 'false';
    this.element.remove();
  }

  private buildSliders(state: Readonly<PostProcessingControlState>): void {
    const host = this.requireElement('[data-post-processing-sliders]');
    for (const definition of POST_PROCESSING_SLIDERS) {
      const label = document.createElement('label');
      label.className = 'post-processing-console__slider';
      label.dataset.group = definition.group;
      const value = state[definition.key];
      label.innerHTML = `
        <span>${definition.label}</span>
        <output data-post-processing-output="${definition.key}">${formatPostProcessingValue(definition.key, value)}</output>
        <input
          type="range"
          min="${definition.minimum}"
          max="${definition.maximum}"
          step="${definition.step}"
          value="${value}"
          data-post-processing-setting="${definition.key}"
        >
      `;
      if (
        definition.group === 'ambient-occlusion'
        && !state.ambientOcclusionAvailable
      ) {
        label.querySelector('input')!.disabled = true;
      }
      host.append(label);
    }
  }

  private setOpen(open: boolean): void {
    if (this.disposed) return;
    this.element.dataset.open = String(open);
    this.panel.hidden = !open;
    this.toggleButton.setAttribute('aria-expanded', String(open));
    if (open && document.pointerLockElement != null) {
      document.exitPointerLock?.();
    }
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target as Element | null;
    if (target?.closest('[data-post-processing-toggle]')) {
      this.setOpen(this.panel.hidden);
    } else if (target?.closest('[data-post-processing-close]')) {
      this.setOpen(false);
    }
  };

  private readonly handleChange = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-post-processing-grade]')) {
      this.controls.setGradeEnabled(target.checked);
      return;
    }
    if (target instanceof HTMLSelectElement && target.matches('[data-post-processing-ao-mode]')) {
      const mode = target.value as ItemAmbientOcclusionMode;
      if (mode === 'composite' || mode === 'debug' || mode === 'off') {
        this.controls.setAmbientOcclusionMode(mode);
      }
    }
  };

  private readonly handleInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
    const setting = target.dataset.postProcessingSetting as
      | PostProcessingNumericSetting
      | undefined;
    if (setting === undefined) return;
    const value = Number(target.value);
    this.controls.setNumeric(setting, value);
    const output = this.element.querySelector<HTMLOutputElement>(
      `[data-post-processing-output="${setting}"]`,
    );
    if (output !== null) output.value = formatPostProcessingValue(setting, value);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.code !== 'Backquote' || event.repeat
      || event.altKey || event.ctrlKey || event.metaKey
    ) return;
    event.preventDefault();
    this.setOpen(this.panel.hidden);
  };

  private requireElement<T extends Element = HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing post-processing console element: ${selector}`);
    return element;
  }
}
