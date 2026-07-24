import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const FONT_FILES = [
  'bowlby-one-sc-latin-400-normal.woff2',
  'alegreya-sans-latin-400-normal.woff2',
  'alegreya-sans-latin-700-normal.woff2',
  'ibm-plex-mono-latin-600-normal.woff2',
] as const;

describe('UI font assets', () => {
  it('commits local WOFF2 files with no runtime CDN dependency', async () => {
    for (const filename of FONT_FILES) {
      const contents = await readFile(`src/assets/fonts/${filename}`);
      expect(contents.subarray(0, 4).toString('ascii')).toBe('wOF2');
      expect(contents.byteLength).toBeGreaterThan(4_000);
    }

    const [styles, entry] = await Promise.all([
      readFile('src/styles/fonts.css', 'utf8'),
      readFile('src/main.ts', 'utf8'),
    ]);
    expect(styles).toContain("font-family: 'Bowlby One SC'");
    expect(styles).toContain("font-family: 'Alegreya Sans'");
    expect(styles).toContain("font-family: 'IBM Plex Mono'");
    expect(styles.match(/font-display:\s*swap/g)).toHaveLength(4);
    expect(styles).not.toMatch(/https?:\/\//);
    expect(entry.indexOf("import './styles/fonts.css'"))
      .toBeLessThan(entry.indexOf("import './styles/main.css'"));
  });

  it('records permanent source and OFL provenance for every font family', async () => {
    const ledger = await readFile('THIRD_PARTY_ASSETS.md', 'utf8');
    expect(ledger).toContain('## Runtime font asset ledger');
    expect(ledger).toContain('google/fonts/tree/main/ofl/bowlbyonesc');
    expect(ledger).toContain('google/fonts/tree/main/ofl/alegreyasans');
    expect(ledger).toContain('IBM/plex');
    expect(ledger.match(/OFL 1\.1/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
