import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, createItemInstances } from '../src/game/itemCatalog';

const activeAssetFiles = [
  'README.md',
  'AGENTS.md',
  'THIRD_PARTY_ASSETS.md',
  'src/world/itemModelManifest.ts',
  'src/world/lifeboatEquipmentManifest.ts',
  'scripts/fetch-item-models.ps1',
  'scripts/check-item-models.mjs',
];

describe('third-party asset policy', () => {
  it('keeps Kenney as the default store, records the Quaternius runtime exception, and removes active Poly Pizza dependencies', async () => {
    const contents = await Promise.all(activeAssetFiles.map((path) => readFile(path, 'utf8')));
    for (const content of contents.slice(0, 3)) {
      expect(content).toContain('Kenney as the default third-party asset store');
      expect(content).toContain('Quaternius exception');
    }
    expect(contents[0]).toMatch(/Quaternius exception is approved only for the committed `compass`, `flareGun`, and `anchor` runtime models/i);
    expect(contents[0]).toMatch(/Production never fetches models, textures, artwork, event data, or wiki content/i);
    expect(contents[1]).toMatch(/Quaternius exception is approved only for the committed runtime models `compass`, `flareGun`, and `anchor`/i);
    expect(contents[1]).toMatch(/Production code must not fetch models, textures, audio, UI art, or effects from a store/i);
    expect(contents[2]).toContain('https://kenney.nl/assets/');
    expect(contents[2]).toMatch(/twelve third-party runtime models: nine Kenney-derived and three Quaternius-derived/i);
    for (const content of contents) expect(content).not.toMatch(/poly\.pizza/i);
  });

  it('keeps the active Dorothy contract free of removed items and obsolete counts', async () => {
    const sourceRoots = ['src', 'scripts'];
    const productionFiles: string[] = [];
    const visit = async (path: string): Promise<void> => {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const entryPath = join(path, entry.name);
        if (entry.isDirectory()) await visit(entryPath);
        else if (['.css', '.json', '.mjs', '.mts', '.ps1', '.ts'].includes(extname(entry.name))) {
          productionFiles.push(entryPath);
        }
      }
    };
    await Promise.all(sourceRoots.map(visit));
    productionFiles.sort();

    const runtimeDocs = ['index.html', 'README.md', 'THIRD_PARTY_ASSETS.md'];
    const productionText = (
      await Promise.all([...productionFiles, ...runtimeDocs].map((path) => readFile(path, 'utf8')))
    ).join('\n');
    const modelFiles = (await readdir('src/assets/models/items')).join('\n');
    const activeContract = `${productionText}\n${modelFiles}`;

    const normalizedActiveContract = activeContract.toUpperCase();
    for (const forbidden of ['WATERJUG', 'WATER BOTTLE', 'BLASTER-N.GLB']) {
      expect(normalizedActiveContract, forbidden).not.toContain(forbidden);
    }
    expect(productionText).not.toMatch(/fourteen-item|water charge/i);
    expect(ITEM_IDS).toHaveLength(18);
    expect(createItemInstances()).toHaveLength(21);
  });
});
