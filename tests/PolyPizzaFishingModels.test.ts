import { describe, expect, it } from 'vitest';
import {
  POLY_PIZZA_FISHING_MODEL_IDS,
  POLY_PIZZA_FISHING_MODEL_SOURCES,
} from '../scripts/poly-pizza-fishing-models.mjs';
import {
  FISHING_CATCH_MODEL_SPECS,
  FISHING_MODEL_CATCH_IDS,
} from '../src/survival/fishingModelManifest';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';

const EXPECTED_IDS = [
  'cod',
  'salmon',
  'tuna',
  'crab',
  'squid',
  'sardine',
  'bass',
  'redSnapper',
  'clownfish',
  'seaweed',
  'boot',
  'plasticBottle',
];

describe('Poly Pizza fishing models', () => {
  it('pins each selected source once and excludes non-matching submissions', () => {
    expect(POLY_PIZZA_FISHING_MODEL_IDS).toEqual(EXPECTED_IDS);
    expect(FISHING_MODEL_CATCH_IDS).toEqual(EXPECTED_IDS);
    expect(
      FISHING_CATCHES
        .filter(({ presentation }) => presentation.kind === 'fishing')
        .map(({ id }) => id),
    ).toEqual(EXPECTED_IDS);

    const publicIds = Object.values(POLY_PIZZA_FISHING_MODEL_SOURCES)
      .map(({ publicId }) => publicId);
    expect(new Set(publicIds).size).toBe(publicIds.length);
    expect(publicIds).not.toContain('dDzthiG8nr9');
    expect(publicIds).not.toContain('0IceC4Tzcad');
    expect(publicIds).not.toContain('9-b6-yqrwEe');
  });

  it('keeps source identity, license, and geometry budgets pinned', () => {
    for (const [id, source] of Object.entries(POLY_PIZZA_FISHING_MODEL_SOURCES)) {
      expect(source.id).toBe(id);
      expect(source.pageUrl).toBe(`https://poly.pizza/m/${source.publicId}`);
      expect(source.sourceAssetId).toBe(`poly-pizza:${source.resourceId}`);
      expect(source.sha256).toMatch(/^[A-F0-9]{64}$/);
      expect(source.sourceTriangles).toBeGreaterThan(0);
      expect(source.maxTriangles).toBe(2_000);
      expect(['CC0 1.0', 'CC-BY 3.0']).toContain(source.license);
      expect(FISHING_CATCH_MODEL_SPECS[id as keyof typeof FISHING_CATCH_MODEL_SPECS]
        .maxTriangles).toBe(source.sourceTriangles);
    }
  });

  it('matches runtime scale to existing food and catch size', () => {
    const catalog = new Map(FISHING_CATCHES.map((entry) => [entry.id, entry]));
    expect(catalog.get('tuna')).toMatchObject({
      reward: { kind: 'food', amount: 2 },
      size: 'large',
    });
    expect(catalog.get('squid')).toMatchObject({
      reward: { kind: 'food', amount: 2 },
      size: 'large',
    });
    expect(FISHING_CATCH_MODEL_SPECS.tuna.targetLength)
      .toBeGreaterThan(FISHING_CATCH_MODEL_SPECS.cod.targetLength);
    expect(FISHING_CATCH_MODEL_SPECS.squid.targetLength)
      .toBeGreaterThan(FISHING_CATCH_MODEL_SPECS.sardine.targetLength);
    expect(FISHING_CATCH_MODEL_SPECS.clownfish.targetLength)
      .toBeLessThan(FISHING_CATCH_MODEL_SPECS.cod.targetLength);
  });
});
