import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, createItemInstances } from '../src/game/itemCatalog';

const activeAssetFiles = [
  'README.md',
  'AGENTS.md',
];

describe('asset documentation', () => {
  it('records the initial ship texture pages without imposing a store policy', async () => {
    const contents = await Promise.all(activeAssetFiles.map((path) => readFile(path, 'utf8')));
    expect(contents[0]).toContain('https://ambientcg.com/view?id=PaintedMetal007');
    expect(contents[0]).toContain('https://polyhaven.com/a/wood_floor_deck');
    for (const content of contents) {
      expect(content).not.toMatch(/## (Asset policy|Third-party assets)/i);
      expect(content).not.toContain('Kenney as the default third-party asset store');
      expect(content).not.toContain('Quaternius exception');
    }
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
