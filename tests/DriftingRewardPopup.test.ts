// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { SurvivalCoverView } from '../src/ui/SurvivalCoverView';

afterEach(() => setLanguage('en'));

it('shows every reward and preserves the bundle when the language changes', async () => {
  const view = new SurvivalCoverView();
  try {
    const result = view.showRewardResult({ title: 'SALVAGE', lines: [], reward: {
      kind: 'bundle', rewards: [
        { kind: 'resource', id: 'food', quantity: 3 },
        { kind: 'resource', id: 'bait', quantity: 1 },
        { kind: 'item', id: 'energyBar', quantity: 1 },
        { kind: 'item', id: 'umbrella', quantity: 1 },
      ],
    } });
    const items = () => [...view.resultRoot.querySelectorAll<HTMLElement>('[data-item-type]')].map(item => item.dataset.itemType);
    expect(items()).toEqual(['cannedFood', 'baitTin', 'energyBar', 'umbrella']);
    expect([...view.resultRoot.querySelectorAll('[data-dive-result-reward-quantity]')].map(item => item.textContent))
      .toEqual(['×3', '×1', '×1', '×1']);
    const english = view.resultRoot.textContent;
    setLanguage('pl');
    expect(view.resultRoot.textContent).not.toBe(english);
    expect(items()).toEqual(['cannedFood', 'baitTin', 'energyBar', 'umbrella']);
    view.confirmRewardResult();
    await result;
    expect(items()).toEqual([]);
  } finally {
    view.dispose();
  }
});


it('shows the island rewards title and resolves only after close', async () => {
  const view = new SurvivalCoverView();
  try {
    view.onResultClose = () => view.confirmRewardResult();
    let closed = false;
    const result = view.showRewardResult({ title: 'ISLAND REWARDS', lines: [], reward: {
      kind: 'bundle', rewards: [{ kind: 'resource', id: 'bait', quantity: 1 }],
    } }).then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    expect(view.resultRoot.textContent).toContain('island rewards');
    const close = view.resultRoot.querySelector<HTMLButtonElement>('[aria-label="Close island rewards"]')!;
    expect(close).not.toBeNull();
    close.click();
    await result;
    expect(closed).toBe(true);
  } finally {
    view.dispose();
  }
});
