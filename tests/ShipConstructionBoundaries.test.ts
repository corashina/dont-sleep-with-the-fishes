import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const WORLD_DIRECTORY = fileURLToPath(new URL('../src/world/', import.meta.url));
const SOURCE_DIRECTORY = fileURLToPath(new URL('../src/', import.meta.url));
const TEST_DIRECTORY = fileURLToPath(new URL('./', import.meta.url));

const LAYOUT_FILES = [
  'ShipLayoutTypes.ts',
  'shipLayoutData.ts',
  'ShipNavigation.ts',
  'ShipLayoutValidation.ts',
];

const FOCUSED_BUILDERS = [
  'ShipHullGeometry',
  'ShipRoomGeometry',
  'ShipAccessGeometry',
  'ShipExteriorGeometry',
];

const THREE_IMPORT = /\b(?:from\s+|import\s*(?:\(\s*)?)['\"]three(?:\/[^'\"]*)?['\"]/;
const STATIC_OR_SIDE_EFFECT_IMPORT = /\bimport\s+(?:type\s+)?(?:(?:[\w*$\s,{}]+)\s+from\s+)?(['\"])([^'\"]+)\1/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(['\"])([^'\"]+)\1\s*\)/g;
const RE_EXPORT = /\bexport\s+(?:type\s+)?(?:\*\s*(?:as\s+\w+)?|\{[^}]*\})\s+from\s+(['\"])([^'\"]+)\1/g;

interface ModuleReference {
  readonly kind: 'import' | 'dynamic import' | 're-export';
  readonly specifier: string;
}

function sourceFile(file: string): string {
  return readFileSync(resolve(WORLD_DIRECTORY, file), 'utf8');
}

function moduleReferences(source: string): readonly ModuleReference[] {
  const references: ModuleReference[] = [];
  const collect = (expression: RegExp, kind: ModuleReference['kind']): void => {
    expression.lastIndex = 0;
    let match = expression.exec(source);
    while (match) {
      const specifier = match[2];
      if (specifier) references.push({ kind, specifier });
      match = expression.exec(source);
    }
  };

  collect(STATIC_OR_SIDE_EFFECT_IMPORT, 'import');
  collect(DYNAMIC_IMPORT, 'dynamic import');
  collect(RE_EXPORT, 're-export');
  return references;
}

function typeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return typeScriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

function isObsoleteShipLayout(specifier: string): boolean {
  return /(?:^|\/)ShipLayout(?:\.ts)?$/.test(specifier);
}

it('detects Three.js static, side-effect, and dynamic imports', () => {
  expect(THREE_IMPORT.test("import { Scene } from 'three';")).toBe(true);
  expect(THREE_IMPORT.test("import 'three/addons/loaders/GLTFLoader.js';")).toBe(true);
  expect(THREE_IMPORT.test("await import('three');")).toBe(true);
  expect(THREE_IMPORT.test("import { Scene } from 'three-custom';")).toBe(false);
  expect(THREE_IMPORT.test("import { Scene } from '@scope/three';")).toBe(false);
  expect(THREE_IMPORT.test("const moduleName = 'three';")).toBe(false);
});

it('keeps focused layout modules free of Three.js', () => {
  for (const file of LAYOUT_FILES) {
    expect(sourceFile(file)).not.toMatch(THREE_IMPORT);
  }
});

it('detects obsolete ShipLayout imports without matching focused layout modules', () => {
  const obsoletePath = (extension = '') => `../src/world/${['Ship', 'Layout'].join('')}${extension}`;
  const obsoleteSources = [
    `import { SHIP_LAYOUT } from '${obsoletePath()}';`,
    `import '${obsoletePath('.ts')}';`,
    `const layout = await import('${obsoletePath()}');`,
    `export { SHIP_LAYOUT } from '${obsoletePath('.ts')}';`,
    `export * from '${obsoletePath()}';`,
  ];

  for (const source of obsoleteSources) {
    expect(moduleReferences(source).some((reference) => isObsoleteShipLayout(reference.specifier))).toBe(true);
  }

  expect(moduleReferences("import { SHIP_LAYOUT } from '../src/world/ShipLayoutTypes';")
    .some((reference) => isObsoleteShipLayout(reference.specifier))).toBe(false);
  expect(moduleReferences("export { validateShipLayout } from '../src/world/ShipLayoutValidation';")
    .some((reference) => isObsoleteShipLayout(reference.specifier))).toBe(false);
});

it('keeps focused builders independent from the final and peer builders', () => {
  for (const builder of FOCUSED_BUILDERS) {
    const forbiddenModules = new Set([
      'ShipGeometry',
      ...FOCUSED_BUILDERS.filter((candidate) => candidate !== builder),
    ]);
    const references = moduleReferences(sourceFile(`${builder}.ts`));

    for (const reference of references) {
      expect(forbiddenModules.has(reference.specifier.replace(/^.*\//, '').replace(/\.ts$/, ''))).toBe(false);
    }
  }
});

it('keeps final geometry composition direct and ordered', () => {
  const source = sourceFile('ShipGeometry.ts');
  const builders = [
    ['addShipHull', 'ShipHullGeometry'],
    ['addShipRooms', 'ShipRoomGeometry'],
    ['addShipAccess', 'ShipAccessGeometry'],
    ['addShipExterior', 'ShipExteriorGeometry'],
  ] as const;

  for (const [builder, module] of builders) {
    expect(source).toMatch(new RegExp(
      `\\bimport\\s*\\{[^}]*\\b${builder}\\b[^}]*\\}\\s*from\\s*['\"]\\./${module}['\"]`,
    ));
  }

  const calls = [
    /const\s*\{\s*waterExclusion\s*\}\s*=\s*addShipHull\s*\(\s*context\s*,\s*layout\s*\)\s*;/,
    /addShipRooms\s*\(\s*context\s*,\s*layout\s*\)\s*;/,
    /const\s+climbZones\s*=\s*addShipAccess\s*\(\s*context\s*,\s*layout\s*\)\s*;/,
    /const\s+stackOutlets\s*=\s*addShipExterior\s*\(\s*context\s*,\s*layout\s*\)\s*;/,
  ].map((expression) => {
    const match = expression.exec(source);
    expect(match).not.toBeNull();
    return match?.index ?? -1;
  });

  expect(calls).toEqual([...calls].sort((left, right) => left - right));
  expect(moduleReferences(source).filter((reference) => reference.kind === 're-export')).toEqual([]);
});

it('removes the obsolete layout module and all source references', () => {
  expect(existsSync(resolve(WORLD_DIRECTORY, 'ShipLayout.ts'))).toBe(false);

  for (const file of [...typeScriptFiles(SOURCE_DIRECTORY), ...typeScriptFiles(TEST_DIRECTORY)]) {
    const source = readFileSync(file, 'utf8');
    const obsoleteReference = moduleReferences(source)
      .find((reference) => isObsoleteShipLayout(reference.specifier));
    expect(obsoleteReference, file).toBeUndefined();
  }
});
