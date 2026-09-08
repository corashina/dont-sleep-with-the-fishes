import { settingsText } from '../i18n/settingsMessages';
import type { PostProcessingControls } from '../rendering/postProcessingControls';
import {
  DEFAULT_POST_PROCESSING_FILTERS,
  POST_PROCESSING_FILTERS,
  type PostProcessingFilterId,
} from '../rendering/postProcessingFilters';

export class PostProcessingFilterControl {
  readonly element = document.createElement('section');

  constructor(private readonly controls: PostProcessingControls) {
    this.element.className = 'post-processing-console__category';
    this.element.innerHTML = `
      <h2 data-settings-copy="filters">${settingsText('filters')}</h2>
      ${POST_PROCESSING_FILTERS.map(({ id, label }) => `
        <div class="post-processing-console__group">
          <label class="post-processing-console__filter-toggle">
            <input type="checkbox" data-filter-enabled="${id}">
            <span id="filter-${id}-name" data-settings-copy="${label}">${settingsText(label)}</span>
          </label>
          <label class="post-processing-console__slider">
            <span id="filter-${id}-strength" data-settings-copy="filterStrength">${settingsText('filterStrength')}</span>
            <output data-filter-output="${id}"></output>
            <input type="range" min="0" max="1" step="0.05" data-filter-strength="${id}"
              aria-labelledby="filter-${id}-name filter-${id}-strength">
          </label>
        </div>
      `).join('')}
      <button type="button" class="post-processing-console__filter-reset" data-filter-reset
        data-settings-copy="resetFilters">${settingsText('resetFilters')}</button>
    `;
    this.element.addEventListener('change', this.handleChange);
    this.element.addEventListener('input', this.handleInput);
    this.element.addEventListener('click', this.handleClick);
    this.refresh();
  }

  refresh(): void {
    const state = this.controls.getState().filters;
    for (const { id } of POST_PROCESSING_FILTERS) {
      const setting = state[id];
      this.element.querySelector<HTMLInputElement>(`[data-filter-enabled="${id}"]`)!.checked = setting.enabled;
      const slider = this.element.querySelector<HTMLInputElement>(`[data-filter-strength="${id}"]`)!;
      slider.value = String(setting.strength);
      slider.disabled = !setting.enabled;
      this.element.querySelector<HTMLOutputElement>(`[data-filter-output="${id}"]`)!.value = `${Math.round(setting.strength * 100)}%`;
    }
  }

  dispose(): void {
    this.element.removeEventListener('change', this.handleChange);
    this.element.removeEventListener('input', this.handleInput);
    this.element.removeEventListener('click', this.handleClick);
    this.element.remove();
  }

  private readonly handleChange = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.filterEnabled) return;
    const id = input.dataset.filterEnabled as PostProcessingFilterId;
    const state = this.controls.getState().filters;
    this.controls.setFilters({ ...state, [id]: { ...state[id], enabled: input.checked } });
    this.refresh();
  };

  private readonly handleInput = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.filterStrength) return;
    const id = input.dataset.filterStrength as PostProcessingFilterId;
    const state = this.controls.getState().filters;
    this.controls.setFilters({ ...state, [id]: { ...state[id], strength: Number(input.value) } });
    this.refresh();
  };

  private readonly handleClick = (event: Event): void => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-filter-reset]')) return;
    this.controls.setFilters(DEFAULT_POST_PROCESSING_FILTERS);
    this.refresh();
  };
}
