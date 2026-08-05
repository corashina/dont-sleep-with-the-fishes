import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateEventModelMetadata } from '../scripts/check-event-models.mjs';

function eventMetadata(): Record<string, Record<string, unknown>> {
  return JSON.parse(
    readFileSync('src/assets/models/events/event-model-metadata.json', 'utf8'),
  ) as Record<string, Record<string, unknown>>;
}

describe('event model audit contract', () => {
  it('accepts the combined curated and processed metadata', () => {
    expect(() => validateEventModelMetadata(eventMetadata())).not.toThrow();
  });

  it('requires every processed model from the fetch contract', () => {
    const metadata = eventMetadata();
    delete metadata.leakPlanks;

    expect(() => validateEventModelMetadata(metadata)).toThrow(
      'event model metadata is missing leakPlanks',
    );
  });

  it('rejects processed metadata that differs from its pinned source', () => {
    const metadata = eventMetadata();
    metadata.schoolFish!.outputSha256 = '0'.repeat(64);

    expect(() => validateEventModelMetadata(metadata)).toThrow(
      'schoolFish processed metadata does not match its pinned source',
    );
  });
});
