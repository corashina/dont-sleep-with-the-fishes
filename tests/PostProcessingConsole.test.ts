// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PostProcessingControlState,
  PostProcessingControls,
} from '../src/rendering/postProcessingControls';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
import {
  PostProcessingConsole,
  type EventTestControls,
  type WeatherControls,
} from '../src/ui/PostProcessingConsole';

function state(): PostProcessingControlState {
  return {
    ambientOcclusionAvailable: true,
    ambientOcclusionMode: 'composite',
    ambientOcclusionIntensity: 1,
    ambientOcclusionRadius: 0.5,
  };
}

describe('PostProcessingConsole', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('toggles with Backquote and routes controls without retaining listeners', () => {
    const onOpenChange = vi.fn();
    const exitPointerLock = vi.fn();
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      value: document.createElement('canvas'),
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: exitPointerLock,
    });
    const controls: PostProcessingControls = {
      getState: vi.fn(() => state()),
      setAmbientOcclusionMode: vi.fn(),
      setNumeric: vi.fn(),
    };
    const mount = document.createElement('main');
    document.body.append(mount);
    const setPhysicsEnabled = vi.fn();
    const setDebugMeshes = vi.fn();
    const applyVisualQuality = vi.fn();
    const visualQuality = createVisualQualityPreference(applyVisualQuality, null);
    const consoleMenu = new PostProcessingConsole(
      mount,
      controls,
      onOpenChange,
      {
        enabled: true,
        debugMeshes: false,
        setEnabled: setPhysicsEnabled,
        setDebugMeshes,
      },
      visualQuality,
    );
    const panel = mount.querySelector<HTMLElement>('[data-post-processing-panel]')!;

    expect(mount.querySelector('[data-post-processing-toggle]')).toBeNull();
    expect(panel.hidden).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    expect(panel.hidden).toBe(false);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(exitPointerLock).toHaveBeenCalledOnce();

    expect(panel.textContent).not.toContain('Color grade');
    expect(panel.querySelectorAll('input[type="range"]')).toHaveLength(2);
    const qualityControl = panel.querySelector('[data-visual-quality-control]');
    const highQuality = panel.querySelector<HTMLButtonElement>(
      '[data-visual-quality="high"]',
    )!;
    expect(qualityControl).not.toBeNull();
    expect(panel.contains(qualityControl)).toBe(true);
    highQuality.click();
    expect(visualQuality.get()).toBe('high');
    expect(applyVisualQuality).toHaveBeenCalledWith('high');

    const physics = panel.querySelector<HTMLInputElement>('[data-physics-enabled]')!;
    expect(physics.checked).toBe(true);
    expect(panel.querySelector<HTMLOutputElement>('[data-physics-state]')?.value).toBe('ON');
    physics.checked = false;
    physics.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setPhysicsEnabled).toHaveBeenCalledWith(false);
    expect(panel.querySelector<HTMLOutputElement>('[data-physics-state]')?.value).toBe('OFF');

    const debugMeshes = panel.querySelector<HTMLInputElement>('[data-physics-debug]')!;
    expect(debugMeshes.disabled).toBe(true);
    physics.checked = true;
    physics.dispatchEvent(new Event('change', { bubbles: true }));
    expect(debugMeshes.disabled).toBe(false);
    debugMeshes.checked = true;
    debugMeshes.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setDebugMeshes).toHaveBeenCalledWith(true);
    expect(
      panel.querySelector<HTMLOutputElement>('[data-physics-debug-state]')?.value,
    ).toBe('ON');

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

    panel.querySelector<HTMLButtonElement>('[data-post-processing-close]')!.click();
    expect(panel.hidden).toBe(true);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    consoleMenu.dispose();
    expect(consoleMenu.element.isConnected).toBe(false);
    highQuality.click();
    expect(applyVisualQuality).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    expect(consoleMenu.element.dataset.open).toBe('false');
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      value: null,
    });
  });

  it('presents catalog weather in order and distinguishes effective from forced weather', () => {
    const controls: PostProcessingControls = {
      getState: vi.fn(() => state()),
      setAmbientOcclusionMode: vi.fn(),
      setNumeric: vi.fn(),
    };
    const setWeather = vi.fn();
    const weatherControls: WeatherControls = {
      selected: 'calm',
      source: 'normal',
      setWeather,
    };
    const mount = document.createElement('main');
    document.body.append(mount);
    const consoleMenu = new PostProcessingConsole(
      mount,
      controls,
      undefined,
      undefined,
      undefined,
      weatherControls,
    );
    const weather = mount.querySelector<HTMLSelectElement>(
      '[data-presentation-weather]',
    )!;
    const source = mount.querySelector<HTMLOutputElement>(
      '[data-weather-source]',
    )!;

    expect(Array.from(weather.options, (option) => [option.value, option.text]))
      .toEqual([
        ['calm', 'Calm'],
        ['overcast', 'Overcast'],
        ['squall', 'Squall'],
        ['rain', 'Rain'],
        ['wind', 'Wind'],
        ['thunderstorm', 'Thunderstorm'],
        ['waves', 'Waves'],
        ['fog', 'Fog'],
      ]);
    expect(weather.value).toBe('calm');
    expect(source.value).toBe('NORMAL');

    consoleMenu.setWeatherState('rain', 'event');
    expect(weather.value).toBe('rain');
    expect(source.value).toBe('EVENT');

    weather.value = 'fog';
    weather.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setWeather).toHaveBeenCalledOnce();
    expect(setWeather).toHaveBeenCalledWith('fog');
    expect(source.value).toBe('FORCED');

    consoleMenu.dispose();
    weather.value = 'wind';
    weather.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setWeather).toHaveBeenCalledOnce();
  });

  it('groups event test scenes and enters only after explicit activation', () => {
    const controls: PostProcessingControls = {
      getState: vi.fn(() => state()),
      setAmbientOcclusionMode: vi.fn(),
      setNumeric: vi.fn(),
    };
    const enterEvent = vi.fn();
    const eventTestControls: EventTestControls = {
      options: [
        { id: 'dangerous-waters', title: 'Dangerous Waters', phase: 'day' },
        { id: 'shower-night', title: 'Shower Night', phase: 'night' },
      ],
      enterEvent,
    };
    const mount = document.createElement('main');
    document.body.append(mount);
    const consoleMenu = new PostProcessingConsole(
      mount,
      controls,
      undefined,
      undefined,
      undefined,
      undefined,
      eventTestControls,
    );
    const select = mount.querySelector<HTMLSelectElement>('[data-event-test-select]')!;
    const panel = mount.querySelector<HTMLElement>('[data-post-processing-panel]')!;

    expect(Array.from(select.querySelectorAll('optgroup'), (group) => group.label))
      .toEqual(['DAY', 'NIGHT']);
    expect(Array.from(select.options, (option) => [option.value, option.text]))
      .toEqual([
        ['dangerous-waters', 'Dangerous Waters'],
        ['shower-night', 'Shower Night'],
      ]);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    select.value = 'shower-night';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(enterEvent).not.toHaveBeenCalled();

    mount.querySelector<HTMLButtonElement>('[data-event-test-enter]')!.click();
    expect(enterEvent).toHaveBeenCalledWith('shower-night');
    expect(panel.hidden).toBe(true);

    consoleMenu.dispose();
  });
});
