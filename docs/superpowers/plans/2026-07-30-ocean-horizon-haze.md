# Ocean Horizon Haze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the coarse ocean grid join with a low-cost horizon haze ramp.

**Architecture:** `OceanRenderer` owns one reusable haze uniform. The fragment shader blends distant water toward atmospheric color before the existing weather fog.

**Tech Stack:** TypeScript, Three.js GLSL, Vitest, Vite

## Global Constraints

Add no geometry, texture, render pass, draw call, or frame allocation.

Keep the current shared wave field unchanged.

Use low settings `55`, `180`, and `0.76`.

Use high settings `65`, `220`, and `0.65`.

Mix haze color from fog color and 22 percent horizon color.

Keep existing fog and ordered dither after the haze blend.

Do not add reduced-motion behavior.

---

## File Structure

- Modify `src/ocean/OceanRenderer.ts`.
  It owns water quality values, uniforms, shader code, and resource disposal.
- Create `tests/OceanRenderer.test.ts`.
  It protects haze settings, uniform reuse, and safe disposal.

### Task 1: Add the horizon haze ramp

**Files:**
- Modify: `src/ocean/OceanRenderer.ts:20-824`
- Create: `tests/OceanRenderer.test.ts`

**Interfaces:**
- Consumes: `WaterQuality`, `OceanRenderer.material`, and `OceanRenderer.setQuality`.
- Produces: `OceanSurfaceQuality.horizonHazeStart: number`.
- Produces: `OceanSurfaceQuality.horizonHazeEnd: number`.
- Produces: `OceanSurfaceQuality.horizonHazeStrength: number`.
- Produces: shader uniform `uHorizonHaze: Vector3`.

- [ ] **Step 1: Write failing quality and ownership tests**

Create `tests/OceanRenderer.test.ts`:

```ts
// Importance: 4/5. Protects the cheap horizon transition and uniform ownership.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  OCEAN_SURFACE_QUALITY,
  OceanRenderer,
} from '../src/ocean/OceanRenderer';

describe('OceanRenderer horizon haze', () => {
  it.each([
    ['low', [55, 180, 0.76]],
    ['high', [65, 220, 0.65]],
  ] as const)('uses the %s quality haze settings', (quality, expected) => {
    const ocean = new OceanRenderer(quality);

    expect([
      OCEAN_SURFACE_QUALITY[quality].horizonHazeStart,
      OCEAN_SURFACE_QUALITY[quality].horizonHazeEnd,
      OCEAN_SURFACE_QUALITY[quality].horizonHazeStrength,
    ]).toEqual(expected);
    expect(
      (ocean.material.uniforms.uHorizonHaze!.value as Vector3).toArray(),
    ).toEqual(expected);

    ocean.dispose();
  });

  it('updates the existing haze uniform when quality changes', () => {
    const ocean = new OceanRenderer('low');
    const haze = ocean.material.uniforms.uHorizonHaze!.value as Vector3;

    ocean.setQuality('high');

    expect(ocean.material.uniforms.uHorizonHaze!.value).toBe(haze);
    expect(haze.toArray()).toEqual([65, 220, 0.65]);
    ocean.dispose();
  });

  it('disposes safely after a quality change', () => {
    const ocean = new OceanRenderer('low');

    ocean.setQuality('high');
    expect(() => ocean.dispose()).not.toThrow();
    expect(() => ocean.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```powershell
bunx vitest run tests/OceanRenderer.test.ts
```

Expected: fail because haze quality fields and `uHorizonHaze` do not exist.

- [ ] **Step 3: Add exact quality settings**

Add these fields to `OceanSurfaceQuality`:

```ts
horizonHazeStart: number;
horizonHazeEnd: number;
horizonHazeStrength: number;
```

Add these low settings:

```ts
horizonHazeStart: 55,
horizonHazeEnd: 180,
horizonHazeStrength: 0.76,
```

Add these high settings:

```ts
horizonHazeStart: 65,
horizonHazeEnd: 220,
horizonHazeStrength: 0.65,
```

- [ ] **Step 4: Add the shader uniform and blend**

Add this fragment shader uniform:

```glsl
uniform vec3 uHorizonHaze;
```

Add this code immediately before the current exponential fog:

```glsl
float horizonHaze = smoothstep(
  uHorizonHaze.x,
  uHorizonHaze.y,
  vViewDepth
) * uHorizonHaze.z;
vec3 hazeColor = mix(uFogColor, uHorizonColor, 0.22);
color = mix(color, hazeColor, horizonHaze);
```

Keep the existing fog and ordered dither code after this blend.

- [ ] **Step 5: Create and update the uniform without frame allocations**

Add this constructor uniform:

```ts
uHorizonHaze: {
  value: new Vector3(
    surfaceQuality.horizonHazeStart,
    surfaceQuality.horizonHazeEnd,
    surfaceQuality.horizonHazeStrength,
  ),
},
```

Add this in-place update to `setQuality`:

```ts
(this.material.uniforms.uHorizonHaze!.value as Vector3).set(
  surfaceQuality.horizonHazeStart,
  surfaceQuality.horizonHazeEnd,
  surfaceQuality.horizonHazeStrength,
);
```

Do not add work to `update`, `follow`, or `dispose`.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
bunx vitest run tests/OceanRenderer.test.ts tests/WaveField.test.ts tests/BoatWorld.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Run all automated checks**

Run:

```powershell
bun run test
bun run build
```

Expected: all tests pass. TypeScript and Vite builds pass.

- [ ] **Step 8: Check the clear-day horizon**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Open the starting screen at the local Vite URL.

Confirm the near water keeps its waves, foam, and contrast.

Confirm haze begins before the coarse grid join.

Confirm the flat distant band is not visible.

Confirm the horizon fades into the current sky palette.

- [ ] **Step 9: Commit the implementation**

```powershell
git add -- src/ocean/OceanRenderer.ts tests/OceanRenderer.test.ts
git commit -m "fix: blend ocean into horizon haze"
```
