// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { PostProcessingConsole } from '../src/ui/PostProcessingConsole';
import { getLanguage, setLanguage } from '../src/i18n/language';
import { createSystemTuningPreference, SYSTEM_TUNING_STORAGE_KEY } from '../src/ui/systemTuningPreference';
import {
  DEFAULT_POST_PROCESSING_FILTERS,
  normalizePostProcessingFilters,
  POST_PROCESSING_FILTERS,
  type PostProcessingFilterState,
} from '../src/rendering/postProcessingFilters';

let console: PostProcessingConsole | undefined;
const originalLanguage = getLanguage();
afterEach(() => { console?.dispose(); document.body.innerHTML = ''; setLanguage(originalLanguage); });

it('combines filters, keeps strength when disabled, restores saved choices, and resets only filters', () => {
  let stored: string | null = null;
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
  const preferences = createSystemTuningPreference(storage);
  preferences.set('weatherOverride', 'rain');
  let filters = preferences.get().filters;
  const setFilters = (value: PostProcessingFilterState) => {
    filters = normalizePostProcessingFilters(value);
    preferences.set('filters', filters);
  };
  const makeConsole = () => new PostProcessingConsole(document.body, {
    getState: () => ({ filters, ambientOcclusionAvailable: true, ambientOcclusionMode: 'composite',
      ambientOcclusionQuality: 'low', ambientOcclusionIntensity: 1, ambientOcclusionRadius: .2 }),
    setFilters, setNumeric: vi.fn(), setAmbientOcclusionMode: vi.fn(), setAmbientOcclusionQuality: vi.fn(),
  });
  console = makeConsole();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
  expect(document.querySelectorAll('[data-filter-enabled]')).toHaveLength(8);
  const checkbox = (id: string) => document.querySelector<HTMLInputElement>(`[data-filter-enabled="${id}"]`)!;
  const slider = (id: string) => document.querySelector<HTMLInputElement>(`[data-filter-strength="${id}"]`)!;
  expect(POST_PROCESSING_FILTERS.every(({ id }) => !checkbox(id).checked && slider(id).disabled)).toBe(true);
  checkbox('sea').click();
  checkbox('bloom').click();
  slider('sea').value = '0.75';
  slider('sea').dispatchEvent(new Event('input', { bubbles: true }));
  checkbox('sea').click();
  expect(filters.sea).toEqual({ enabled: false, strength: .75 });
  checkbox('sea').click();
  expect(filters.bloom.enabled).toBe(true);
  expect(document.querySelector<HTMLOutputElement>('[data-filter-output="sea"]')!.value).toBe('75%');
  console.dispose();
  filters = createSystemTuningPreference(storage).get().filters;
  console = makeConsole();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
  expect(checkbox('sea').checked).toBe(true);
  expect(slider('sea').value).toBe('0.75');
  expect(checkbox('bloom').checked).toBe(true);
  setLanguage('pl');
  expect(document.querySelector('#filter-sea-name')!.textContent).toBe('Morska paleta barw');
  expect(slider('sea').getAttribute('aria-labelledby')).toBe('filter-sea-name filter-sea-strength');
  document.querySelector<HTMLButtonElement>('[data-filter-reset]')!.click();
  expect(filters).toEqual(DEFAULT_POST_PROCESSING_FILTERS);
  expect(POST_PROCESSING_FILTERS.every(({ id }) => !checkbox(id).checked && slider(id).disabled)).toBe(true);
  expect(createSystemTuningPreference(storage).get()).toMatchObject({ filters: DEFAULT_POST_PROCESSING_FILTERS, weatherOverride: 'rain' });
});

it('validates saved filters and prevents callers from changing saved state through a reference', () => {
  const filters = normalizePostProcessingFilters({
    sea: { enabled: true, strength: 50 }, bleach: { enabled: 'true', strength: -1 },
    grain: { enabled: true, strength: Infinity }, sepia: null,
  });
  expect(filters.sea).toEqual({ enabled: true, strength: 1 });
  expect(filters.bleach).toEqual({ enabled: false, strength: 0 });
  expect(filters.grain.strength).toBe(DEFAULT_POST_PROCESSING_FILTERS.grain.strength);
  expect(filters.sepia).toEqual(DEFAULT_POST_PROCESSING_FILTERS.sepia);
  expect(Object.isFrozen(filters)).toBe(true);
  expect(Object.isFrozen(filters.sea)).toBe(true);
  const storage = { getItem: vi.fn(() => JSON.stringify({ filters })), setItem: vi.fn() };
  expect(createSystemTuningPreference(storage).get().filters).toEqual(filters);
  expect(storage.getItem).toHaveBeenCalledWith(SYSTEM_TUNING_STORAGE_KEY);
});
