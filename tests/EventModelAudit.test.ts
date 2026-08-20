// Importance: 8/10. Protects event model integrity, provenance, and current asset paths.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateEventModelMetadata } from '../scripts/check-event-models.mjs';
import { SURVIVAL_EVENT_MODEL_SPECS } from '../src/survival/eventModelManifest';
import { EVENT_MODEL_IDS, EVENT_MODEL_SPECS } from '../src/world/eventModelManifest';

function eventMetadata(): Record<string, Record<string, unknown>> {
  return JSON.parse(
    readFileSync('src/assets/models/events/event-model-metadata.json', 'utf8'),
  ) as Record<string, Record<string, unknown>>;
}

describe('event model audit contract', () => {
  it('uses the Drifting Chest model for every acquired chest', () => {
    expect(EVENT_MODEL_SPECS.chestClosed.url)
      .toBe(SURVIVAL_EVENT_MODEL_SPECS.mysteryChest.url);
    expect(EVENT_MODEL_SPECS.chestClosed).toMatchObject({
      sourceUrl: 'https://poly.pizza/m/O72u4Drp8k',
      sourceModelId: 'poly-pizza:803af4ae-433f-4b05-b1f1-c6a2da02d768',
    });
  });

  it('registers the midnight tour palm trees', () => {
    expect(EVENT_MODEL_IDS).toContain('midnightPalmTrees');
    expect(EVENT_MODEL_SPECS.midnightPalmTrees).toMatchObject({
      sourceUrl: 'https://poly.pizza/m/VYslw9DEi6',
      license: 'CC0 1.0',
    });
    expect(existsSync('src/assets/models/events/midnightPalmTrees.glb')).toBe(true);
  });

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

  it('contains the tornado model without the obsolete model ID or path', () => {
    const metadata = eventMetadata();
    const fetchScript = readFileSync('scripts/fetch-event-models.ps1', 'utf8');

    expect(metadata.tornadoCore).toBeDefined();
    expect(metadata.whirlpoolCore).toBeUndefined();
    expect(existsSync('src/assets/models/events/whirlpoolCore.glb')).toBe(false);
    expect(fetchScript).toContain("'tornadoCore'");
    expect(fetchScript).not.toContain('whirlpoolCore');
    expect(fetchScript).not.toContain('whirlpoolCore.glb');
  });

  it('rejects processed metadata that differs from its pinned source', () => {
    const metadata = eventMetadata();
    metadata.schoolFish!.outputSha256 = '0'.repeat(64);

    expect(() => validateEventModelMetadata(metadata)).toThrow(
      'schoolFish processed metadata does not match its pinned source',
    );
  });
});
