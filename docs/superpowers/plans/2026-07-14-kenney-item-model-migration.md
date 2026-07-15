# Kenney Item Model Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all nine Poly Pizza item models with reproducible CC0 Kenney assets and make Kenney the repository's required third-party asset store.

**Architecture:** A Node builder will package direct Kenney GLBs and assemble four composite props from transformed Kenney meshes. A PowerShell fetcher will download four pinned archives, verify SHA-256 values, extract approved entries, build into a guarded staging directory, audit the result, and publish through the existing atomic swap helper. The runtime keeps the current item IDs, filenames, loader, and gameplay contracts.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Three.js 0.180, glTF Transform 4.4, Node ESM, PowerShell, Vite 7.1.

## Global Constraints

- Use Kenney as the sole third-party game-asset store unless the user approves another source.
- Keep these runtime IDs and filenames: `flareGun`, `ductTape`, `fishingRod`, `baitTin`, `medicalKit`, `waterJug`, `cannedFood`, `flashlight`, and `scubaSet`.
- Pin Blaster Kit 2.1 SHA-256 `91E3093E95427D59625E7E2CE2D0399B861600160FD0B4ADA7714796B67CEA8C`.
- Pin Food Kit 2.0 SHA-256 `CDAD90853682499B94C9FDA2F87678B24BFD8F3264E0ED323F6B6A27FD7C6F6F`.
- Pin Survival Kit 2.0 SHA-256 `C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E`.
- Pin Prototype Kit 1.0 SHA-256 `213B522FB12BCC9B9AC66C4F7581F7C74623293272212E40A70C39936AD3DA95`.
- Commit self-contained GLBs. Production code must not request remote models or textures.
- Clone and transform Kenney meshes for composites. Do not generate replacement mesh geometry or draw textures.
- Limit each item to 3,000 triangles and the complete library to 28,000 triangles.
- Preserve unrelated working-tree changes. `README.md` already contains a user-owned Space-control edit.

---

### Task 1: Define and Test the Kenney Model Builder

**Files:**
- Create: `scripts/kenney-item-models.mjs`
- Create: `scripts/kenney-item-models.d.mts`
- Create: `tests/KenneyItemModels.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:**
- Produces: `KENNEY_PACKS`, a frozen pack descriptor map.
- Produces: `KENNEY_ITEM_RECIPES`, a frozen nine-item recipe map.
- Produces: `buildKenneyItemModels({ sourceRoot, outputRoot, recipes? }): Promise<void>`.
- Produces CLI: `node scripts/kenney-item-models.mjs --packs` and `node scripts/kenney-item-models.mjs <sourceRoot> <outputRoot>`.

- [ ] **Step 1: Write the failing catalog test**

Create `tests/KenneyItemModels.test.ts` with an exact pack and recipe contract:

```ts
import { describe, expect, it } from 'vitest';
import {
  KENNEY_ITEM_RECIPES,
  KENNEY_PACKS,
} from '../scripts/kenney-item-models.mjs';

const expectedTriangles = {
  flareGun: 410,
  ductTape: 192,
  fishingRod: 376,
  baitTin: 154,
  medicalKit: 228,
  waterJug: 96,
  cannedFood: 156,
  flashlight: 340,
  scubaSet: 688,
} as const;

describe('Kenney item model catalog', () => {
  it('pins four official CC0 packs and nine deterministic recipes', () => {
    expect(Object.keys(KENNEY_PACKS).sort()).toEqual([
      'blaster-kit', 'food-kit', 'prototype-kit', 'survival-kit',
    ]);
    expect(Object.keys(KENNEY_ITEM_RECIPES).sort()).toEqual(
      Object.keys(expectedTriangles).sort(),
    );
    expect(KENNEY_PACKS['blaster-kit'].sha256).toBe(
      '91E3093E95427D59625E7E2CE2D0399B861600160FD0B4ADA7714796B67CEA8C',
    );
    expect(KENNEY_PACKS['food-kit'].sha256).toBe(
      'CDAD90853682499B94C9FDA2F87678B24BFD8F3264E0ED323F6B6A27FD7C6F6F',
    );
    expect(KENNEY_PACKS['survival-kit'].sha256).toBe(
      'C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E',
    );
    expect(KENNEY_PACKS['prototype-kit'].sha256).toBe(
      '213B522FB12BCC9B9AC66C4F7581F7C74623293272212E40A70C39936AD3DA95',
    );
    for (const [id, recipe] of Object.entries(KENNEY_ITEM_RECIPES)) {
      expect(recipe.expectedTriangles).toBe(
        expectedTriangles[id as keyof typeof expectedTriangles],
      );
    }
    expect(Object.values(expectedTriangles).reduce((sum, value) => sum + value, 0)).toBe(2_640);
  });
});
```

- [ ] **Step 2: Run the catalog test and confirm RED**

Run: `bun run test tests/KenneyItemModels.test.ts`

Expected: FAIL because `scripts/kenney-item-models.mjs` does not exist.

- [ ] **Step 3: Add the pinned descriptors and recipes**

Run `bun add -d @gltf-transform/functions@^4.4.1` so the builder declares its direct dependency instead of relying on the CLI's transitive installation.

Create the module with these descriptor fields and recipes. Use `QX90` for reel rotation and the listed transforms without changing triangle topology:

```js
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, copyToDocument, dedup, prune, unpartition } from '@gltf-transform/functions';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const QX90 = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

export const KENNEY_PACKS = Object.freeze({
  'blaster-kit': {
    version: '2.1',
    pageUrl: 'https://kenney.nl/assets/blaster-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/blaster-kit/261d80a716-1753959510/kenney_blaster-kit_2.1.zip',
    sha256: '91E3093E95427D59625E7E2CE2D0399B861600160FD0B4ADA7714796B67CEA8C',
    licenseUrl: CC0,
    requiredEntries: ['License.txt', 'Models/GLB format/Textures/colormap.png', 'Models/GLB format/blaster-n.glb'],
  },
  'food-kit': {
    version: '2.0',
    pageUrl: 'https://kenney.nl/assets/food-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip',
    sha256: 'CDAD90853682499B94C9FDA2F87678B24BFD8F3264E0ED323F6B6A27FD7C6F6F',
    licenseUrl: CC0,
    requiredEntries: ['License.txt', 'Models/GLB format/Textures/colormap.png', 'Models/GLB format/can-small.glb', 'Models/GLB format/can.glb'],
  },
  'survival-kit': {
    version: '2.0',
    pageUrl: 'https://kenney.nl/assets/survival-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/survival-kit/4065a8185b-1712149243/kenney_survival-kit.zip',
    sha256: 'C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E',
    licenseUrl: CC0,
    requiredEntries: ['License.txt', 'Models/GLB format/Textures/colormap.png', 'Models/GLB format/bottle-large.glb'],
  },
  'prototype-kit': {
    version: '1.0',
    pageUrl: 'https://kenney.nl/assets/prototype-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/prototype-kit/4d3b7073ed-1724832076/kenney_prototype-kit.zip',
    sha256: '213B522FB12BCC9B9AC66C4F7581F7C74623293272212E40A70C39936AD3DA95',
    licenseUrl: CC0,
    requiredEntries: [
      'License.txt',
      'Models/GLB format/Textures/colormap.png',
      'Models/GLB format/shape-cylinder-detailed.glb',
      'Models/GLB format/shape-cylinder.glb',
      'Models/GLB format/shape-hollow-cylinder-detailed.glb',
      'Models/GLB format/shape-hollow-cylinder-half-detailed.glb',
      'Models/GLB format/shape-cube-rounded.glb',
      'Models/GLB format/shape-cube-half.glb',
    ],
  },
});

const direct = (pack, entry, expectedTriangles, scale = [1, 1, 1]) => ({
  kind: 'direct', pack, entry, expectedTriangles, scale,
});
const part = (name, entry, translation, scale, color, rotation = [0, 0, 0, 1]) => ({
  name, pack: 'prototype-kit', entry, translation, scale, color, rotation,
});

export const KENNEY_ITEM_RECIPES = Object.freeze({
  flareGun: direct('blaster-kit', 'Models/GLB format/blaster-n.glb', 410),
  ductTape: direct('prototype-kit', 'Models/GLB format/shape-hollow-cylinder-detailed.glb', 192, [1, 0.35, 1]),
  fishingRod: {
    kind: 'composite', expectedTriangles: 376, parts: [
      part('rod', 'Models/GLB format/shape-cylinder-detailed.glb', [0, 0, 0], [0.018, 1.6, 0.018], [0.95, 0.25, 0.08, 1]),
      part('grip', 'Models/GLB format/shape-cylinder-detailed.glb', [0, -0.35, 0], [0.04, 0.35, 0.04], [0.12, 0.12, 0.14, 1]),
      part('reel', 'Models/GLB format/shape-hollow-cylinder-detailed.glb', [0.05, -0.14, 0], [0.08, 0.05, 0.08], [0.2, 0.24, 0.3, 1], QX90),
    ],
  },
  baitTin: direct('food-kit', 'Models/GLB format/can-small.glb', 154),
  medicalKit: {
    kind: 'composite', expectedTriangles: 228, parts: [
      part('case', 'Models/GLB format/shape-cube-rounded.glb', [0, 0, 0], [1, 0.7, 0.3], [0.85, 0.08, 0.06, 1]),
      part('cross-vertical', 'Models/GLB format/shape-cube-half.glb', [0, 0.15, 0.17], [0.12, 0.8, 0.04], [1, 1, 1, 1]),
      part('cross-horizontal', 'Models/GLB format/shape-cube-half.glb', [0, 0.29, 0.17], [0.4, 0.24, 0.04], [1, 1, 1, 1]),
    ],
  },
  waterJug: direct('survival-kit', 'Models/GLB format/bottle-large.glb', 96),
  cannedFood: direct('food-kit', 'Models/GLB format/can.glb', 156),
  flashlight: {
    kind: 'composite', expectedTriangles: 340, parts: [
      part('body', 'Models/GLB format/shape-cylinder-detailed.glb', [0, 0, 0], [0.18, 0.9, 0.18], [0.12, 0.16, 0.18, 1]),
      part('head', 'Models/GLB format/shape-cylinder.glb', [0, 0.9, 0], [0.28, 0.25, 0.28], [0.95, 0.32, 0.08, 1]),
      part('lens-ring', 'Models/GLB format/shape-hollow-cylinder-detailed.glb', [0, 1.15, 0], [0.3, 0.1, 0.3], [0.9, 0.95, 1, 1]),
      part('switch', 'Models/GLB format/shape-cube-half.glb', [0, 0.65, 0.17], [0.08, 0.12, 0.06], [0.95, 0.32, 0.08, 1]),
    ],
  },
  scubaSet: {
    kind: 'composite', expectedTriangles: 688, parts: [
      part('tank-left', 'Models/GLB format/shape-cylinder-detailed.glb', [-0.18, 0, 0], [0.24, 1, 0.24], [0.95, 0.35, 0.08, 1]),
      part('tank-right', 'Models/GLB format/shape-cylinder-detailed.glb', [0.18, 0, 0], [0.24, 1, 0.24], [0.95, 0.35, 0.08, 1]),
      part('harness', 'Models/GLB format/shape-cube-rounded.glb', [0, 0.12, 0.15], [0.5, 0.72, 0.16], [0.08, 0.12, 0.16, 1]),
      part('loop-left', 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', [-0.22, 0.58, 0.13], [0.18, 0.52, 0.16], [0.08, 0.12, 0.16, 1]),
      part('loop-right', 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', [0.22, 0.58, 0.13], [0.18, 0.52, 0.16], [0.08, 0.12, 0.16, 1]),
      part('regulator', 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', [0, 1.05, 0.18], [0.14, 0.12, 0.14], [0.12, 0.18, 0.22, 1]),
    ],
  },
});
```

- [ ] **Step 4: Add fixture tests for direct packaging and composite assembly**

Extend `tests/KenneyItemModels.test.ts` with temporary source documents built through `Document`, one embedded 1x1 PNG texture, and one triangle mesh. Add imports for `mkdir` from `node:fs/promises`, `dirname` from `node:path`, `Document` and `NodeIO` from `@gltf-transform/core`, and `buildKenneyItemModels` from the builder module. Test a custom direct recipe with `expectedTriangles: 1` and a custom two-part composite recipe with `expectedTriangles: 2`. Assert that the builder writes only the requested GLBs, preserves the texture inside the GLB, creates two composite nodes, applies each node transform, and throws an item-specific error for a missing source entry.

Use this test shape and assertions:

```ts
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XxL7WQAAAABJRU5ErkJggg==',
  'base64',
);

async function writeFixture(path: string, name: string): Promise<void> {
  const io = new NodeIO();
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor('position', buffer)
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const texture = document.createTexture('colormap')
    .setImage(PNG_1X1)
    .setMimeType('image/png');
  const material = document.createMaterial('material').setBaseColorTexture(texture);
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setMaterial(material);
  const mesh = document.createMesh(name).addPrimitive(primitive);
  document.createScene(name).addChild(document.createNode(name).setMesh(mesh));
  await mkdir(dirname(path), { recursive: true });
  await io.write(path, document);
}
```

Add `scripts/kenney-item-models.d.mts` so `npx tsc --noEmit` checks test imports from the `.mjs` module:

```ts
export interface KenneyPack {
  readonly version: string;
  readonly pageUrl: string;
  readonly archiveUrl: string;
  readonly sha256: string;
  readonly licenseUrl: string;
  readonly requiredEntries: readonly string[];
}

export interface DirectRecipe {
  readonly kind: 'direct';
  readonly pack: string;
  readonly entry: string;
  readonly expectedTriangles: number;
  readonly scale: readonly [number, number, number];
}

export interface CompositePart {
  readonly name: string;
  readonly pack: string;
  readonly entry: string;
  readonly translation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: readonly [number, number, number, number];
  readonly rotation: readonly [number, number, number, number];
}

export interface CompositeRecipe {
  readonly kind: 'composite';
  readonly expectedTriangles: number;
  readonly parts: readonly CompositePart[];
}

export type KenneyItemRecipe = DirectRecipe | CompositeRecipe;

export interface BuildOptions {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly recipes?: Readonly<Record<string, KenneyItemRecipe>>;
}

export const KENNEY_PACKS: Readonly<Record<string, KenneyPack>>;
export const KENNEY_ITEM_RECIPES: Readonly<Record<string, KenneyItemRecipe>>;
export function buildKenneyItemModels(options: BuildOptions): Promise<void>;
```

- [ ] **Step 5: Run the builder test and confirm RED**

Run: `bun run test tests/KenneyItemModels.test.ts`

Expected: FAIL because `buildKenneyItemModels` and its CLI do not exist.

- [ ] **Step 6: Implement direct and composite builds**

Complete `scripts/kenney-item-models.mjs` with these behaviors:

```js
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sourcePath(sourceRoot, pack, entry) {
  return join(sourceRoot, pack, ...entry.split('/'));
}

function tintMesh(mesh, color, name) {
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial();
    if (!material) continue;
    primitive.setMaterial(
      material.clone().setName(`${name}-material`).setBaseColorFactor(color),
    );
  }
}

async function buildDirect(sourceRoot, itemId, recipe) {
  const document = cloneDocument(await io.read(sourcePath(sourceRoot, recipe.pack, recipe.entry)));
  const scene = document.getRoot().listScenes()[0];
  if (!scene) throw new Error(`${itemId}: source scene is missing`);
  scene.setName(itemId);
  for (const node of scene.listChildren()) {
    node.setName(`${itemId}:${node.getName() || 'source'}`);
    node.setScale(node.getScale().map((value, axis) => value * recipe.scale[axis]));
  }
  await document.transform(prune(), dedup(), unpartition());
  return document;
}

async function buildComposite(sourceRoot, itemId, recipe) {
  const document = new Document();
  document.createBuffer('buffer');
  const scene = document.createScene(itemId);
  const sources = new Map();
  for (const spec of recipe.parts) {
    const key = `${spec.pack}:${spec.entry}`;
    if (!sources.has(key)) {
      sources.set(key, await io.read(sourcePath(sourceRoot, spec.pack, spec.entry)));
    }
    const source = sources.get(key);
    for (const sourceExtension of source.getRoot().listExtensionsUsed()) {
      const targetExtension = document.createExtension(sourceExtension.constructor);
      if (sourceExtension.isRequired()) targetExtension.setRequired(true);
    }
    const sourceMesh = source.getRoot().listMeshes()[0];
    if (!sourceMesh) throw new Error(`${itemId}: ${spec.entry} contains no mesh`);
    const map = copyToDocument(document, source, [sourceMesh]);
    const mesh = map.get(sourceMesh);
    if (!mesh) throw new Error(`${itemId}: failed to copy ${spec.entry}`);
    tintMesh(mesh, spec.color, spec.name);
    scene.addChild(document.createNode(`${itemId}:${spec.name}`)
      .setMesh(mesh)
      .setTranslation(spec.translation)
      .setRotation(spec.rotation)
      .setScale(spec.scale));
  }
  await document.transform(prune(), dedup(), unpartition());
  return document;
}

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getIndices()?.getCount()
        ?? primitive.getAttribute('POSITION')?.getCount()
        ?? 0;
      total += count / 3;
    }
  }
  return total;
}

export async function buildKenneyItemModels({ sourceRoot, outputRoot, recipes = KENNEY_ITEM_RECIPES }) {
  await mkdir(outputRoot, { recursive: true });
  for (const [itemId, recipe] of Object.entries(recipes)) {
    let document;
    try {
      document = recipe.kind === 'direct'
        ? await buildDirect(sourceRoot, itemId, recipe)
        : await buildComposite(sourceRoot, itemId, recipe);
    } catch (error) {
      throw new Error(`${itemId}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const triangles = countTriangles(document);
    if (triangles !== recipe.expectedTriangles) {
      throw new Error(`${itemId}: expected ${recipe.expectedTriangles} triangles, received ${triangles}`);
    }
    await io.write(join(outputRoot, `${itemId}.glb`), document);
  }
}
```

Add CLI handling that prints `JSON.stringify(KENNEY_PACKS)` for `--packs`, validates two positional paths for a build, and calls `buildKenneyItemModels` only when `process.argv[1]` resolves to `fileURLToPath(import.meta.url)`.

- [ ] **Step 7: Run the builder test and confirm GREEN**

Run: `bun run test tests/KenneyItemModels.test.ts`

Expected: PASS with the catalog, direct packaging, composite assembly, embedded texture, and missing-source cases green.

- [ ] **Step 8: Commit the builder**

```bash
git add scripts/kenney-item-models.mjs scripts/kenney-item-models.d.mts tests/KenneyItemModels.test.ts package.json bun.lock
git commit -m "feat: add deterministic Kenney item builder"
```

### Task 2: Pin Downloads and Preserve Atomic Publication

**Files:**
- Create: `scripts/kenney-item-sources.ps1`
- Create: `tests/KenneyItemSources.test.ts`
- Modify: `scripts/fetch-item-models.ps1`
- Test: `tests/itemModelPublication.test.ts`

**Interfaces:**
- Produces: `Assert-FileSha256 -Path <path> -Expected <hex>`.
- Produces: `Expand-ApprovedArchiveEntries -ArchivePath <zip> -DestinationRoot <dir> -Entries <string[]>`.
- Consumes: `node scripts/kenney-item-models.mjs --packs`.
- Consumes: `node scripts/kenney-item-models.mjs <sourceRoot> <stagedRoot>`.

- [ ] **Step 1: Write failing archive-validation tests**

Create `tests/KenneyItemSources.test.ts`. Build a temporary ZIP with `License.txt`, `Models/GLB format/model.glb`, and `Models/GLB format/Textures/colormap.png`. Spawn PowerShell to dot-source `scripts/kenney-item-sources.ps1`. Cover a matching SHA-256, a mismatched hash, approved extraction, a missing entry, and `../escape.glb` rejection. Require nonzero status and a specific error string for each rejected case.

- [ ] **Step 2: Run the source-helper test and confirm RED**

Run: `bun run test tests/KenneyItemSources.test.ts`

Expected: FAIL because `scripts/kenney-item-sources.ps1` does not exist.

- [ ] **Step 3: Implement hash and extraction guards**

Create `scripts/kenney-item-sources.ps1`:

```powershell
function Assert-FileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Expected
  )
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if (-not $actual.Equals($Expected, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Archive SHA-256 mismatch for $Path`: expected $Expected, received $actual"
  }
}

function Expand-ApprovedArchiveEntries {
  param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][string]$DestinationRoot,
    [Parameter(Mandatory = $true)][string[]]$Entries
  )
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $root = [System.IO.Path]::GetFullPath($DestinationRoot).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    foreach ($entryName in $Entries) {
      if ([System.IO.Path]::IsPathRooted($entryName) -or $entryName -match '(^|[\\/])\.\.([\\/]|$)') {
        throw "Unsafe archive entry: $entryName"
      }
      $entry = $archive.GetEntry($entryName)
      if ($null -eq $entry) { throw "Missing archive entry: $entryName" }
      $target = [System.IO.Path]::GetFullPath((Join-Path $root $entryName))
      if (-not $target.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe archive target: $target"
      }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
  } finally {
    $archive.Dispose()
  }
}
```

- [ ] **Step 4: Run the source-helper test and confirm GREEN**

Run: `bun run test tests/KenneyItemSources.test.ts`

Expected: PASS.

- [ ] **Step 5: Rewrite the fetch script around pinned packs**

Replace Poly Pizza metadata scraping in `scripts/fetch-item-models.ps1` with this sequence:

1. Dot-source `item-model-publication.ps1` and `kenney-item-sources.ps1`.
2. Parse `node scripts/kenney-item-models.mjs --packs` with `ConvertFrom-Json`.
3. Download each `archiveUrl` once into the guarded operating-system temporary root.
4. Call `Assert-FileSha256` for each pack.
5. Pass each descriptor's `requiredEntries` to `Expand-ApprovedArchiveEntries`, extracting only those files into `<tempRoot>/sources/<pack-slug>/`.
6. Call `node scripts/kenney-item-models.mjs <sourceRoot> <stagedRoot>`.
7. Require exactly nine expected GLBs in staging.
8. Run `node scripts/check-item-models.mjs --assets-only --models-dir <stagedRoot>`.
9. Publish with `Publish-ItemModelDirectory` and retain the existing guarded cleanup.

Remove the `bunx` alias, Poly Pizza page requests, ResourceID checks, direct `static.poly.pizza` requests, and scuba simplification branch.

- [ ] **Step 6: Prove the active fetch script has no Poly Pizza path**

Extend `tests/KenneyItemSources.test.ts` to read `scripts/fetch-item-models.ps1` and assert:

```ts
expect(source).toContain('kenney-item-models.mjs --packs');
expect(source).toContain('Assert-FileSha256');
expect(source).toContain('Expand-ApprovedArchiveEntries');
expect(source).not.toMatch(/poly\.pizza|static\.poly|ResourceID/i);
```

Run: `bun run test tests/KenneyItemSources.test.ts tests/itemModelPublication.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the fetch pipeline**

```bash
git add scripts/kenney-item-sources.ps1 scripts/fetch-item-models.ps1 tests/KenneyItemSources.test.ts
git commit -m "feat: fetch pinned Kenney asset packs"
```

### Task 3: Replace the Nine Binaries and Provenance Contracts

**Files:**
- Replace: `src/assets/models/items/*.glb`
- Modify: `src/world/itemModelManifest.ts`
- Modify: `src/world/PropModelLibrary.ts`
- Modify: `scripts/check-item-models.mjs`
- Modify: `THIRD_PARTY_ASSETS.md`
- Modify: `tests/itemModelManifest.test.ts`
- Modify: `tests/itemModelAudit.test.ts`
- Modify: `tests/PropModelLibrary.test.ts`
- Modify: `tests/helpers/productionPropModels.ts`
- Test: `tests/ShipItemPlacement.test.ts`

**Interfaces:**
- Renames: `ItemModelSpec.resourceId` to `ItemModelSpec.sourceAssetId`.
- Preserves: stable local GLB URLs and `ItemId` keys.
- Preserves: `ITEM_MODEL_MAX_TOTAL_TRIANGLES = 28_000`.

- [ ] **Step 1: Write failing Kenney provenance assertions**

Replace the Poly Pizza ID tables in `tests/itemModelManifest.test.ts` with:

```ts
const EXPECTED_SOURCES: Readonly<Record<ItemId, readonly [string, string]>> = {
  flareGun: ['https://kenney.nl/assets/blaster-kit', 'blaster-kit@2.1:Models/GLB format/blaster-n.glb'],
  ductTape: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb'],
  fishingRod: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/fishingRod'],
  baitTin: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can-small.glb'],
  medicalKit: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/medicalKit'],
  waterJug: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:Models/GLB format/bottle-large.glb'],
  cannedFood: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can.glb'],
  flashlight: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/flashlight'],
  scubaSet: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/scubaSet'],
};
```

Assert `maxTriangles === 3_000`, `creator === 'Kenney'`, the CC0 URL, exact `sourceUrl`, exact `sourceAssetId`, one matching ten-cell ledger row, and no `poly.pizza` string in the manifest or ledger.

Rename the source-ID swap test in `tests/PropModelLibrary.test.ts` and replace `.resourceId` references with `.sourceAssetId`.

- [ ] **Step 2: Tighten the audit test before replacing binaries**

In `scripts/check-item-models.mjs`, plan for one `MODEL_LIMIT = 3_000`; delete `DUCT_TAPE_LIMIT`. In `tests/itemModelAudit.test.ts`, change the expected aggregate to:

```ts
expect(result.stdout).toContain('total: 2640 / 28000 triangles');
```

Run: `bun run test tests/itemModelManifest.test.ts tests/itemModelAudit.test.ts tests/PropModelLibrary.test.ts`

Expected: FAIL on old source URLs, old field names, duct tape's 20,332 triangles, and the old aggregate.

- [ ] **Step 3: Build and publish the real Kenney assets**

Run: `bun run models:fetch`

Expected asset audit:

```text
flareGun: 410 triangles
ductTape: 192 triangles
fishingRod: 376 triangles
baitTin: 154 triangles
medicalKit: 228 triangles
waterJug: 96 triangles
cannedFood: 156 triangles
flashlight: 340 triangles
scubaSet: 688 triangles
total: 2640 / 28000 triangles
```

- [ ] **Step 4: Update manifest presentation data**

Use these target sizes, rotations, offsets, and normalized sizes. Wrap each recorded bound with the existing `BOUNDS_EPSILON` helper.

| Item | Target | Rotation | Offset | Normalized size | Normalized min | Normalized max |
|---|---:|---|---|---|---|---|
| flareGun | 0.72 | `[0, Math.PI / 2, 0]` | `[0, 0.07, 0]` | `[0.72, 0.371191998, 0.191220115]` | `[-0.36, -0.115595999, -0.095610057]` | `[0.36, 0.255595999, 0.095610057]` |
| ductTape | 0.55 | `[Math.PI / 2, 0, 0]` | `[0, 0, 0]` | `[0.55, 0.55, 0.1925]` | `[-0.275, -0.275, -0.09625]` | `[0.275, 0.275, 0.09625]` |
| fishingRod | 1.80 | `[Math.PI / 2, 0, 0]` | `[0, 0, 0]` | `[0.12, 0.083076923, 1.8]` | `[-0.06, -0.041538462, -0.9]` | `[0.06, 0.041538462, 0.9]` |
| baitTin | 0.48 | `[0, 0, 0]` | `[0, 0.12, 0]` | `[0.48, 0.257795606, 0.48]` | `[-0.24, -0.008897803, -0.24]` | `[0.24, 0.248897803, 0.24]` |
| medicalKit | 0.72 | `[0, 0, 0]` | `[0, 0.07, 0]` | `[0.72, 0.504, 0.2448]` | `[-0.36, -0.182, -0.1224]` | `[0.36, 0.322, 0.1224]` |
| waterJug | 0.78 | `[0, 0, 0]` | `[0, 0.22, 0]` | `[0.392781501, 0.78, 0.453544982]` | `[-0.196390751, -0.17, -0.226772491]` | `[0.196390751, 0.61, 0.226772491]` |
| cannedFood | 0.42 | `[0, 0, 0]` | `[0, 0.04, 0]` | `[0.393750024, 0.42, 0.393750024]` | `[-0.196875012, -0.17, -0.196875012]` | `[0.196875012, 0.25, 0.196875012]` |
| flashlight | 0.72 | `[0, 0, 0]` | `[0, 0.19, 0]` | `[0.1728, 0.72, 0.2016]` | `[-0.0864, -0.17, -0.1008]` | `[0.0864, 0.55, 0.1008]` |
| scubaSet | 0.88 | `[0, 0, 0]` | `[0, 0.25, 0]` | `[0.451282051, 0.88, 0.278290598]` | `[-0.225641026, -0.19, -0.139145299]` | `[0.225641026, 0.69, 0.139145299]` |

Update `tests/helpers/productionPropModels.ts` with the same minima and maxima. If floating-point export changes a final decimal, use the GLTFLoader-measured value and keep the manifest bound conservative by at least `1e-9`.

- [ ] **Step 5: Update runtime and ledger validation**

Rename `resourceId` to `sourceAssetId` in `ItemModelSpec`, all nine entries, `PropModelLibrary.validateLedgerEntry`, and tests. Set each creator to `Kenney`, each license to CC0, and each source URL and source identity to the exact table from Step 1.

Rewrite `THIRD_PARTY_ASSETS.md` with a ten-column Kenney ledger. Record the four pack hashes above. For each composite row, list every source entry, the transforms from Task 1, material-factor adjustments, the source triangle sum, the committed triangle count, and download date `2026-07-14`.

Replace `LEDGER_REQUIREMENTS` in `scripts/check-item-models.mjs` with the exact Kenney page URLs, source identities, `Kenney`, and the CC0 URL. Delete the duct-tape exception.

- [ ] **Step 6: Run focused binary, provenance, and placement tests**

Run:

```bash
bun run models:check
bun run test tests/KenneyItemModels.test.ts tests/KenneyItemSources.test.ts tests/itemModelManifest.test.ts tests/itemModelAudit.test.ts tests/PropModelLibrary.test.ts tests/ShipItemPlacement.test.ts
```

Expected: PASS. The audit prints `total: 2640 / 28000 triangles`; placement finds a regular anchor for each instance and confirms all conservative bounds.

- [ ] **Step 7: Commit the binaries and contracts**

```bash
git add src/assets/models/items src/world/itemModelManifest.ts src/world/PropModelLibrary.ts scripts/check-item-models.mjs THIRD_PARTY_ASSETS.md tests/itemModelManifest.test.ts tests/itemModelAudit.test.ts tests/PropModelLibrary.test.ts tests/helpers/productionPropModels.ts
git commit -m "feat: migrate item models to Kenney"
```

### Task 4: Make Kenney the Documented Default Store

**Files:**
- Create: `AGENTS.md`
- Create: `tests/AssetPolicy.test.ts`
- Modify: `README.md`

**Interfaces:**
- Documents: Kenney-only third-party asset policy.
- Preserves: the existing `Space | Jump` README control row.

- [ ] **Step 1: Write the failing documentation-policy test**

Create `tests/AssetPolicy.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the policy test and confirm RED**

Run: `bun run test tests/AssetPolicy.test.ts`

Expected: FAIL because `AGENTS.md` does not exist and README still claims that the game needs no external art.

- [ ] **Step 3: Update README without absorbing the user-owned edit**

Replace the false external-art sentence near the top with:

```markdown
The 3D world combines original procedural geometry and shaders with locally committed CC0 item models from [Kenney](https://kenney.nl/assets). The game makes no runtime asset requests.
```

Add this section before `## Commands`:

```markdown
## Asset policy

Kenney is the project's store for third-party game assets. Downloaded assets must come from an individual free CC0 pack, run through the local reproducible asset pipeline, and ship from the repository rather than a remote URL. [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) records pack versions, hashes, source entries, modifications, and license details.
```

Keep the existing `Space | Jump` row unchanged.

- [ ] **Step 4: Create root contributor guidance**

Create `AGENTS.md`:

```markdown
# Repository Guidance

## Third-party assets

Use [Kenney](https://kenney.nl/assets) as the sole third-party asset store unless the user approves another source.

- Download individual free CC0 packs. Do not make the project depend on the optional All-in-1 bundle.
- Commit processed runtime assets locally. Production code must not fetch models, textures, audio, UI art, or effects from a store.
- Record the asset-page URL, pack version, archive SHA-256, source entry, processing steps, triangle counts, license, and download date in `THIRD_PARTY_ASSETS.md`.
- Embed textures and other runtime dependencies in the committed artifact where the format permits it.
- Keep downloaded model filenames stable once runtime code references them.
- Run `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build` after asset changes. Inspect changed visual assets in the browser in both game phases.
```

- [ ] **Step 5: Run the policy test and confirm GREEN**

Run: `bun run test tests/AssetPolicy.test.ts`

Expected: PASS.

- [ ] **Step 6: Preserve the user-owned README hunk**

Inspect `git diff -- README.md` and confirm the Space-control addition remains present. Leave `README.md`, `AGENTS.md`, and `tests/AssetPolicy.test.ts` unstaged at this checkpoint unless the migration's README hunks can be staged independently and verified with `git diff --cached`. Do not create a documentation commit that omits the README policy or absorbs the user's pre-existing control edit. Report the intentionally uncommitted documentation changes in the handoff.

### Task 5: Verify Runtime Appearance and the Complete Project

**Files:**
- Modify only if visual inspection finds a concrete placement issue: `scripts/kenney-item-models.mjs`, `src/world/itemModelManifest.ts`, `tests/helpers/productionPropModels.ts`

**Interfaces:**
- Verifies the public game behavior and production asset pipeline.

- [ ] **Step 1: Run clean automated verification**

Run:

```bash
bun run models:check
bun run typecheck
bun run test
bun run build
```

Expected: each command exits 0; the model audit reports 2,640 triangles; Vitest reports no failures; Vite writes `dist/`.

- [ ] **Step 2: Inspect the built asset dependency graph**

Run: `rg -n "https://(poly\.pizza|static\.poly\.pizza|kenney\.nl)" dist src`

Expected: no runtime source file or built output contains a remote model or texture request. Manifest provenance may contain Kenney page URLs as inert strings.

- [ ] **Step 3: Start the game and inspect scavenging models**

Run: `bun run dev -- --host 127.0.0.1`

Open the Vite URL. Use a 1280x720 viewport, begin evacuation, and inspect all fourteen spawned instances. Confirm each of the nine item types has a visible Kenney model, rests on its support, remains targetable, and fits the carry attachment without blocking the crosshair.

- [ ] **Step 4: Inspect lifeboat storage and survival use**

Save at least one instance of each type, evacuate, and inspect the lifeboat at 1280x720 and 1920x1080. Confirm dense storage remains readable, depletion tint affects one physical instance, canned food disappears after consumption, and the fishing rod moves during the fishing cue.

- [ ] **Step 5: Inspect lighting and composite recognition**

Check daylight, night, overcast, and squall states. Confirm the medical cross, tape hole, rod reel, flashlight lens, and scuba twin tanks remain legible without HUD text. If a failure appears, write a failing placement or model-recipe test before changing the recipe or manifest, then repeat Tasks 3 and 5 verification.

- [ ] **Step 6: Review the final diff**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: no whitespace errors, no temporary archives or extracted palette files, and no unrelated file staged or reverted.
