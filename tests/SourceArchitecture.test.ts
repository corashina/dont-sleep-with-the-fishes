import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PROJECT_DIRECTORY = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_DIRECTORY = resolve(PROJECT_DIRECTORY, 'src');
const UI_DIRECTORY = resolve(SOURCE_DIRECTORY, 'ui');
const FIXTURE_DIRECTORY = resolve(PROJECT_DIRECTORY, 'tests/fixtures/sourceArchitecture');
const RESOLVER_FIXTURE_DIRECTORY = resolve(FIXTURE_DIRECTORY, 'resolver');
const TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/i;
const ASSET_EXTENSIONS = new Set([
  '.css',
  '.gif',
  '.glb',
  '.gltf',
  '.jpeg',
  '.jpg',
  '.json',
  '.mp3',
  '.ogg',
  '.png',
  '.svg',
  '.wav',
  '.webp',
  '.woff',
  '.woff2',
]);
const DELETED_PATHS = [
  'src/survival/events.ts',
  'src/survival/ActiveEventPresenter.ts',
  'src/world/ShipLayout.ts',
] as const;
const DOMAIN_FILES = [
  'survival/eventCatalog.ts',
  'survival/eventCatalogValidation.ts',
  'survival/eventSelection.ts',
  'survival/eventOutcomeRules.ts',
  'survival/journalRecords.ts',
  'survival/dayActionRules.ts',
  'survival/fishingSettlementRules.ts',
] as const;
const LAYOUT_FILES = [
  'world/ShipLayoutTypes.ts',
  'world/shipLayoutData.ts',
  'world/ShipNavigation.ts',
  'world/ShipLayoutValidation.ts',
] as const;
const BOUNDARY_FILES = [...DOMAIN_FILES, ...LAYOUT_FILES] as const;

type ModuleReferenceKind =
  | 'dynamic import'
  | 'import'
  | 'import equals'
  | 'import type'
  | 're-export';

interface ModuleReference {
  readonly kind: ModuleReferenceKind;
  readonly specifier: string;
}

interface SourceGraph {
  readonly dependencies: ReadonlyMap<string, readonly string[]>;
  readonly displayNames: ReadonlyMap<string, string>;
}

function diagnosticsText(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => PROJECT_DIRECTORY,
    getNewLine: () => '\n',
  });
}

function projectCompilerOptions(): ts.CompilerOptions {
  const configPath = resolve(PROJECT_DIRECTORY, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(diagnosticsText([config.error]));
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    PROJECT_DIRECTORY,
    undefined,
    configPath,
  );
  if (parsed.errors.length > 0) throw new Error(diagnosticsText(parsed.errors));
  return parsed.options;
}

const COMPILER_OPTIONS = projectCompilerOptions();

function scriptKind(fileName: string): ts.ScriptKind {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.mts') return ts.ScriptKind.TS;
  if (extension === '.cts') return ts.ScriptKind.TS;
  return ts.ScriptKind.TS;
}

function parseSource(source: string, fileName = 'source.ts'): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  );
}

function moduleReferences(source: string, fileName = 'source.ts'): readonly ModuleReference[] {
  const references: ModuleReference[] = [];
  const sourceFile = parseSource(source, fileName);
  const add = (node: ts.Node | undefined, kind: ModuleReferenceKind): void => {
    if (node && ts.isStringLiteralLike(node)) {
      references.push({ kind, specifier: node.text });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, 'import');
    if (ts.isExportDeclaration(node)) add(node.moduleSpecifier, 're-export');
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, 'import equals');
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node.arguments[0], 'dynamic import');
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, 'import type');
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
    return entry.isFile() && TYPESCRIPT_FILE.test(entry.name) ? [path] : [];
  }).sort();
}

function canonicalPath(path: string): string {
  const absolute = resolve(path).replaceAll('\\', '/');
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./')
    || specifier.startsWith('../');
}

function specifierExtension(specifier: string): string {
  return extname(specifier.replace(/[?#].*$/, '')).toLowerCase();
}

function isKnownAsset(specifier: string): boolean {
  return ASSET_EXTENSIONS.has(specifierExtension(specifier));
}

function resolveRelativeModule(specifier: string, containingFile: string): string | null {
  const resolution = ts.resolveModuleName(
    specifier,
    containingFile,
    COMPILER_OPTIONS,
    ts.sys,
  ).resolvedModule;
  if (!resolution) {
    if (isKnownAsset(specifier)) return null;
    throw new Error(
      `Unresolved relative module ${specifier} from ${relative(PROJECT_DIRECTORY, containingFile)}`,
    );
  }
  if (isKnownAsset(resolution.resolvedFileName) || isKnownAsset(specifier)) return null;
  return TYPESCRIPT_FILE.test(resolution.resolvedFileName)
    ? resolve(resolution.resolvedFileName)
    : null;
}

function buildRelativeGraph(files: readonly string[], displayRoot: string): SourceGraph {
  const sourceFiles = new Map(files.map((file) => [canonicalPath(file), resolve(file)]));
  const dependencies = new Map<string, readonly string[]>();
  const displayNames = new Map<string, string>();
  for (const [canonical, file] of sourceFiles) {
    displayNames.set(canonical, relative(displayRoot, file).replaceAll('\\', '/'));
    const resolvedDependencies = moduleReferences(readFileSync(file, 'utf8'), file)
      .filter(({ specifier }) => isRelativeSpecifier(specifier))
      .flatMap(({ specifier }) => {
        const resolvedModule = resolveRelativeModule(specifier, file);
        if (resolvedModule === null) return [];
        const dependency = canonicalPath(resolvedModule);
        return sourceFiles.has(dependency) ? [dependency] : [];
      });
    dependencies.set(canonical, [...new Set(resolvedDependencies)].sort());
  }
  return { dependencies, displayNames };
}

function assertAcyclic(graph: SourceGraph): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (file: string): void => {
    visiting.add(file);
    stack.push(file);
    for (const dependency of graph.dependencies.get(file) ?? []) {
      if (visiting.has(dependency)) {
        const cycleStart = stack.indexOf(dependency);
        const cycle = [...stack.slice(cycleStart), dependency]
          .map((path) => graph.displayNames.get(path) ?? path)
          .join(' -> ');
        throw new Error(`Relative import cycle: ${cycle}`);
      }
      if (!visited.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(file);
    visited.add(file);
  };
  for (const file of [...graph.dependencies.keys()].sort()) {
    if (!visited.has(file)) visit(file);
  }
}

function pathIsWithin(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function boundaryModuleViolations(file: string): readonly string[] {
  return moduleReferences(readFileSync(file, 'utf8'), file).flatMap(({ kind, specifier }) => {
    if (specifier === 'three' || specifier.startsWith('three/')) {
      return [`${kind} uses ${specifier}`];
    }
    if (!isRelativeSpecifier(specifier)) return [];
    const resolvedModule = resolveRelativeModule(specifier, file);
    return resolvedModule !== null && pathIsWithin(UI_DIRECTORY, resolvedModule)
      ? [`${kind} uses ${relative(SOURCE_DIRECTORY, resolvedModule).replaceAll('\\', '/')}`]
      : [];
  });
}

function domGlobalNames(program: ts.Program, file: string): readonly string[] {
  const sourceFile = program.getSourceFile(resolve(file));
  if (!sourceFile) throw new Error(`Missing program source: ${file}`);
  const checker = program.getTypeChecker();
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      const target = symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0
        ? checker.getAliasedSymbol(symbol)
        : symbol;
      if (target?.declarations?.some((declaration) =>
        declaration.getSourceFile().fileName.replaceAll('\\', '/').toLowerCase()
          .endsWith('/lib.dom.d.ts'))) {
        names.add(node.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...names].sort();
}

function projectProgram(): ts.Program {
  const configPath = resolve(PROJECT_DIRECTORY, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(diagnosticsText([config.error]));
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    PROJECT_DIRECTORY,
    undefined,
    configPath,
  );
  if (parsed.errors.length > 0) throw new Error(diagnosticsText(parsed.errors));
  return ts.createProgram(parsed.fileNames, parsed.options);
}

describe('source reference helpers', () => {
  it('parses module syntax without matching comments or strings', () => {
    const source = [
      "import value from './static';",
      "import equal = require('./equals');",
      "export { value } from './exported';",
      "const dynamic = import('./dynamic');",
      "type Imported = import('./typed').Imported;",
      "// import './comment';",
      "const text = \"export * from './text'\";",
    ].join('\n');

    expect(moduleReferences(source).map(({ kind, specifier }) => [kind, specifier])).toEqual([
      ['import', './static'],
      ['import equals', './equals'],
      ['re-export', './exported'],
      ['dynamic import', './dynamic'],
      ['import type', './typed'],
    ]);
  });

  it('uses TypeScript resolution for supported relative forms', () => {
    const containingFile = resolve(RESOLVER_FIXTURE_DIRECTORY, 'consumer.ts');
    const target = canonicalPath(resolve(RESOLVER_FIXTURE_DIRECTORY, 'target.ts'));
    const index = canonicalPath(resolve(RESOLVER_FIXTURE_DIRECTORY, 'indexTarget/index.ts'));

    expect(canonicalPath(resolveRelativeModule('./target', containingFile)!)).toBe(target);
    expect(canonicalPath(resolveRelativeModule('./target.ts', containingFile)!)).toBe(target);
    expect(canonicalPath(resolveRelativeModule('./target.js', containingFile)!)).toBe(target);
    expect(canonicalPath(resolveRelativeModule('./indexTarget', containingFile)!)).toBe(index);
  });

  it('includes type-only edges and renders the complete cycle', () => {
    const files = [
      resolve(FIXTURE_DIRECTORY, 'typeOnlyA.ts'),
      resolve(FIXTURE_DIRECTORY, 'typeOnlyB.ts'),
    ];
    expect(() => assertAcyclic(buildRelativeGraph(files, FIXTURE_DIRECTORY))).toThrow(
      'typeOnlyA.ts -> typeOnlyB.ts -> typeOnlyA.ts',
    );
  });

  it('uses symbols instead of comments and strings for DOM checks', () => {
    const program = projectProgram();
    expect(domGlobalNames(program, resolve(FIXTURE_DIRECTORY, 'domClean.ts'))).toEqual([]);
    expect(domGlobalNames(program, resolve(FIXTURE_DIRECTORY, 'domGlobal.ts'))).toContain('document');
  });
});

it('does not keep obsolete source paths', () => {
  for (const path of DELETED_PATHS) {
    expect(existsSync(resolve(PROJECT_DIRECTORY, path)), path).toBe(false);
  }
});

it('keeps domain and layout modules independent from UI, DOM, and Three.js', () => {
  const program = projectProgram();
  for (const relativeFile of BOUNDARY_FILES) {
    const file = resolve(SOURCE_DIRECTORY, relativeFile);
    expect(boundaryModuleViolations(file), relativeFile).toEqual([]);
    expect(domGlobalNames(program, file), relativeFile).toEqual([]);
  }
});

it('resolves every relative source import', () => {
  const files = typeScriptFiles(SOURCE_DIRECTORY);
  const graph = buildRelativeGraph(files, SOURCE_DIRECTORY);
  expect(graph.dependencies.size).toBe(files.length);
});

it('keeps the source relative-import graph acyclic', () => {
  const graph = buildRelativeGraph(typeScriptFiles(SOURCE_DIRECTORY), SOURCE_DIRECTORY);
  expect(() => assertAcyclic(graph)).not.toThrow();
});
