// Importance: 8/10. Protects event model integrity, provenance, and current asset paths.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateEventModelMetadata } from '../scripts/check-event-models.mjs';
import { SURVIVAL_EVENT_MODEL_SPECS } from '../src/survival/eventModelManifest';
import { EVENT_MODEL_IDS } from '../src/world/eventModelIds';
import { EVENT_MODEL_SPECS } from '../src/world/eventModelManifest';

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

  it('registers the supplied Plane event model', () => {
    expect(EVENT_MODEL_IDS).toContain('airplane');
    expect(EVENT_MODEL_SPECS.airplane).toMatchObject({
      sourceUrl: 'https://poly.pizza/m/8VysVKMXN2J',
      sourceModelId: 'poly-pizza:13293400-c90f-4cc0-966a-7e07d38f7565',
      license: 'CC-BY 3.0',
    });
    expect(existsSync('src/assets/models/events/airplane.glb')).toBe(true);
  });

  it('registers the required Midnight Tour action models', () => {
    expect(EVENT_MODEL_IDS).toEqual(expect.arrayContaining([
      'midnightShovel',
      'midnightMonster',
    ]));
    expect(EVENT_MODEL_SPECS.midnightShovel).toMatchObject({
      sourceUrl: 'https://poly.pizza/m/oNBQSf87ZJ',
      sourceModelId: 'poly-pizza:4ca5006b-da27-4d96-9042-9672c9776750',
      license: 'CC0 1.0',
    });
    expect(EVENT_MODEL_SPECS.midnightMonster).toMatchObject({
      sourceUrl: 'https://poly.pizza/m/22K0aSZkHV',
      sourceModelId: 'poly-pizza:cf4368cf-b39e-4c9a-8a83-a9c637740eb8',
      license: 'CC-BY 3.0',
    });
    expect(existsSync('src/assets/models/events/midnightShovel.glb')).toBe(true);
    expect(existsSync('src/assets/models/events/midnightMonster.glb')).toBe(true);
    expect(eventMetadata().midnightMonster?.animations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'CharacterArmature|Idle' }),
        expect.objectContaining({ name: 'CharacterArmature|Idle_Attack' }),
      ]),
    );
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
