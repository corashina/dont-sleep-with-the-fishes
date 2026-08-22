import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const DOMAIN_FILES = [
  'eventCatalog.ts',
  'eventCatalogValidation.ts',
  'eventSelection.ts',
  'eventOutcomeRules.ts',
  'journalRecords.ts',
  'dayActionRules.ts',
  'fishingSettlementRules.ts',
];

it('keeps domain modules independent from DOM and Three.js', () => {
  for (const file of DOMAIN_FILES) {
    const source = readFileSync(new URL(`../src/survival/${file}`, import.meta.url), 'utf8');

    expect(source).not.toMatch(/from ['\"]three/);
    expect(source).not.toMatch(/\b(document|window|HTMLElement)\b/);
  }
});
