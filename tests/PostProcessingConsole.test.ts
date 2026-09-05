// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { PostProcessingConsole } from '../src/ui/PostProcessingConsole';

let console: PostProcessingConsole;
afterEach(() => { console?.dispose(); document.body.innerHTML = ''; });

it('keeps only developer controls and toggles with backtick', () => {
  const changes = vi.fn();
  const numeric = vi.fn();
  console = new PostProcessingConsole(document.body, {
    getState: () => ({ ambientOcclusionAvailable: true, ambientOcclusionMode: 'composite', ambientOcclusionIntensity: 1, ambientOcclusionRadius: .5 }),
    setAmbientOcclusionMode: vi.fn(), setNumeric: numeric,
  }, changes, { enabled: true, debugMeshes: false, setEnabled: vi.fn(), setDebugMeshes: vi.fn() });
  const root = console.element;
  for (const selector of ['[data-physics-enabled]', '[data-physics-debug]', '[data-presentation-weather]', '[data-post-processing-ao-mode]']) {
    expect(root.querySelector(selector)).not.toBeNull();
  }
  for (const selector of ['[data-language-select]', '[data-save-enabled]', '[data-audio-volume]', '[data-camera-fov]', '[data-quality-control]', '[data-performance-stats-enabled]', '[data-volumetric-clouds]']) {
    expect(root.querySelector(selector)).toBeNull();
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
  const radius = root.querySelector<HTMLInputElement>('[data-post-processing-setting="ambientOcclusionRadius"]')!;
  radius.value = '.2';
  radius.dispatchEvent(new Event('input', { bubbles: true }));
  expect(numeric).toHaveBeenCalledWith('ambientOcclusionRadius', .2);
  radius.click();
  expect(changes.mock.calls).toEqual([[true]]);
  const outside = document.createElement('button');
  const outsideClick = vi.fn();
  outside.addEventListener('click', outsideClick);
  document.body.append(outside);
  outside.click();
  expect(root.querySelector<HTMLElement>('[data-post-processing-panel]')!.hidden).toBe(true);
  expect(changes.mock.calls).toEqual([[true], [false]]);
  expect(outsideClick).not.toHaveBeenCalled();
  outside.click();
  expect(outsideClick).toHaveBeenCalledOnce();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
  root.querySelector<HTMLButtonElement>('[data-post-processing-close]')!.click();
  expect(changes.mock.calls).toEqual([[true], [false], [true], [false]]);
});
