export function summarizeFrameTimes(samples: readonly number[]) {
  if (!samples.length || samples.some(value => !Number.isFinite(value) || value < 0))
    throw new RangeError('Frame measurements must be finite, nonnegative, and nonempty');
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)]!;
  return { p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), sampleCount: sorted.length };
}
