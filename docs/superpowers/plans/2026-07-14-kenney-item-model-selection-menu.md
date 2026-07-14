# Kenney Item Model Selection Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research three official Kenney alternatives for each of the nine runtime items and publish one browser board that shows the current model beside those alternatives for selection.

**Architecture:** Keep the selection pass in the ignored `.superpowers/kenney-item-selection/` workspace so production assets and tests do not change. A validated JSON catalog pins official pack metadata and candidate recipes, the existing Kenney model builder creates research-only GLBs, and a Vite-built Three.js page renders each GLB under the same studio setup. The brainstorming companion serves the board and records one choice per item.

**Tech Stack:** Node.js ESM, PowerShell, Three.js 0.180, GLTF Transform 4.4, Vite 7.1, Node's built-in test runner, and the Superpowers brainstorming companion.

## Global Constraints

- Use Kenney as the sole third-party asset store.
- Use free individual CC0 packs, not the All-in-1 bundle.
- Cover `flareGun`, `ductTape`, `fishingRod`, `baitTin`, `medicalKit`, `waterJug`, `cannedFood`, `flashlight`, and `scubaSet`.
- Show the current model plus three alternatives for each item.
- Permit complete models and composites made only from Kenney parts.
- Keep every candidate at or below 3,000 triangles.
- Render candidate geometry under one camera, background, lighting rig, and display volume.
- Leave `src/assets/models/items`, `src/world/itemModelManifest.ts`, `THIRD_PARTY_ASSETS.md`, repository tests, and gameplay code unchanged during selection.
- Keep research downloads, generated models, and board files under `.superpowers/kenney-item-selection/`.
- Preserve the existing dirty working tree. Compare repository status before and after the selection pass.

---

### Task 1: Create the Research Workspace and Catalog Contract

**Files:**
- Create: `.superpowers/kenney-item-selection/catalog.mjs`
- Create: `.superpowers/kenney-item-selection/catalog.test.mjs`
- Create: `.superpowers/kenney-item-selection/status-before.txt`

**Interfaces:**
- Produces: `ITEM_IDS: readonly string[]`.
- Produces: `validateCatalog(catalog: unknown): void`.
- Produces: `candidateKey(itemId: string, candidateId: string): string`.
- Consumes later: `.superpowers/kenney-item-selection/selection-catalog.json`.

- [ ] **Step 1: Record the repository baseline**

Run:

```powershell
New-Item -ItemType Directory -Force .superpowers/kenney-item-selection | Out-Null
git status --porcelain=v1 | Set-Content -Encoding utf8 .superpowers/kenney-item-selection/status-before.txt
```

Expected: the file records the existing modified and untracked paths without changing them.

- [ ] **Step 2: Write the failing catalog-contract test**

Create `.superpowers/kenney-item-selection/catalog.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidateKey, ITEM_IDS, validateCatalog } from './catalog.mjs';

const fixture = {
  packs: {
    survival: {
      pageUrl: 'https://kenney.nl/assets/survival-kit',
      version: '2.0',
      archiveUrl: 'https://kenney.nl/media/pages/assets/survival-kit/example/kenney_survival-kit.zip',
      sha256: 'A'.repeat(64),
      requiredEntries: ['License.txt', 'Models/GLB format/bottle.glb'],
    },
  },
  items: Object.fromEntries(ITEM_IDS.map((itemId) => [itemId, [
    {
      id: 'current', label: 'Keep current', kind: 'current',
      sourceUrl: 'https://kenney.nl/assets/survival-kit', sourceAssetId: 'current',
      modelFile: `${itemId}--current.glb`, triangles: 100, fit: 'Current production model.',
    },
    ...['a', 'b', 'c'].map((id) => ({
      id, label: `Candidate ${id.toUpperCase()}`, kind: 'direct',
      sourceUrl: 'https://kenney.nl/assets/survival-kit',
      sourceAssetId: `survival-kit@2.0:Models/GLB format/${itemId}-${id}.glb`,
      modelFile: `${itemId}--${id}.glb`, triangles: 200, fit: 'Readable silhouette.',
      recipe: { kind: 'direct', pack: 'survival', entry: `Models/GLB format/${itemId}-${id}.glb`, expectedTriangles: 200 },
    })),
  ]])),
};

test('accepts nine rows with current plus three official Kenney choices', () => {
  assert.doesNotThrow(() => validateCatalog(fixture));
  assert.equal(candidateKey('flareGun', 'a'), 'flareGun--a');
});

test('rejects candidates above the triangle budget', () => {
  const invalid = structuredClone(fixture);
  invalid.items.flareGun[1].triangles = 3001;
  assert.throws(() => validateCatalog(invalid), /flareGun.*3,000/);
});
```

- [ ] **Step 3: Run the test and confirm RED**

Run:

```powershell
node --test .superpowers/kenney-item-selection/catalog.test.mjs
```

Expected: FAIL because `catalog.mjs` does not exist.

- [ ] **Step 4: Implement the catalog validator**

Create `.superpowers/kenney-item-selection/catalog.mjs` with these checks:

```js
export const ITEM_IDS = Object.freeze([
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
]);

export function candidateKey(itemId, candidateId) {
  return `${itemId}--${candidateId}`;
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${path} must be a non-empty string`);
}

export function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object') throw new Error('catalog must be an object');
  if (!catalog.packs || typeof catalog.packs !== 'object') throw new Error('packs must be an object');
  if (!catalog.items || typeof catalog.items !== 'object') throw new Error('items must be an object');

  const itemKeys = Object.keys(catalog.items).sort();
  const expectedKeys = [...ITEM_IDS].sort();
  if (JSON.stringify(itemKeys) !== JSON.stringify(expectedKeys)) throw new Error('catalog must contain the nine runtime item IDs');

  for (const [packId, pack] of Object.entries(catalog.packs)) {
    requireString(pack.pageUrl, `packs.${packId}.pageUrl`);
    if (!/^https:\/\/(www\.)?kenney\.nl\/assets\//.test(pack.pageUrl)) throw new Error(`${packId} must use an official Kenney asset page`);
    requireString(pack.version, `packs.${packId}.version`);
    requireString(pack.archiveUrl, `packs.${packId}.archiveUrl`);
    if (!/^https:\/\/(www\.)?kenney\.nl\//.test(pack.archiveUrl)) throw new Error(`${packId} archive must use kenney.nl`);
    if (!/^[A-Fa-f0-9]{64}$/.test(pack.sha256)) throw new Error(`${packId} must pin a SHA-256`);
    if (!Array.isArray(pack.requiredEntries) || pack.requiredEntries.length < 2) throw new Error(`${packId} must list approved archive entries`);
  }

  for (const itemId of ITEM_IDS) {
    const choices = catalog.items[itemId];
    if (!Array.isArray(choices) || choices.length !== 4) throw new Error(`${itemId} must contain current plus three candidates`);
    if (choices[0].id !== 'current' || choices[0].kind !== 'current') throw new Error(`${itemId} must start with the current model`);
    for (const choice of choices) {
      for (const field of ['id', 'label', 'kind', 'sourceUrl', 'sourceAssetId', 'modelFile', 'fit']) requireString(choice[field], `${itemId}.${choice.id}.${field}`);
      if (!/^https:\/\/(www\.)?kenney\.nl\/assets\//.test(choice.sourceUrl)) throw new Error(`${itemId}.${choice.id} must use an official Kenney asset page`);
      if (!Number.isInteger(choice.triangles) || choice.triangles < 1 || choice.triangles > 3000) throw new Error(`${itemId}.${choice.id} exceeds the 3,000 triangle budget`);
      if (choice.kind !== 'current' && choice.kind !== 'direct' && choice.kind !== 'composite') throw new Error(`${itemId}.${choice.id} has an invalid kind`);
      if (choice.kind !== 'current' && !choice.recipe) throw new Error(`${itemId}.${choice.id} requires a reproducible recipe`);
    }
  }
}
```

- [ ] **Step 5: Run the contract test and confirm GREEN**

Run: `node --test .superpowers/kenney-item-selection/catalog.test.mjs`

Expected: 2 tests pass.

---

### Task 2: Research and Pin the Candidate Catalog

**Files:**
- Create: `.superpowers/kenney-item-selection/selection-catalog.json`
- Create: `.superpowers/kenney-item-selection/fetch-packs.ps1`
- Create: `.superpowers/kenney-item-selection/archives/`
- Create: `.superpowers/kenney-item-selection/sources/`

**Interfaces:**
- Produces: a validated catalog with exact pack hashes, archive entries, recipes, labels, triangle counts, and fit notes.
- Produces: extracted source files under `sources/$packId/`.
- Consumes: official Kenney asset pages and individual pack archives.

- [ ] **Step 1: Search the official catalog by item family**

Search only `kenney.nl/assets` for these groups:

```text
flare gun / signal pistol / blaster
duct tape / repair roll / tool
fishing rod / pole / reel
bait tin / small can / tackle
medical kit / first aid / case
water jug / bottle / canteen
canned food / food can / tin
flashlight / torch / lamp
scuba set / oxygen tank / diving gear
```

Record candidate pack-page URLs in `selection-catalog.json`. Include the four current packs before adding a new pack: Blaster Kit 2.1, Food Kit 2.0, Survival Kit 2.0, and Prototype Kit 1.0.

- [ ] **Step 2: Download each individual pack and record its hash**

For each selected pack, download the official archive into `archives/`, using the pack ID as the ZIP filename. Then run:

```powershell
Get-ChildItem .superpowers/kenney-item-selection/archives -Filter *.zip | Get-FileHash -Algorithm SHA256
```

Copy the 64-character result into that pack's `sha256` field. Record the page version and direct archive URL shown by the official page. Do not use or link the All-in-1 bundle.

- [ ] **Step 3: Inspect archive model names before choosing recipes**

Run this PowerShell expression to list the GLBs in every research archive:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
Get-ChildItem .superpowers/kenney-item-selection/archives -Filter *.zip | ForEach-Object {
  Write-Output "[$($_.BaseName)]"
  $zip = [System.IO.Compression.ZipFile]::OpenRead($_.FullName)
  try { $zip.Entries | Where-Object { $_.FullName -match 'Models/GLB format/.+\.glb$' } | Select-Object -ExpandProperty FullName } finally { $zip.Dispose() }
}
```

Expected: a list of exact archive-relative GLB paths. Use those paths in direct recipes and composite part recipes.

- [ ] **Step 4: Choose three alternatives per item**

Populate `selection-catalog.json` so every item contains four ordered choices. Choice zero records the current checked-in model. Choices `a`, `b`, and `c` follow these rules:

- at least one direct and one composite candidate when both produce credible silhouettes;
- a source page, versioned source identity, model filename, triangle count, and one-sentence fit note for each choice;
- defining geometry visible from the preview angle: tape hole, rod reel, medical cross, flashlight lens, and twin tanks;
- no candidate above 3,000 triangles;
- no additional pack when an approved pack offers an equal candidate.

Use `recipe.kind = "direct"` with `pack`, `entry`, and `expectedTriangles` for complete models. Use `recipe.kind = "composite"` with `parts[]`; each part records `name`, `pack`, `entry`, `translation`, quaternion `rotation`, `scale`, and RGBA `color`.

- [ ] **Step 5: Add a pinned, allowlisted extractor**

Create `fetch-packs.ps1`:

```powershell
param(
  [string]$SelectionRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$selectionRoot = [System.IO.Path]::GetFullPath($SelectionRoot)
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $selectionRoot '..\..'))
. (Join-Path $repositoryRoot 'scripts\kenney-item-sources.ps1')

$catalog = Get-Content -Raw (Join-Path $selectionRoot 'selection-catalog.json') | ConvertFrom-Json
$archivesRoot = Join-Path $selectionRoot 'archives'
$sourcesRoot = Join-Path $selectionRoot 'sources'
New-Item -ItemType Directory -Force $sourcesRoot | Out-Null

foreach ($property in $catalog.packs.PSObject.Properties) {
  $packId = $property.Name
  $pack = $property.Value
  $archivePath = Join-Path $archivesRoot "$packId.zip"
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    Invoke-WebRequest -Uri $pack.archiveUrl -OutFile $archivePath
  }
  Assert-FileSha256 -Path $archivePath -Expected $pack.sha256
  $destination = Join-Path $sourcesRoot $packId
  $entries = [string[]]@($pack.requiredEntries)
  Expand-ApprovedArchiveEntries -ArchivePath $archivePath -DestinationRoot $destination -Entries $entries
}
```

- [ ] **Step 6: Extract the approved source entries**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .superpowers/kenney-item-selection/fetch-packs.ps1
```

Expected: every selected pack passes SHA-256 verification and only `License.txt`, required GLBs, and required texture files appear under `sources/`.

- [ ] **Step 7: Validate the complete catalog**

Run:

```powershell
node -e "import('./.superpowers/kenney-item-selection/catalog.mjs').then(async m => { const c = JSON.parse(await (await import('node:fs/promises')).readFile('.superpowers/kenney-item-selection/selection-catalog.json', 'utf8')); m.validateCatalog(c); console.log('catalog valid: 9 items, 36 choices'); })"
```

Expected: `catalog valid: 9 items, 36 choices`.

---

### Task 3: Build and Audit the 36 Research Models

**Files:**
- Create: `.superpowers/kenney-item-selection/build-models.mjs`
- Create: `.superpowers/kenney-item-selection/build-models.test.mjs`
- Create: `.superpowers/kenney-item-selection/audit-models.mjs`
- Create: `.superpowers/kenney-item-selection/models/`

**Interfaces:**
- Produces: `recipesFromCatalog(catalog): Record<string, DirectRecipe | CompositeRecipe>`.
- Produces: 36 files named with `candidateKey(itemId, choiceId) + '.glb'`.
- Consumes: `buildKenneyItemModels({ sourceRoot, outputRoot, recipes })` from `scripts/kenney-item-models.mjs`.

- [ ] **Step 1: Write the failing recipe-flattening test**

Create `build-models.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEM_IDS } from './catalog.mjs';
import { recipesFromCatalog } from './build-models.mjs';

const direct = (suffix) => ({
  kind: 'direct', pack: 'prototype', entry: `Models/GLB format/${suffix}.glb`, expectedTriangles: 100,
});
const catalog = {
  items: Object.fromEntries(ITEM_IDS.map((itemId) => [itemId, [
    { id: 'current', kind: 'current' },
    { id: 'a', kind: 'direct', recipe: direct(`${itemId}-a`) },
    { id: 'b', kind: 'direct', recipe: direct(`${itemId}-b`) },
    { id: 'c', kind: 'direct', recipe: direct(`${itemId}-c`) },
  ]])),
};

test('flattens alternative recipes and excludes current models', () => {
  const recipes = recipesFromCatalog(catalog);
  assert.equal(Object.keys(recipes).length, 27);
  assert.deepEqual(recipes['flareGun--a'], direct('flareGun-a'));
  assert.deepEqual(recipes['flareGun--b'], direct('flareGun-b'));
  assert.equal(recipes['flareGun--current'], undefined);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test .superpowers/kenney-item-selection/build-models.test.mjs`

Expected: FAIL because `build-models.mjs` does not exist.

- [ ] **Step 3: Implement the research builder**

Create `build-models.mjs`:

```js
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKenneyItemModels } from '../../scripts/kenney-item-models.mjs';
import { candidateKey, ITEM_IDS, validateCatalog } from './catalog.mjs';

export function recipesFromCatalog(catalog) {
  return Object.fromEntries(ITEM_IDS.flatMap((itemId) =>
    catalog.items[itemId]
      .filter(({ kind }) => kind !== 'current')
      .map(({ id, recipe }) => [candidateKey(itemId, id), recipe]),
  ));
}

export async function buildSelectionModels(root = fileURLToPath(new URL('.', import.meta.url))) {
  const catalog = JSON.parse(await readFile(resolve(root, 'selection-catalog.json'), 'utf8'));
  validateCatalog(catalog);
  const outputRoot = resolve(root, 'models');
  await mkdir(outputRoot, { recursive: true });
  for (const itemId of ITEM_IDS) {
    await copyFile(
      resolve(root, '../../src/assets/models/items', `${itemId}.glb`),
      resolve(outputRoot, `${candidateKey(itemId, 'current')}.glb`),
    );
  }
  await buildKenneyItemModels({
    sourceRoot: resolve(root, 'sources'),
    outputRoot,
    recipes: recipesFromCatalog(catalog),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSelectionModels();
}
```

- [ ] **Step 4: Run the unit test and confirm GREEN**

Run: `node --test .superpowers/kenney-item-selection/build-models.test.mjs`

Expected: the recipe-flattening test passes.

- [ ] **Step 5: Build all candidate files**

Run: `node .superpowers/kenney-item-selection/build-models.mjs`

Expected: `models/` contains 36 GLBs: four choices for each of the nine item IDs.

- [ ] **Step 6: Implement and run the model audit**

Create `audit-models.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ITEM_IDS, validateCatalog } from './catalog.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const catalog = JSON.parse(await readFile(resolve(root, 'selection-catalog.json'), 'utf8'));
validateCatalog(catalog);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let count = 0;

for (const itemId of ITEM_IDS) {
  for (const choice of catalog.items[itemId]) {
    const document = await io.read(resolve(root, 'models', choice.modelFile));
    const resources = [...document.getRoot().listBuffers(), ...document.getRoot().listTextures()];
    if (resources.some((resource) => resource.getURI())) throw new Error(`${choice.modelFile}: external resource URI`);
    let triangles = 0;
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const vertices = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
        triangles += vertices / 3;
      }
    }
    if (!Number.isInteger(triangles)) throw new Error(`${choice.modelFile}: non-triangle primitive count`);
    if (triangles !== choice.triangles) throw new Error(`${choice.modelFile}: catalog ${choice.triangles}, file ${triangles}`);
    if (triangles > 3000) throw new Error(`${choice.modelFile}: exceeds 3,000 triangles`);
    console.log(`${itemId}:${choice.id}: ${triangles} triangles`);
    count += 1;
  }
}

if (count !== 36) throw new Error(`expected 36 models, audited ${count}`);
console.log('selection models valid: 36 / 36');
```

Run: `node .superpowers/kenney-item-selection/audit-models.mjs`

Expected: 36 labeled audit lines followed by `selection models valid: 36 / 36`.

---

### Task 4: Build the Interactive Studio Board

**Files:**
- Create: `.superpowers/kenney-item-selection/viewer/index.html`
- Create: `.superpowers/kenney-item-selection/viewer/board-state.mjs`
- Create: `.superpowers/kenney-item-selection/viewer/board-state.test.mjs`
- Create: `.superpowers/kenney-item-selection/viewer/board.js`
- Create: `.superpowers/kenney-item-selection/viewer/vite.config.mjs`
- Create: `.superpowers/kenney-item-selection/viewer/dist/`

**Interfaces:**
- Produces: `selectChoice(state, itemId, candidateId)` and `selectionSummary(state, catalog)`.
- Produces: `viewer/dist/index.html` and `viewer/dist/board.js` with base path `/files/`.
- Consumes: `/files/selection-catalog.json` and the 36 catalog `modelFile` URLs under `/files/`.

- [ ] **Step 1: Write the failing selection-state test**

Create `board-state.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialSelections, selectChoice } from './board-state.mjs';

test('defaults each row to current and changes one row at a time', () => {
  const state = initialSelections(['flareGun', 'ductTape']);
  assert.deepEqual(state, { flareGun: 'current', ductTape: 'current' });
  assert.deepEqual(selectChoice(state, 'flareGun', 'b'), { flareGun: 'b', ductTape: 'current' });
  assert.deepEqual(state, { flareGun: 'current', ductTape: 'current' });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test .superpowers/kenney-item-selection/viewer/board-state.test.mjs`

Expected: FAIL because `board-state.mjs` does not exist.

- [ ] **Step 3: Implement immutable selection state**

Create `board-state.mjs`:

```js
export const initialSelections = (itemIds) => Object.fromEntries(itemIds.map((id) => [id, 'current']));

export function selectChoice(state, itemId, candidateId) {
  if (!(itemId in state)) throw new Error(`Unknown item: ${itemId}`);
  return { ...state, [itemId]: candidateId };
}

export function selectionSummary(state, catalog) {
  return Object.fromEntries(Object.entries(state).map(([itemId, candidateId]) => {
    const choice = catalog.items[itemId].find(({ id }) => id === candidateId);
    if (!choice) throw new Error(`Unknown choice: ${itemId}:${candidateId}`);
    return [itemId, { candidateId, label: choice.label, sourceAssetId: choice.sourceAssetId }];
  }));
}
```

- [ ] **Step 4: Run the state test and confirm GREEN**

Run: `node --test .superpowers/kenney-item-selection/viewer/board-state.test.mjs`

Expected: 1 test passes.

- [ ] **Step 5: Implement the full-document board**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kenney Item Model Menu</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; background:#0e151a; color:#edf3f4; }
    * { box-sizing:border-box; }
    body { margin:0; background:linear-gradient(#111b21,#0b1115); }
    header { position:sticky; top:0; z-index:5; padding:18px 24px; background:#10191eed; border-bottom:1px solid #36505c; backdrop-filter:blur(12px); }
    h1 { margin:0 0 6px; font-size:clamp(22px,3vw,34px); }
    header p, .fit { color:#b8c7cc; }
    main { width:min(1500px,100%); margin:auto; padding:20px 24px 180px; }
    .item-row { margin:0 0 28px; }
    .item-row h2 { margin:0 0 10px; font-size:20px; }
    .cards { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .card { overflow:hidden; cursor:pointer; border:2px solid #29404a; border-radius:14px; background:#152229; transition:border-color .15s, transform .15s; }
    .card:hover { transform:translateY(-2px); border-color:#6594a6; }
    .card.selected { border-color:#ef8a4c; box-shadow:0 0 0 2px #ef8a4c40; }
    .preview { display:block; width:100%; aspect-ratio:3/2; object-fit:cover; background:#172027; }
    .card-body { padding:12px; }
    .card h3 { margin:0 0 6px; font-size:16px; }
    .meta { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
    .badge { padding:3px 7px; border-radius:99px; background:#263942; color:#d7e2e5; font-size:11px; text-transform:uppercase; }
    .source { color:#8fcde2; font-size:12px; }
    .fit { margin:8px 0 0; font-size:13px; line-height:1.35; }
    aside { position:fixed; left:0; right:0; bottom:0; z-index:6; padding:12px 24px 18px; background:#0b1216f2; border-top:1px solid #36505c; }
    #summary { width:min(1500px,100%); margin:auto; display:grid; grid-template-columns:repeat(9,minmax(90px,1fr)); gap:8px; }
    .summary-item { min-width:0; padding:8px; border-radius:8px; background:#18262d; }
    .summary-item strong, .summary-item span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
    .summary-item span { color:#efb28d; margin-top:3px; }
    @media (max-width:900px) { .cards { grid-template-columns:repeat(2,minmax(0,1fr)); } #summary { grid-template-columns:repeat(3,1fr); } }
    @media (max-width:560px) { main, header { padding-left:14px; padding-right:14px; } .cards { grid-template-columns:1fr; } aside { position:static; } main { padding-bottom:20px; } }
  </style>
</head>
<body>
  <header>
    <h1>Choose the item models</h1>
    <p>Each row starts on the current model. Pick one card per row. <span id="progress">Preparing 0 / 36 previews…</span></p>
  </header>
  <main id="items" aria-live="polite"></main>
  <aside aria-label="Current selections"><div id="summary"></div></aside>
  <script type="module" src="/board.js"></script>
</body>
</html>
```

Create `board.js`:

```js
import {
  Box3, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { initialSelections, selectChoice, selectionSummary } from './board-state.mjs';

const catalog = await fetch('/files/selection-catalog.json').then((response) => {
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
  return response.json();
});
const itemIds = Object.keys(catalog.items);
let selections = initialSelections(itemIds);
const cardsByModel = new Map();
const itemsRoot = document.querySelector('#items');
const summaryRoot = document.querySelector('#summary');
const progress = document.querySelector('#progress');

function displayName(itemId) {
  return itemId.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}

function redrawSummary() {
  const summary = selectionSummary(selections, catalog);
  summaryRoot.replaceChildren(...itemIds.map((itemId) => {
    const node = document.createElement('div');
    node.className = 'summary-item';
    node.innerHTML = `<strong>${displayName(itemId)}</strong><span>${summary[itemId].label}</span>`;
    return node;
  }));
  window.brainstorm?.choice('selection-summary', { selections: summary });
}

for (const itemId of itemIds) {
  const section = document.createElement('section');
  section.className = 'item-row';
  section.innerHTML = `<h2>${displayName(itemId)}</h2>`;
  const cards = document.createElement('div');
  cards.className = 'cards';
  for (const choice of catalog.items[itemId]) {
    const card = document.createElement('article');
    card.className = `card${choice.id === 'current' ? ' selected' : ''}`;
    card.dataset.choice = `${itemId}:${choice.id}`;
    card.innerHTML = `
      <img class="preview" alt="${choice.label} preview">
      <div class="card-body">
        <h3>${choice.label}</h3>
        <div class="meta"><span class="badge">${choice.kind}</span><span class="badge">${choice.triangles} triangles</span></div>
        <a class="source" href="${choice.sourceUrl}" target="_blank" rel="noreferrer">Open Kenney source pack</a>
        <p class="fit">${choice.fit}</p>
      </div>`;
    card.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      window.toggleSelect?.(card);
      if (!window.toggleSelect) {
        cards.querySelectorAll('.card').forEach((node) => node.classList.remove('selected'));
        card.classList.add('selected');
      }
      selections = selectChoice(selections, itemId, choice.id);
      redrawSummary();
    });
    cards.append(card);
    cardsByModel.set(choice.modelFile, card);
  }
  section.append(cards);
  itemsRoot.append(section);
}
redrawSummary();

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(480, 320, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = SRGBColorSpace;
const loader = new GLTFLoader();
const camera = new PerspectiveCamera(35, 1.5, 0.1, 100);
camera.position.set(2.4, 1.8, 2.8);
camera.lookAt(0, 0, 0);
const box = new Box3();
const size = new Vector3();
const center = new Vector3();
let rendered = 0;

async function renderModel(choice) {
  const scene = new Scene();
  scene.background = new Color('#172027');
  scene.add(new HemisphereLight(0xdcecf3, 0x36424a, 2.1));
  const key = new DirectionalLight(0xffe3cf, 3.3);
  key.position.set(3, 4, 2);
  scene.add(key);
  const floor = new Mesh(new PlaneGeometry(6, 6), new MeshStandardMaterial({ color: 0x25343a, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.92;
  scene.add(floor);

  const gltf = await loader.loadAsync(`/files/${choice.modelFile}`);
  const model = gltf.scene;
  box.setFromObject(model).getSize(size);
  const longest = Math.max(size.x, size.y, size.z);
  if (!(longest > 0)) throw new Error(`${choice.modelFile} has empty bounds`);
  model.scale.setScalar(1.7 / longest);
  box.setFromObject(model).getCenter(center);
  model.position.sub(center);
  model.rotation.y = -0.55;
  scene.add(model);
  renderer.render(scene, camera);
  cardsByModel.get(choice.modelFile).querySelector('img').src = renderer.domElement.toDataURL('image/png');
  floor.geometry.dispose();
  floor.material.dispose();
  model.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    materials.forEach((material) => material.dispose());
  });
}

for (const itemId of itemIds) {
  for (const choice of catalog.items[itemId]) {
    try {
      await renderModel(choice);
    } catch (error) {
      const card = cardsByModel.get(choice.modelFile);
      card.querySelector('img').alt = `Preview failed: ${error instanceof Error ? error.message : String(error)}`;
      card.dataset.renderFailed = 'true';
    }
    rendered += 1;
    progress.textContent = `Preparing ${rendered} / 36 previews…`;
  }
}
progress.textContent = 'All 36 previews are ready.';
renderer.dispose();
```

- [ ] **Step 6: Configure a flat companion build**

Create `vite.config.mjs`:

```js
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  base: '/files/',
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: resolve(root, 'index.html'),
      output: {
        entryFileNames: 'board.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
```

- [ ] **Step 7: Build the board**

Run:

```powershell
npx.cmd --no-install vite build --config .superpowers/kenney-item-selection/viewer/vite.config.mjs
```

Expected: Vite writes `viewer/dist/index.html` and a flat `viewer/dist/board.js` bundle without modifying the production `dist/` directory.

---

### Task 5: Publish, Inspect, and Collect the Nine Choices

**Files:**
- Create through companion: `$screenDir/kenney-model-menu.html`
- Create through companion: `$screenDir/board.js`
- Create through companion: `$screenDir/selection-catalog.json`
- Create through companion: `$screenDir/*.glb`
- Create after user confirmation: `.superpowers/kenney-item-selection/selections.json`

**Interfaces:**
- Consumes: the built viewer, validated catalog, and 36 GLBs.
- Produces: one user-confirmed choice for each runtime item.

- [ ] **Step 1: Start the approved visual companion**

Run the Superpowers `skills/brainstorming/scripts/start-server.sh` script with the repository root as `--project-dir` and `--open`. Read the returned JSON and retain its complete keyed `url`, `screen_dir`, and `state_dir`.

Expected: `server-info` exists, `server-stopped` does not exist, and the browser opens on the keyed URL.

- [ ] **Step 2: Publish support files before the HTML screen**

Copy `viewer/dist/board.js`, `selection-catalog.json`, and all 36 GLBs into `screen_dir`. Copy `viewer/dist/index.html` last and name it `kenney-model-menu.html` so the companion selects it as the newest screen.

Expected: `/files/board.js`, `/files/selection-catalog.json`, and each model URL return HTTP 200 through the companion.

- [ ] **Step 3: Perform visual and interaction QA**

Inspect the opened board at desktop width and a narrow width. Confirm:

- nine rows and 36 cards render;
- each card shows the intended model rather than a blank frame;
- defining item features remain legible;
- each row starts on `Keep current`;
- clicking one card changes only that row;
- the sticky summary contains nine entries;
- official source links match the catalog;
- no card reports more than 3,000 triangles.

Replace any failed candidate, rebuild its model, and repeat the audit before presenting the board.

- [ ] **Step 4: Hand the board to the user**

Send the complete keyed companion URL and state that the page contains nine rows with the current model plus three alternatives. Ask the user to choose one card per row and confirm in the terminal when finished.

- [ ] **Step 5: Read and persist the confirmed choices**

Read `state_dir/events`. Use the last `selection-summary` choice event as the structured state and reconcile it with the user's terminal response. Write the nine confirmed entries to `.superpowers/kenney-item-selection/selections.json` with `itemId`, `candidateId`, `label`, `sourceUrl`, and `sourceAssetId`.

Expected: the file contains nine unique runtime item IDs and no unresolved choice.

- [ ] **Step 6: Prove the selection pass left production files untouched**

Run:

```powershell
git status --porcelain=v1 | Set-Content -Encoding utf8 .superpowers/kenney-item-selection/status-after.txt
Compare-Object (Get-Content .superpowers/kenney-item-selection/status-before.txt) (Get-Content .superpowers/kenney-item-selection/status-after.txt)
```

Expected: no comparison output. The committed design and plan may already exist in both baselines; this check detects new production changes during selection.

- [ ] **Step 7: Prepare the replacement implementation handoff**

Summarize the nine selected source identities and pack additions. Start a separate brainstorming-to-plan cycle for replacing only the chosen production GLBs, updating hashes and provenance, running `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build`, and inspecting both game phases.
