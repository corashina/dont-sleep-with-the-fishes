// @vitest-environment jsdom
// Importance: 95/100. Scaled controls must match world hit tests and cast coordinates.
import { afterEach, expect, it, vi } from 'vitest';
import { installUiScale } from '../src/ui/uiScale';
import { BoatAnchorView } from '../src/ui/BoatAnchorView';
import { SurvivalFishingView } from '../src/ui/SurvivalFishingView';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.documentElement.style.removeProperty('--ui-scale');
});

it.each([[2560, 1440], [1920, 1080]])('keeps object hits and fishing in screen coordinates at %i by %i', (width, height) => {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  const stopScale = installUiScale();
  const mount = document.createElement('main');
  document.body.append(mount);
  vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 10, width, height } as DOMRect);
  const anchors = new BoatAnchorView(mount);
  const fishing = new SurvivalFishingView(mount);
  mount.append(...anchors.roots, ...fishing.roots);
  const x = width / 2;
  const y = height / 2;
  const hitTest = vi.fn(() => true);
  try {
    anchors.setAnchors([{
      id: 'bait', itemType: 'baitTin', toolId: null, action: null, remainingUses: 4,
      x, y, visible: true, depleted: false, hitTest,
      hitArea: { width: 100, height: 80, depth: 1 },
    }]);
    const button = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bait"]')!;
    expect(button.style.transform).toBe(`translate(${x}px, ${y}px)`);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: x + 20, clientY: y + 10 }));
    expect(hitTest).toHaveBeenCalledWith(x, y);
    fishing.onCast = vi.fn(() => true);
    fishing.setState({ mode: 'aiming', message: '', biteTarget: null });
    fishing.interactionRoot.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: x + 20, clientY: y + 10 }));
    expect(fishing.onCast).toHaveBeenCalledWith({ x, y });
    fishing.setState({ mode: 'bite', message: '', biteTarget: { x, y, width: 100, height: 80, depth: 1, visible: true } });
    expect(fishing.biteButton.style.transform).toBe(`translate(${x}px, ${y}px)`);
    expect(fishing.biteButton.style.width).toBe('100px');
  } finally {
    anchors.dispose();
    fishing.dispose();
    stopScale();
  }
});
