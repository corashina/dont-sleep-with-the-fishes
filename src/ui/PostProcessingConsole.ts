import { onLanguageChange } from '../i18n/language';
import { settingsText, refreshSettingsText } from '../i18n/settingsMessages';
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
  PRESENTATION_WEATHER_IDS,
  presentationWeatherProfile,
  type PresentationWeatherId,
  type WeatherControlSource,
} from '../weather/presentationWeather';
import type { SkyPhase } from '../world/skyPalette';

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

export interface TimeOfDayControls {
  readonly selected: SkyPhase;
  setTimeOfDay(phase: SkyPhase): void;
}

export interface EventTestControls {
  readonly options: readonly EventTestOption[];
  enterEvent(id: string): void;
}

const DEFAULT_WEATHER_CONTROLS: WeatherControls = {
  selected: 'calm',
  source: 'normal',
  setWeather: () => undefined,
};

interface ConsoleMarkupOptions {
  readonly physicsControls?: PhysicsToggleControls;
  readonly timeOfDayControls?: TimeOfDayControls;
  readonly eventTestControls?: EventTestControls;
  readonly weatherControls: WeatherControls;
}

function checkedAttribute(checked: boolean): string {
  return checked ? 'checked' : '';
}

function buildGameplayPhysicsControl(controls?: PhysicsToggleControls): string {
  if (controls === undefined) return '';
  return `
    <div class="post-processing-console__group">
      <strong data-settings-copy="simulation">${settingsText('simulation')}</strong>
      <label class="post-processing-console__physics">
        <span data-settings-copy="barrels">${settingsText('barrels')}</span>
        <input
          type="checkbox"
          role="switch"
          data-physics-enabled
          ${checkedAttribute(controls.enabled)}
        >
      </label>
    </div>
  `;
}

function buildDiagnosticPhysicsControl(controls?: PhysicsToggleControls): string {
  if (controls === undefined) return '';
  const disabled = controls.enabled ? '' : 'disabled';
  return `
    <div class="post-processing-console__group">
      <strong data-settings-copy="physics">${settingsText('physics')}</strong>
      <label class="post-processing-console__physics">
        <span data-settings-copy="collisions">${settingsText('collisions')}</span>
        <input
          type="checkbox"
          role="switch"
          data-physics-debug
          ${checkedAttribute(controls.debugMeshes)}
          ${disabled}
        >
      </label>
    </div>
  `;
}

function buildEventTestControlHost(controls?: EventTestControls): string {
  if (controls === undefined) return '';
  return '<div class="post-processing-console__group" data-event-test-control></div>';
}

function buildToolsCategory(options: ConsoleMarkupOptions): string {
  const controls = [
    buildDiagnosticPhysicsControl(options.physicsControls),
    buildEventTestControlHost(options.eventTestControls),
  ].join('');
  if (controls.length === 0) return '';
  return `<section class="post-processing-console__category">
    <h2 data-settings-copy="tools">${settingsText('tools')}</h2>
    ${controls}
  </section>`;
}

function buildTimeOfDayControl(controls?: TimeOfDayControls): string {
  if (controls === undefined) return '';
  const isNight = controls.selected === 'night';
  const label = isNight ? settingsText('night') : settingsText('day');
  return `<div class="post-processing-console__group">
    <strong data-settings-copy="time">${settingsText('time')}</strong>
    <label class="post-processing-console__toggle">
      <span data-time-of-day-label>${label}</span>
      <input
        type="checkbox"
        role="switch"
        data-presentation-night
        ${checkedAttribute(isNight)}
      >
      <output data-time-of-day-state>${settingsText(controls.selected === 'night' ? 'nightUpper' : 'dayUpper')}</output>
    </label>
  </div>`;
}

function buildConsoleMarkup(options: ConsoleMarkupOptions): string {
  const weatherOptions = PRESENTATION_WEATHER_IDS.map((id) => `
    <option value="${id}">${presentationWeatherProfile(id).label}</option>
  `).join('');
  return `
    <section
      id="${PANEL_ID}"
      class="post-processing-console__panel"
      data-post-processing-panel
      data-settings-aria="developer" aria-label="${settingsText('developer')}"
      hidden
    >
      <header>
        <strong data-settings-copy="developerTitle">${settingsText('developerTitle')}</strong>
        <button type="button" data-post-processing-close data-settings-aria="closeDeveloper" aria-label="${settingsText('closeDeveloper')}">×</button>
      </header>
      <div class="post-processing-console__columns">
        <div class="post-processing-console__category-column">
          ${buildToolsCategory(options)}
        </div>
        <div class="post-processing-console__category-column">
          <section class="post-processing-console__category post-processing-console__category--graphics">
            <h2 data-settings-copy="graphicsUpper">${settingsText('graphicsUpper')}</h2>
            <div class="post-processing-console__group post-processing-console__group--ao">
              <strong data-settings-copy="ao">${settingsText('ao')}</strong>
              <label class="post-processing-console__select">
                <span data-settings-copy="display">${settingsText('display')}</span>
                <select data-post-processing-ao-mode>
                  <option value="composite" data-settings-copy="composite">${settingsText('composite')}</option>
                  <option value="debug" data-settings-copy="debug">${settingsText('debug')}</option>
                  <option value="off" data-settings-copy="off">${settingsText('off')}</option>
                </select>
              </label>
              <div class="post-processing-console__sliders" data-post-processing-sliders></div>
            </div>
          </section>
          <section class="post-processing-console__category">
            <h2 data-settings-copy="gameplay">${settingsText('gameplay')}</h2>
            ${buildGameplayPhysicsControl(options.physicsControls)}
            ${buildTimeOfDayControl(options.timeOfDayControls)}
            <div class="post-processing-console__group">
              <strong data-settings-copy="weather">${settingsText('weather')}</strong>
              <label class="post-processing-console__select">
                <span>
                  <span data-settings-copy="presentation">${settingsText('presentation')}</span>
                  <output data-weather-source>${settingsText(options.weatherControls.source)}</output>
                </span>
                <select data-presentation-weather>
                  ${weatherOptions}
                </select>
              </label>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

export class PostProcessingConsole {
  readonly element = document.createElement('aside');
  private readonly panel: HTMLElement;
  private readonly weatherSelect: HTMLSelectElement;
  private readonly weatherSource: HTMLOutputElement;
  private weatherId: PresentationWeatherId;
  private weatherControlSource: WeatherControlSource;
  private disposed = false;
  private readonly unsubscribeLanguage: () => void;

  constructor(
    mount: HTMLElement,
    private readonly controls: PostProcessingControls,
    private readonly onOpenChange: (open: boolean) => void = () => undefined,
    private readonly physicsControls?: PhysicsToggleControls,
    private readonly weatherControls: WeatherControls = DEFAULT_WEATHER_CONTROLS,
    private readonly timeOfDayControls?: TimeOfDayControls,
    private readonly eventTestControls?: EventTestControls,
  ) {
    const state = controls.getState();
    this.weatherId = weatherControls.selected;
    this.weatherControlSource = weatherControls.source;
    this.element.className = 'post-processing-console';
    this.element.dataset.open = 'false';
    this.element.innerHTML = buildConsoleMarkup({
      physicsControls,
      timeOfDayControls,
      eventTestControls,
      weatherControls,
    });
    this.panel = this.requireElement('[data-post-processing-panel]');
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
    window.addEventListener('click', this.handleOutsideClick, true);
    mount.append(this.element);
    this.refreshLanguage();
    this.unsubscribeLanguage = onLanguageChange(this.refreshLanguage);
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
    this.weatherSource.value = settingsText(source);
  }

  setTimeOfDayState(phase: SkyPhase): void {
    if (this.disposed) return;
    const input = this.element.querySelector<HTMLInputElement>('[data-presentation-night]');
    const label = this.element.querySelector<HTMLElement>('[data-time-of-day-label]');
    const output = this.element.querySelector<HTMLOutputElement>('[data-time-of-day-state]');
    if (input !== null) input.checked = phase === 'night';
    if (label !== null) label.textContent = phase === 'night' ? settingsText('night') : settingsText('day');
    if (output !== null) output.value = settingsText(phase === 'night' ? 'nightUpper' : phase === 'day' ? 'dayUpper' : 'lab');
  }

  dispose(): void {
    if (this.disposed) return;
    if (!this.panel.hidden) this.onOpenChange(false);
    this.disposed = true;
    this.unsubscribeLanguage();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('click', this.handleOutsideClick, true);
    this.element.removeEventListener('click', this.handleClick);
    this.element.removeEventListener('change', this.handleChange);
    this.element.removeEventListener('input', this.handleInput);
    this.element.dataset.open = 'false';
    this.element.remove();
  }

  private readonly refreshLanguage = (): void => {
    refreshSettingsText(this.element);
    this.weatherSource.value = settingsText(this.weatherControlSource);
    for (const option of this.weatherSelect.options) option.textContent = presentationWeatherProfile(option.value as PresentationWeatherId).label;
    const night = this.element.querySelector<HTMLInputElement>('[data-presentation-night]');
    if (night) this.setTimeOfDayState(night.checked ? 'night' : 'day');
    for (const definition of POST_PROCESSING_SLIDERS) {
      const input = this.element.querySelector('[data-post-processing-setting="' + definition.key + '"]');
      const span = input?.parentElement?.querySelector('span');
      if (span) span.textContent = definition.label;
    }
    this.refreshEventTestLanguage();
  };

  private refreshEventTestLanguage(): void {
    const host = this.element.querySelector('[data-event-test-control]');
    if (host) {
      host.querySelector('strong')!.textContent = settingsText('eventTest');
      host.querySelector('button')!.textContent = settingsText('enterEvent');
      host.querySelector('select')!.ariaLabel = settingsText('eventScene');
      for (const group of host.querySelectorAll('optgroup')) group.label = settingsText(group.dataset.phase === 'ending' ? 'endings' : group.dataset.phase === 'night' ? 'nightUpper' : group.dataset.phase === 'day' ? 'dayUpper' : 'lab');
      for (const option of host.querySelectorAll('option')) {
        const definition = this.eventTestControls?.options.find((entry) => entry.id === option.value);
        if (definition) option.textContent = definition.title;
      }
    }
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
    heading.textContent = settingsText('eventTest');

    const control = document.createElement('div');
    control.className = 'post-processing-console__event-test';
    const select = document.createElement('select');
    select.ariaLabel = settingsText('eventScene');
    select.dataset.eventTestSelect = '';
    for (const phase of ['lab', 'day', 'night', 'ending'] as const) {
      const options = controls.options.filter((option) => option.phase === phase);
      if (options.length === 0) continue;
      const group = document.createElement('optgroup');
      group.dataset.phase = phase;
      group.label = phase === 'ending' ? settingsText('endings') : phase.toUpperCase();
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
    enter.textContent = settingsText('enterEvent');
    control.append(select, enter);

    host.append(heading, control);
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

  private readonly handleOutsideClick = (event: MouseEvent): void => {
    if (this.panel.hidden || event.composedPath().includes(this.panel)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.setOpen(false);
  };

  private readonly handleClick = (event: Event): void => {
    const target = event.target as Element | null;
    if (this.handleEventTestEnter(target)) return;
    if (target?.closest('[data-post-processing-close]')) this.setOpen(false);
  };

  private readonly handleChange = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.handleInputChange(target);
    if (target instanceof HTMLSelectElement) this.handleSelectChange(target);
  };

  private handleEventTestEnter(target: Element | null): boolean {
    if (!target?.closest('[data-event-test-enter]')) return false;
    const select = this.element.querySelector<HTMLSelectElement>('[data-event-test-select]');
    const id = select?.value;
    if (id === undefined || this.eventTestControls === undefined) return true;
    if (!this.eventTestControls.options.some((option) => option.id === id)) return true;
    this.setOpen(false);
    this.eventTestControls.enterEvent(id);
    return true;
  }

  private handleInputChange(target: HTMLInputElement): void {
    if (target.matches('[data-presentation-night]')) {
      const phase: SkyPhase = target.checked ? 'night' : 'day';
      this.setTimeOfDayState(phase);
      this.timeOfDayControls?.setTimeOfDay(phase);
      return;
    }
    this.handleToggleInput(target);
  }

  private handleToggleInput(target: HTMLInputElement): void {
    if (target.matches('[data-physics-enabled]')) this.setPhysicsEnabled(target.checked);
    if (target.matches('[data-physics-debug]')) this.setPhysicsDebug(target.checked);
  }

  private handleSelectChange(target: HTMLSelectElement): void {
    if (target.matches('[data-presentation-weather]')) {
      const id = target.value as PresentationWeatherId;
      if (PRESENTATION_WEATHER_IDS.includes(id)) {
        this.setWeatherState(id, 'forced');
        this.weatherControls.setWeather(id);
      }
      return;
    }
    if (!target.matches('[data-post-processing-ao-mode]')) return;
    const mode = target.value as ItemAmbientOcclusionMode;
    if (mode === 'composite' || mode === 'debug' || mode === 'off') {
      this.controls.setAmbientOcclusionMode(mode);
    }
  }

  private setPhysicsEnabled(enabled: boolean): void {
    const debug = this.element.querySelector<HTMLInputElement>('[data-physics-debug]');
    if (debug !== null) debug.disabled = !enabled;
    this.physicsControls?.setEnabled(enabled);
  }

  private setPhysicsDebug(enabled: boolean): void {
    this.physicsControls?.setDebugMeshes(enabled);
  }

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
