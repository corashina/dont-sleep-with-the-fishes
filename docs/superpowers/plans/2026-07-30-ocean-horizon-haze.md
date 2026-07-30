# Ocean Distance Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep ocean waves coherent from the near grid to the true horizon.

**Architecture:** Grade the existing horizon vertices toward the near-grid density. Preserve middle-distance wave contrast, then complete fog near the true horizon.

**Tech Stack:** TypeScript, Three.js GLSL, Vitest, Vite

## Global Constraints

Add no vertices, panels, materials, textures, render passes, or draw calls.

Keep the shared wave field unchanged.

Use radial exponent `1.75`.

Use low fog settings `150`, `650`, and `0.86`.

Use high fog settings `180`, `750`, and `0.82`.

Do not add frame-loop allocations.

Do not add reduced-motion behavior.

---

## File Structure

- Modify `src/ocean/OceanRenderer.ts`.
  It owns ocean geometry, shader settings, quality changes, and disposal.
- Modify `tests/OceanRenderer.test.ts`.
  It protects seam density, vertex budget, fog settings, and ownership.

### Task 1: Grade horizon geometry and preserve distant contrast

**Files:**
- Modify: `src/ocean/OceanRenderer.ts`
- Modify: `tests/OceanRenderer.test.ts`

**Interfaces:**
- Produces: `OceanSurfaceQuality.horizonRadialExponent: number`.
- Produces: `OceanSurfaceQuality.horizonFogStart: number`.
- Produces: `OceanSurfaceQuality.horizonFogEnd: number`.
- Produces: `OceanSurfaceQuality.horizonFogLimit: number`.
- Produces: shader uniform `uHorizonFog: Vector3`.

- [x] **Step 1: Write the failing geometry test**

Read centerline radial positions from `horizonMesh.geometry`.

Require the first horizon cell to stay within 1.5 near-grid cells.

Require the first cell to remain smaller than the last cell.

Require the old horizon vertex count for each quality.

- [x] **Step 2: Run the geometry test and confirm failure**

Run:

```powershell
bunx vitest run tests/OceanRenderer.test.ts
```

Expected before implementation:

```text
Low first cell: about 21.04; maximum: 1.41.
High first cell: about 14.03; maximum: 0.94.
```

- [x] **Step 3: Grade every horizon panel**

After panel rotation and translation, remap each radial coordinate:

```ts
const distance = direction * value;
const progress = Math.min(
  1,
  Math.max(0, (distance - innerHalfExtent) / span),
);
const graded = direction * (
  innerHalfExtent + span * Math.pow(progress, 1.75)
);
```

Grade one axis for edge panels.

Grade both axes for corner panels.

Keep all existing segment counts.

- [x] **Step 4: Write the failing fog ownership test**

Require low uniform values `[150, 650, 0.86]`.

Require high uniform values `[180, 750, 0.82]`.

Require `setQuality` to update the existing uniform.

- [x] **Step 5: Preserve contrast and finish horizon fog**

Add the uniform:

```glsl
uniform vec3 uHorizonFog;
```

Replace the final fog blend with:

```glsl
float fogFactor = 1.0 - exp(
  -uFogDensity * uFogDensity * vViewDepth * vViewDepth
);
float horizonFogProgress = smoothstep(
  uHorizonFog.x,
  uHorizonFog.y,
  vViewDepth
);
float distanceFogFactor = mix(
  min(fogFactor, uHorizonFog.z),
  1.0,
  horizonFogProgress
);
vec3 distanceFogColor = mix(
  uFogColor,
  uHorizonColor,
  horizonFogProgress
);
color = mix(
  color,
  distanceFogColor,
  clamp(distanceFogFactor, 0.0, 1.0)
);
```

Create one `Vector3` in the constructor.

Update it in place during `setQuality`.

- [x] **Step 6: Run focused tests**

Run:

```powershell
bunx vitest run tests/OceanRenderer.test.ts tests/WaveField.test.ts tests/BoatWorld.test.ts
```

Expected: 47 tests pass.

- [x] **Step 7: Run all automated checks**

Run:

```powershell
bun run test
bun run build
```

Expected: all tests, TypeScript, and Vite build pass.

- [x] **Step 8: Inspect the clear-day horizon**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Confirm wave structure continues into the middle distance.

Confirm the fog completes only near the true horizon.

Confirm no flat cyan slab remains.

- [x] **Step 9: Commit the revision**

```powershell
git add -- src/ocean/OceanRenderer.ts tests/OceanRenderer.test.ts
git commit -m "fix: grade ocean horizon geometry"
```
