// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { SurvivalEventView } from '../src/ui/SurvivalEventView';
import { survivalEventById } from '../src/survival/eventCatalog';

it('shows the island popup only after arrival and provides both choices', async () => {
  const view = new SurvivalEventView();
  document.body.append(...view.roots);
  const choices = [
    { id: 'visit' as const, label: 'Visit island', unavailableReason: null },
    { id: 'sleep' as const, label: 'Skip island', unavailableReason: null },
  ];
  await view.showReveal(survivalEventById('midnight-tour')!);
  view.setSelection([{ ...choices[0]!, anchorId: 'midnight-tour:island' }, choices[1]!]);
  expect(view.caption.getAttribute('aria-hidden')).toBe('true');
  view.setSelection(choices);
  expect(view.caption.getAttribute('aria-hidden')).toBe('false');
  expect(view.caption.getAttribute('role')).toBe('dialog');
  expect(view.caption.classList.contains('confirmation-dialog')).toBe(true);
  expect(view.caption.textContent).toContain('Visit the island?');
  expect(view.choiceButtonsInOrder().map((button) => button.textContent)).toEqual(['Visit island', 'Skip island']);
  expect(document.activeElement).toBe(view.choiceButton('visit'));
  view.onChoice = vi.fn();
  view.choiceButton('sleep')!.click();
  expect(view.onChoice).toHaveBeenCalledWith('sleep');
  view.dispose();
});
