import { describe, expect, it } from 'vitest';
import { SCAVENGE_ITEM_IDS } from '../src/game/scavengeCatalog';
import { itemThumbnailUrl } from '../src/ui/itemThumbnailManifest';

describe('item thumbnail manifest', () => {
  it('maps every scavenging item to one PNG asset', () => {
    for (const id of SCAVENGE_ITEM_IDS) {
      expect(itemThumbnailUrl(id)).toMatch(/\.png(?:\?|$)/);
    }
  });
});
