// @vitest-environment jsdom
// Importance: 95/100. Scaling must preserve controls and world target alignment.
import { afterEach, expect, it, vi } from 'vitest';
import { installUiScale, uiScaleForViewport } from '../src/ui/uiScale';
import { focusedEventPlacement } from '../src/ui/focusedEventPlacement';
import { FocusedEventView } from '../src/ui/FocusedEventView';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.documentElement.style.removeProperty('--ui-scale');
});

it.each([
  [2560, 1440, 1],
  [1920, 1080, 0.75],
  [2240, 1260, 0.875],
  [2560, 1080, 0.75],
  [1920, 1440, 0.75],
  [3840, 2160, 1],
  [1280, 720, 0.75],
])('scales the UI for a %i by %i viewport', (width, height, scale) => {
  expect(uiScaleForViewport(width, height)).toBe(scale);
});

it('updates CSS before resize listeners position controls', () => {
  vi.stubGlobal('innerWidth', 2560);
  vi.stubGlobal('innerHeight', 1440);
  const dispose = installUiScale();
  const resize = vi.fn(() => document.documentElement.style.getPropertyValue('--ui-scale'));
  window.addEventListener('resize', resize);
  try {
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1');
    vi.stubGlobal('innerWidth', 1920);
    vi.stubGlobal('innerHeight', 1080);
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.75');
    expect(resize).toHaveReturnedWith('0.75');
  } finally {
    dispose();
    window.removeEventListener('resize', resize);
  }
});

it('preserves popup placement relative to projected loot at 1080p', () => {
  const place = (scale: number) => focusedEventPlacement(
    2560 * scale, 1440 * scale, 420 * scale, 360 * scale,
    { x: 1500 * scale, y: 800 * scale, width: 600 * scale, height: 400 * scale, depth: 1, visible: true },
    scale,
  );
  const reference = place(1);
  const scaled = place(0.75);
  expect(scaled.placement).toBe(reference.placement);
  expect(scaled.x).toBeCloseTo(reference.x * 0.75);
  expect(scaled.y).toBeCloseTo(reference.y * 0.75);
  expect(scaled.maximumHeight).toBeCloseTo(reference.maximumHeight * 0.75);
});

it('resizes an open loot card without moving the projected target', () => {
  let width = 2560;
  let height = 1440;
  vi.spyOn(document.body, 'getBoundingClientRect').mockImplementation(() => ({ width, height } as DOMRect));
  const view = new FocusedEventView(document.body);
  document.body.append(view.root);
  try {
    view.show({ eventId: 'drifting-supplies', choices: [], target: null });
    expect(view.root.style.getPropertyValue('--focused-event-width')).toBe('420px');
    width = 1920;
    height = 1080;
    window.dispatchEvent(new Event('resize'));
    expect(view.root.style.getPropertyValue('--focused-event-width')).toBe('315px');
    expect(view.root.style.getPropertyValue('--focused-event-x')).toBe('803px');
    expect(view.root.style.getPropertyValue('--focused-event-max-height')).toBe('969px');
  } finally { view.dispose(); }
});
