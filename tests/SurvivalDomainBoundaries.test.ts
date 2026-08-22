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

const THREE_IMPORT = /\b(?:from\s+|import\s*(?:\(\s*)?)['"]three(?:\/[^'"]*)?['"]/;

it('detects Three.js static, side-effect, and dynamic imports', () => {
  expect(THREE_IMPORT.test("import { Scene } from 'three';")).toBe(true);
  expect(THREE_IMPORT.test("import 'three/addons/loaders/GLTFLoader.js';")).toBe(true);
  expect(THREE_IMPORT.test("await import('three');")).toBe(true);
  expect(THREE_IMPORT.test("import { Scene } from 'three-custom';")).toBe(false);
  expect(THREE_IMPORT.test("import { Scene } from '@scope/three';")).toBe(false);
  expect(THREE_IMPORT.test("const moduleName = 'three';")).toBe(false);
});

it('keeps domain modules independent from DOM and Three.js', () => {
  for (const file of DOMAIN_FILES) {
    const source = readFileSync(new URL(`../src/survival/${file}`, import.meta.url), 'utf8');

    expect(source).not.toMatch(THREE_IMPORT);
    expect(source).not.toMatch(/\b(document|window|HTMLElement)\b/);
  }
});
