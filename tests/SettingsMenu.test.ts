// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsMenu } from '../src/ui/SettingsMenu';
import { GameUI } from '../src/ui/GameUI';
import { MenuUI } from '../src/menu/MenuUI';
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
  it('closes from outside the paper without resuming the game', () => {
    const { menu, button, pause, ui } = setup();
    const resume = vi.fn();
    ui.onResume = resume;
    button.click();
    menu.element.querySelector<HTMLElement>('.settings-menu__paper')!.click();
    expect(menu.element.hidden).toBe(false);
    menu.element.click();
    expect(menu.element.hidden).toBe(true);
    expect(pause.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(resume).not.toHaveBeenCalled();
    pause.querySelector<HTMLElement>('.screen__content')!.click();
    expect(resume).not.toHaveBeenCalled();
    pause.click();
    expect(resume).toHaveBeenCalledOnce();
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
});
