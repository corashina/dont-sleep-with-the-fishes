import { settingsText } from '../i18n/settingsMessages';
import type { AudioControls, CameraControls, SaveControls, PerformanceStatsControls, VolumetricCloudControls } from './SettingsControls';

function checkedAttribute(checked: boolean): string {
  return checked ? 'checked' : '';
}

function buildPerformanceStatsControl(controls: PerformanceStatsControls): string {
  return `
    <div class="settings-menu__group">
      <strong data-settings-copy="performance">${settingsText('performance')}</strong>
      <label class="settings-menu__toggle">
        <span data-settings-copy="fps">${settingsText('fps')}</span>
        <input
          type="checkbox"
          role="switch"
          data-performance-stats-enabled
          ${checkedAttribute(controls.visible)}
        >
      </label>
    </div>
  `;
}

function buildAudioControl(controls: AudioControls): string {
  const volume = Math.round(controls.volume * 100);
  return `
    <div class="settings-menu__group">
      <label class="settings-menu__slider">
        <span data-settings-copy="volume">${settingsText('volume')}</span>
        <output data-audio-volume-output>${volume}%</output>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value="${volume}"
          data-audio-volume
          data-settings-aria="volumeAria" aria-label="${settingsText('volumeAria')}"
        >
      </label>
    </div>
  `;
}

function buildCameraControl(controls: CameraControls): string {
  return `
    <div class="settings-menu__group">
      <strong data-settings-copy="camera">${settingsText('camera')}</strong>
      <label class="settings-menu__slider">
        <span data-settings-copy="fov">${settingsText('fov')}</span>
        <output data-camera-fov-output>${Math.round(controls.fieldOfView)}°</output>
        <input
          type="range"
          min="40"
          max="110"
          step="1"
          value="${controls.fieldOfView}"
          data-camera-fov
          data-settings-aria="fovAria" aria-label="${settingsText('fovAria')}"
        >
      </label>
    </div>
  `;
}

function buildGeneralCategory(controls: SaveControls): string {
  return `
    <section class="settings-menu__category">
      <h3 data-settings-copy="general">${settingsText('general')}</h3>
      <div class="settings-menu__group settings-menu__save">
        <label class="settings-menu__toggle">
          <span data-settings-copy="autoSave">${settingsText('autoSave')}</span>
          <input
            type="checkbox"
            role="switch"
            data-save-enabled
            data-settings-aria="autoSaveAria" aria-label="${settingsText('autoSaveAria')}"
            ${checkedAttribute(controls.enabled)}
          >
          <output data-save-status></output>
        </label>
        <button type="button" data-save-continue data-settings-copy="continueSave">${settingsText('continueSave')}</button>
      </div>
      <label class="settings-menu__language"><span>Language / Język</span>
        <select data-language-select aria-label="Language / Język"><option value="en">English</option><option value="pl">Polski</option></select>
      </label>
    </section>
  `;
}

function buildVolumetricCloudControl(controls: VolumetricCloudControls): string {
  const disabled = controls.available ? '' : 'disabled';
  const state = controls.available ? '' : settingsText('unavailable');
  return `<label class="settings-menu__toggle">
    <span data-settings-copy="clouds">${settingsText('clouds')}</span>
    <input
      type="checkbox"
      role="switch"
      data-volumetric-clouds
      ${checkedAttribute(controls.enabled)}
      ${disabled}
    >
    <output data-volumetric-clouds-state>${state}</output>
  </label>`;
}

export interface SettingsMarkupOptions {
  audio: AudioControls;
  camera: CameraControls;
  save: SaveControls;
  performance: PerformanceStatsControls;
  clouds: VolumetricCloudControls;
}

export function settingsMarkup(options: SettingsMarkupOptions): string {
  return `
    <div class="settings-menu__paper">
      <header><h2 class="ui-role-display" id="settings-title" data-settings-copy="settings">${settingsText('settings')}</h2></header>
      <div class="settings-menu__sections">
        ${buildGeneralCategory(options.save)}
        <section class="settings-menu__category"><h3 data-settings-copy="sound">${settingsText('sound')}</h3>${buildAudioControl(options.audio)}</section>
        <section class="settings-menu__category"><h3 data-settings-copy="graphics">${settingsText('graphics')}</h3>
          <div class="settings-menu__quality" data-settings-quality></div>
          ${buildCameraControl(options.camera)}
          <div class="settings-menu__group">${buildVolumetricCloudControl(options.clouds)}</div>
          ${buildPerformanceStatsControl(options.performance)}
        </section>
      </div>
      <footer><button type="button" class="settings-menu__back ui-role-context" data-settings-back data-settings-copy="back">${settingsText('back')}</button></footer>
    </div>`;
}
