# Dual-Layer Ocean Whitecaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make moderate broken foam visible on ordinary wave crests and add thin bright caps to the tallest ridges.

**Architecture:** `OceanRenderer` keeps its existing single procedural draw call. The fragment shader replaces the one-layer `crestFoam()` mask with `foamBody()` and `foamCap()`, combines each with its own breakup and distance response, then applies separate color mixes while preserving wave displacement, direct-light synchronization, fog, and exclusions.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, GLSL through `ShaderMaterial`, Vitest 3.2, Vite 7

## Global Constraints

- Target desktop web browsers at 1280 by 720 and 1920 by 1080.
- Add foam only to ocean wave crests; add no hull wake or shoreline foam.
- Keep one ocean plane, one material, and one draw call.
- Add no texture lookup, render pass, geometry, particle system, allocation, runtime asset, or persistent foam simulation.
- Keep wave displacement, CPU buoyancy, weather amplitude, exclusions, fog, celestial-light synchronization, and reduced-motion behavior unchanged.
- Keep `OceanRenderer.constructor`, `update()`, `setExclusions()`, `follow()`, and `dispose()` signatures unchanged.
- Retain `foamBreakup()`, replace `crestFoam()` with `foamBody()`, and add `foamCap()`.
- Make `foamCap()` multiply its result by the body foam response so caps cannot form as an independent layer.
- Run the focused ocean tests, full test suite, typecheck, and production build.

---

## File Structure

- Modify `src/ocean/OceanRenderer.ts`: body foam, bright crest caps, weather scaling, distance fading, glint suppression, and two-stage foam color mixing.
- Modify `tests/OceanRenderer.test.ts`: focused shader contract for layer dependency, weather response, distance fade, lighting interaction, and removal of the former single-layer helper.
- Do not modify `src/world/World.ts`, `src/survival/BoatWorld.ts`, `src/ocean/WaveField.ts`, or any concurrent UI and post-processing work.

### Task 1: Dual-Layer Procedural Whitecaps

**Files:**
- Modify: `tests/OceanRenderer.test.ts`
- Modify: `src/ocean/OceanRenderer.ts`

**Interfaces:**
- Consumes: `vHeight`, `vWaveSlope`, `vViewDepth`, `uAmplitudeScale`, `uDetailFade`, `uFoamColor`, and the existing `foamBreakup(vec2)` helper.
- Produces: `foamBody(float, float) -> float`, `foamCap(float, float, float) -> float`, `bodyFoam`, `capFoam`, and a clamped combined foam amount.

- [ ] **Step 1: Write the failing dual-layer foam contract test**

Append this test inside `describe('OceanRenderer', ...)` in `tests/OceanRenderer.test.ts`:

```ts
it('layers bright crest caps inside broader weather-scaled foam patches', () => {
  const ocean = new OceanRenderer();
  const shader = ocean.material.fragmentShader;

  expect(shader).toContain('float foamBody(');
  expect(shader).toContain('float foamCap(');
  expect(shader).toContain('return bodyFoam * crest * breaking * coverage;');
  expect(shader).toContain('float bodyFoam = foamBody(vHeight, vWaveSlope)');
  expect(shader).toContain('float capFoam = foamCap(vHeight, vWaveSlope, bodyFoam)');
  expect(shader).toContain('float bodyDistanceFade =');
  expect(shader).toContain('float capDistanceFade =');
  expect(shader).toContain('float foam = clamp(bodyFoam + capFoam, 0.0, 1.0);');
  expect(shader).toContain('foam * 0.72 + capFoam * 0.22');
  expect(shader).toContain('color = mix(color, uFoamColor, bodyFoam * 0.60);');
  expect(shader).toContain('color = mix(color, uFoamColor, capFoam * 0.88);');
  expect(shader).not.toContain('float crestFoam(');

  ocean.dispose();
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts
```

Expected: FAIL at `float foamBody(` because the current shader still defines `crestFoam()` and one combined `foam` mask.

- [ ] **Step 3: Replace the single crest helper with body and cap helpers**

In the fragment shader in `src/ocean/OceanRenderer.ts`, replace the complete `crestFoam()` function with:

```glsl
float foamBody(float waveHeight, float waveSlope) {
  float roughness = clamp((uAmplitudeScale - 0.85) / 0.65, 0.0, 1.0);
  float crestStart = mix(0.45, 0.30, roughness);
  float slopeStart = mix(0.19, 0.12, roughness);
  float crest = smoothstep(crestStart, crestStart + 0.30, waveHeight);
  float breaking = smoothstep(slopeStart, slopeStart + 0.25, waveSlope);
  float coverage = mix(0.78, 0.98, roughness);
  return crest * breaking * coverage;
}

float foamCap(float waveHeight, float waveSlope, float bodyFoam) {
  float roughness = clamp((uAmplitudeScale - 0.85) / 0.65, 0.0, 1.0);
  float crestStart = mix(0.61, 0.43, roughness);
  float slopeStart = mix(0.29, 0.19, roughness);
  float crest = smoothstep(crestStart, crestStart + 0.18, waveHeight);
  float breaking = smoothstep(slopeStart, slopeStart + 0.18, waveSlope);
  float coverage = mix(0.68, 0.90, roughness);
  return bodyFoam * crest * breaking * coverage;
}
```

- [ ] **Step 4: Replace the single foam mask and color mix**

Replace the existing block that begins with `float foam = crestFoam(...)` and ends with `color = mix(color, uFoamColor, foam * 0.74);` with:

```glsl
float bodyBreakup = foamBreakup(vWorldPosition.xz);
float bodyFoam = foamBody(vHeight, vWaveSlope) * bodyBreakup;
float capBreakup = foamBreakup(
  vWorldPosition.xz * 1.17 + vec2(uTime * 0.08, -uTime * 0.05)
);
float capFoam = foamCap(vHeight, vWaveSlope, bodyFoam)
  * smoothstep(0.48, 0.80, capBreakup);
float bodyDistanceFade = 1.0 - smoothstep(
  uDetailFade.y * 0.62,
  uDetailFade.y * 0.94,
  vViewDepth
);
float capDistanceFade = 1.0 - smoothstep(
  uDetailFade.y * 0.48,
  uDetailFade.y * 0.78,
  vViewDepth
);
bodyFoam *= bodyDistanceFade;
capFoam *= capDistanceFade;
float foam = clamp(bodyFoam + capFoam, 0.0, 1.0);
color += uSunColor * (sunCore + sunSheen) * uDirectLightStrength
  * (1.0 - clamp(foam * 0.72 + capFoam * 0.22, 0.0, 0.94));
color = mix(color, uFoamColor, bodyFoam * 0.60);
color = mix(color, uFoamColor, capFoam * 0.88);
```

- [ ] **Step 5: Run focused tests and confirm the green state**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts tests/WaterExclusion.test.ts tests/WaveField.test.ts
```

Expected: PASS for all focused ocean, exclusion, and shared-wave tests.

- [ ] **Step 6: Run typecheck and the full suite**

Run:

```powershell
bun run typecheck
bun run test
```

Expected: both commands exit 0. Existing GLTF loader warnings may remain, but no ocean or shader-contract test may fail.

- [ ] **Step 7: Commit the whitecaps implementation**

```powershell
git add -- src/ocean/OceanRenderer.ts tests/OceanRenderer.test.ts
git commit -m "feat: add visible ocean whitecaps"
```

### Task 2: Production Build and Visual Verification

**Files:**
- Verify: `src/ocean/OceanRenderer.ts`
- Verify: `tests/OceanRenderer.test.ts`

**Interfaces:**
- Consumes: the complete dual-layer foam shader from Task 1.
- Produces: verified production output with no tracked source change unless verification exposes a defect.

- [ ] **Step 1: Run the production build**

Run:

```powershell
bun run build
git diff --check
git status --short
```

Expected: build and whitespace checks exit 0. Status contains no uncommitted `OceanRenderer` or ocean-test files.

- [ ] **Step 2: Start the local game**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL and the server returns HTTP 200.

- [ ] **Step 3: Inspect daylight scavenging**

At 1280 by 720 and 1920 by 1080, inspect water from the freighter deck and lifeboat station. Confirm:

- moderate broken body foam appears on some ordinary high crests;
- narrow bright caps stay inside the body patches;
- dark water separates neighboring patches;
- body foam and caps fade before the horizon without persistent shimmer;
- hull exclusions remain aligned and no foam appears inside vessel bounds.

- [ ] **Step 4: Inspect survival weather and night**

Inspect calm daylight, squall daylight, and night. Confirm:

- calm water keeps scattered moderate foam rather than constant white cover;
- squalls increase body coverage and cap length within visible dark gaps;
- direct sun highlights weaken beneath body foam and caps;
- night foam remains desaturated and carries no golden direct-sun glow;
- boat motion remains synchronized with the large visible waves.

- [ ] **Step 5: Record blocked visual checks honestly**

If the authorized in-app browser backend remains unavailable, record the exact backend error and browser-list result. Do not substitute another browser surface when its skill forbids that workaround. Report automated verification separately from blocked visual acceptance.
