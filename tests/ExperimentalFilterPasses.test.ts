import { expect, it, vi } from 'vitest';
import { ExperimentalFilterPasses } from '../src/rendering/ExperimentalFilterPasses';
import { DEFAULT_POST_PROCESSING_FILTERS, normalizePostProcessingFilters, POST_PROCESSING_FILTERS } from '../src/rendering/postProcessingFilters';

it('skips disabled filters, combines enabled filters, and updates grain without rebuilding passes', () => {
  const filters = new ExperimentalFilterPasses();
  const passes = [...filters.passes];
  try {
    expect(passes.every((pass) => !pass.enabled)).toBe(true);
    const enabled = normalizePostProcessingFilters(Object.fromEntries(
      POST_PROCESSING_FILTERS.map(({ id }) => [id, { enabled: true, strength: .5 }]),
    ));
    filters.setState(enabled);
    expect(passes.every((pass) => pass.enabled)).toBe(true);
    filters.setTime(2);
    expect(passes.at(-1)!.uniforms.time!.value).toBe(2);
    filters.setState({ ...enabled, grain: { enabled: false, strength: .5 }, sea: { enabled: true, strength: 0 } });
    expect(passes[0]!.enabled).toBe(false);
    expect(passes.at(-1)!.enabled).toBe(false);
    expect(passes[1]!.enabled).toBe(true);
    filters.setTime(3);
    expect(passes.at(-1)!.uniforms.time!.value).toBe(2);
    expect(filters.passes).toEqual(passes);
    filters.setState(DEFAULT_POST_PROCESSING_FILTERS);
    expect(passes.every((pass) => !pass.enabled)).toBe(true);
  } finally {
    const disposal = passes.map((pass) => vi.spyOn(pass, 'dispose'));
    filters.dispose();
    for (const dispose of disposal) expect(dispose).toHaveBeenCalledOnce();
  }
});
