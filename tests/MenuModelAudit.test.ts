// Importance: 8/10. Protects committed menu model integrity, provenance, and licenses.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  validateCommittedMenuModel,
  validateMenuAttribution,
} from '../scripts/check-menu-models.mjs';
import {
  POLY_PIZZA_MENU_MODEL_IDS,
  POLY_PIZZA_MENU_MODEL_SOURCES,
} from '../scripts/poly-pizza-menu-models.mjs';

const ledger = readFileSync('src/assets/ATTRIBUTION.md', 'utf8');
const metadata = JSON.parse(
  readFileSync('src/assets/models/menu/menu-model-metadata.json', 'utf8'),
) as Record<string, { triangles: number }>;
const measurements = Object.fromEntries(
  POLY_PIZZA_MENU_MODEL_IDS.map((id) => [id, {
    triangles: metadata[id]!.triangles,
  }]),
);

function replaceMenuRow(
  ledgerText: string,
  modelId: string,
  replace: (row: string) => string,
): string {
  const row = ledgerText.split(/\r?\n/)
    .find((line) => line.startsWith(`| ${modelId} |`));
  if (!row) throw new Error(`Missing test ledger row: ${modelId}`);
  return ledgerText.replace(row, replace(row));
}

describe('menu model audit contract', () => {
  it('pins the approved committed hashes and licenses', () => {
    expect(Object.fromEntries(POLY_PIZZA_MENU_MODEL_IDS.map((id) => [
      id,
      {
        committedSha256: POLY_PIZZA_MENU_MODEL_SOURCES[id].committedSha256,
        license: POLY_PIZZA_MENU_MODEL_SOURCES[id].license,
      },
    ]))).toEqual({
      boat: {
        committedSha256: 'D1B71C2F9222B93C32AA4C5764B543F7471A046D047997473CAB82364F97942A',
        license: 'CC-BY 3.0',
      },
      rockA: {
        committedSha256: 'DFE74B88D1E8C31C3242E151C620463858154BB32F36D3A7042BFB4A75AC78BE',
        license: 'CC0 1.0',
      },
      rockB: {
        committedSha256: '223C02346797221792B6FFFFAC3B0AEA4C8094BB854055D0D13B0F3C092F0E5F',
        license: 'CC0 1.0',
      },
      rockC: {
        committedSha256: 'B9EB2A8A48D1E99474DDAD1B7EFE438085EEB783F816E43B1608978C508D97CB',
        license: 'CC0 1.0',
      },
      coral: {
        committedSha256: '2ACA833051D14C22B107D14B2AE84E533B69A1EFBEC2B7F0A087416B9079D0AD',
        license: 'CC-BY 3.0',
      },
      starfish: {
        committedSha256: '7B79DB36F41814317A5888D10E5A7EA9EDEA7998DAE7F982F19608BC7F2D98A1',
        license: 'CC-BY 3.0',
      },
      fishBone: {
        committedSha256: '6FCD27536B4691BD0D639055BAC1C3D84AD3978654F310A3DF0C3F157EED371E',
        license: 'CC0 1.0',
      },
      skull: {
        committedSha256: '8E0BAC5BA9A119D70798163D744D4925487C6F8CB6155EB92585B8EEA59E9823',
        license: 'CC0 1.0',
      },
      largeBone: {
        committedSha256: '48DE96535E005B857ABC76BB5817062A06410B4F06DB8D32981D5999B2F3415C',
        license: 'CC0 1.0',
      },
      shark: {
        committedSha256: '1311D6750FB737669557C45855568E8DD2D8C8D8B5C374704028C656712A4648',
        license: 'CC0 1.0',
      },
    });
  });

  it('pins and verifies every committed menu GLB hash', () => {
    for (const modelId of POLY_PIZZA_MENU_MODEL_IDS) {
      const bytes = readFileSync(`src/assets/models/menu/${modelId}.glb`);
      expect(() => validateCommittedMenuModel(modelId, new Uint8Array(bytes))).not.toThrow();
      expect(POLY_PIZZA_MENU_MODEL_SOURCES[modelId].committedSha256)
        .toMatch(/^[A-F0-9]{64}$/);
    }
  });

  it('rejects changed committed menu model bytes', () => {
    expect(() => validateCommittedMenuModel('boat', new Uint8Array([1, 2, 3])))
      .toThrow('boat: committed GLB SHA-256 does not match');
  });

  it('rejects a menu ledger row without its pinned provenance', () => {
    const source = POLY_PIZZA_MENU_MODEL_SOURCES.boat;
    const changedLedger = replaceMenuRow(
      ledger,
      'boat',
      (row) => row.replace(source.sourceAssetId, 'wrong-resource-id'),
    );

    expect(() => validateMenuAttribution(changedLedger, measurements))
      .toThrow(`ATTRIBUTION.md: menu boat row is missing \`${source.sourceAssetId}\``);
  });

  it('rejects a menu ledger row without its pinned license', () => {
    const source = POLY_PIZZA_MENU_MODEL_SOURCES.boat;
    const changedLedger = replaceMenuRow(
      ledger,
      'boat',
      (row) => row.replace(source.license, 'Unknown license'),
    );

    expect(() => validateMenuAttribution(changedLedger, measurements))
      .toThrow(
        `ATTRIBUTION.md: menu boat row is missing [${source.license}](${source.licenseUrl})`,
      );
  });

  it('rejects a menu ledger row with a changed license URL', () => {
    const source = POLY_PIZZA_MENU_MODEL_SOURCES.boat;
    const changedLedger = replaceMenuRow(
      ledger,
      'boat',
      (row) => row.replace(source.licenseUrl, 'https://example.com/license'),
    );

    expect(() => validateMenuAttribution(changedLedger, measurements))
      .toThrow(
        `ATTRIBUTION.md: menu boat row is missing [${source.license}](${source.licenseUrl})`,
      );
  });
});
