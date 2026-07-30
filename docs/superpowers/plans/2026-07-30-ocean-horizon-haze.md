# Ocean Horizon Haze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the coarse ocean grid join with a low-cost horizon haze ramp.

**Architecture:** `OceanRenderer` owns reusable haze and detail uniforms. The shader keeps subtle distant ripples and moves far fog toward the sky horizon color.

**Tech Stack:** TypeScript, Three.js GLSL, Vitest, Vite

## Global Constraints

Add no geometry, texture, render pass, draw call, or frame allocation.

Keep the current shared wave field unchanged.

Use low haze settings `85`, `260`, and `1`.

Use high haze settings `100`, `320`, and `1`.

Use detail floors `0.11` for low and `0.08` for high.

Blend the fog target toward the horizon color.

Keep existing fog strength and ordered dither.

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
- Produces: `OceanSurfaceQuality.distantDetailStrength: number`.
- Produces: shader uniform `uHorizonHaze: Vector3`.
- Produces: shader uniform `uDistantDetailStrength: number`.

- [x] **Step 1: Write failing quality and ownership tests**

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
    ['low', [85, 260, 1], 0.11],
    ['high', [100, 320, 1], 0.08],
  ] as const)('uses the %s quality distance settings', (
    quality,
    expectedHaze,
    expectedDetail,
  ) => {
    const ocean = new OceanRenderer(quality);

    expect([
      OCEAN_SURFACE_QUALITY[quality].horizonHazeStart,
      OCEAN_SURFACE_QUALITY[quality].horizonHazeEnd,
      OCEAN_SURFACE_QUALITY[quality].horizonHazeStrength,
    ]).toEqual(expectedHaze);
    expect(
      OCEAN_SURFACE_QUALITY[quality].distantDetailStrength,
    ).toBe(expectedDetail);
    expect(
      (ocean.material.uniforms.uHorizonHaze!.value as Vector3).toArray(),
    ).toEqual(expectedHaze);
    expect(
      ocean.material.uniforms.uDistantDetailStrength!.value,
    ).toBe(expectedDetail);

    ocean.dispose();
  });

  it('updates the existing haze uniform when quality changes', () => {
    const ocean = new OceanRenderer('low');
    const haze = ocean.material.uniforms.uHorizonHaze!.value as Vector3;

    ocean.setQuality('high');

    expect(ocean.material.uniforms.uHorizonHaze!.value).toBe(haze);
    expect(haze.toArray()).toEqual([100, 320, 1]);
    expect(ocean.material.uniforms.uDistantDetailStrength!.value).toBe(0.08);
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

- [x] **Step 2: Run the focused test and confirm failure**

Run:

```powershell
bunx vitest run tests/OceanRenderer.test.ts
```

Expected: fail because haze quality fields and `uHorizonHaze` do not exist.

- [x] **Step 3: Add exact quality settings**

Add these fields to `OceanSurfaceQuality`:

```ts
horizonHazeStart: number;
horizonHazeEnd: number;
horizonHazeStrength: number;
distantDetailStrength: number;
```

Add these low settings:

```ts
horizonHazeStart: 85,
horizonHazeEnd: 260,
horizonHazeStrength: 1,
distantDetailStrength: 0.11,
```

Add these high settings:

```ts
horizonHazeStart: 100,
horizonHazeEnd: 320,
horizonHazeStrength: 1,
distantDetailStrength: 0.08,
```

- [x] **Step 4: Add the shader uniform and blend**

Add this fragment shader uniform:

```glsl
uniform vec3 uHorizonHaze;
uniform float uDistantDetailStrength;
```

Add this code immediately before the current exponential fog:

```glsl
float horizonHaze = smoothstep(
  uHorizonHaze.x,
  uHorizonHaze.y,
  vViewDepth
) * uHorizonHaze.z;
float fogFactor = 1.0 - exp(
  -uFogDensity * uFogDensity * vViewDepth * vViewDepth
);
vec3 distanceFogColor = mix(uFogColor, uHorizonColor, horizonHaze);
color = mix(color, distanceFogColor, clamp(fogFactor, 0.0, 1.0));
```

Keep ordered dither after this blend.

Retain medium ripple detail with:

```glsl
float distanceBlend = 1.0 - smoothstep(
  uDetailFade.x,
  uDetailFade.y,
  vViewDepth
);
float distanceFade = mix(
  uDistantDetailStrength,
  1.0,
  distanceBlend
);
```

- [x] **Step 5: Create and update the uniform without frame allocations**

Add this constructor uniform:

```ts
uHorizonHaze: {
  value: new Vector3(
    surfaceQuality.horizonHazeStart,
    surfaceQuality.horizonHazeEnd,
    surfaceQuality.horizonHazeStrength,
  ),
},
uDistantDetailStrength: {
  value: surfaceQuality.distantDetailStrength,
},
```

Add this in-place update to `setQuality`:

```ts
(this.material.uniforms.uHorizonHaze!.value as Vector3).set(
  surfaceQuality.horizonHazeStart,
  surfaceQuality.horizonHazeEnd,
  surfaceQuality.horizonHazeStrength,
);
this.material.uniforms.uDistantDetailStrength!.value =
  surfaceQuality.distantDetailStrength;
```

Do not add work to `update`, `follow`, or `dispose`.

- [x] **Step 6: Run focused tests**

Run:

```powershell
bunx vitest run tests/OceanRenderer.test.ts tests/WaveField.test.ts tests/BoatWorld.test.ts
```

Expected: all focused tests pass.

- [x] **Step 7: Run all automated checks**

Run:

```powershell
bun run test
bun run build
```

Expected: all tests pass. TypeScript and Vite builds pass.

- [x] **Step 8: Check the clear-day horizon**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Open the starting screen at the local Vite URL.

Confirm the near water keeps its waves, foam, and contrast.

Confirm haze begins before the coarse grid join.

Confirm the flat distant band is not visible.

Confirm the horizon fades into the current sky palette.

- [x] **Step 9: Commit the implementation**

```powershell
git add -- src/ocean/OceanRenderer.ts tests/OceanRenderer.test.ts
git commit -m "fix: blend ocean into horizon haze"
```
