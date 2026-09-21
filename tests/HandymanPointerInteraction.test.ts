// @vitest-environment jsdom
// Importance: 95/100. Hidden hand geometry must not accept pointer input or show an outline.
import { expect, it, vi } from 'vitest';
import { BoatAnchorView } from '../src/ui/BoatAnchorView';

it('gates hand hover and clicks while retaining keyboard access', () => {
  const host = document.createElement('main');
  document.body.append(host);
  const view = new BoatAnchorView(host);
  host.append(...view.roots);
  const hitTest = vi.fn(() => false);
  const anchor = {
    id: 'handyman:hand', eventChoiceId: 'touch', label: '?',
    itemType: null, toolId: null, action: null, x: 400, y: 300,
    visible: true, depleted: false, remainingUses: null, hitTest,
  } as const;
  const highlight = vi.fn();
  const choose = vi.fn();
  view.onHighlight = highlight;
  view.onEventChoice = choose;
  try {
    view.beginEventPresentation();
    view.setEventSelection(new Map(), [{ id: 'touch', label: 'Touch', unavailableReason: null }]);
    view.setAnchors([anchor]);
    const button = view.anchorButton(anchor.id)!;
    const pointer = { bubbles: true, clientX: 400, clientY: 300, detail: 1 };
    button.dispatchEvent(new MouseEvent('pointerover', pointer));
    button.dispatchEvent(new MouseEvent('click', pointer));
    expect(highlight).not.toHaveBeenCalledWith(anchor.id);
    expect(choose).not.toHaveBeenCalled();

    hitTest.mockReturnValue(true);
    button.dispatchEvent(new MouseEvent('pointermove', pointer));
    expect(highlight).toHaveBeenLastCalledWith(anchor.id);
    expect(button.classList.contains('is-pointer-hit')).toBe(true);
    button.dispatchEvent(new MouseEvent('click', pointer));
    expect(choose).toHaveBeenCalledExactlyOnceWith('touch');

    hitTest.mockReturnValue(false);
    view.setAnchors([anchor]);
    expect(highlight).toHaveBeenLastCalledWith(null);
    expect(button.classList.contains('is-pointer-hit')).toBe(false);
    const down = new MouseEvent('mousedown', { ...pointer, cancelable: true });
    button.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    button.focus();
    expect(highlight).toHaveBeenLastCalledWith(anchor.id);
    button.click();
    expect(choose).toHaveBeenCalledTimes(2);
  } finally {
    view.dispose();
    host.remove();
  }
});
