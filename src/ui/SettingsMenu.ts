import { getLanguage, setLanguage, onLanguageChange } from '../i18n/language';
import { settingsText, settingsDynamic, refreshSettingsText } from '../i18n/settingsMessages';
import type { VisualQualityPreference } from '../rendering/visualQuality';
import type { WaterQualityPreference } from '../rendering/waterQuality';
import type { AntiAliasingQualityPreference } from '../rendering/antiAliasingQuality';
import type { ShadowQualityPreference } from '../rendering/shadowQuality';
import { VisualQualityControl } from './VisualQualityControl';
import { WaterQualityControl } from './WaterQualityControl';
import { AntiAliasingQualityControl } from './AntiAliasingQualityControl';
import { ShadowQualityControl } from './ShadowQualityControl';
import { settingsMarkup, type SettingsMarkupOptions } from './SettingsMarkup';
import { createElementRequirement } from './dom';

const requireElement = createElementRequirement('settings menu');

export interface SettingsMenuOptions extends SettingsMarkupOptions {
  visualQuality: VisualQualityPreference;
  waterQuality: WaterQualityPreference;
  antiAliasingQuality: AntiAliasingQualityPreference;
  shadowQuality: ShadowQualityPreference;
}

export class SettingsMenu {
  readonly element = document.createElement('section');
  private readonly qualityControls;
  private pauseRoot: HTMLElement | null = null;
  private opener: HTMLButtonElement | null = null;
  private disposed = false;
  private readonly unsubscribeLanguage: () => void;
  private savedDay: number | null;
  private cloudAvailability: boolean;

  constructor(private readonly mount: HTMLElement, private readonly options: SettingsMenuOptions) {
    this.savedDay = options.save.savedDay;
    this.cloudAvailability = options.clouds.available;
    this.element.className = 'settings-menu';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'settings-title');
    this.element.innerHTML = settingsMarkup(options);
    this.qualityControls = [
      new VisualQualityControl(options.visualQuality),
      new WaterQualityControl(options.waterQuality),
      new AntiAliasingQualityControl(options.antiAliasingQuality),
      new ShadowQualityControl(options.shadowQuality),
    ];
    const host = requireElement(this.element, '[data-settings-quality]');
    for (const control of this.qualityControls) host.append(control.element);
    this.setSaveState(options.save.enabled, options.save.savedDay);
    this.mount.addEventListener('click', this.handleClick);
    this.element.addEventListener('input', this.handleInput);
    this.element.addEventListener('change', this.handleChange);
    window.addEventListener('keydown', this.handleKeyDown, true);
    this.mount.append(this.element);
    this.refreshLanguage();
    this.unsubscribeLanguage = onLanguageChange(this.refreshLanguage);
  }

  close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    this.pauseRoot?.removeAttribute('inert');
    this.pauseRoot?.setAttribute('aria-hidden', 'false');
    this.pauseRoot?.classList.remove('settings-covered');
    this.opener?.focus();
    this.pauseRoot = null;
    this.opener = null;
  }

  setSaveState(enabled: boolean, savedDay: number | null): void {
    if (this.disposed) return;
    this.savedDay = savedDay;
    requireElement<HTMLInputElement>(this.element, '[data-save-enabled]').checked = enabled;
    this.output('[data-save-status]', !enabled ? '' : savedDay === null ? settingsText('noSave') : settingsDynamic('day', savedDay));
    requireElement<HTMLButtonElement>(this.element, '[data-save-continue]').disabled = !enabled || savedDay === null;
  }

  setVolumetricCloudAvailability(available: boolean): void {
    if (this.disposed || available === this.cloudAvailability) return;
    this.cloudAvailability = available;
    const input = requireElement<HTMLInputElement>(this.element, '[data-volumetric-clouds]');
    input.disabled = !available;
    this.output('[data-volumetric-clouds-state]', available ? '' : settingsText('unavailable'));
  }

  dispose(): void {
    if (this.disposed) return;
    this.close();
    this.disposed = true;
    this.unsubscribeLanguage();
    this.mount.removeEventListener('click', this.handleClick);
    this.element.removeEventListener('input', this.handleInput);
    this.element.removeEventListener('change', this.handleChange);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    for (const control of this.qualityControls) control.dispose();
    this.element.remove();
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.matches('[data-open-settings]')) this.open(button);
    if (!this.element.contains(button)) return;
    if (button.matches('[data-settings-back]')) this.close();
    if (button.matches('[data-save-continue]')) {
      this.close();
      this.options.save.continueSavedRun();
    }
  };

  private open(button: HTMLButtonElement): void {
    const pause = button.closest<HTMLElement>('[data-pause]');
    if (!pause || pause.getAttribute('aria-hidden') !== 'false' || !this.element.hidden) return;
    this.opener = button;
    this.pauseRoot = pause;
    this.element.hidden = false;
    requireElement<HTMLInputElement>(this.element, '[data-save-enabled]').focus();
    pause.setAttribute('inert', '');
    pause.setAttribute('aria-hidden', 'true');
    pause.classList.add('settings-covered');
  }

  private readonly handleInput = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.matches('[data-audio-volume]')) {
      const value = Number(input.value);
      this.output('[data-audio-volume-output]', `${Math.round(value)}%`);
      this.options.audio.setVolume(value / 100);
    }
    if (input.matches('[data-camera-fov]')) {
      const value = Number(input.value);
      this.output('[data-camera-fov-output]', `${Math.round(value)}°`);
      this.options.camera.setFieldOfView(value);
    }
  };

  private readonly handleChange = (event: Event): void => {
    const input = event.target;
    if (input instanceof HTMLSelectElement) {
      this.changeLanguage(input.value);
      return;
    }
    if (!(input instanceof HTMLInputElement) || input.disabled) return;
    const enabled = input.checked;
    if (input.matches('[data-save-enabled]')) {
      this.options.save.setEnabled(enabled);
      this.setSaveState(enabled, this.savedDay);
    }
    if (input.matches('[data-performance-stats-enabled]')) {
      this.options.performance.setVisible(enabled);
    }
    if (input.matches('[data-volumetric-clouds]')) {
      this.options.clouds.setEnabled(enabled);
    }
  };

  private changeLanguage(value: string): void {
    if (value === 'en' || value === 'pl') setLanguage(value);
  }

  private readonly refreshLanguage = (): void => {
    refreshSettingsText(this.element);
    requireElement<HTMLSelectElement>(this.element, '[data-language-select]').value = getLanguage();
    const enabled = requireElement<HTMLInputElement>(this.element, '[data-save-enabled]').checked;
    this.setSaveState(enabled, this.savedDay);
    this.output('[data-volumetric-clouds-state]', this.cloudAvailability ? '' : settingsText('unavailable'));
  };

  private output(selector: string, value: string): void {
    requireElement<HTMLOutputElement>(this.element, selector).value = value;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.element.hidden) return;
    // Keep pause and developer shortcuts from reaching the active phase.
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) this.close();
    }
    if (event.key !== 'Tab') return;
    const controls = [...this.element.querySelectorAll<HTMLElement>(':is(button, input, select):not(:disabled)')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
}
