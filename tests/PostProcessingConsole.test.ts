// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PostProcessingControlState,
  PostProcessingControls,
} from '../src/rendering/postProcessingControls';
import { PostProcessingConsole } from '../src/ui/PostProcessingConsole';

function state(): PostProcessingControlState {
  return {
    ambientOcclusionAvailable: true,
    ambientOcclusionMode: 'composite',
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

    expect(panel.textContent).not.toContain('Color grade');
    expect(panel.querySelectorAll('input[type="range"]')).toHaveLength(2);

    const aoMode = panel.querySelector<HTMLSelectElement>('[data-post-processing-ao-mode]')!;
    aoMode.value = 'debug';
    aoMode.dispatchEvent(new Event('change', { bubbles: true }));
    expect(controls.setAmbientOcclusionMode).toHaveBeenCalledWith('debug');

    const intensity = panel.querySelector<HTMLInputElement>(
      '[data-post-processing-setting="ambientOcclusionIntensity"]',
    )!;
    intensity.value = '0.4';
    intensity.dispatchEvent(new Event('input', { bubbles: true }));
    expect(controls.setNumeric).toHaveBeenCalledWith('ambientOcclusionIntensity', 0.4);
    expect(
      panel.querySelector<HTMLOutputElement>(
        '[data-post-processing-output="ambientOcclusionIntensity"]',
      )
        ?.value,
    ).toBe('0.40');

    consoleMenu.dispose();
    expect(consoleMenu.element.isConnected).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    expect(consoleMenu.element.dataset.open).toBe('false');
  });
});
