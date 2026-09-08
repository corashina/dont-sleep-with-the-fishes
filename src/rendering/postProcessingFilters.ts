export const POST_PROCESSING_FILTERS = [
  { id: 'sea', label: 'filterSea', strength: 0.5 },
  { id: 'bleach', label: 'filterBleach', strength: 0.35 },
  { id: 'bloom', label: 'filterBloom', strength: 0.4 },
  { id: 'vignette', label: 'filterVignette', strength: 0.45 },
  { id: 'grain', label: 'filterGrain', strength: 0.3 },
  { id: 'sepia', label: 'filterSepia', strength: 0.35 },
  { id: 'chromatic', label: 'filterChromatic', strength: 0.3 },
  { id: 'posterization', label: 'filterPosterization', strength: 0.4 },
] as const;

export type PostProcessingFilterId = typeof POST_PROCESSING_FILTERS[number]['id'];
export interface PostProcessingFilterSetting {
  readonly enabled: boolean;
  readonly strength: number;
}
export type PostProcessingFilterState = Readonly<Record<PostProcessingFilterId, PostProcessingFilterSetting>>;

export function normalizePostProcessingFilters(value: unknown): PostProcessingFilterState {
  const source = typeof value === 'object' && value !== null
    ? value as Record<string, unknown> : {};
  return Object.freeze(Object.fromEntries(POST_PROCESSING_FILTERS.map((definition) => {
    const stored = source[definition.id];
    const setting = typeof stored === 'object' && stored !== null
      ? stored as Record<string, unknown> : {};
    return [definition.id, Object.freeze({
      enabled: setting.enabled === true,
      strength: typeof setting.strength === 'number' && Number.isFinite(setting.strength)
        ? Math.min(1, Math.max(0, setting.strength)) : definition.strength,
    })];
  })) as Record<PostProcessingFilterId, PostProcessingFilterSetting>);
}

export const DEFAULT_POST_PROCESSING_FILTERS = normalizePostProcessingFilters(null);
