// @vitest-environment jsdom
// Importance: 92/100. Protects visible quest rewards and live translations.
import { afterEach, expect, it, vi } from 'vitest';
import { SurvivalUI } from '../src/ui/SurvivalUI';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { setLanguage } from '../src/i18n/language';

let ui: SurvivalUI | undefined;
afterEach(() => { ui?.dispose(); document.body.replaceChildren(); setLanguage('en'); vi.restoreAllMocks(); vi.useRealTimers(); });

// Importance: 95/100. Prevents reward timers from surviving UI disposal.
it('clears the reward dismissal timer when disposed', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  ui = new SurvivalUI(document.body);
  const reward = ui.showRewardResult({ title: 'SALVAGE', reward: { kind: 'heartPiece', id: 'flowers', quantity: 1 }, lines: [] });
  const schedule = vi.spyOn(window, 'setTimeout');
  const cancel = vi.spyOn(window, 'clearTimeout');
  ui.dispose();
  await reward;
  expect(schedule).toHaveBeenCalled();
  for (const timer of schedule.mock.results) expect(cancel).toHaveBeenCalledWith(timer.value);
});

it('shows a heart reward and translates its completion line while open', () => {
  ui = new SurvivalUI(document.body);
  void ui.showRewardResult({ title: 'CHEST REWARD', reward: { kind: 'heartPiece', id: 'chest', quantity: 1 }, lines: [], heartCompleted: true });
  expect(document.querySelector('[data-heart-piece="chest"]')).not.toBeNull();
  expect(document.querySelector('[data-dive-result-reward-name]')?.textContent).toBe('Kidneys');
  expect(document.querySelector<HTMLImageElement>('[data-heart-piece="chest"] img')?.src).toContain('chestHeart.png');
  expect(document.querySelector('[data-item-type="ductTape"]')).toBeNull();
  expect(document.body.textContent).toContain('The heart is whole.');
  setLanguage('pl');
  expect(document.querySelector('[data-dive-result-reward-name]')?.textContent).toBe('Nerki');
  expect(document.body.textContent).toContain('Serce jest całe.');
  setLanguage('es-AR');
  expect(document.querySelector('[data-dive-result-reward-name]')?.textContent).toBe('Riñones');
  expect(document.body.textContent).toContain('El corazón está completo.');
});

it.each([
  ['flowers', 'Brain', 'flowersHeart'],
  ['blood', 'Heart', 'bloodHeart'],
] as const)('shows the %s reward with its model thumbnail and name', (id, name, model) => {
  ui = new SurvivalUI(document.body);
  void ui.showRewardResult({ title: 'SALVAGE', reward: { kind: 'heartPiece', id, quantity: 1 }, lines: [] });
  expect(document.querySelector('[data-dive-result-reward-name]')?.textContent).toBe(name);
  expect(document.querySelector<HTMLImageElement>('.dive-result__reward img')?.src).toContain(`${model}.png`);
  expect(document.querySelector('[data-dive-result-reward-quantity]')).toBeNull();
});

it('does not show a heart counter or icon in the HUD', () => {
  ui = new SurvivalUI(document.body);
  ui.render(new SurvivalSession([], { seed: 41 }).snapshot(), () => null);
  expect(document.querySelector('[data-heart-progress]')).toBeNull();
  ui.render(new SurvivalSession([], { seed: 41, initialHeartPieces: { flowers: true, blood: false, chest: true } }).snapshot(), () => null);
  expect(document.querySelector('[data-heart-progress]')).toBeNull();
  expect(document.querySelector('[data-survival-top]')?.textContent).not.toContain('Heart of the Sea');
});
