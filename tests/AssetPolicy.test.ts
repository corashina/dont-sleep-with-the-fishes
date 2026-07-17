import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, createItemInstances } from '../src/game/itemCatalog';

const activeAssetFiles = [
  'README.md',
  'AGENTS.md',
  'THIRD_PARTY_ASSETS.md',
  'src/world/itemModelManifest.ts',
  'scripts/fetch-item-models.ps1',
  'scripts/check-item-models.mjs',
];

describe('third-party asset policy', () => {
  it('keeps Kenney as the default store, pins the approved Quaternius source-input exception, and removes active Poly Pizza dependencies', async () => {
    const contents = await Promise.all(activeAssetFiles.map((path) => readFile(path, 'utf8')));
    expect(contents[0]).toMatch(/Kenney remains the project's default third-party asset store/i);
    expect(contents[0]).toMatch(/Quaternius is the user-approved exception solely for the committed `compass`, `flareGun`, and `anchor` source inputs/i);
    expect(contents[0]).toMatch(/Production never fetches models, textures, artwork, event data, or wiki content/i);
    expect(contents[1]).toMatch(/\[Kenney\]\(https:\/\/kenney\.nl\/assets\) as the default third-party asset store/i);
    expect(contents[1]).toMatch(/Quaternius is a user-approved exception solely for the committed source inputs for `compass`, `flareGun`, and `anchor`/i);
    expect(contents[1]).toMatch(/Production code must not fetch models, textures, audio, UI art, or effects from a store/i);
    expect(contents[2]).toContain('https://kenney.nl/assets/');
    expect(contents[2]).toMatch(/Quaternius pinned source inputs/i);
    expect(contents[2]).toMatch(/approved and committed now, but do not become runtime GLBs until the later builder\/publication tasks/i);
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
    expect(ITEM_IDS).toHaveLength(19);
    expect(createItemInstances()).toHaveLength(22);
  });
});
