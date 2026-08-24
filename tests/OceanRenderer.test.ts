// Importance: 8/10 (scaled from 4/5). Protects the low-cost graded ocean horizon geometry.
import { readFileSync } from 'node:fs';
import {
  type BufferAttribute,
  type BufferGeometry,
  Color,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  OceanRenderer,
} from '../src/ocean/OceanRenderer';
import type { WaterExclusionRegion } from '../src/ocean/WaterExclusion';
import {
  createInactiveVortexWaveState,
  type VortexWaveState,
} from '../src/ocean/WaveField';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

vi.mock('three/addons/utils/BufferGeometryUtils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/addons/utils/BufferGeometryUtils.js')>();
  return {
    ...actual,
    mergeGeometries: vi.fn(actual.mergeGeometries),
  };
});

const OCEAN_RENDERER_SOURCE = readFileSync(
  new URL('../src/ocean/OceanRenderer.ts', import.meta.url),
  'utf8',
);

function parseSource(source: string): ts.SourceFile {
  return ts.createSourceFile(
    'OceanRenderer.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function oceanRendererClass(source = OCEAN_RENDERER_SOURCE): ts.ClassDeclaration {
  const declaration = parseSource(source).statements.find(
    (statement): statement is ts.ClassDeclaration => (
      ts.isClassDeclaration(statement)
      && statement.name?.text === 'OceanRenderer'
    ),
  );
  expect(declaration).toBeDefined();
  return declaration as ts.ClassDeclaration;
}

function namedMethod(
  declaration: ts.ClassDeclaration,
  name: string,
): ts.MethodDeclaration {
  const method = declaration.members.find(
    (member): member is ts.MethodDeclaration => (
      ts.isMethodDeclaration(member)
      && ts.isIdentifier(member.name)
      && member.name.text === name
    ),
  );
  expect(method, name).toBeDefined();
  expect(method?.body, name).toBeDefined();
  return method as ts.MethodDeclaration;
}

function allocationSites(method: ts.MethodDeclaration): readonly string[] {
  const sites: string[] = [];
  const allocationMethods = new Set([
    'bind',
    'clone',
    'concat',
    'filter',
    'flatMap',
    'map',
    'slice',
    'toArray',
  ]);
  const allocationFactories = new Set([
    'createOceanHorizonGeometry',
    'createOceanShaderDefinition',
    'createOceanSurfaceGeometry',
    'structuredClone',
  ]);
  const allocationStaticMethods = new Set([
    'Array.from',
    'Array.of',
    'Object.entries',
    'Object.keys',
    'Object.values',
    'Reflect.ownKeys',
  ]);
  const visit = (node: ts.Node): void => {
    const isLiteralAllocation = ts.isArrayLiteralExpression(node)
      || ts.isObjectLiteralExpression(node);
    const isNestedFunction = node !== method
      && (ts.isArrowFunction(node)
        || ts.isFunctionExpression(node)
        || ts.isFunctionDeclaration(node));
    let isFactoryCall = false;
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      isFactoryCall = ts.isIdentifier(expression)
        ? allocationFactories.has(expression.text)
          || expression.text.startsWith('create')
        : ts.isPropertyAccessExpression(expression)
          && (allocationMethods.has(expression.name.text)
            || allocationStaticMethods.has(expression.getText()));
    }
    if (ts.isNewExpression(node)
      || isLiteralAllocation
      || isNestedFunction
      || isFactoryCall) {
      sites.push(node.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(method);
  return sites;
}

interface OceanSurfaceQuality {
  readonly segments: number;
  readonly surfaceExtent: number;
  readonly horizonHalfExtent: number;
  readonly horizonRadialSegments: number;
  readonly horizonRadialExponent: number;
}

const OCEAN_SURFACE_QUALITY = Object.freeze({
  low: Object.freeze({
    segments: 192,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 48,
    horizonRadialExponent: 1.75,
  }),
  high: Object.freeze({
    segments: 288,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 72,
    horizonRadialExponent: 1.75,
  }),
  ultra: Object.freeze({
    segments: 384,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 96,
    horizonRadialExponent: 1.75,
  }),
}) satisfies Readonly<Record<string, Readonly<OceanSurfaceQuality>>>;

function centerlineRadialDistances(ocean: OceanRenderer): number[] {
  const positions = ocean.horizonMesh.geometry.getAttribute(
    'position',
  ) as BufferAttribute;
  const innerHalfExtent = OCEAN_SURFACE_QUALITY.low.surfaceExtent / 2;
  const distances = new Set<number>();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    if (Math.abs(x) > 0.0001 || z < innerHalfExtent - 0.0001) continue;
    distances.add(Number(z.toFixed(4)));
  }

  return [...distances].sort((a, b) => a - b);
}

function expectedHorizonVertexCount(
  quality: Readonly<OceanSurfaceQuality>,
): number {
  const edgeVertices = quality.segments + 1;
  const radialVertices = quality.horizonRadialSegments + 1;
  return 4 * edgeVertices * radialVertices
    + 4 * radialVertices * radialVertices;
}

function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index === null) throw new Error('Expected indexed ocean geometry.');
  return index.count / 3;
}

describe('OceanRenderer', () => {
  it('keeps the exact runtime controller API and update argument order', () => {
    const declaration = oceanRendererClass();
    const constructors = declaration.members.filter(ts.isConstructorDeclaration);
    const publicMethods = declaration.members.filter(
      (member): member is ts.MethodDeclaration => (
        ts.isMethodDeclaration(member)
        && !member.modifiers?.some((modifier) => (
          modifier.kind === ts.SyntaxKind.PrivateKeyword
          || modifier.kind === ts.SyntaxKind.ProtectedKeyword
        ))
      ),
    );

    expect(constructors).toHaveLength(1);
    expect(constructors[0]?.parameters.map((parameter) => parameter.name.getText()))
      .toEqual(['quality', 'lightDirection']);
    expect(publicMethods.map((method) => method.name.getText())).toEqual([
      'setQuality',
      'update',
      'setVortex',
      'vortexStateForTest',
      'setExclusions',
      'follow',
      'dispose',
    ]);
    const update = namedMethod(declaration, 'update');
    expect(update.parameters.map((parameter) => parameter.name.getText())).toEqual([
      'timeSeconds',
      'amplitudeScale',
      'fogDensity',
      'atmosphere',
    ]);
    expect(update.parameters[3]?.questionToken).toBeDefined();
  });

  it('imports shader and geometry owners without obsolete helper residue', () => {
    const sourceFile = parseSource(OCEAN_RENDERER_SOURCE);
    const imports = sourceFile.statements
      .filter(ts.isImportDeclaration)
      .map((declaration) => (
        ts.isStringLiteral(declaration.moduleSpecifier)
          ? declaration.moduleSpecifier.text
          : ''
      ));

    expect(imports).toContain('./oceanShader');
    expect(imports).toContain('./oceanGeometry');
    for (const residue of [
      'gl_Position',
      'gl_FragColor',
      'createOceanPanel',
      'createSurfaceGeometry',
      'createHorizonGeometry',
    ]) {
      expect(OCEAN_RENDERER_SOURCE, residue).not.toContain(residue);
    }
  });

  it('keeps runtime paths free of shader, geometry, and scratch allocations', () => {
    const declaration = oceanRendererClass();
    const runtimeMethods = [
      'update',
      'setVortex',
      'setExclusions',
      'follow',
    ];

    for (const name of runtimeMethods) {
      expect(allocationSites(namedMethod(declaration, name)), name).toEqual([]);
    }
  });

  it('detects runtime allocation syntax without matching cached mutations', () => {
    const declaration = oceanRendererClass(`
      class OceanRenderer {
        update(): void {
          const vector = new Vector2();
          const array = [];
          const object = {};
          const copy = this.cached.clone();
          const build = () => this.cached;
          createOceanSurfaceGeometry(this.quality);
          Object.values(this.cached);
        }
        follow(): void {
          this.position.set(1, 2, 3);
          this.color.copy(this.cachedColor);
        }
      }
    `);

    expect(allocationSites(namedMethod(declaration, 'update'))).toHaveLength(7);
    expect(allocationSites(namedMethod(declaration, 'follow'))).toEqual([]);
  });

  it('keeps wave shading independent from horizon mesh density', () => {
    const ocean = new OceanRenderer('low');

    expect(ocean.material.vertexShader).toContain('geometryLod');
    expect(ocean.material.vertexShader).toContain('resolvedGeometryWave');
    expect(ocean.material.fragmentShader).toContain('sampleSurfaceWave');
    expect(ocean.material.fragmentShader).toContain(
      'sampleSurfaceWave(vOceanPosition, waveHeight, waveDerivative)',
    );
    expect(ocean.material.fragmentShader).not.toContain('vWorldNormal');

    ocean.dispose();
  });

  it('copies active and inactive vortex state into shader uniforms', () => {
    const ocean = new OceanRenderer('low');
    const active: VortexWaveState = {
      centerX: 0,
      centerZ: -7,
      radius: 8,
      depression: 1.1,
      tangentStrength: 0.8,
      phase: 0.4,
      strength: 1,
    };

    ocean.setVortex(active);
    expect(ocean.vortexStateForTest()).toEqual(active);

    active.strength = 0.25;
    expect(ocean.vortexStateForTest()!.strength).toBe(1);

    ocean.setVortex({
      centerX: Number.NaN,
      centerZ: Number.POSITIVE_INFINITY,
      radius: Number.NEGATIVE_INFINITY,
      depression: Number.NaN,
      tangentStrength: Number.POSITIVE_INFINITY,
      phase: Number.NaN,
      strength: Number.NEGATIVE_INFINITY,
    });
    expect(Object.values(ocean.vortexStateForTest()).every(Number.isFinite)).toBe(true);
    expect(ocean.vortexStateForTest()).toEqual({
      centerX: 0,
      centerZ: 0,
      radius: 0,
      depression: 0,
      tangentStrength: 0,
      phase: 0,
      strength: 0,
    });

    ocean.setVortex(createInactiveVortexWaveState());
    expect(ocean.vortexStateForTest()!.strength).toBe(0);
    ocean.dispose();
  });

  it.each([
    ['low', [150, 650, 0.86]],
    ['high', [180, 750, 0.82]],
    ['ultra', [210, 820, 0.78]],
  ] as const)(
    'concentrates %s quality vertices beside the surface join',
    (qualityName, expectedFog) => {
      const quality = OCEAN_SURFACE_QUALITY[qualityName];
      const ocean = new OceanRenderer(qualityName);
      const distances = centerlineRadialDistances(ocean);
      const innerHalfExtent = quality.surfaceExtent / 2;
      const nearCellSize = quality.surfaceExtent / quality.segments;
      const firstStep = distances[1]! - distances[0]!;
      const lastStep = distances.at(-1)! - distances.at(-2)!;

      expect(distances).toHaveLength(quality.horizonRadialSegments + 1);
      expect(distances[0]).toBeCloseTo(innerHalfExtent, 4);
      expect(distances.at(-1)).toBeCloseTo(quality.horizonHalfExtent, 4);
      expect(firstStep).toBeLessThanOrEqual(nearCellSize * 1.5);
      expect(firstStep).toBeLessThan(lastStep);
      expect(
        ocean.horizonMesh.geometry.getAttribute('position').count,
      ).toBe(expectedHorizonVertexCount(quality));
      expect(
        (ocean.material.uniforms.uHorizonFog!.value as Vector3).toArray(),
      ).toEqual(expectedFog);

      ocean.dispose();
    },
  );

  it('keeps Ultra geometry below twice High geometry', () => {
    const high = new OceanRenderer('high');
    const ultra = new OceanRenderer('ultra');

    expect(OCEAN_SURFACE_QUALITY.ultra.horizonRadialSegments).toBe(96);
    expect(triangleCount(ultra.mesh.geometry)).toBe(294_912);
    expect(triangleCount(ultra.mesh.geometry)).toBeLessThan(
      triangleCount(high.mesh.geometry) * 2,
    );
    expect(
      ultra.horizonMesh.geometry.getAttribute('position').count,
    ).toBeLessThan(
      high.horizonMesh.geometry.getAttribute('position').count * 2,
    );
    expect(ultra.mesh.children).toEqual([ultra.horizonMesh]);
    expect(ultra.horizonMesh.material).toBe(ultra.material);

    high.dispose();
    ultra.dispose();
  });

  it.each([
    ['low', {}],
    ['high', { HIGH_QUALITY_WATER: 1 }],
    ['ultra', { HIGH_QUALITY_WATER: 1, ULTRA_QUALITY_WATER: 1 }],
  ] as const)('uses the exact %s shader defines', (quality, expectedDefines) => {
    const ocean = new OceanRenderer(quality);

    expect(ocean.material.defines ?? {}).toEqual(expectedDefines);
    ocean.dispose();
  });

  it('keeps the four displacement waves identical in Ultra', () => {
    const low = new OceanRenderer('low');
    const ultra = new OceanRenderer('ultra');
    const parameters = (ocean: OceanRenderer): number[][] => (
      ocean.material.uniforms.uParameters!.value as Vector4[]
    ).map((value) => value.toArray());

    expect(parameters(ultra)).toEqual(parameters(low));
    expect(parameters(ultra)).toHaveLength(4);

    low.dispose();
    ultra.dispose();
  });

  it('contains a bounded procedural Ultra surface and light model', () => {
    const ocean = new OceanRenderer('ultra');
    const shader = ocean.material.fragmentShader;
    const microStart = shader.indexOf('vec2 ultraQualityMicroSlope');
    const microEnd = shader.indexOf('#endif', microStart);
    const microSource = shader.slice(microStart, microEnd);

    expect(microStart).toBeGreaterThan(-1);
    expect(microSource.match(/float band[A-D] =/g)).toHaveLength(4);
    expect(shader).toContain('float ultraSurfaceRoughness');
    expect(shader).toContain('float ultraSunGlint');
    expect(shader).toContain('ultraOpticalPath');
    expect(shader).toContain('ultraBroadReflection');
    expect(shader).toContain('ultraReflectionBlur');
    expect(shader).not.toContain('sampler2D');
    expect(
      Object.keys(ocean.material.uniforms)
        .filter((name) => name.startsWith('uUltra')),
    ).toEqual([]);
    expect(ocean.material.transparent).toBe(false);

    ocean.dispose();
  });

  it('keeps Ultra reflection below the dark-body preservation limit', () => {
    const ocean = new OceanRenderer('ultra');
    const shader = ocean.material.fragmentShader;
    const ultraStart = shader.indexOf(
      '#ifdef ULTRA_QUALITY_WATER',
      shader.indexOf('float reflectionStrength'),
    );
    const ultraEnd = shader.indexOf('#else', ultraStart);
    const ultraReflection = shader.slice(ultraStart, ultraEnd);

    expect(ultraReflection).toContain(
      '0.05 + fresnel * mix(0.63, 0.45, ultraRoughnessT)',
    );
    expect(ultraReflection).toContain('0.68');

    ocean.dispose();
  });

  it('uses bounded weather-aware Ultra foam instead of stacked High foam', () => {
    const ocean = new OceanRenderer('ultra');
    const shader = ocean.material.fragmentShader;
    const foamStart = shader.indexOf('vec2 ultraQualityFoam');
    const foamEnd = shader.indexOf('#endif', foamStart);
    const foamSource = shader.slice(foamStart, foamEnd);
    const coverageStart = shader.indexOf(
      '#ifdef ULTRA_QUALITY_WATER',
      shader.indexOf('float capFoam;'),
    );
    const coverageEnd = shader.indexOf('float capDistanceFade', coverageStart);
    const coverageElse = shader.indexOf('#else', coverageStart);
    const ultraCoverage = shader.slice(coverageStart, coverageElse);
    const nonUltraCoverage = shader.slice(coverageElse, coverageEnd);
    const colorStart = shader.lastIndexOf(
      '#ifdef ULTRA_QUALITY_WATER',
      shader.indexOf('vec3 ultraFoamColor'),
    );
    const colorEnd = shader.indexOf('float fogFactor', colorStart);
    const colorElse = shader.indexOf('#else', colorStart);
    const ultraColor = shader.slice(colorStart, colorElse);
    const nonUltraColor = shader.slice(colorElse, colorEnd);

    expect(foamStart).toBeGreaterThan(-1);
    expect(foamSource).toContain('calmSuppression');
    expect(foamSource).toContain('trailingEnvelope');
    expect(foamSource).not.toContain('for (');
    expect(shader).toContain('ultraFoamDistanceFade');
    expect(shader).toContain('ultraFoamColor');
    expect(shader).toContain('bodyFoam = max(bodyFoam * 0.42, ultraFoam.x)');
    expect(coverageElse).toBeGreaterThan(coverageStart);
    expect(ultraCoverage).not.toContain('highQualityFoamCoverage');
    expect(ultraCoverage).not.toContain('highQualityCrestCap');
    expect(nonUltraCoverage).toContain('highQualityFoamCoverage');
    expect(nonUltraCoverage).toContain('highQualityCrestCap');
    expect(colorStart).toBeGreaterThan(-1);
    expect(colorElse).toBeGreaterThan(colorStart);
    expect(ultraColor).not.toContain('highFoamLayer');
    expect(nonUltraColor).toContain('highFoamLayer');

    ocean.dispose();
  });

  it('keeps rejected Ultra storm streaks below the continuous-foam limit', () => {
    const ocean = new OceanRenderer('ultra');
    const shader = ocean.material.fragmentShader;
    const foamStart = shader.indexOf('vec2 ultraQualityFoam');
    const foamEnd = shader.indexOf('#endif', foamStart);
    const foamSource = shader.slice(foamStart, foamEnd);

    expect(foamSource).toContain(
      'crest * breaking * mix(0.12, 1.0, streakMask)',
    );
    expect(foamSource).not.toContain(
      'crest * breaking * mix(0.45, 1.0, streakMask)',
    );

    ocean.dispose();
  });

  it('rebuilds geometry and state across Low, Ultra, and High', () => {
    const ocean = new OceanRenderer('low');
    const mesh = ocean.mesh;
    const horizonMesh = ocean.horizonMesh;
    const lowSurface = ocean.mesh.geometry;
    const lowHorizon = ocean.horizonMesh.geometry;
    const lowSurfaceDispose = vi.spyOn(lowSurface, 'dispose');
    const lowHorizonDispose = vi.spyOn(lowHorizon, 'dispose');
    const lowMaterialVersion = ocean.material.version;
    const directions = ocean.material.uniforms.uDirections!.value;
    const parameters = ocean.material.uniforms.uParameters!.value;
    const phases = ocean.material.uniforms.uPhases!.value;

    ocean.setQuality('ultra');

    expect(ocean.mesh.geometry).not.toBe(lowSurface);
    expect(ocean.mesh).toBe(mesh);
    expect(ocean.horizonMesh).toBe(horizonMesh);
    expect(ocean.mesh.children).toEqual([horizonMesh]);
    expect(horizonMesh.parent).toBe(mesh);
    expect(mesh.frustumCulled).toBe(false);
    expect(horizonMesh.frustumCulled).toBe(false);
    expect(lowSurfaceDispose).toHaveBeenCalledOnce();
    expect(lowHorizonDispose).toHaveBeenCalledOnce();
    expect(ocean.material.version).toBe(lowMaterialVersion + 1);
    expect(ocean.material.uniforms.uDirections!.value).toBe(directions);
    expect(ocean.material.uniforms.uParameters!.value).toBe(parameters);
    expect(ocean.material.uniforms.uPhases!.value).toBe(phases);
    expect((ocean.material.uniforms.uDetailFade!.value as Vector2).toArray())
      .toEqual([52, 160]);
    expect((ocean.material.uniforms.uHorizonFog!.value as Vector3).toArray())
      .toEqual([210, 820, 0.78]);
    expect((ocean.material.uniforms.uDeepColor!.value as Color).getHex())
      .toBe(0x062932);
    expect((ocean.material.uniforms.uShallowColor!.value as Color).getHex())
      .toBe(0x2f7377);
    expect((ocean.material.uniforms.uFoamColor!.value as Color).getHex())
      .toBe(0xc6cdc4);
    expect(ocean.material.defines).toEqual({
      HIGH_QUALITY_WATER: 1,
      ULTRA_QUALITY_WATER: 1,
    });
    const ultraSurface = ocean.mesh.geometry;
    const ultraHorizon = ocean.horizonMesh.geometry;
    const ultraSurfaceDispose = vi.spyOn(ultraSurface, 'dispose');
    const ultraHorizonDispose = vi.spyOn(ultraHorizon, 'dispose');
    const ultraMaterialVersion = ocean.material.version;

    ocean.setQuality('high');

    expect(ocean.mesh.geometry).not.toBe(ultraSurface);
    expect(ultraSurfaceDispose).toHaveBeenCalledOnce();
    expect(ultraHorizonDispose).toHaveBeenCalledOnce();
    expect(ocean.material.version).toBe(ultraMaterialVersion + 1);
    expect((ocean.material.uniforms.uDetailFade!.value as Vector2).toArray())
      .toEqual([40, 128]);
    expect((ocean.material.uniforms.uDeepColor!.value as Color).getHex())
      .toBe(0x073844);
    expect(ocean.material.defines).toEqual({ HIGH_QUALITY_WATER: 1 });
    ocean.dispose();
  });

  it('keeps the material and complete uniform graph across quality changes', () => {
    const ocean = new OceanRenderer('low');
    const material = ocean.material;
    const uniformMap = material.uniforms;

    ocean.update(8, 0.75, 0.024);
    ocean.follow(26, -34);
    ocean.setVortex({
      centerX: 3,
      centerZ: -4,
      radius: 9,
      depression: 1.2,
      tangentStrength: 0.6,
      phase: 0.8,
      strength: 0.9,
    });
    const uniformObjects = Object.fromEntries(
      Object.entries(uniformMap).map(([name, uniform]) => [name, uniform]),
    );
    const uniformValues = Object.fromEntries(
      Object.entries(uniformMap).map(([name, uniform]) => [name, uniform.value]),
    );
    const nestedValues = Object.fromEntries(
      Object.entries(uniformMap).map(([name, uniform]) => [
        name,
        Array.isArray(uniform.value) ? [...uniform.value] : null,
      ]),
    );
    ocean.setQuality('ultra');

    expect(ocean.material).toBe(material);
    expect(ocean.material.uniforms).toBe(uniformMap);
    expect(ocean.mesh.material).toBe(material);
    expect(ocean.horizonMesh.material).toBe(material);
    for (const [name, uniform] of Object.entries(uniformMap)) {
      expect(uniform).toBe(uniformObjects[name]);
      expect(uniform.value).toBe(uniformValues[name]);
      if (Array.isArray(uniform.value)) {
        uniform.value.forEach((value, index) => {
          expect(value).toBe(nestedValues[name]![index]);
        });
      }
    }
    expect(ocean.vortexStateForTest()).toEqual({
      centerX: 3,
      centerZ: -4,
      radius: 9,
      depression: 1.2,
      tangentStrength: 0.6,
      phase: 0.8,
      strength: 0.9,
    });
    expect(ocean.mesh.position.toArray()).toEqual([30, 0, -30]);

    ocean.dispose();
  });

  it('owns runtime state and disposes every geometry exactly once', () => {
    const ocean = new OceanRenderer('low', [3, 0, 4]);
    const material = ocean.material;
    const uniformMap = ocean.material.uniforms;
    const mesh = ocean.mesh;
    const horizonMesh = ocean.horizonMesh;
    const rootChildren = [...mesh.children];
    const exclusions = [0, 1, 2].map((index): WaterExclusionRegion => ({
      worldToLocal: new Matrix4().makeTranslation(index + 1, index + 2, index + 3),
      bounds: new Vector4(-index - 1, index + 1, -index - 2, index + 2),
      taperStarts: new Vector2(-index - 0.5, index + 0.5),
      minimumLocalY: -index - 3,
      lowerBounds: new Vector4(-index - 0.8, index + 0.8, -index - 1.5, index + 1.5),
      lowerTaperStarts: new Vector2(-index - 0.25, index + 0.25),
      upperLocalY: index + 4,
    }));
    const exclusionSlots = [
      ...(uniformMap.uExclusionWorldToLocal!.value as Matrix4[]),
      ...(uniformMap.uExclusionBounds!.value as Vector4[]),
      ...(uniformMap.uExclusionLowerBounds!.value as Vector4[]),
      ...(uniformMap.uExclusionTaperStarts!.value as Vector2[]),
      ...(uniformMap.uExclusionLowerTaperStarts!.value as Vector2[]),
    ];
    const vortex: VortexWaveState = {
      centerX: -3,
      centerZ: 4,
      radius: -9,
      depression: -1.2,
      tangentStrength: -0.6,
      phase: -0.8,
      strength: -0.9,
    };
    const atmosphere = {
      fogColor: new Color(0x102030),
      horizonColor: new Color(0x405060),
      skyColor: new Color(0x708090),
      sunColor: new Color(0xa0b0c0),
      sunVisibility: 0.8,
    };
    const geometries: BufferGeometry[] = [];
    const geometryDispose = new Map<BufferGeometry, ReturnType<typeof vi.spyOn>>();
    const trackGeometry = (): void => {
      for (const geometry of [ocean.mesh.geometry, ocean.horizonMesh.geometry]) {
        geometries.push(geometry);
        geometryDispose.set(geometry, vi.spyOn(geometry, 'dispose'));
      }
    };
    trackGeometry();

    ocean.setVortex(vortex);
    ocean.setExclusions(exclusions);
    ocean.follow(12, -8);
    ocean.update(4, 0.8, 0.02, atmosphere);

    expect(ocean.vortexStateForTest()).toEqual(vortex);
    expect(ocean.material.uniforms.uExclusionCount!.value).toBe(2);
    expect(ocean.material.uniforms.uExclusionWorldToLocal!.value[0])
      .not.toBe(exclusions[0]!.worldToLocal);
    expect(ocean.material.uniforms.uExclusionBounds!.value[1])
      .not.toBe(exclusions[1]!.bounds);
    expect(ocean.mesh.position.toArray()).toEqual([10, 0, -10]);
    const horizonWorldPosition = new Vector3();
    ocean.horizonMesh.getWorldPosition(horizonWorldPosition);
    expect(horizonWorldPosition.toArray()).toEqual([10, 0, -10]);
    expect((uniformMap.uOrigin!.value as Vector2).toArray()).toEqual([10, -10]);

    vortex.strength = 0.25;
    exclusions[0]!.worldToLocal.identity();
    exclusions[1]!.bounds.set(0, 0, 0, 0);
    exclusions.splice(0, exclusions.length);
    atmosphere.fogColor.set(0xffffff);
    expect(ocean.vortexStateForTest().strength).toBe(-0.9);
    expect((uniformMap.uExclusionWorldToLocal!.value[0] as Matrix4).elements[12])
      .toBe(1);
    expect((uniformMap.uExclusionBounds!.value[1] as Vector4).toArray())
      .toEqual([-2, 2, -3, 3]);
    expect((uniformMap.uFogColor!.value as Color).getHex()).toBe(0x102030);

    ocean.setQuality('high');
    trackGeometry();
    ocean.setQuality('ultra');
    trackGeometry();

    expect(ocean.material).toBe(material);
    expect(ocean.material.uniforms).toBe(uniformMap);
    expect(ocean.mesh).toBe(mesh);
    expect(ocean.horizonMesh).toBe(horizonMesh);
    expect(ocean.mesh.material).toBe(material);
    expect(ocean.horizonMesh.material).toBe(material);
    expect(ocean.mesh.children).toEqual(rootChildren);
    const currentExclusionSlots = [
      ...(uniformMap.uExclusionWorldToLocal!.value as Matrix4[]),
      ...(uniformMap.uExclusionBounds!.value as Vector4[]),
      ...(uniformMap.uExclusionLowerBounds!.value as Vector4[]),
      ...(uniformMap.uExclusionTaperStarts!.value as Vector2[]),
      ...(uniformMap.uExclusionLowerTaperStarts!.value as Vector2[]),
    ];
    expect(currentExclusionSlots).toHaveLength(exclusionSlots.length);
    currentExclusionSlots.forEach((slot, index) => {
      expect(slot).toBe(exclusionSlots[index]);
    });
    expect(ocean.vortexStateForTest()).toEqual({ ...vortex, strength: -0.9 });
    expect(ocean.mesh.position.toArray()).toEqual([10, 0, -10]);
    expect((uniformMap.uOrigin!.value as Vector2).toArray()).toEqual([10, -10]);
    expect(uniformMap.uTime!.value).toBe(4);
    expect(uniformMap.uAmplitudeScale!.value).toBe(0.8);
    expect(uniformMap.uFogDensity!.value).toBe(0.02);
    expect(uniformMap.uDirectLightStrength!.value).toBe(0.8);
    const lightDirection = uniformMap.uLightDirection!.value as Vector3;
    expect(lightDirection.x).toBeCloseTo(0.6);
    expect(lightDirection.y).toBe(0);
    expect(lightDirection.z).toBeCloseTo(0.8);
    expect((uniformMap.uFogColor!.value as Color).getHex()).toBe(0x102030);
    expect((uniformMap.uHorizonColor!.value as Color).getHex()).toBe(0x405060);
    expect((uniformMap.uSkyColor!.value as Color).getHex()).toBe(0x708090);
    expect((uniformMap.uSunColor!.value as Color).getHex()).toBe(0xa0b0c0);

    const materialDispose = vi.spyOn(material, 'dispose');
    ocean.dispose();
    ocean.dispose();

    expect(geometries).toHaveLength(6);
    for (const geometry of geometries) {
      expect(geometryDispose.get(geometry)).toHaveBeenCalledOnce();
    }
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('copies atmosphere values and sanitizes sun visibility', () => {
    const ocean = new OceanRenderer('low');
    const fog = ocean.material.uniforms.uFogColor!.value as Color;
    const horizon = ocean.material.uniforms.uHorizonColor!.value as Color;
    const sky = ocean.material.uniforms.uSkyColor!.value as Color;
    const sun = ocean.material.uniforms.uSunColor!.value as Color;
    const atmosphere = {
      fogColor: new Color(0x102030),
      horizonColor: new Color(0x405060),
      skyColor: new Color(0x708090),
      sunColor: new Color(0xa0b0c0),
      sunVisibility: 2,
    };

    ocean.update(12, 0.65, 0.031, atmosphere);

    expect(ocean.material.uniforms.uTime!.value).toBe(12);
    expect(ocean.material.uniforms.uAmplitudeScale!.value).toBe(0.65);
    expect(ocean.material.uniforms.uFogDensity!.value).toBe(0.031);
    expect(fog).toEqual(atmosphere.fogColor);
    expect(horizon).toEqual(atmosphere.horizonColor);
    expect(sky).toEqual(atmosphere.skyColor);
    expect(sun).toEqual(atmosphere.sunColor);
    expect(fog).not.toBe(atmosphere.fogColor);
    expect(horizon).not.toBe(atmosphere.horizonColor);
    expect(sky).not.toBe(atmosphere.skyColor);
    expect(sun).not.toBe(atmosphere.sunColor);
    expect(ocean.material.uniforms.uDirectLightStrength!.value).toBe(1);

    for (const [visibility, expected] of [
      [-2, 0],
      [0.4, 0.4],
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [Number.NEGATIVE_INFINITY, 0],
    ] as const) {
      atmosphere.sunVisibility = visibility;
      ocean.update(12, 0.65, 0.031, atmosphere);
      expect(ocean.material.uniforms.uDirectLightStrength!.value).toBe(expected);
    }

    ocean.dispose();
  });

  it('normalizes the constructor light override after uniform creation', () => {
    const ocean = new OceanRenderer('low', [3, 0, 4]);
    const lightDirection = (
      ocean.material.uniforms.uLightDirection!.value as Vector3
    );

    expect(lightDirection.x).toBeCloseTo(0.6);
    expect(lightDirection.y).toBe(0);
    expect(lightDirection.z).toBeCloseTo(0.8);

    ocean.dispose();
  });

  it('uses exact ten-unit follow snapping', () => {
    const ocean = new OceanRenderer('low');

    ocean.follow(14.9, -15);

    expect(ocean.mesh.position.toArray()).toEqual([10, 0, -10]);
    expect(
      (ocean.material.uniforms.uOrigin!.value as Vector2).toArray(),
    ).toEqual([10, -10]);

    ocean.dispose();
  });

  it('rolls back a failed horizon replacement without changing renderer state', () => {
    const ocean = new OceanRenderer('low');
    const surface = ocean.mesh.geometry;
    const horizon = ocean.horizonMesh.geometry;
    const surfaceDispose = vi.spyOn(surface, 'dispose');
    const horizonDispose = vi.spyOn(horizon, 'dispose');
    const detailFade = (ocean.material.uniforms.uDetailFade!.value as Vector2)
      .clone();
    const horizonFog = (ocean.material.uniforms.uHorizonFog!.value as Vector3)
      .clone();
    const deepColor = (ocean.material.uniforms.uDeepColor!.value as Color).clone();
    const shallowColor = (ocean.material.uniforms.uShallowColor!.value as Color).clone();
    const foamColor = (ocean.material.uniforms.uFoamColor!.value as Color).clone();
    const defines = ocean.material.defines;
    const materialVersion = ocean.material.version;
    const failure = new Error('horizon build failed');
    const partialDispose = vi.spyOn(PlaneGeometry.prototype, 'dispose');

    vi.mocked(mergeGeometries).mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => ocean.setQuality('ultra')).toThrow(failure);
    expect(ocean.mesh.geometry).toBe(surface);
    expect(ocean.horizonMesh.geometry).toBe(horizon);
    expect(surfaceDispose).not.toHaveBeenCalled();
    expect(horizonDispose).not.toHaveBeenCalled();
    expect(partialDispose).toHaveBeenCalledTimes(9);
    expect((ocean as unknown as { quality: string }).quality).toBe('low');
    expect(ocean.material.defines).toBe(defines);
    expect(ocean.material.version).toBe(materialVersion);
    expect(ocean.material.uniforms.uDetailFade!.value).toEqual(detailFade);
    expect(ocean.material.uniforms.uHorizonFog!.value).toEqual(horizonFog);
    expect(ocean.material.uniforms.uDeepColor!.value).toEqual(deepColor);
    expect(ocean.material.uniforms.uShallowColor!.value).toEqual(shallowColor);
    expect(ocean.material.uniforms.uFoamColor!.value).toEqual(foamColor);

    partialDispose.mockRestore();
    ocean.dispose();
  });

  it('rolls back a failed surface replacement and cleans the partial surface', () => {
    const ocean = new OceanRenderer('low');
    const surface = ocean.mesh.geometry;
    const horizon = ocean.horizonMesh.geometry;
    const material = ocean.material;
    const defines = material.defines;
    const version = material.version;
    const failure = { source: 'surface build' };
    const partialDispose = vi.spyOn(PlaneGeometry.prototype, 'dispose');
    const rotate = vi.spyOn(PlaneGeometry.prototype, 'rotateX')
      .mockImplementationOnce(() => {
        throw failure;
      });
    let thrown: unknown;

    try {
      ocean.setQuality('ultra');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
    expect(partialDispose).toHaveBeenCalledOnce();
    expect(ocean.mesh.geometry).toBe(surface);
    expect(ocean.horizonMesh.geometry).toBe(horizon);
    expect(ocean.material).toBe(material);
    expect(ocean.material.defines).toBe(defines);
    expect(ocean.material.version).toBe(version);
    expect((ocean as unknown as { quality: string }).quality).toBe('low');

    rotate.mockRestore();
    partialDispose.mockRestore();
    ocean.dispose();
  });

  it('keeps new quality state when old geometry cleanup fails', () => {
    const ocean = new OceanRenderer('low');
    const material = ocean.material;
    const uniformMap = material.uniforms;
    const uniformObjects = Object.fromEntries(
      Object.entries(uniformMap).map(([name, uniform]) => [name, uniform]),
    );
    const uniformValues = Object.fromEntries(
      Object.entries(uniformMap).map(([name, uniform]) => [name, uniform.value]),
    );
    const previousSurface = ocean.mesh.geometry;
    const previousHorizon = ocean.horizonMesh.geometry;
    const firstFailure = { source: 'old surface cleanup' };
    const secondFailure = { source: 'old horizon cleanup' };
    const previousSurfaceDispose = vi.spyOn(previousSurface, 'dispose')
      .mockImplementationOnce(() => {
        expect(ocean.mesh.geometry).not.toBe(previousSurface);
        expect(ocean.horizonMesh.geometry).not.toBe(previousHorizon);
        throw firstFailure;
      });
    const previousHorizonDispose = vi.spyOn(previousHorizon, 'dispose')
      .mockImplementationOnce(() => {
        throw secondFailure;
      });
    let thrown: unknown;

    try {
      ocean.setQuality('ultra');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(firstFailure);
    expect(previousSurfaceDispose).toHaveBeenCalledOnce();
    expect(previousHorizonDispose).toHaveBeenCalledOnce();
    expect(ocean.mesh.geometry).not.toBe(previousSurface);
    expect(ocean.horizonMesh.geometry).not.toBe(previousHorizon);
    expect((ocean as unknown as { quality: string }).quality).toBe('ultra');
    expect(ocean.material).toBe(material);
    expect(ocean.material.uniforms).toBe(uniformMap);
    expect(ocean.mesh.material).toBe(material);
    expect(ocean.horizonMesh.material).toBe(material);
    expect(ocean.material.defines).toEqual({
      HIGH_QUALITY_WATER: 1,
      ULTRA_QUALITY_WATER: 1,
    });
    expect((uniformMap.uDetailFade!.value as Vector2).toArray())
      .toEqual([52, 160]);
    expect((uniformMap.uHorizonFog!.value as Vector3).toArray())
      .toEqual([210, 820, 0.78]);
    expect((uniformMap.uDeepColor!.value as Color).getHex()).toBe(0x062932);
    expect((uniformMap.uShallowColor!.value as Color).getHex()).toBe(0x2f7377);
    expect((uniformMap.uFoamColor!.value as Color).getHex()).toBe(0xc6cdc4);
    for (const [name, uniform] of Object.entries(uniformMap)) {
      expect(uniform).toBe(uniformObjects[name]);
      expect(uniform.value).toBe(uniformValues[name]);
    }

    const nextSurfaceDispose = vi.spyOn(ocean.mesh.geometry, 'dispose');
    const nextHorizonDispose = vi.spyOn(ocean.horizonMesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(ocean.material, 'dispose');
    expect(() => ocean.dispose()).not.toThrow();
    expect(() => ocean.dispose()).not.toThrow();
    expect(nextSurfaceDispose).toHaveBeenCalledOnce();
    expect(nextHorizonDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(previousSurfaceDispose).toHaveBeenCalledOnce();
    expect(previousHorizonDispose).toHaveBeenCalledOnce();
  });

  it('cleans all partial construction resources and keeps the primary error', () => {
    const primaryError = new Error('horizon merge failed');
    const cleanupError = new Error('panel cleanup failed');
    const planeDispose = vi.spyOn(PlaneGeometry.prototype, 'dispose')
      .mockImplementationOnce(() => {
        throw cleanupError;
      });
    const materialDispose = vi.spyOn(ShaderMaterial.prototype, 'dispose');
    vi.mocked(mergeGeometries).mockImplementationOnce(() => {
      throw primaryError;
    });
    let thrown: unknown;

    try {
      new OceanRenderer('low');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(primaryError);
    expect(planeDispose).toHaveBeenCalledTimes(9);
    expect(materialDispose).toHaveBeenCalledOnce();
    planeDispose.mockRestore();
    materialDispose.mockRestore();
  });

  it('cleans the material and partial surface after surface construction fails', () => {
    const primaryError = { source: 'surface construction' };
    const cleanupError = new Error('surface cleanup failed');
    const planeDispose = vi.spyOn(PlaneGeometry.prototype, 'dispose')
      .mockImplementationOnce(() => {
        throw cleanupError;
      });
    const materialDispose = vi.spyOn(ShaderMaterial.prototype, 'dispose');
    const rotate = vi.spyOn(PlaneGeometry.prototype, 'rotateX')
      .mockImplementationOnce(() => {
        throw primaryError;
      });
    let thrown: unknown;

    try {
      new OceanRenderer('low');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(primaryError);
    expect(planeDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    rotate.mockRestore();
    planeDispose.mockRestore();
    materialDispose.mockRestore();
  });

  it('continues disposal and rethrows the first value once', () => {
    const ocean = new OceanRenderer('low');
    const firstFailure = { source: 'surface' };
    const surfaceDispose = vi.spyOn(ocean.mesh.geometry, 'dispose')
      .mockImplementationOnce(() => {
        throw firstFailure;
      });
    const horizonDispose = vi.spyOn(ocean.horizonMesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(ocean.material, 'dispose');
    let thrown: unknown;

    try {
      ocean.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(firstFailure);
    expect(surfaceDispose).toHaveBeenCalledOnce();
    expect(horizonDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(() => ocean.dispose()).not.toThrow();
    expect(surfaceDispose).toHaveBeenCalledOnce();
    expect(horizonDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('disposes safely after a quality change', () => {
    const ocean = new OceanRenderer('low');

    ocean.setQuality('ultra');
    expect(() => ocean.dispose()).not.toThrow();
    expect(() => ocean.dispose()).not.toThrow();
  });
});
