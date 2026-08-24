import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface FrameRoot {
  readonly className: string;
  readonly displayPath: string;
  readonly methodName: string;
  readonly sourceUrl: URL;
}

interface AllocationSite {
  readonly kind: string;
  readonly methodName: string;
  readonly text: string;
}

const ALLOCATING_METHODS = new Set([
  'clone',
  'concat',
  'filter',
  'flat',
  'flatMap',
  'map',
  'slice',
  'toArray',
]);

const ALLOCATING_STATIC_METHODS = new Set([
  'Array.from',
  'Array.of',
  'Object.entries',
  'Object.keys',
  'Object.values',
  'Reflect.ownKeys',
]);

const FRAME_ROOTS = [
  {
    className: 'OceanRenderer',
    displayPath: 'src/ocean/OceanRenderer.ts',
    methodName: 'update',
    sourceUrl: new URL('../src/ocean/OceanRenderer.ts', import.meta.url),
  },
  {
    className: 'BoatWorld',
    displayPath: 'src/survival/BoatWorld.ts',
    methodName: 'updateScene',
    sourceUrl: new URL('../src/survival/BoatWorld.ts', import.meta.url),
  },
  {
    className: 'World',
    displayPath: 'src/world/World.ts',
    methodName: 'update',
    sourceUrl: new URL('../src/world/World.ts', import.meta.url),
  },
] as const satisfies readonly FrameRoot[];

function parseClass(
  source: string,
  displayPath: string,
  className: string,
): ts.ClassDeclaration {
  const sourceFile = ts.createSourceFile(
    displayPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.ClassDeclaration => (
      ts.isClassDeclaration(statement)
      && statement.name?.text === className
    ),
  );
  if (!declaration) throw new Error(`Missing class ${className} in ${displayPath}`);
  return declaration;
}

function classMethods(declaration: ts.ClassDeclaration): ReadonlyMap<string, ts.MethodDeclaration> {
  const methods = new Map<string, ts.MethodDeclaration>();
  for (const member of declaration.members) {
    if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name) && member.body) {
      methods.set(member.name.text, member);
    }
  }
  return methods;
}

function directlyCalledHelpers(
  method: ts.MethodDeclaration,
  methods: ReadonlyMap<string, ts.MethodDeclaration>,
): readonly string[] {
  const called = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword
      && methods.has(node.expression.name.text)) {
      called.add(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  };
  if (method.body) visit(method.body);
  return [...called].sort();
}

function reachableMethods(
  methods: ReadonlyMap<string, ts.MethodDeclaration>,
  rootName: string,
): ReadonlyMap<string, ts.MethodDeclaration> {
  const reachable = new Map<string, ts.MethodDeclaration>();
  const visit = (name: string): void => {
    if (reachable.has(name)) return;
    const method = methods.get(name);
    if (!method) throw new Error(`Missing frame method ${name}`);
    reachable.set(name, method);
    for (const helper of directlyCalledHelpers(method, methods)) visit(helper);
  };
  visit(rootName);
  return reachable;
}

function allocationSites(
  methodName: string,
  method: ts.MethodDeclaration,
): readonly AllocationSite[] {
  const sites: AllocationSite[] = [];
  const add = (node: ts.Node, kind: string): void => {
    sites.push({ kind, methodName, text: node.getText() });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node)) add(node, 'new');
    else if (ts.isArrayLiteralExpression(node)) add(node, 'array literal');
    else if (ts.isObjectLiteralExpression(node)) add(node, 'object literal');
    else if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) add(node, 'spread');
    else if (node !== method
      && (ts.isArrowFunction(node)
        || ts.isFunctionExpression(node)
        || ts.isFunctionDeclaration(node))) {
      add(node, 'function');
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callName = node.expression.name.text;
      if (ALLOCATING_METHODS.has(callName)) add(node, callName);
      else if (ALLOCATING_STATIC_METHODS.has(node.expression.getText())) add(node, 'collection');
    }
    ts.forEachChild(node, visit);
  };
  if (method.body) visit(method.body);
  return sites;
}

function auditFrameRoot(root: FrameRoot, source?: string): {
  readonly allocations: readonly AllocationSite[];
  readonly methods: readonly string[];
} {
  const declaration = parseClass(
    source ?? readFileSync(root.sourceUrl, 'utf8'),
    root.displayPath,
    root.className,
  );
  const reachable = reachableMethods(classMethods(declaration), root.methodName);
  return {
    allocations: [...reachable]
      .flatMap(([name, method]) => allocationSites(name, method))
      .sort((left, right) => (
        left.methodName.localeCompare(right.methodName)
        || left.kind.localeCompare(right.kind)
        || left.text.localeCompare(right.text)
      )),
    methods: [...reachable.keys()].sort(),
  };
}

describe('frame allocation audit', () => {
  it('checks each frame root and its direct local helpers', () => {
    const audits = FRAME_ROOTS.map((root) => ({
      ...auditFrameRoot(root),
      displayPath: root.displayPath,
    }));

    expect(audits.map(({ displayPath, methods }) => ({ displayPath, methods }))).toEqual([
      {
        displayPath: 'src/ocean/OceanRenderer.ts',
        methods: ['update'],
      },
      {
        displayPath: 'src/survival/BoatWorld.ts',
        methods: [
          'applyBaseLighting',
          'applyBasePresentation',
          'applyCue',
          'currentDriftingItemAimTarget',
          'isTerminalCue',
          'updateScene',
        ],
      },
      {
        displayPath: 'src/world/World.ts',
        methods: ['syncPhysicsObjects', 'update'],
      },
    ]);
    expect(audits.flatMap(({ allocations, displayPath }) => (
      allocations.map(({ kind, methodName }) => `${displayPath}:${methodName}:${kind}`)
    ))).toEqual([
      'src/survival/BoatWorld.ts:applyBaseLighting:clone',
      'src/survival/BoatWorld.ts:applyBaseLighting:new',
    ]);
  });

  it('detects allocation syntax without matching cached mutation', () => {
    const audit = auditFrameRoot(FRAME_ROOTS[0], `
      class OceanRenderer {
        update(): void { this.helper(); }
        helper(): void {
          const vector = new Vector2();
          const array = [...this.values];
          const object = { ...this.value };
          const copy = this.cached.clone();
          const mapped = this.values.map(String);
          const keys = Object.keys(this.value);
          this.cached.copy(this.value);
        }
      }
    `);

    expect(audit.methods).toEqual(['helper', 'update']);
    expect(audit.allocations.map(({ kind }) => kind).sort()).toEqual([
      'array literal',
      'clone',
      'collection',
      'map',
      'new',
      'object literal',
      'spread',
      'spread',
    ]);
  });
});
