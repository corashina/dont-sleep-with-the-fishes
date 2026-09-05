// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsMenu } from '../src/ui/SettingsMenu';
import { getLanguage, setLanguage } from '../src/i18n/language';
import { GameUI } from '../src/ui/GameUI';
import { MenuUI } from '../src/menu/MenuUI';
import { SurvivalModalViews } from '../src/ui/SurvivalModalViews';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
import { createWaterQualityPreference } from '../src/rendering/waterQuality';
import { createAntiAliasingQualityPreference } from '../src/rendering/antiAliasingQuality';
import { createShadowQualityPreference } from '../src/rendering/shadowQuality';
import type { PostProcessingControlState } from '../src/rendering/postProcessingControls';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach((dispose) => dispose()); document.body.innerHTML = ''; });

function setup(enabled = false, savedDay: number | null = null) {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new GameUI(mount);
  ui.setPaused(true);
  cleanup.push(() => ui.dispose());
  const aoState: PostProcessingControlState = {
    ambientOcclusionAvailable: true,
    ambientOcclusionMode: 'composite',
    ambientOcclusionQuality: 'low',
    ambientOcclusionIntensity: 1,
    ambientOcclusionRadius: .28,
  };
  const options = {
    ambientOcclusion: {
      getState: () => aoState,
      setAmbientOcclusionMode: vi.fn((mode: PostProcessingControlState['ambientOcclusionMode']) => { aoState.ambientOcclusionMode = mode; }),
      setAmbientOcclusionQuality: vi.fn((quality: PostProcessingControlState['ambientOcclusionQuality']) => { aoState.ambientOcclusionQuality = quality; }),
      setNumeric: vi.fn(),
    },
    audio: { volume: .6, setVolume: vi.fn() },
    camera: { fieldOfView: 65, setFieldOfView: vi.fn() },
    performance: { visible: false, setVisible: vi.fn() },
    clouds: { enabled: false, available: true, setEnabled: vi.fn() },
    save: { enabled, savedDay, setEnabled: vi.fn(), continueSavedRun: vi.fn() },
    visualQuality: createVisualQualityPreference(vi.fn(), null),
    waterQuality: createWaterQualityPreference(vi.fn(), null),
    antiAliasingQuality: createAntiAliasingQualityPreference(vi.fn(), null),
    shadowQuality: createShadowQualityPreference(vi.fn(), null),
  };
  const menu = new SettingsMenu(mount, options);
  cleanup.push(() => menu.dispose());
  const button = mount.querySelector<HTMLButtonElement>('[data-open-settings]')!;
  const pause = mount.querySelector<HTMLElement>('[data-pause]')!;
  return { menu, options, button, pause, ui, mount };
}

describe('Settings menu', () => {
  it('sets AO presets and reflects developer changes when reopened', () => {
    const { menu, options, button } = setup();
    button.click();
    const quality = menu.element.querySelector<HTMLFieldSetElement>('[data-quality-control="ambient-occlusion"]')!;
    for (const value of ['high', 'off', 'low'] as const) {
      const choice = quality.querySelector<HTMLButtonElement>(`[data-quality="${value}"]`)!;
      choice.click();
      expect(choice.getAttribute('aria-pressed')).toBe('true');
      expect(options.ambientOcclusion.getState().ambientOcclusionMode).toBe(value === 'off' ? 'off' : 'composite');
      if (value !== 'off') expect(options.ambientOcclusion.getState().ambientOcclusionQuality).toBe(value);
    }
    expect(options.ambientOcclusion.setNumeric).not.toHaveBeenCalled();
    menu.close();
    options.ambientOcclusion.setAmbientOcclusionMode('off');
    button.click();
    expect(quality.querySelector('[data-quality="off"]')!.getAttribute('aria-pressed')).toBe('true');
    menu.close();
    options.ambientOcclusion.getState().ambientOcclusionAvailable = false;
    button.click();
    expect(quality.disabled).toBe(true);
  });

  it('returns from Settings to the start menu pause panel before closing it', () => {
    const { menu, mount, ui } = setup();
    ui.dispose();
    const startMenu = new MenuUI(mount);
    cleanup.push(() => startMenu.dispose());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const settings = mount.querySelector<HTMLButtonElement>('[data-open-settings]')!;
    settings.click();
    expect(menu.element.hidden).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.element.hidden).toBe(true);
    expect(startMenu.isOverlayOpen).toBe(true);
    expect(document.activeElement).toBe(settings);
    settings.click();
    menu.element.querySelector<HTMLButtonElement>('[data-settings-back]')!.click();
    expect(startMenu.isOverlayOpen).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(startMenu.isOverlayOpen).toBe(false);
  });

  it('opens from pause, traps focus, blocks shortcuts, and returns to pause', () => {
    const { menu, button, pause, ui } = setup();
    const resume = vi.fn();
    ui.onResume = resume;
    const gameplayKey = vi.fn();
    window.addEventListener('keydown', gameplayKey);
    cleanup.push(() => window.removeEventListener('keydown', gameplayKey));
    button.click();
    expect(menu.element.hidden).toBe(false);
    expect(pause.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(menu.element.querySelector('[data-save-enabled]'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
    expect(document.activeElement).toBe(menu.element.querySelector('[data-settings-back]'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(document.activeElement).toBe(menu.element.querySelector('[data-save-enabled]'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(gameplayKey).not.toHaveBeenCalled();
    expect(menu.element.hidden).toBe(true);
    expect(pause.classList.contains('is-visible')).toBe(true);
    expect(pause.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(resume).not.toHaveBeenCalled();
  });

  it('places Settings after Resume in both pause menus', () => {
    const { button, mount, menu } = setup();
    expect(button.previousElementSibling?.getAttribute('aria-label')).toBe('Resume');
    expect(button.nextElementSibling?.getAttribute('aria-label')).toBe('Back to menu');
    const survival = new SurvivalModalViews();
    cleanup.push(() => survival.dispose());
    mount.append(survival.pauseRoot);
    survival.pauseRoot.setAttribute('aria-hidden', 'false');
    survival.pauseRoot.removeAttribute('inert');
    const survivalButton = survival.pauseRoot.querySelector<HTMLButtonElement>('[data-open-settings]')!;
    expect(survivalButton.previousElementSibling).toBe(survival.resumeButton);
    expect(survivalButton.nextElementSibling).toBe(survival.pauseMenuButton);
    survivalButton.click();
    expect(menu.element.hidden).toBe(false);
    menu.element.querySelector<HTMLButtonElement>('[data-settings-back]')!.click();
    expect(document.activeElement).toBe(survivalButton);
  });

  it('applies sound, camera, frame rate, cloud, and quality controls', () => {
    const { menu, options, button } = setup();
    button.click();
    for (const [selector, value] of [['[data-audio-volume]', '35'], ['[data-camera-fov]', '90']] as const) {
      const input = menu.element.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(options.audio.setVolume).toHaveBeenCalledWith(.35);
    expect(options.camera.setFieldOfView).toHaveBeenCalledWith(90);
    for (const selector of ['[data-performance-stats-enabled]', '[data-volumetric-clouds]']) {
      menu.element.querySelector<HTMLInputElement>(selector)!.click();
    }
    expect(options.performance.setVisible).toHaveBeenCalledWith(true);
    expect(options.clouds.setEnabled).toHaveBeenCalledWith(true);
    menu.element.querySelector<HTMLButtonElement>('[data-quality-control="water"] [data-quality="ultra"]')!.click();
    expect(options.waterQuality.get()).toBe('ultra');
    menu.setVolumetricCloudAvailability(false);
    expect(menu.element.querySelector<HTMLInputElement>('[data-volumetric-clouds]')!.disabled).toBe(true);
    expect(menu.element.querySelector('[data-volumetric-clouds-state]')!.textContent).toBe('UNAVAILABLE');
  });

  it('updates saves and keeps newly created checkpoints when enabling auto-save', () => {
    const { menu, button, options } = setup();
    button.click();
    const continueButton = menu.element.querySelector<HTMLButtonElement>('[data-save-continue]')!;
    expect(continueButton.disabled).toBe(true);
    expect(menu.element.querySelector('[data-save-status]')!.textContent).toBe('');
    options.save.setEnabled.mockImplementation((enabled: boolean) => menu.setSaveState(enabled, 8));
    menu.element.querySelector<HTMLInputElement>('[data-save-enabled]')!.click();
    expect(options.save.setEnabled).toHaveBeenCalledWith(true);
    expect(menu.element.querySelector('[data-save-status]')!.textContent).toBe('DAY 8');
    expect(continueButton.disabled).toBe(false);
    options.save.continueSavedRun.mockImplementation(() => expect(menu.element.hidden).toBe(true));
    continueButton.click();
    expect(options.save.continueSavedRun).toHaveBeenCalledOnce();
    menu.setSaveState(false, 8);
    expect(continueButton.disabled).toBe(true);
    menu.setSaveState(true, null);
    expect(menu.element.querySelector('[data-save-status]')!.textContent).toBe('NO SAVE');
  });

  it('removes listeners and restores pause on disposal', () => {
    const { menu, button, pause } = setup();
    button.click();
    menu.dispose();
    expect(pause.hasAttribute('inert')).toBe(false);
    button.click();
    expect(menu.element.isConnected).toBe(false);
    expect(menu.element.hidden).toBe(true);
  });

  it('changes language from Settings while keeping the pause open', () => {
    const { menu, button } = setup();
    button.click();
    cleanup.push(() => setLanguage('en'));
    const select = menu.element.querySelector<HTMLSelectElement>('[data-language-select]')!;
    select.value = 'pl';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getLanguage()).toBe('pl');
    expect(menu.element.querySelector('#settings-title')!.textContent).toBe('Ustawienia');
    expect(menu.element.hidden).toBe(false);
    menu.close();
    expect(button.getAttribute('aria-label')).toBe('Ustawienia');
    expect(document.activeElement).toBe(button);
  });
});
