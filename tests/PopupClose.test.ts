// @vitest-environment jsdom
// Importance: 95/100. Closing must use the safe exit and respect action locks.
import { afterEach, expect, it, vi } from 'vitest';
import { FocusedEventView } from '../src/ui/FocusedEventView';
import { SurvivalEventView } from '../src/ui/SurvivalEventView';

const views: { dispose(): void }[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.dispose());
  document.body.replaceChildren();
});

it.each(['drifting-supplies', 'drifting-chest'] as const)(
  '%s closes through the return action and respects busy and modal locks',
  (eventId) => {
    const view = new FocusedEventView(document.body);
    views.push(view);
    document.body.append(view.root);
    view.onBack = vi.fn();
    view.onChoice = vi.fn();
    view.show({ eventId, target: null, choices: [] });
    const close = view.card.querySelector<HTMLButtonElement>('[data-focused-event-close]')!;

    view.setBusy(true);
    close.click();
    expect(view.onBack).not.toHaveBeenCalled();
    view.setBusy(false);
    view.canUse = () => false;
    close.click();
    expect(view.onBack).not.toHaveBeenCalled();
    view.canUse = () => true;
    close.click();
    expect(view.onBack).toHaveBeenCalledOnce();
    expect(view.onChoice).not.toHaveBeenCalled();
    view.hide();
    close.click();
    expect(view.onBack).toHaveBeenCalledOnce();
  },
);

it.each([
  ['check-the-back', 'check'],
  ['guarded-sleep', 'watch'],
  ['midnight-tour', 'visit'],
] as const)('%s closes through its decline choice', async (eventId, acceptId) => {
  const view = new SurvivalEventView();
  views.push(view);
  document.body.append(...view.roots);
  view.onChoice = vi.fn();
  await view.showReveal({ id: eventId, revealText: '', danger: 'uncertain' });
  view.setSelection([
    { id: acceptId, label: 'Yes', unavailableReason: null },
    { id: 'sleep', label: 'No', unavailableReason: null },
  ]);
  const close = view.caption.querySelector<HTMLButtonElement>('[data-event-close]')!;
  expect(close.hidden).toBe(false);
  expect(close.parentElement!.hidden).toBe(false);

  view.setBusy(true);
  close.click();
  expect(view.onChoice).not.toHaveBeenCalled();
  view.setBusy(false);
  view.setModalOpen(true);
  close.click();
  expect(view.onChoice).not.toHaveBeenCalled();
  view.setModalOpen(false);
  close.click();
  expect(view.onChoice).toHaveBeenCalledExactlyOnceWith('sleep');
  expect(view.caption.getAttribute('aria-hidden')).toBe('true');
  close.click();
  expect(view.onChoice).toHaveBeenCalledOnce();
  view.clear();
  expect(close.hidden).toBe(true);
  expect(close.parentElement!.hidden).toBe(true);
});
