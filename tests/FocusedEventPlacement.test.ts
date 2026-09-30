// @vitest-environment jsdom
// Importance: 90/100. Loot choices must stay on screen without hiding the event.
import { afterEach, expect, it, vi } from 'vitest';
import { focusedEventPlacement } from '../src/ui/focusedEventPlacement';
import { FocusedEventView } from '../src/ui/FocusedEventView';

const target = (x: number, y: number, width: number, height: number) =>
  ({ x, y, width, height, depth: 1, visible: true });

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

it.each([360, 1080])('places the popup beside loot at x=%s, toward the center', x => {
  const bounds = target(x, 400, 300, 260);
  const result = focusedEventPlacement(1440, 900, 420, 300, bounds, 1);
  expect(result.placement).toBe(x < 720 ? 'right' : 'left');
  expect(Math.abs(result.x + 210 - 720)).toBeLessThanOrEqual(24);
  expect(x < 720 ? result.x - (x + 150) : x - 150 - (result.x + 420)).toBe(24);
  expect(result.y + 150).toBeCloseTo(450);
  expect(result.maximumHeight).toBeGreaterThanOrEqual(300);
});

it('keeps a wide whale clear by placing the popup above it', () => {
  const result = focusedEventPlacement(1280, 900, 420, 280, target(640, 530, 1000, 200), 1);
  expect(result.placement).toBe('above');
  expect(result.x).toBe(430);
  expect(result.y + 280).toBeLessThanOrEqual(406);
});

it('limits the popup height below loot on a narrow screen', () => {
  const result = focusedEventPlacement(390, 844, 350, 360, target(195, 240, 320, 120), 1);
  expect(result.placement).toBe('below');
  expect(result.y).toBeGreaterThanOrEqual(324);
  expect(result.y + Math.min(360, result.maximumHeight)).toBeLessThanOrEqual(716);
  expect(result.x).toBe(20);
});

it('scrolls a tall popup above loot when neither side has space', () => {
  const result = focusedEventPlacement(628, 600, 420, 360, target(314, 350, 550, 120), 1);
  expect(result.placement).toBe('above');
  expect(result.maximumHeight).toBe(246);
  expect(result.y + result.maximumHeight).toBeLessThan(290);
});

it('uses new target bounds after an open popup is resized', () => {
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 1440, height: 900 } as DOMRect);
  const view = new FocusedEventView(document.body);
  document.body.append(view.root);
  try {
    view.show({ eventId: 'drifting-supplies', choices: [], target: target(360, 400, 300, 260) });
    expect(view.root.dataset.placement).toBe('right');
    view.updateTarget(target(1080, 400, 300, 260));
    expect(view.root.dataset.placement).toBe('left');
  } finally { view.dispose(); }
});
