// @vitest-environment jsdom
// Importance: 10/10. Protects drifting choices, placement, input, state, and cleanup.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriftingItemView } from '../src/ui/DriftingItemView';

const activeViews: DriftingItemView[] = [];

afterEach(() => {
  activeViews.splice(0).forEach((view) => view.dispose());
  document.body.innerHTML = '';
});

function createView() {
  const coordinateRoot = document.createElement('div');
  document.body.append(coordinateRoot);
  vi.spyOn(coordinateRoot, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600,
    width: 800, height: 600, toJSON: () => ({}),
  });
  const view = new DriftingItemView(coordinateRoot);
  coordinateRoot.append(view.root);
  vi.spyOn(view.card, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 200,
    width: 300, height: 200, toJSON: () => ({}),
  });
  activeViews.push(view);
  return { view, coordinateRoot };
}

const choices = [
  { id: 'retrieve', label: 'RETRIEVE', energyCost: 1, energyOwner: 'player' as const, unavailableReason: null },
  {
    id: 'delegate-carlitos', label: 'SEND CARLITOS', energyCost: 3,
    energyOwner: 'carlitos' as const, unavailableReason: 'Carlitos needs more energy.',
  },
  { id: 'sleep', label: 'LET IT DRIFT', unavailableReason: null },
];

describe('DriftingItemView', () => {
  it('owns the exact single root and focus markup', () => {
    const { view } = createView();

    expect(view.root.className).toBe('drifting-item-focus');
    expect(view.root.getAttribute('role')).toBe('dialog');
    expect(view.root.getAttribute('aria-modal')).toBe('true');
    expect(view.card.className).toBe(
      'dive-result__paper drifting-item-focus__card scuba-popup-paper',
    );
    expect(view.title.id).toBe('drifting-item-focus-title');
    expect(view.backButton.parentElement).toBe(view.root);
    expect(view.backButton.getAttribute('aria-label')).toBe('Return to boat');
    expect(view.backButton.querySelector('path')?.getAttribute('d'))
      .toBe('M9 3h6v10h5l-8 8-8-8h5z');
  });

  it('keeps generic choice order, copy, energy, and reasons without owner copy', () => {
    const { view } = createView();
    view.show({ eventId: 'drifting-bottle', title: 'DRIFTING BOTTLE', choices, target: null });
    const buttons = [...view.root.querySelectorAll<HTMLButtonElement>('[data-event-choice]')];

    expect(buttons.map((button) => button.dataset.eventChoice))
      .toEqual(['retrieve', 'delegate-carlitos', 'sleep']);
    expect(view.title.textContent).toBe('DRIFTING BOTTLE');
    expect(buttons.map((button) => button.querySelector('.drifting-item-focus__cost')?.textContent))
      .toEqual(['⚡️', '⚡️⚡️⚡️', undefined]);
    expect(view.root.textContent).not.toContain('PLAYER');
    expect(view.root.textContent).not.toContain('CARLITOS —');
    expect(buttons[1]!.querySelector('.event-choice__reason')?.textContent)
      .toBe('Carlitos needs more energy.');
  });

  it('keeps unavailable choices focusable and suppresses their command', () => {
    const { view } = createView();
    const choose = vi.fn();
    view.onChoice = choose;
    view.show({ eventId: 'drifting-bottle', title: 'BOTTLE', choices, target: null });
    const unavailable = view.choiceButton('delegate-carlitos')!;

    expect(unavailable.disabled).toBe(false);
    expect(unavailable.getAttribute('aria-disabled')).toBe('true');
    expect(unavailable.getAttribute('aria-description')).toBe('Carlitos needs more energy.');
    unavailable.focus();
    expect(document.activeElement).toBe(unavailable);
    unavailable.click();
    expect(choose).not.toHaveBeenCalled();
  });

  it('emits root choice and Back clicks only while usable', () => {
    const { view } = createView();
    const choose = vi.fn();
    const back = vi.fn();
    view.onChoice = choose;
    view.onBack = back;
    view.show({ eventId: 'drifting-bottle', title: 'BOTTLE', choices, target: null });

    view.choiceButton('retrieve')!.querySelector('span')!.click();
    view.backButton.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(choose).toHaveBeenCalledWith('retrieve');
    expect(back).toHaveBeenCalledOnce();

    view.canUse = () => false;
    view.choiceButton('sleep')!.click();
    view.backButton.click();
    expect(choose).toHaveBeenCalledOnce();
    expect(back).toHaveBeenCalledOnce();
  });

  it('keeps busy and selected choices focusable while suppressing commands', () => {
    const { view } = createView();
    const choose = vi.fn();
    view.onChoice = choose;
    view.show({ eventId: 'drifting-bottle', title: 'BOTTLE', choices, target: null });
    const retrieve = view.choiceButton('retrieve')!;

    view.setBusy(true);
    expect(retrieve.disabled).toBe(false);
    expect(retrieve.getAttribute('aria-disabled')).toBe('true');
    retrieve.click();
    expect(choose).not.toHaveBeenCalled();

    view.setBusy(false);
    view.setSelectedChoice('retrieve');
    expect(retrieve.dataset.eventState).toBe('selected');
    expect(retrieve.getAttribute('aria-pressed')).toBe('true');
    expect(view.choiceButton('sleep')?.getAttribute('aria-disabled')).toBe('true');
    view.choiceButton('sleep')!.click();
    expect(choose).not.toHaveBeenCalled();
  });

  it('uses the first available choice and Back only when none are available', () => {
    const { view } = createView();
    view.show({ eventId: 'drifting-bottle', title: 'BOTTLE', choices, target: null });
    expect(view.initialFocus()).toBe(view.choiceButton('retrieve'));

    view.show({
      eventId: 'drifting-bottle', title: 'BOTTLE', target: null,
      choices: choices.map((choice) => ({ ...choice, unavailableReason: 'NO' })),
    });
    expect(view.initialFocus()).toBe(view.backButton);
  });

  it('clones the target and places CSS variables beside it', () => {
    const { view } = createView();
    const target = { x: 420, y: 260, width: 64, height: 64, depth: 2, visible: true };
    view.show({ eventId: 'drifting-bottle', title: 'BOTTLE', choices, target });
    const x = view.root.style.getPropertyValue('--drifting-x');

    expect(view.root.dataset.anchorState).toBe('projected');
    expect(['left', 'right']).toContain(view.root.dataset.placement);
    expect(view.root.style.getPropertyValue('--drifting-width')).not.toBe('');
    expect(view.root.style.getPropertyValue('--drifting-max-height')).not.toBe('');
    Object.assign(target, { x: 20, y: 20 });
    window.dispatchEvent(new Event('resize'));
    expect(view.root.style.getPropertyValue('--drifting-x')).toBe(x);
  });

  it('uses centered fallback placement and clamps projected updates', () => {
    const { view } = createView();
    view.show({ eventId: 'drifting-bottle', title: 'BOTTLE', choices, target: null });
    expect(view.root.dataset.placement).toBe('center');
    expect(view.root.dataset.anchorState).toBe('fallback');

    view.updateTarget({ x: 790, y: 590, width: 20, height: 20, depth: 1, visible: true });
    expect(Number.parseFloat(view.root.style.getPropertyValue('--drifting-x'))).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(view.root.style.getPropertyValue('--drifting-y'))).toBeGreaterThanOrEqual(20);
    view.updateTarget({ x: 0, y: 0, width: 0, height: 0, depth: 0, visible: false });
    expect(view.root.dataset.anchorState).toBe('fallback');
  });

  it('hides and clears choices, target, selection, and title', () => {
    const { view } = createView();
    const hide = vi.fn();
    view.onHide = hide;
    view.show({ eventId: 'drifting-bottle', title: 'BOTTLE', choices, target: null });
    view.setSelectedChoice('retrieve');
    view.hide();

    expect(hide).toHaveBeenCalledOnce();
    expect(view.title.textContent).toBe('');
    expect(view.root.querySelectorAll('[data-event-choice]')).toHaveLength(0);
  });

  it('removes root and resize listeners once during disposal', () => {
    const { view } = createView();
    const choose = vi.fn();
    const back = vi.fn();
    view.onChoice = choose;
    view.onBack = back;
    view.show({ eventId: 'drifting-bottle', title: 'BOTTLE', choices, target: null });
    const choice = view.choiceButton('retrieve')!;
    const x = view.root.style.getPropertyValue('--drifting-x');

    view.dispose();
    view.dispose();
    choice.click();
    view.backButton.click();
    window.dispatchEvent(new Event('resize'));
    expect(choose).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(view.root.style.getPropertyValue('--drifting-x')).toBe(x);
  });

  it('continues to resize cleanup after the root listener removal fails', () => {
    const { view } = createView();
    const firstError = new Error('root listener cleanup failed');
    const rootRemove = vi.spyOn(view.root, 'removeEventListener')
      .mockImplementationOnce(() => { throw firstError; });
    const windowRemove = vi.spyOn(window, 'removeEventListener');

    expect(() => view.dispose()).toThrow(firstError);
    expect(rootRemove).toHaveBeenCalledWith('click', expect.any(Function));
    expect(windowRemove.mock.calls.some(([type]) => type === 'resize')).toBe(true);
    expect(() => view.dispose()).not.toThrow();
  });
});
