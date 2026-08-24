import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
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

const SHARED_GEOMETRY_EXPORTS = [
  'ShipBlockOptions',
  'ShipGeometryBuildContext',
  'addBlock',
  'toCollisionBox',
  'toOrientedCollisionBox',
] as const;

const OWNER_HELPERS = {
  ShipHullGeometry: ['addRoundedPrism', 'appendRoundedBow', 'shipPlanShape'],
  ShipRoomGeometry: ['applyRoofPlanarUvs', 'applyWallPlanarUvs', 'createWallBoxGeometry'],
  ShipExteriorGeometry: ['addCylinder', 'addRotatedBlock', 'roundedBowPoint'],
} as const;

const SHARED_GEOMETRY_VALUES = [
  'SHIP_BOW_DEPTH',
  'SHIP_BOW_NOSE_CONTROL_WIDTH_SCALE',
  'SHIP_BOW_SHOULDER_CONTROL_DEPTH_SCALE',
  'SHIP_DECK_LENGTH',
  'SHIP_STRUCTURAL_DECK_TOP_Y',
] as const;

interface BuilderComposition {
  readonly name: string;
  readonly module: string;
  readonly binding?: string;
  readonly destructured?: boolean;
}

const BUILDER_COMPOSITION: readonly BuilderComposition[] = [
  {
    name: 'addShipHull',
    module: 'ShipHullGeometry',
    binding: 'waterExclusion',
    destructured: true,
  },
  { name: 'addShipRooms', module: 'ShipRoomGeometry' },
  { name: 'addShipAccess', module: 'ShipAccessGeometry', binding: 'climbZones' },
  { name: 'addShipExterior', module: 'ShipExteriorGeometry', binding: 'stackOutlets' },
] as const;

const THREE_IMPORT = /\b(?:from\s+|import\s*(?:\(\s*)?)['"]three(?:\/[^'"]*)?['"]/;

type ModuleReferenceKind = 'import' | 'import equals' | 'dynamic import' | 're-export';

interface ModuleReference {
  readonly kind: ModuleReferenceKind;
  readonly specifier: string;
}

function sourceFile(file: string): string {
  return readFileSync(resolve(WORLD_DIRECTORY, file), 'utf8');
}

function parseSource(source: string, fileName = 'source.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function moduleReferences(source: string, fileName?: string): readonly ModuleReference[] {
  const references: ModuleReference[] = [];
  const sourceFile = parseSource(source, fileName);

  const addSpecifier = (node: ts.Expression | ts.ModuleReference | undefined, kind: ModuleReferenceKind): void => {
    if (node && ts.isStringLiteral(node)) references.push({ kind, specifier: node.text });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) addSpecifier(node.moduleSpecifier, 'import');
    if (ts.isExportDeclaration(node)) addSpecifier(node.moduleSpecifier, 're-export');
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addSpecifier(node.moduleReference.expression, 'import equals');
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      addSpecifier(node.arguments[0], 'dynamic import');
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

function typeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return typeScriptFiles(path);
    return entry.isFile() && /\.(?:ts|tsx|mts|cts)$/i.test(path) ? [path] : [];
  });
}

function normalizedModuleName(specifier: string): string {
  return specifier
    .replace(/^.*\//, '')
    .replace(/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i, '');
}

function isObsoleteShipLayout(specifier: string): boolean {
  return normalizedModuleName(specifier) === 'ShipLayout';
}

function isForbiddenBuilderReference(specifier: string, forbiddenModules: ReadonlySet<string>): boolean {
  return forbiddenModules.has(normalizedModuleName(specifier));
}

function exportedCreateShipGeometry(sourceFile: ts.SourceFile): ts.FunctionDeclaration {
  const declaration = sourceFile.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement)
    && statement.name?.text === 'createShipGeometry'
    && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true);
  expect(declaration).toBeDefined();
  expect(declaration?.body).toBeDefined();
  return declaration as ts.FunctionDeclaration;
}

function exportedDeclarationNames(sourceFile: ts.SourceFile): readonly string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.canHaveModifiers(statement)
      || !ts.getModifiers(statement)?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name) ? [declaration.name.text] : []);
    }
    if ((ts.isFunctionDeclaration(statement)
      || ts.isClassDeclaration(statement)
      || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
      || ts.isEnumDeclaration(statement)) && statement.name) return [statement.name.text];
    return [];
  }).sort();
}

function topLevelFunctionNames(sourceFile: ts.SourceFile): readonly string[] {
  return sourceFile.statements.flatMap((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name ? [statement.name.text] : []);
}

function constructionBlock(body: ts.Block): ts.Block {
  const tries = body.statements.filter(ts.isTryStatement);
  expect(tries).toHaveLength(1);
  expect(tries[0]?.catchClause).toBeDefined();
  expect(tries[0]?.finallyBlock).toBeUndefined();
  return tries[0]!.tryBlock;
}

function hasOneValueNamedImport(
  sourceFile: ts.SourceFile,
  module: string,
  name: string,
): boolean {
  let unaliasedValueImports = 0;
  let otherImports = 0;
  sourceFile.statements.forEach((statement) => {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== `./${module}`
    ) return;
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    bindings.elements.forEach((element) => {
      const exportedName = element.propertyName?.text ?? element.name.text;
      if (exportedName !== name) return;
      if (clause?.isTypeOnly || element.isTypeOnly || element.propertyName) otherImports += 1;
      else unaliasedValueImports += 1;
    });
  });
  return unaliasedValueImports === 1 && otherImports === 0;
}

function directBuilderCalls(body: ts.Block): readonly ts.CallExpression[] {
  const names = new Set<string>(BUILDER_COMPOSITION.map((builder) => builder.name));
  const callFromStatement = (statement: ts.Statement): ts.CallExpression | undefined => {
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
      return statement.expression;
    }
    if (!ts.isVariableStatement(statement)) return undefined;
    const [declaration] = statement.declarationList.declarations;
    return statement.declarationList.declarations.length === 1
      && declaration?.initializer
      && ts.isCallExpression(declaration.initializer)
      ? declaration.initializer
      : undefined;
  };
  return body.statements.flatMap((statement) => {
    const call = callFromStatement(statement);
    return call && ts.isIdentifier(call.expression) && names.has(call.expression.text) ? [call] : [];
  });
}

function hasFunctionBodyParent(call: ts.CallExpression, body: ts.Block): boolean {
  if (ts.isExpressionStatement(call.parent)) return call.parent.parent === body;
  if (!ts.isVariableDeclaration(call.parent)) return false;
  const declarationList = call.parent.parent;
  return ts.isVariableDeclarationList(declarationList)
    && ts.isVariableStatement(declarationList.parent)
    && declarationList.parent.parent === body;
}

function functionBody(source: string): ts.Block {
  const sourceFile = parseSource(source);
  const declaration = sourceFile.statements.find(ts.isFunctionDeclaration);
  expect(declaration?.body).toBeDefined();
  return declaration?.body as ts.Block;
}

function hasExactArguments(call: ts.CallExpression): boolean {
  const [context, layout] = call.arguments;
  return call.arguments.length === 2
    && context !== undefined
    && ts.isIdentifier(context)
    && context.text === 'context'
    && layout !== undefined
    && ts.isIdentifier(layout)
    && layout.text === 'layout';
}

function isConstDeclaration(call: ts.CallExpression): call is ts.CallExpression & { parent: ts.VariableDeclaration } {
  return ts.isVariableDeclaration(call.parent)
    && call.parent.initializer === call
    && ts.isVariableDeclarationList(call.parent.parent)
    && (call.parent.parent.flags & ts.NodeFlags.Const) !== 0;
}

function hasExactBinding(
  call: ts.CallExpression,
  binding: string,
  destructured: boolean,
): boolean {
  if (!isConstDeclaration(call)) return false;
  const name = call.parent.name;
  if (!destructured) return ts.isIdentifier(name) && name.text === binding;
  if (!ts.isObjectBindingPattern(name)) return false;
  const [element] = name.elements;
  return name.elements.length === 1
    && element !== undefined
    && ts.isIdentifier(element.name)
    && element.name.text === binding
    && !element.propertyName;
}

function isUnboundStatementCall(call: ts.CallExpression): boolean {
  return ts.isExpressionStatement(call.parent) && call.parent.expression === call;
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

it('detects obsolete ShipLayout AST references without matching text', () => {
  const obsoleteSources = [
    "import /* layout */ { SHIP_LAYOUT } from '../src/world/ShipLayout';",
    "import '../src/world/ShipLayout.ts';",
    "const layout = await import('../src/world/ShipLayout', { with: { type: 'json' } });",
    "export { SHIP_LAYOUT } from '../src/world/ShipLayout.ts';",
    "export * from '../src/world/ShipLayout';",
    "import layout = require('../src/world/ShipLayout');",
  ];

  for (const source of obsoleteSources) {
    expect(moduleReferences(source).some((reference) => isObsoleteShipLayout(reference.specifier))).toBe(true);
  }

  const textOnlySource = [
    "// import '../src/world/ShipLayout';",
    "const message = \"export * from '../src/world/ShipLayout'\";",
  ].join('\n');
  expect(moduleReferences(textOnlySource)).toEqual([]);
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
    const references = moduleReferences(sourceFile(`${builder}.ts`), `${builder}.ts`);

    for (const reference of references) {
      expect(isForbiddenBuilderReference(reference.specifier, forbiddenModules)).toBe(false);
    }
  }

  const peerImport = moduleReferences("import { addShipRooms } from './ShipRoomGeometry.js';");
  expect(peerImport.some((reference) =>
    isForbiddenBuilderReference(reference.specifier, new Set(['ShipRoomGeometry'])))).toBe(true);
});

it('keeps shared geometry APIs narrow and private helpers with their owners', () => {
  const primitives = parseSource(
    sourceFile('ShipGeometryPrimitives.ts'),
    'ShipGeometryPrimitives.ts',
  );
  expect(exportedDeclarationNames(primitives)).toEqual([...SHARED_GEOMETRY_EXPORTS].sort());
  expect(moduleReferences(primitives.text, 'ShipGeometryPrimitives.ts')
    .some(({ specifier }) => normalizedModuleName(specifier) === 'shipLayoutData')).toBe(false);

  for (const [owner, helpers] of Object.entries(OWNER_HELPERS)) {
    const ownerSource = parseSource(sourceFile(`${owner}.ts`), `${owner}.ts`);
    const functions = topLevelFunctionNames(ownerSource);
    const exports = exportedDeclarationNames(ownerSource);
    helpers.forEach((helper) => {
      expect(functions, `${owner}.${helper}`).toContain(helper);
      expect(exports, `${owner}.${helper}`).not.toContain(helper);
    });
  }
});

it('keeps shared ship values and geometry lookups in one neutral owner', () => {
  const types = parseSource(sourceFile('ShipLayoutTypes.ts'), 'ShipLayoutTypes.ts');
  const typeExports = exportedDeclarationNames(types);
  SHARED_GEOMETRY_VALUES.forEach((name) => expect(typeExports).toContain(name));
  expect(typeExports).toContain('requiredShipZone');
  expect(typeExports).toContain('shipRoomRoofTopY');

  for (const builder of FOCUSED_BUILDERS) {
    const functions = topLevelFunctionNames(
      parseSource(sourceFile(`${builder}.ts`), `${builder}.ts`),
    );
    expect(functions).not.toContain('requiredZone');
    expect(functions).not.toContain('roomWallHeight');
    expect(functions).not.toContain('balconyDeckTopY');
  }

  const dataExports = exportedDeclarationNames(
    parseSource(sourceFile('shipLayoutData.ts'), 'shipLayoutData.ts'),
  );
  expect(dataExports).not.toContain('SHIP_STERN_DECK_DEPTH');
});

it('rejects nested composition calls and non-value builder imports', () => {
  const nestedFunction = functionBody(`
    function createShipGeometry(): void {
      const composeHull = (): void => { addShipHull(context, layout); };
      composeHull();
    }
  `);
  const nestedBlock = functionBody(`
    function createShipGeometry(): void {
      if (true) { addShipHull(context, layout); }
    }
  `);
  const typeOnlyClause = parseSource(
    "import type { addShipHull } from './ShipHullGeometry';",
  );
  const typeOnlyElement = parseSource(
    "import { type addShipHull } from './ShipHullGeometry';",
  );
  const duplicateValueAlias = parseSource(
    "import { addShipHull, addShipHull as hullAgain } from './ShipHullGeometry';",
  );
  const typeOnlyAlias = parseSource(
    "import { addShipHull, type addShipHull as hullType } from './ShipHullGeometry';",
  );

  expect(directBuilderCalls(nestedFunction)).toEqual([]);
  expect(directBuilderCalls(nestedBlock)).toEqual([]);
  expect(hasOneValueNamedImport(typeOnlyClause, 'ShipHullGeometry', 'addShipHull')).toBe(false);
  expect(hasOneValueNamedImport(typeOnlyElement, 'ShipHullGeometry', 'addShipHull')).toBe(false);
  expect(hasOneValueNamedImport(duplicateValueAlias, 'ShipHullGeometry', 'addShipHull')).toBe(false);
  expect(hasOneValueNamedImport(typeOnlyAlias, 'ShipHullGeometry', 'addShipHull')).toBe(false);
});

it('keeps final geometry composition direct and ordered', () => {
  const geometrySource = parseSource(sourceFile('ShipGeometry.ts'), 'ShipGeometry.ts');
  const composition = exportedCreateShipGeometry(geometrySource);
  const body = constructionBlock(composition.body as ts.Block);

  for (const builder of BUILDER_COMPOSITION) {
    expect(hasOneValueNamedImport(geometrySource, builder.module, builder.name)).toBe(true);
  }

  const calls = directBuilderCalls(body);
  expect(calls.map((call) => (call.expression as ts.Identifier).text))
    .toEqual(BUILDER_COMPOSITION.map((builder) => builder.name));
  expect(calls.every((call) => hasFunctionBodyParent(call, body))).toBe(true);

  for (const [index, builder] of BUILDER_COMPOSITION.entries()) {
    const call = calls[index];
    expect(call).toBeDefined();
    expect(hasExactArguments(call as ts.CallExpression)).toBe(true);
    if (builder.binding) {
      expect(hasExactBinding(
        call as ts.CallExpression,
        builder.binding,
        builder.destructured === true,
      )).toBe(true);
    } else {
      expect(isUnboundStatementCall(call as ts.CallExpression)).toBe(true);
    }
  }

  expect(moduleReferences(geometrySource.text, 'ShipGeometry.ts')
    .filter((reference) => reference.kind === 're-export')).toEqual([]);
});

it('removes the obsolete layout module and all TypeScript source references', () => {
  expect(existsSync(resolve(WORLD_DIRECTORY, 'ShipLayout.ts'))).toBe(false);

  for (const file of [...typeScriptFiles(SOURCE_DIRECTORY), ...typeScriptFiles(TEST_DIRECTORY)]) {
    const source = readFileSync(file, 'utf8');
    const obsoleteReference = moduleReferences(source, file)
      .find((reference) => isObsoleteShipLayout(reference.specifier));
    expect(obsoleteReference, file).toBeUndefined();
  }
});
