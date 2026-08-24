# Ocean Rendering and Finalization Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate ocean shader and geometry construction, then remove obsolete paths and verify the complete behavior-preserving refactor.

**Architecture:** Shader assembly and geometry builders are stateless modules. `OceanRenderer` keeps runtime quality, atmosphere, exclusions, vortex, follow, update, and disposal. Final source tests enforce the new dependency boundaries.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Three.js 0.180, Vite 7

**Spec:** `docs/superpowers/specs/2026-08-21-code-refactor-design.md`

## Global Constraints

- Complete all earlier refactor plans first.
- Preserve shader source, defines, colors, quality values, geometry counts, wave behavior, exclusions, and vortex behavior.
- Read `VISUAL_STYLE_GUIDE.md` before changing any player-facing value.
- Do not change player-facing values during this plan.
- Do not allocate shader source, geometry, or scratch state during frame updates.
- Delete obsolete files and imports. Do not add compatibility shims.
- Finish with passing type checks, tests, build, and visual smoke checks.

---

### Task 1: Extract Ocean Shader Assembly

**Files:**
- Create: `src/ocean/oceanShader.ts`
- Create: `tests/OceanShader.test.ts`
- Modify: `src/ocean/OceanRenderer.ts`
- Modify: `tests/OceanRenderer.test.ts`

**Interfaces:**
- Produces: frozen shader source, quality defines, uniform construction, and typed uniform values.
- Consumes: water quality and the existing maximum exclusion count.

- [ ] **Step 1: Add shader characterization tests**

```ts
const low = createOceanShaderDefinition('low');
const ultra = createOceanShaderDefinition('ultra');
expect(low.vertexShader).toBe(OCEAN_VERTEX_SHADER);
expect(low.fragmentShader).toBe(OCEAN_FRAGMENT_SHADER);
expect(low.defines).toEqual({});
expect(ultra.defines).toEqual({
  HIGH_QUALITY_WATER: 1,
  ULTRA_QUALITY_WATER: 1,
});
expect(low.uniforms.exclusionInverseMatrices.value).toHaveLength(2);
```

Assert all current define values, uniform names, initial values, and shader markers used by tests.

- [ ] **Step 2: Run the test and confirm the missing module**

Run: `npm test -- tests/OceanShader.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Move shader constants and define assembly**

Export `MAX_OCEAN_EXCLUSIONS`, `OCEAN_VERTEX_SHADER`,
`OCEAN_FRAGMENT_SHADER`, `OceanShaderUniforms`, and
`createOceanShaderDefinition(quality: WaterQuality)`. The definition returns
defines, uniforms, and both shader strings.

Move shader strings byte-for-byte. Move `OCEAN_COLORS` and shader-only
uniform builders with the shader.

- [ ] **Step 4: Construct material from the definition**

`OceanRenderer` calls `createOceanShaderDefinition` only during construction or quality rebuild. It retains uniform references used during updates.

- [ ] **Step 5: Run shader and renderer tests**

Run: `npm test -- tests/OceanShader.test.ts tests/OceanRenderer.test.ts tests/WaterExclusion.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit shader extraction**

```bash
git add src/ocean/oceanShader.ts src/ocean/OceanRenderer.ts tests/OceanShader.test.ts tests/OceanRenderer.test.ts
git commit -m "refactor: extract ocean shader assembly"
```

---

### Task 2: Extract Ocean Geometry Builders

**Files:**
- Create: `src/ocean/oceanGeometry.ts`
- Create: `tests/OceanGeometry.test.ts`
- Modify: `src/ocean/OceanRenderer.ts`
- Modify: `tests/OceanRenderer.test.ts`

**Interfaces:**
- Produces: surface panel, merged surface geometry, and horizon geometry builders.
- Consumes: immutable `OceanSurfaceQuality`.

- [ ] **Step 1: Add geometry characterization tests**

```ts
const quality = OCEAN_SURFACE_QUALITY.low;
const surface = createOceanSurfaceGeometry(quality);
const horizon = createOceanHorizonGeometry(quality);
expect(surface.getAttribute('position').count).toBe((quality.segments + 1) ** 2);
expect(horizon.getAttribute('position').count).toBe(
  4 * (quality.segments + 1) * (quality.horizonRadialSegments + 1)
    + 4 * (quality.horizonRadialSegments + 1) ** 2,
);
surface.dispose();
horizon.dispose();
```

Use the current exact vertex and index counts from `OceanRenderer.test.ts`. Cover Low, High, and Ultra.

- [ ] **Step 2: Run the test and confirm the missing module**

Run: `npm test -- tests/OceanGeometry.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Move geometry builders**

```ts
export function createOceanSurfaceGeometry(quality: OceanSurfaceQuality): BufferGeometry;
export function createOceanHorizonGeometry(quality: OceanSurfaceQuality): BufferGeometry;
```

Keep panel sizes, rings, segment counts, merge order, attribute layout, and bounding behavior unchanged. Keep helper functions private.

- [ ] **Step 4: Delegate quality rebuilds**

`OceanRenderer.setQuality` disposes old geometry, creates both geometries through the new module, replaces mesh geometry, and preserves runtime state.

- [ ] **Step 5: Run geometry, renderer, and world tests**

Run: `npm test -- tests/OceanGeometry.test.ts tests/OceanRenderer.test.ts tests/BoatWorld.test.ts tests/world.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit geometry extraction**

```bash
git add src/ocean/oceanGeometry.ts src/ocean/OceanRenderer.ts tests/OceanGeometry.test.ts tests/OceanRenderer.test.ts
git commit -m "refactor: extract ocean geometry builders"
```

---

### Task 3: Reduce `OceanRenderer` to Runtime Control

**Files:**
- Modify: `src/ocean/OceanRenderer.ts`
- Modify: `tests/OceanRenderer.test.ts`
- Modify: `README.md`

**Interfaces:**
- `OceanRenderer` retains constructor, `setQuality`, `update`, `setVortex`, `vortexStateForTest`, `setExclusions`, `follow`, and `dispose`.

- [ ] **Step 1: Add runtime ownership tests**

```ts
renderer.setVortex(vortex);
renderer.setExclusions(exclusions);
renderer.follow(12, -8);
renderer.update(4, atmosphere, 0.8);
expect(renderer.vortexStateForTest()).toEqual(vortex);
renderer.dispose();
renderer.dispose();
expect(disposeCounts.geometry).toBe(createdGeometryCount);
```

- [ ] **Step 2: Remove shader and geometry helper bodies**

Run: `rg -n "gl_Position|fragmentColor|createOceanPanel|createSurfaceGeometry|createHorizonGeometry" src/ocean/OceanRenderer.ts`

Expected: no matches.

- [ ] **Step 3: Keep update mutation-only**

Update existing uniform values, mesh positions, and cached runtime state. Do not create vectors, matrices, arrays, objects, shader definitions, or geometry.

- [ ] **Step 4: Update architecture documentation**

Document shader, geometry, and runtime ownership.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 6: Commit renderer cleanup**

```bash
git add src/ocean/OceanRenderer.ts tests/OceanRenderer.test.ts README.md
git commit -m "refactor: reduce ocean renderer to runtime control"
```

---

### Task 4: Enforce Dependency and Obsolete-Path Rules

**Files:**
- Create: `tests/SourceArchitecture.test.ts`
- Modify: obsolete imports found by the checks.
- Delete: obsolete modules found by the checks.

**Interfaces:**
- Produces: source tests for forbidden imports, deleted paths, and relative-import cycles.

- [ ] **Step 1: Add forbidden-path checks**

```ts
const DELETED_PATHS = [
  'src/survival/events.ts',
  'src/survival/ActiveEventPresenter.ts',
  'src/world/ShipLayout.ts',
];

it('does not keep obsolete source paths', () => {
  for (const path of DELETED_PATHS) {
    expect(existsSync(new URL(`../${path}`, import.meta.url))).toBe(false);
  }
});
```

- [ ] **Step 2: Add domain-boundary checks**

Read every file in the domain and layout module lists from earlier plans. Reject imports beginning with `three`, imports from `src/ui`, and DOM globals.

- [ ] **Step 3: Add a relative-import cycle check**

Build a map from each `src/**/*.ts` file to resolved relative TypeScript imports. Use depth-first search with `visiting` and `visited` sets. Throw an error containing the full cycle path when a visiting node is reached.

```ts
function visit(file: string, stack: readonly string[]): void {
  if (visiting.has(file)) throw new Error([...stack, file].join(' -> '));
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file) ?? []) visit(dependency, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
}
```

- [ ] **Step 4: Run the architecture test and remove violations**

Run: `npm test -- tests/SourceArchitecture.test.ts`

Expected: pass. Delete dead modules instead of hiding them from the test.

- [ ] **Step 5: Search for legacy symbols**

Run: `rg -n "ActiveEventPresenter|from ['\"].*\/events['\"]|from ['\"].*\/ShipLayout['\"]" src tests`

Expected: no matches.

- [ ] **Step 6: Commit architecture enforcement**

```bash
git add src tests/SourceArchitecture.test.ts
git commit -m "test: enforce refactored source boundaries"
```

---

### Task 5: Complete Product Verification

**Files:**
- Modify: `README.md` only if its architecture list is incomplete.

**Interfaces:**
- Verifies every acceptance criterion from the approved specification.

- [ ] **Step 1: Run static verification**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 2: Run all tests**

Run: `npm test`

Expected: every test file and test passes.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0 and a Vite production bundle in `dist`.

- [ ] **Step 4: Run asset validation**

Run these commands:

```bash
npm run models:check:items
npm run models:check:ship
npm run models:check:fishing
npm run models:check:events
npm run models:check:menu
npm run textures:check:lifeboat
npm run textures:check:ship
npm run thumbnails:check
```

Expected: all committed model, texture, and thumbnail checks pass.

- [ ] **Step 5: Run a player-flow smoke check**

Start: `npm run dev`

In the browser, verify these flows without console errors:

1. Open the underwater menu and start scavenging.
2. Move, collect one item, pause, resume, and enter survival.
3. Run one day action and open the journal.
4. Start fishing, cast, exit, and restore command focus.
5. Open one dedicated, focused, featured, weather, supernatural, and moon event through the event test route.
6. Resolve one item choice and one endure choice.
7. Restart and confirm stale presentation work does not return.

- [ ] **Step 6: Review resource and frame ownership**

Run: `rg -n "new (Vector[234]|Quaternion|Matrix4|Raycaster|Plane|Color|Array|Map|Set)" src/survival src/ocean`

Inspect matches inside `update` methods. Move any repeated frame allocation to a field. Confirm every extracted controller has idempotent disposal tests.

- [ ] **Step 7: Commit final documentation when needed**

```bash
git add README.md
git commit -m "docs: document refactored architecture"
```

Skip this commit when `README.md` already contains the complete final architecture.

- [ ] **Step 8: Confirm a clean worktree**

Run: `git status --short`

Expected: no output.
