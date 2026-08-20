// @vitest-environment jsdom
// Importance: 8/10. Protects live system-tuning camera controls.

import { describe, expect, it, vi } from 'vitest';
import type { PostProcessingControls } from '../src/rendering/postProcessingControls';
import { PostProcessingConsole } from '../src/ui/PostProcessingConsole';

const postProcessingControls = (): PostProcessingControls => ({
  getState: () => ({
    ambientOcclusionAvailable: true,
    ambientOcclusionMode: 'composite',
    ambientOcclusionIntensity: 1,
    ambientOcclusionRadius: 0.5,
  }),
  setAmbientOcclusionMode: () => undefined,
  setNumeric: () => undefined,
});

describe('PostProcessingConsole camera controls', () => {
  it('shows and applies vertical field of view changes', () => {
    const mount = document.createElement('main');
    const setFieldOfView = vi.fn();
    const menu = new PostProcessingConsole(
      mount,
      postProcessingControls(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { fieldOfView: 75, setFieldOfView },
    );
    const input = mount.querySelector<HTMLInputElement>('[data-camera-fov]')!;
    const output = mount.querySelector<HTMLOutputElement>('[data-camera-fov-output]')!;

    expect(input.value).toBe('75');
    expect(output.value).toBe('75°');

    input.value = '90';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(setFieldOfView).toHaveBeenCalledWith(90);
    expect(output.value).toBe('90°');
    menu.dispose();
  });
});
