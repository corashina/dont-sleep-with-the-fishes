// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PostProcessingControlState,
  PostProcessingControls,
} from '../src/rendering/postProcessingControls';
import { PostProcessingConsole } from '../src/ui/PostProcessingConsole';

function state(): PostProcessingControlState {
  return {
    gradeEnabled: true,
    ambientOcclusionAvailable: true,
    ambientOcclusionMode: 'composite',
    contrast: 1.08,
    saturation: 1.1,
    highlightCompression: 0.16,
    shadowLift: 0.12,
    shadowTintStrength: 0.025,
    highlightTintStrength: 0.035,
    posterizationLevels: 48,
    halftoneStrength: 0.075,
    ambientOcclusionIntensity: 0.65,
    ambientOcclusionRadius: 0.24,
  };
}

describe('PostProcessingConsole', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('toggles with Backquote and routes controls without retaining listeners', () => {
    const controls: PostProcessingControls = {
      getState: vi.fn(() => state()),
      setGradeEnabled: vi.fn(),
      setAmbientOcclusionMode: vi.fn(),
      setNumeric: vi.fn(),
    };
    const mount = document.createElement('main');
    document.body.append(mount);
    const consoleMenu = new PostProcessingConsole(mount, controls);
    const panel = mount.querySelector<HTMLElement>('[data-post-processing-panel]')!;
    const toggle = mount.querySelector<HTMLButtonElement>('[data-post-processing-toggle]')!;

    expect(panel.hidden).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const grade = panel.querySelector<HTMLInputElement>('[data-post-processing-grade]')!;
    grade.checked = false;
    grade.dispatchEvent(new Event('change', { bubbles: true }));
    expect(controls.setGradeEnabled).toHaveBeenCalledWith(false);

    const aoMode = panel.querySelector<HTMLSelectElement>('[data-post-processing-ao-mode]')!;
    aoMode.value = 'debug';
    aoMode.dispatchEvent(new Event('change', { bubbles: true }));
    expect(controls.setAmbientOcclusionMode).toHaveBeenCalledWith('debug');

    const contrast = panel.querySelector<HTMLInputElement>(
      '[data-post-processing-setting="contrast"]',
    )!;
    contrast.value = '1.15';
    contrast.dispatchEvent(new Event('input', { bubbles: true }));
    expect(controls.setNumeric).toHaveBeenCalledWith('contrast', 1.15);
    expect(
      panel.querySelector<HTMLOutputElement>('[data-post-processing-output="contrast"]')
        ?.value,
    ).toBe('1.15');

    consoleMenu.dispose();
    expect(consoleMenu.element.isConnected).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    expect(consoleMenu.element.dataset.open).toBe('false');
  });
});
