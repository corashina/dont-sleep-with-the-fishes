// @vitest-environment jsdom
// Importance: 95/100. The reminder must wait, pause with overlays, and disappear when no longer useful.
import { afterEach, expect, it } from 'vitest';
import { CarlitosChestReminderView } from '../src/ui/CarlitosChestReminderView';
import { SurvivalUI } from '../src/ui/SurvivalUI';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { setLanguage } from '../src/i18n/language';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';

const anchor: BoatInteractionAnchor = {
  id: 'carlitos', companionId: 'carlitos', itemType: null, toolId: null, action: null,
  x: 300, y: 250, visible: true, depleted: false, remainingUses: null,
};
afterEach(() => { document.body.innerHTML = ''; setLanguage('en'); });

it('waits four seconds, follows Carlitos, and shows the bubble for eight seconds', () => {
  const view = new CarlitosChestReminderView();
  view.configure(2, true);
  view.setAnchors([anchor]);
  expect(view.update(3.9, true)).toBe(false);
  expect(view.root.hidden).toBe(true);
  expect(view.update(0.1, true)).toBe(true);
  expect(view.root.textContent).toBe('Maybe we should open that chest?');
  expect(view.root.hidden).toBe(false);
  view.setAnchors([{ ...anchor, x: 400 }]);
  expect(view.root.style.left).toBe('400px');
  view.update(7.9, false);
  expect(view.root.hidden).toBe(false);
  view.update(0.1, false);
  expect(view.root.hidden).toBe(true);
});

it('delays offscreen or blocked reminders and cancels them after opening or a new day', () => {
  const view = new CarlitosChestReminderView();
  view.configure(2, true);
  expect(view.update(100, true)).toBe(false);
  view.setAnchors([anchor]);
  view.setBlocked(true);
  expect(view.update(100, true)).toBe(false);
  view.setBlocked(false);
  expect(view.update(3, true)).toBe(false);
  expect(view.update(1, true)).toBe(true);
  view.configure(2, false);
  expect(view.root.hidden).toBe(true);
  expect(view.update(100, true)).toBe(false);
  view.configure(3, true);
  expect(view.update(3, true)).toBe(false);
});

it('integrates with pauses, language changes, chest opening, and disposal', () => {
  const session = new SurvivalSession([{ type: 'carlitos', instanceId: 'carlitos-1' }], {
    seed: 1, initialChest: { state: 'closed', acquiredDay: 1 },
  });
  const ui = new SurvivalUI(document.body);
  ui.render(session.snapshot(), () => null);
  ui.setAnchors([anchor]);
  ui.setPaused(true);
  expect(ui.updateChestReminder(100, true)).toBe(false);
  ui.setPaused(false);
  expect(ui.updateChestReminder(4, true)).toBe(true);
  const bubble = document.querySelector<HTMLElement>('.carlitos-chest-reminder')!;
  expect(bubble.hidden).toBe(false);
  setLanguage('pl');
  expect(bubble.textContent).toBe('Może otworzymy tę skrzynię?');
  ui.setBusy(true);
  expect(bubble.hidden).toBe(true);
  ui.setBusy(false);
  ui.render(session.snapshot(), () => 'Unavailable');
  expect(bubble.hidden).toBe(true);
  ui.dispose();
  expect(ui.updateChestReminder(100, true)).toBe(false);
  expect(document.querySelector('.carlitos-chest-reminder')).toBeNull();
});
