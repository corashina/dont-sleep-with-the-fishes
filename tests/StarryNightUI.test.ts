// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { survivalEventById } from '../src/survival/eventCatalog';
import { SurvivalEventView } from '../src/ui/SurvivalEventView';

it('shows only Sleep outside the constellation and keeps it keyboard accessible', async () => {
  const view = new SurvivalEventView();
  const onChoice = vi.fn();
  view.onChoice = onChoice;
  document.body.append(view.caption);
  try {
    await view.showReveal(survivalEventById('starry-night')!);
    view.setSelection([
      { id: 'wish', label: 'Touch the stars', anchorId: 'starry-night:constellation', unavailableReason: null },
      { id: 'sleep', label: 'Sleep', unavailableReason: null },
    ]);
    expect(view.caption.getAttribute('aria-hidden')).toBe('false');
    expect(view.caption.querySelectorAll('button')).toHaveLength(1);
    expect(view.choiceButton('wish')).toBeNull();
    const sleep = view.choiceButton('sleep')!;
    expect(sleep.disabled).toBe(false);
    sleep.focus();
    expect(document.activeElement).toBe(sleep);
    sleep.click();
    expect(onChoice).toHaveBeenCalledWith('sleep');
    view.setBusy(true);
    sleep.click();
    expect(onChoice).toHaveBeenCalledTimes(1);
  } finally {
    view.dispose();
    view.caption.remove();
  }
});
