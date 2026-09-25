// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { PostProcessingConsole } from '../src/ui/PostProcessingConsole';
import { EventReactionControls } from '../src/ui/EventReactionControls';
import { EVENT_TEST_OPTIONS } from '../src/app/EventTest';
import { setLanguage } from '../src/i18n/language';
import type { PostProcessingControls } from '../src/rendering/postProcessingControls';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); setLanguage('en'); });

// Importance: 95/100. The console must unpause playback and preserve the forced result for repeat tests.
it('closes for playback and restores the two-column console with the selected result', async () => {
  let finish!: () => void;
  const play = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const open = vi.fn();
  const console = new PostProcessingConsole(document.body, {
    getState: () => ({ ambientOcclusionAvailable: true, ambientOcclusionMode: 'composite', ambientOcclusionIntensity: 1, ambientOcclusionRadius: 0.3 }),
    setNumeric: vi.fn(), setAmbientOcclusionMode: vi.fn(),
  } as unknown as PostProcessingControls, open, undefined, undefined, undefined,
  { options: EVENT_TEST_OPTIONS, enterEvent: vi.fn() }, play);
  cleanups.push(() => console.dispose());
  const root = console.element;
  expect(root.querySelectorAll('.post-processing-console__column')).toHaveLength(2);
  expect(root.querySelector('[data-console-tests] .post-processing-console__reactions')).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
  const result = root.querySelector<HTMLSelectElement>('[data-reaction-result]')!;
  const selection = result.value;
  root.querySelector<HTMLButtonElement>('[data-reaction-play="reaction"]')!.click();
  expect(root.dataset.open).toBe('false');
  expect(open).toHaveBeenLastCalledWith(false);
  expect(play).toHaveBeenCalledWith({ eventId: 'monster-in-the-fog', choiceId: 'flashlight', resultId: selection, mode: 'reaction' });
  finish();
  await vi.waitFor(() => expect(root.dataset.open).toBe('true'));
  expect(result.value).toBe(selection);
  expect(root.querySelector('[data-reaction-status]')?.textContent).toBe('Ready to replay.');
});

// Importance: 90/100. Changing a choice must remove stale outcomes and failed playback must be retryable.
it('updates dependent results and allows retry after an error', async () => {
  const controls = new EventReactionControls(vi.fn().mockRejectedValue(new Error('load failed')));
  cleanups.push(() => controls.dispose());
  document.body.append(controls.element);
  const choice = controls.element.querySelector<HTMLSelectElement>('[data-reaction-choice]')!;
  const result = controls.element.querySelector<HTMLSelectElement>('[data-reaction-result]')!;
  choice.value = 'compass';
  choice.dispatchEvent(new Event('change'));
  expect(result.options).toHaveLength(1);
  const button = controls.element.querySelector<HTMLButtonElement>('[data-reaction-play]')!;
  button.click();
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(controls.element.textContent).toContain('load failed');
  const selection = result.value;
  setLanguage('pl');
  controls.refreshLanguage();
  expect(result.value).toBe(selection);
  expect(controls.element.textContent).toContain('REAKCJE ZDARZEŃ');
});
