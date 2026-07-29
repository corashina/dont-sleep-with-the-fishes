import type { EventTestOption } from '../app/EventTest';
import type { ItemAmbientOcclusionMode } from '../rendering/ItemAmbientOcclusion';
import {
  formatPostProcessingValue,
  POST_PROCESSING_SLIDERS,
  type PostProcessingControlState,
  type PostProcessingControls,
  type PostProcessingNumericSetting,
} from '../rendering/postProcessingControls';
import {
  createVisualQualityPreference,
  type VisualQualityPreference,
} from '../rendering/visualQuality';
import {
  createWaterQualityPreference,
  type WaterQualityPreference,
} from '../rendering/waterQuality';
import {
  PRESENTATION_WEATHER_IDS,
  presentationWeatherProfile,
  type PresentationWeatherId,
  type WeatherControlSource,
} from '../weather/presentationWeather';
import { VisualQualityControl } from './VisualQualityControl';
import { WaterQualityControl } from './WaterQualityControl';

const PANEL_ID = 'post-processing-console-panel';

export interface PhysicsToggleControls {
  readonly enabled: boolean;
  readonly debugMeshes: boolean;
  setEnabled(enabled: boolean): void;
  setDebugMeshes(enabled: boolean): void;
}

export interface WeatherControls {
  readonly selected: PresentationWeatherId;
  readonly source: WeatherControlSource;
  setWeather(id: PresentationWeatherId): void;
}

export interface EventTestControls {
  readonly options: readonly EventTestOption[];
  enterEvent(id: string): void;
}

export interface PerformanceStatsControls {
  readonly visible: boolean;
  setVisible(visible: boolean): void;
}

const DEFAULT_WEATHER_CONTROLS: WeatherControls = {
  selected: 'calm',
  source: 'normal',
  setWeather: () => undefined,
};

export class PostProcessingConsole {
  readonly element = document.createElement('aside');
  private readonly panel: HTMLElement;
  private readonly visualQualityControl: VisualQualityControl;
  private readonly waterQualityControl: WaterQualityControl;
  private readonly weatherSelect: HTMLSelectElement;
  private readonly weatherSource: HTMLOutputElement;
  private weatherId: PresentationWeatherId;
  private weatherControlSource: WeatherControlSource;
  private disposed = false;

  constructor(
    mount: HTMLElement,
    private readonly controls: PostProcessingControls,
    private readonly onOpenChange: (open: boolean) => void = () => undefined,
    private readonly physicsControls?: PhysicsToggleControls,
    visualQuality: VisualQualityPreference = createVisualQualityPreference(
      () => undefined,
      null,
    ),
    private readonly weatherControls: WeatherControls = DEFAULT_WEATHER_CONTROLS,
    private readonly eventTestControls?: EventTestControls,
    waterQuality: WaterQualityPreference = createWaterQualityPreference(
      () => undefined,
      null,
    ),
    private readonly performanceStatsControls?: PerformanceStatsControls,
  ) {
    const state = controls.getState();
    this.weatherId = weatherControls.selected;
    this.weatherControlSource = weatherControls.source;
    const physicsControl = physicsControls === undefined
      ? ''
      : `
        <section class="post-processing-console__section">
          <strong>PHYSICS</strong>
          <label class="post-processing-console__physics">
            <span>
              Barrel simulation
              <small id="physics-toggle-note">Reloads the scene; fully unloads physics when off</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              data-physics-enabled
              aria-describedby="physics-toggle-note"
              ${physicsControls.enabled ? 'checked' : ''}
            >
            <output data-physics-state>${physicsControls.enabled ? 'ON' : 'OFF'}</output>
          </label>
          <label class="post-processing-console__physics">
            <span>
              Collision meshes
              <small id="physics-debug-note">Shows the physics shapes over the ship</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              data-physics-debug
              aria-describedby="physics-debug-note"
              ${physicsControls.debugMeshes ? 'checked' : ''}
              ${physicsControls.enabled ? '' : 'disabled'}
            >
            <output data-physics-debug-state>${physicsControls.debugMeshes ? 'ON' : 'OFF'}</output>
          </label>
        </section>
      `;
    const performanceStatsControl = performanceStatsControls === undefined
      ? ''
      : `
        <section class="post-processing-console__section">
          <strong>DISPLAY</strong>
          <label class="post-processing-console__toggle">
            <span>
              Frame rate
              <small id="performance-stats-note">Shows current frames per second during play</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              data-performance-stats-enabled
              aria-describedby="performance-stats-note"
              ${performanceStatsControls.visible ? 'checked' : ''}
            >
            <output data-performance-stats-state>${performanceStatsControls.visible ? 'ON' : 'OFF'}</output>
          </label>
        </section>
      `;
    this.element.className = 'post-processing-console';
    this.element.dataset.open = 'false';
    this.element.innerHTML = `
      <section
        id="${PANEL_ID}"
        class="post-processing-console__panel"
        data-post-processing-panel
        aria-label="System tuning menu"
        hidden
      >
        <header>
          <strong>SYSTEM TUNING</strong>
          <button type="button" data-post-processing-close aria-label="Close system tuning menu">×</button>
        </header>
        ${physicsControl}
        ${performanceStatsControl}
        <section class="post-processing-console__section" data-ao-quality-control></section>
        <section class="post-processing-console__section" data-water-quality-control></section>
        ${eventTestControls === undefined
          ? ''
          : '<section class="post-processing-console__section" data-event-test-control></section>'}
        <section class="post-processing-console__section">
          <strong>WEATHER</strong>
          <label class="post-processing-console__select">
            <span>
              Presentation
              <output data-weather-source>${weatherControls.source.toUpperCase()}</output>
            </span>
            <select data-presentation-weather>
              ${PRESENTATION_WEATHER_IDS.map((id) => `
                <option value="${id}">${presentationWeatherProfile(id).label}</option>
              `).join('')}
            </select>
          </label>
          <small>Forced weather persists until reload.</small>
        </section>
        <section class="post-processing-console__section">
          <strong>AMBIENT OCCLUSION</strong>
          <label class="post-processing-console__select">
            <span>Display</span>
            <select data-post-processing-ao-mode>
              <option value="composite">COMPOSITE</option>
              <option value="debug">DEBUG BUFFER</option>
              <option value="off">OFF</option>
            </select>
          </label>
          <div class="post-processing-console__sliders" data-post-processing-sliders></div>
        </section>
      </section>
    `;
    this.panel = this.requireElement('[data-post-processing-panel]');
    this.visualQualityControl = new VisualQualityControl(visualQuality);
    this.requireElement('[data-ao-quality-control]').append(
      this.visualQualityControl.element,
    );
    this.waterQualityControl = new WaterQualityControl(waterQuality);
    this.requireElement('[data-water-quality-control]').append(
      this.waterQualityControl.element,
    );
    if (eventTestControls !== undefined) this.buildEventTestControl(eventTestControls);
    this.weatherSelect = this.requireElement('[data-presentation-weather]');
    this.weatherSource = this.requireElement('[data-weather-source]');
    this.weatherSelect.value = weatherControls.selected;
    const aoMode = this.requireElement<HTMLSelectElement>('[data-post-processing-ao-mode]');
    aoMode.value = state.ambientOcclusionMode;
    aoMode.disabled = !state.ambientOcclusionAvailable;
    this.buildSliders(state);
    this.element.addEventListener('click', this.handleClick);
    this.element.addEventListener('change', this.handleChange);
    this.element.addEventListener('input', this.handleInput);
    window.addEventListener('keydown', this.handleKeyDown);
    mount.append(this.element);
  }

  setWeatherState(
    id: PresentationWeatherId,
    source: WeatherControlSource,
  ): void {
    if (
      this.disposed
      || (id === this.weatherId && source === this.weatherControlSource)
    ) return;
    this.weatherId = id;
    this.weatherControlSource = source;
    this.weatherSelect.value = id;
    this.weatherSource.value = source.toUpperCase();
  }

  dispose(): void {
    if (this.disposed) return;
    if (!this.panel.hidden) this.onOpenChange(false);
    this.disposed = true;
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.removeEventListener('click', this.handleClick);
    this.element.removeEventListener('change', this.handleChange);
    this.element.removeEventListener('input', this.handleInput);
    this.visualQualityControl.dispose();
    this.waterQualityControl.dispose();
    this.element.dataset.open = 'false';
    this.element.remove();
  }

  private buildSliders(state: Readonly<PostProcessingControlState>): void {
    const host = this.requireElement('[data-post-processing-sliders]');
    for (const definition of POST_PROCESSING_SLIDERS) {
      const label = document.createElement('label');
      label.className = 'post-processing-console__slider';
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
      if (!state.ambientOcclusionAvailable) {
        label.querySelector('input')!.disabled = true;
      }
      host.append(label);
    }
  }

  private buildEventTestControl(controls: EventTestControls): void {
    const host = this.requireElement('[data-event-test-control]');
    const heading = document.createElement('strong');
    heading.textContent = 'EVENT TEST';

    const control = document.createElement('div');
    control.className = 'post-processing-console__event-test';
    const select = document.createElement('select');
    select.ariaLabel = 'Event test scene';
    select.dataset.eventTestSelect = '';
    for (const phase of ['day', 'night'] as const) {
      const options = controls.options.filter((option) => option.phase === phase);
      if (options.length === 0) continue;
      const group = document.createElement('optgroup');
      group.label = phase.toUpperCase();
      for (const option of options) {
        const element = document.createElement('option');
        element.value = option.id;
        element.textContent = option.title;
        group.append(element);
      }
      select.append(group);
    }
    const enter = document.createElement('button');
    enter.type = 'button';
    enter.dataset.eventTestEnter = '';
    enter.textContent = 'ENTER EVENT';
    control.append(select, enter);

    const note = document.createElement('small');
    note.textContent = 'Starts a fresh survival run with every item usable.';
    host.append(heading, control, note);
  }

  private setOpen(open: boolean): void {
    if (this.disposed) return;
    if (this.panel.hidden === !open) return;
    this.element.dataset.open = String(open);
    this.panel.hidden = !open;
    this.onOpenChange(open);
    if (open && document.pointerLockElement != null) {
      document.exitPointerLock?.();
    }
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target as Element | null;
    if (target?.closest('[data-event-test-enter]')) {
      const select = this.element.querySelector<HTMLSelectElement>('[data-event-test-select]');
      const id = select?.value;
      if (
        id === undefined
        || this.eventTestControls === undefined
        || !this.eventTestControls.options.some((option) => option.id === id)
      ) return;
      this.setOpen(false);
      this.eventTestControls.enterEvent(id);
      return;
    }
    if (target?.closest('[data-post-processing-close]')) {
      this.setOpen(false);
    }
  };

  private readonly handleChange = (event: Event): void => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement
      && target.matches('[data-performance-stats-enabled]')
    ) {
      const output = this.element.querySelector<HTMLOutputElement>(
        '[data-performance-stats-state]',
      );
      if (output !== null) output.value = target.checked ? 'ON' : 'OFF';
      this.performanceStatsControls?.setVisible(target.checked);
      return;
    }
    if (
      target instanceof HTMLInputElement
      && target.matches('[data-physics-enabled]')
    ) {
      const output = this.element.querySelector<HTMLOutputElement>('[data-physics-state]');
      if (output !== null) output.value = target.checked ? 'ON' : 'OFF';
      const debug = this.element.querySelector<HTMLInputElement>('[data-physics-debug]');
      if (debug !== null) debug.disabled = !target.checked;
      this.physicsControls?.setEnabled(target.checked);
      return;
    }
    if (
      target instanceof HTMLInputElement
      && target.matches('[data-physics-debug]')
    ) {
      const output = this.element.querySelector<HTMLOutputElement>(
        '[data-physics-debug-state]',
      );
      if (output !== null) output.value = target.checked ? 'ON' : 'OFF';
      this.physicsControls?.setDebugMeshes(target.checked);
      return;
    }
    if (
      target instanceof HTMLSelectElement
      && target.matches('[data-presentation-weather]')
    ) {
      const id = target.value as PresentationWeatherId;
      if (!PRESENTATION_WEATHER_IDS.includes(id)) return;
      this.setWeatherState(id, 'forced');
      this.weatherControls.setWeather(id);
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
