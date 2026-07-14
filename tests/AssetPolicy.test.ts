import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const activeAssetFiles = [
  'README.md',
  'AGENTS.md',
  'THIRD_PARTY_ASSETS.md',
  'src/world/itemModelManifest.ts',
  'scripts/fetch-item-models.ps1',
  'scripts/check-item-models.mjs',
];

describe('third-party asset policy', () => {
  it('documents Kenney as the required store and removes active Poly Pizza dependencies', async () => {
    const contents = await Promise.all(activeAssetFiles.map((path) => readFile(path, 'utf8')));
    expect(contents[0]).toMatch(/Kenney/i);
    expect(contents[1]).toMatch(/sole third-party asset store/i);
    expect(contents[1]).toMatch(/user approves/i);
    expect(contents[2]).toContain('https://kenney.nl/assets/');
    for (const content of contents) expect(content).not.toMatch(/poly\.pizza/i);
  });
});
