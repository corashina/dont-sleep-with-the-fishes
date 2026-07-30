import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  validateEventModelAttribution,
  validateEventModelMetadata,
} from '../scripts/check-event-models.mjs';

interface MetadataFixture {
  [modelId: string]: {
    triangles: number;
    rawBounds: Record<string, unknown>;
    animations: Record<string, unknown>[];
  };
}

async function eventMetadata(): Promise<MetadataFixture> {
  return JSON.parse(await readFile(
    new URL('../src/assets/models/events/event-model-metadata.json', import.meta.url),
    'utf8',
  )) as MetadataFixture;
}

async function attributionLedger(): Promise<string> {
  return readFile(new URL('../src/assets/ATTRIBUTION.md', import.meta.url), 'utf8');
}

describe('event model asset audit', () => {
  it('rejects extra nested metadata fields', async () => {
    const metadata = await eventMetadata();
    expect(() => validateEventModelMetadata(metadata)).not.toThrow();

    const extraBoundsField = structuredClone(metadata);
    extraBoundsField.ghost!.rawBounds.note = 'not generated';
    expect(() => validateEventModelMetadata(extraBoundsField))
      .toThrow(/ghost rawBounds keys/);

    const extraAnimationField = structuredClone(metadata);
    extraAnimationField.fogMan!.animations[0]!.note = 'not generated';
    expect(() => validateEventModelMetadata(extraAnimationField))
      .toThrow(/fogMan animation 0 keys/);
  });

  it('rejects duplicate and contradictory attribution blocks', async () => {
    const ledger = await attributionLedger();
    expect(() => validateEventModelAttribution(ledger)).not.toThrow();

    const ghostStart = ledger.indexOf('- "Ghoooooost" by Nikki Morin.');
    const manStart = ledger.indexOf('- "Man in Suit" by Quaternius.');
    const ghostBlock = ledger.slice(ghostStart, manStart);
    const duplicated = `${ledger.slice(0, manStart)}${ghostBlock}${ledger.slice(manStart)}`;
    expect(() => validateEventModelAttribution(duplicated))
      .toThrow(/expected 4 attribution blocks, received 5/);

    const duplicateOutsideSection = `${ledger}\n${ghostBlock}`;
    expect(() => validateEventModelAttribution(duplicateOutsideSection))
      .toThrow(/expected 4 event attribution blocks in the ledger, received 5/);

    const contradictory = ledger.replace(
      'License: CC BY 3.0.',
      'License: CC0 1.0.',
    );
    expect(() => validateEventModelAttribution(contradictory))
      .toThrow(/ghost attribution block does not match/);
  });
});
