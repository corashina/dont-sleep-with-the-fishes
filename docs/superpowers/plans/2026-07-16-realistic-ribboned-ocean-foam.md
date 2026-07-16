# Realistic Ribboned Ocean Foam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the barely visible sine-based foam with wind-aligned, domain-warped whitewater ribbons that remain readable in calm water and grow naturally with rough weather.

**Architecture:** `OceanRenderer` keeps its existing plane, `ShaderMaterial`, uniforms, and single draw call. The fragment shader generates fixed-cost value noise in world-space wind coordinates, uses that signal to shape a broad foam body and a nested bright cap, then fades fine edges, caps, and body at separate distances before existing fog and dithering.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, GLSL through `ShaderMaterial`, Vitest 3.2, Vite 7

## Global Constraints

- Change only the ocean fragment shader and focused ocean tests.
- Keep the existing ocean mesh, wave displacement, buoyancy, exclusions, atmosphere, lighting, fog, ordered dithering, and public API.
- Do not add texture files, geometry, particles, render passes, runtime allocations, public methods, uniforms, draw calls, dependencies, or third-party assets.
- Use world-space coordinates and the established normalized wind vector `vec2(0.83, 0.56)` so foam does not move with the camera.
- Move foam slowly along that wind vector using `uTime`; do not create a persistent simulation.
- Target nearby surface coverage of 7% to 10% for calm water, 12% to 16% for normal water, and 20% to 28% for squalls.
- Keep every bright cap inside the finished broad foam body.
- Fade fine edge noise before the cap, and fade the cap before the broad body.
- Derive foam color from `uFoamColor`, with only a small `uSunColor` contribution gated by `uDirectLightStrength`, so night foam keeps the scene tint.
- Clamp weather values and finished masks. Every `smoothstep` call must use distinct lower and upper edges.
- Use a fixed noise budget with no FBM loop and no texture lookup.
- At 1920 by 1080, keep the title-scene average frame rate within 5% of the existing ocean under the same 10-second capture.
- Preserve every unrelated workspace change and stage only the two foam implementation files in Tasks 1 and 2.

---

## File Structure

- Modify `src/ocean/OceanRenderer.ts`: replace `foamBreakup()` with deterministic value-noise helpers, build domain-warped wind ribbons, lower the crest envelopes, erode nearby edges, nest the cap, and apply ordered distance and color treatment.
- Modify `tests/OceanRenderer.test.ts`: replace the old sine-breakup expectations with contracts for the procedural helpers, wind-space domain warp, weather thresholds, nested masks, separate distance fades, clamping, and tinted cap color.
- Do not modify `src/ocean/WaveField.ts`, `src/ocean/WaterExclusion.ts`, `src/world/World.ts`, `src/survival/BoatWorld.ts`, or any UI/post-processing file.

### Task 1: Domain-Warped Wind Ribbon Signal

**Files:**
- Modify: `tests/OceanRenderer.test.ts:29-43`
- Modify: `src/ocean/OceanRenderer.ts:140-154`
- Modify: `src/ocean/OceanRenderer.ts:233-239`

**Interfaces:**
- Consumes: `uTime`, `vWorldPosition.xz`, and the established wind vector `normalize(vec2(0.83, 0.56))`.
- Produces: `hash21(vec2) -> float`, `valueNoise(vec2) -> float`, `foamRibbonNoise(vec2) -> float`, and `foamEdgeNoise(vec2) -> float`, all local to the fragment shader.

- [ ] **Step 1: Record the pre-change 1080p performance baseline**

Run the current game before changing the shader:

```powershell
bun run dev -- --host 127.0.0.1
```

At a 1920 by 1080 viewport, allow the title scene to warm up for 10 seconds. Record the built-in FPS reading once per second for the next 10 seconds and calculate:

```text
baselineAverage = (sample1 + sample2 + ... + sample10) / 10
```

Expected: the page loads, the browser console contains no shader compilation error, and the ten samples plus `baselineAverage` are recorded in the execution notes. If browser automation cannot establish the viewport, record that limitation now and reserve the comparison for a manual pass on the same machine.

- [ ] **Step 2: Replace the old breakup contract with a failing procedural-noise contract**

In `tests/OceanRenderer.test.ts`, replace the test named `includes layered chop, broken foam, and two-scale sun light` with:

```ts
it('builds domain-warped foam ribbons in world-space wind coordinates', () => {
  const ocean = new OceanRenderer();
  const shader = ocean.material.fragmentShader;

  expect(shader).toContain('vec2 windWarp(');
  expect(shader).toContain('vec2 warpedDetailSlope(');
  expect(shader).toContain('float hash21(vec2 position)');
  expect(shader).toContain('float valueNoise(vec2 position)');
  expect(shader).toContain('float foamRibbonNoise(vec2 worldPosition)');
  expect(shader).toContain('float foamEdgeNoise(vec2 worldPosition)');
  expect(shader).toContain(
    'vec2 windSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));',
  );
  expect(shader).toContain('vec2 warpedSpace = windSpace + vec2(');
  expect(shader).toContain('float coarse = valueNoise(');
  expect(shader).toContain('float medium = valueNoise(');
  expect(shader).toContain('float edge = valueNoise(');
  expect(shader).not.toContain('float foamBreakup(');
  expect(shader).toContain('float sunCore =');
  expect(shader).toContain('float sunSheen =');
  expect(shader).not.toContain('vec2 rippleSlope(');

  ocean.dispose();
});
```

- [ ] **Step 3: Run the focused test and verify the red state**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts
```

Expected: FAIL because the current shader does not contain `float hash21(vec2 position)` and still contains `float foamBreakup(`.

- [ ] **Step 4: Replace `foamBreakup()` with fixed-cost procedural helpers**

In the fragment shader in `src/ocean/OceanRenderer.ts`, replace the complete `foamBreakup()` function with:

```glsl
float hash21(vec2 position) {
  vec2 seed = fract(position * vec2(123.34, 456.21));
  seed += dot(seed, seed + 45.32);
  return fract(seed.x * seed.y);
}

float valueNoise(vec2 position) {
  vec2 cell = floor(position);
  vec2 fractional = fract(position);
  vec2 blend = fractional * fractional * (3.0 - 2.0 * fractional);
  float lower = mix(
    hash21(cell),
    hash21(cell + vec2(1.0, 0.0)),
    blend.x
  );
  float upper = mix(
    hash21(cell + vec2(0.0, 1.0)),
    hash21(cell + vec2(1.0, 1.0)),
    blend.x
  );
  return mix(lower, upper, blend.y);
}

float foamRibbonNoise(vec2 worldPosition) {
  vec2 wind = normalize(vec2(0.83, 0.56));
  vec2 crossWind = vec2(-wind.y, wind.x);
  vec2 drifted = worldPosition + wind * uTime * 0.24;
  vec2 windSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));
  float warpAlong = valueNoise(
    windSpace * vec2(0.075, 0.21) + vec2(8.7, -3.2)
  );
  float warpAcross = valueNoise(
    windSpace * vec2(0.11, 0.16) + vec2(-4.1, 6.8)
  );
  vec2 warpedSpace = windSpace + vec2(
    (warpAlong - 0.5) * 3.4,
    (warpAcross - 0.5) * 1.8
  );
  float coarse = valueNoise(warpedSpace * vec2(0.11, 0.34));
  float medium = valueNoise(
    warpedSpace * vec2(0.26, 0.78) + vec2(13.6, -9.4)
  );
  return clamp(coarse * 0.62 + medium * 0.38, 0.0, 1.0);
}

float foamEdgeNoise(vec2 worldPosition) {
  vec2 wind = normalize(vec2(0.83, 0.56));
  vec2 crossWind = vec2(-wind.y, wind.x);
  vec2 drifted = worldPosition + wind * uTime * 0.31;
  vec2 edgeSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));
  float edge = valueNoise(edgeSpace * vec2(0.72, 1.46) + vec2(2.9, 17.3));
  return edge;
}
```

This uses two value-noise samples for one domain warp, two samples for the broad signal, and one fine sample. It adds no loop, texture lookup, uniform, or allocation.

- [ ] **Step 5: Keep the intermediate shader valid by switching existing callers**

In the fragment shader `main()`, replace both existing `foamBreakup(` calls with `foamRibbonNoise(`. Do not change the current `foamBody()`, `foamCap()`, distance fades, or color mixes yet.

The intermediate block must read:

```glsl
float bodyBreakup = foamRibbonNoise(vWorldPosition.xz);
float bodyFoam = foamBody(vHeight, vWaveSlope) * bodyBreakup;
float capBreakup = foamRibbonNoise(
  vWorldPosition.xz * 1.17 + vec2(uTime * 0.08, -uTime * 0.05)
);
float capFoam = foamCap(vHeight, vWaveSlope, bodyFoam)
  * smoothstep(0.48, 0.80, capBreakup);
```

- [ ] **Step 6: Run the focused test and confirm the green state**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts
```

Expected: PASS for all `OceanRenderer` tests. The new helper test passes, and the existing body/cap contract remains green because Task 1 has not changed those helpers.

- [ ] **Step 7: Commit the procedural ribbon signal**

```powershell
git add -- src/ocean/OceanRenderer.ts tests/OceanRenderer.test.ts
git commit -m "feat: add procedural ocean foam ribbons"
```

### Task 2: Weather-Scaled Body, Nested Cap, and Ordered Detail Fades

**Files:**
- Modify: `tests/OceanRenderer.test.ts:88-108`
- Modify: `src/ocean/OceanRenderer.ts:156-174`
- Modify: `src/ocean/OceanRenderer.ts:233-256`

**Interfaces:**
- Consumes: `foamRibbonNoise(vec2)`, `foamEdgeNoise(vec2)`, `uAmplitudeScale`, `uDetailFade`, `uFoamColor`, `uSunColor`, `uDirectLightStrength`, `vHeight`, `vWaveSlope`, and `vViewDepth`.
- Produces: `foamBody(float, float, float, float, float) -> float`, `foamCap(float, float, float, float) -> float`, distance-faded `bodyFoam`, nested `capFoam`, and clamped `foam`.

- [ ] **Step 1: Replace the former layer test with failing mask and composition contracts**

In `tests/OceanRenderer.test.ts`, replace the test named `layers bright crest caps inside broader weather-scaled foam patches` with these two tests:

```ts
it('uses weather-scaled ribbon thresholds and nearby edge erosion', () => {
  const ocean = new OceanRenderer();
  const shader = ocean.material.fragmentShader;

  expect(shader).toContain(
    'float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);',
  );
  expect(shader).toContain('float crestStart = mix(0.31, 0.13, weather);');
  expect(shader).toContain('float slopeStart = mix(0.11, 0.055, weather);');
  expect(shader).toContain('float ribbonStart = mix(0.57, 0.42, weather);');
  expect(shader).toContain(
    'float erodedEdge = smoothstep(0.20, 0.68, edgeNoise);',
  );
  expect(shader).toContain(
    'float edgeMask = mix(1.0, mix(0.72, 1.0, erodedEdge), fineFade);',
  );
  expect(shader).toContain(
    'return clamp(crestEnvelope * ribbon * edgeMask * strength, 0.0, 1.0);',
  );

  ocean.dispose();
});

it('nests cream crest caps inside distance-faded foam bodies', () => {
  const ocean = new OceanRenderer();
  const shader = ocean.material.fragmentShader;
  const bodyFadeIndex = shader.indexOf('bodyFoam *= bodyDistanceFade;');
  const capIndex = shader.indexOf(
    'float capFoam = foamCap(vHeight, vWaveSlope, bodyFoam, ribbonNoise);',
  );

  expect(shader).toContain('float foamBody(');
  expect(shader).toContain('float foamCap(');
  expect(shader).toContain(
    'return clamp(bodyFoam * crest * breaking * ribbonCore * strength, 0.0, 1.0);',
  );
  expect(shader).toContain('float fineDetailFade =');
  expect(shader).toContain('float bodyDistanceFade =');
  expect(shader).toContain('float capDistanceFade =');
  expect(bodyFadeIndex).toBeGreaterThan(-1);
  expect(capIndex).toBeGreaterThan(bodyFadeIndex);
  expect(shader).toContain('float foam = clamp(bodyFoam + capFoam, 0.0, 1.0);');
  expect(shader).toContain(
    'vec3 capFoamColor = mix(uFoamColor, uSunColor, 0.08 * uDirectLightStrength);',
  );
  expect(shader).toContain('color = mix(color, uFoamColor, bodyFoam * 0.64);');
  expect(shader).toContain('color = mix(color, capFoamColor, capFoam * 0.90);');
  expect(shader).not.toContain('float crestFoam(');

  ocean.dispose();
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts
```

Expected: FAIL because the current helpers use `roughness`, the old thresholds, and no edge-noise or `fineDetailFade` inputs.

- [ ] **Step 3: Replace the body and cap helpers**

In the fragment shader in `src/ocean/OceanRenderer.ts`, replace the complete `foamBody()` and `foamCap()` functions with:

```glsl
float foamBody(
  float waveHeight,
  float waveSlope,
  float ribbonNoise,
  float edgeNoise,
  float fineFade
) {
  float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
  float crestStart = mix(0.31, 0.13, weather);
  float crestWidth = mix(0.30, 0.24, weather);
  float slopeStart = mix(0.11, 0.055, weather);
  float slopeWidth = mix(0.23, 0.17, weather);
  float crest = smoothstep(crestStart, crestStart + crestWidth, waveHeight);
  float breaking = smoothstep(slopeStart, slopeStart + slopeWidth, waveSlope);
  float crestEnvelope = crest * mix(0.62, 1.0, breaking);
  float ribbonStart = mix(0.57, 0.42, weather);
  float ribbon = smoothstep(ribbonStart, ribbonStart + 0.18, ribbonNoise);
  float erodedEdge = smoothstep(0.20, 0.68, edgeNoise);
  float edgeMask = mix(1.0, mix(0.72, 1.0, erodedEdge), fineFade);
  float strength = mix(0.92, 1.12, weather);
  return clamp(crestEnvelope * ribbon * edgeMask * strength, 0.0, 1.0);
}

float foamCap(
  float waveHeight,
  float waveSlope,
  float bodyFoam,
  float ribbonNoise
) {
  float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
  float crestStart = mix(0.48, 0.29, weather);
  float slopeStart = mix(0.22, 0.13, weather);
  float crest = smoothstep(crestStart, crestStart + 0.18, waveHeight);
  float breaking = smoothstep(slopeStart, slopeStart + 0.16, waveSlope);
  float ribbonStart = mix(0.68, 0.55, weather);
  float ribbonCore = smoothstep(ribbonStart, ribbonStart + 0.15, ribbonNoise);
  float strength = mix(0.80, 1.0, weather);
  return clamp(bodyFoam * crest * breaking * ribbonCore * strength, 0.0, 1.0);
}
```

The calm thresholds deliberately begin lower than the old `0.45` crest and `0.19` slope thresholds. Weather lowers the thresholds further while raising strength, but the clamped weather parameter prevents extrapolation beyond calm and squall values.

- [ ] **Step 4: Replace the foam composition block**

In fragment shader `main()`, replace the complete block from `float bodyBreakup =` through the second foam color mix with:

```glsl
float ribbonNoise = foamRibbonNoise(vWorldPosition.xz);
float edgeNoise = foamEdgeNoise(vWorldPosition.xz);
float fineDetailFade = 1.0 - smoothstep(
  uDetailFade.x * 0.72,
  uDetailFade.x,
  vViewDepth
);
float bodyFoam = foamBody(
  vHeight,
  vWaveSlope,
  ribbonNoise,
  edgeNoise,
  fineDetailFade
);
float bodyDistanceFade = 1.0 - smoothstep(
  uDetailFade.y * 0.62,
  uDetailFade.y * 0.96,
  vViewDepth
);
bodyFoam *= bodyDistanceFade;
float capFoam = foamCap(vHeight, vWaveSlope, bodyFoam, ribbonNoise);
float capDistanceFade = 1.0 - smoothstep(
  uDetailFade.y * 0.48,
  uDetailFade.y * 0.74,
  vViewDepth
);
capFoam *= capDistanceFade;
float foam = clamp(bodyFoam + capFoam, 0.0, 1.0);
color += uSunColor * (sunCore + sunSheen) * uDirectLightStrength
  * (1.0 - clamp(foam * 0.72 + capFoam * 0.22, 0.0, 0.94));
vec3 capFoamColor = mix(uFoamColor, uSunColor, 0.08 * uDirectLightStrength);
color = mix(color, uFoamColor, bodyFoam * 0.64);
color = mix(color, capFoamColor, capFoam * 0.90);
```

The ordering is part of the contract: fine detail reaches zero by `uDetailFade.x`, the cap is shorter-ranged than the body, and `bodyFoam` receives its distance fade before `foamCap()` multiplies it.

- [ ] **Step 5: Run the focused ocean tests and confirm the green state**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts tests/WaterExclusion.test.ts tests/WaveField.test.ts
```

Expected: PASS for 19 focused tests: 7 `OceanRenderer` tests, 7 `WaterExclusion` tests, and 5 `WaveField` tests.

- [ ] **Step 6: Run type checking before the task commit**

Run:

```powershell
bun run typecheck
```

Expected: exit 0 with no TypeScript diagnostics.

- [ ] **Step 7: Commit the finished foam composition**

```powershell
git add -- src/ocean/OceanRenderer.ts tests/OceanRenderer.test.ts
git commit -m "feat: make ocean foam visible and weather responsive"
```

### Task 3: Automated, Visual, and Performance Verification

**Files:**
- Verify: `src/ocean/OceanRenderer.ts`
- Verify: `tests/OceanRenderer.test.ts`
- Do not create or commit screenshots, performance logs, `dist`, or browser console dumps.

**Interfaces:**
- Consumes: the procedural ribbon signal and finished body/cap composition from Tasks 1 and 2.
- Produces: test, shader-compilation, coverage, visual-quality, and frame-rate evidence; no source change unless a failed check sends execution back through the Task 2 red-green cycle.

- [ ] **Step 1: Run all repository verification commands**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts tests/WaterExclusion.test.ts tests/WaveField.test.ts
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: every command exits 0. The focused run passes 19 tests, the full suite passes without new failures, Vite produces the production bundle, and the whitespace check prints no errors. Existing GLTF loader warnings may remain if they are unchanged.

- [ ] **Step 2: Check scope and asset integrity**

Run:

```powershell
git show --stat --oneline HEAD~2..HEAD
git status --short
```

Expected: the two implementation commits contain only `src/ocean/OceanRenderer.ts` and `tests/OceanRenderer.test.ts`. No texture, model, dependency, generated bundle, or third-party-asset manifest changed. Pre-existing unrelated workspace changes may remain unstaged.

- [ ] **Step 3: Verify live shader compilation at both target viewports**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Open the game at 1280 by 720 and 1920 by 1080. At each viewport, reload once and inspect the console.

Expected: the game renders at both sizes, the console contains no `THREE.WebGLProgram`, shader compilation, shader validation, or WebGL warning attributable to the ocean material, and the water plane remains a single draw call.

- [ ] **Step 4: Inspect the three weather states and both lighting regimes**

Inspect nearby water in calm, normal, and squall conditions during daylight, then inspect calm or normal water at night. Use a fixed camera position for comparisons and confirm:

- calm water shows broken ribbons across approximately 7% to 10% of nearby visible crests;
- normal water shows approximately 12% to 16% coverage;
- squall water shows approximately 20% to 28% coverage without becoming a continuous white sheet;
- ribbons run predominantly along the wind axis and contain torn cross-wind channels;
- bright cream caps remain entirely inside broader grey-green body foam;
- fine border roughness and small holes are visible nearby but disappear before the horizon;
- camera movement does not make the pattern swim across the surface;
- night foam follows `uFoamColor` and does not glow fixed white;
- hull exclusions, wave motion, buoyancy alignment, fog, and ordered dithering remain unchanged.

Estimate coverage with a 10 by 10 overlay over a representative nearby water area: count cells whose centers contain body foam and use the count as the percentage. Repeat once per weather state from the same camera position.

If a coverage estimate misses its target, return to the Task 2 red-green cycle and change only the matching endpoint before repeating all three measurements:

- calm below 7%: reduce the first `crestStart` endpoint by `0.02`; calm above 10%: increase it by `0.02`;
- normal below 12%: reduce both `ribbonStart` endpoints by `0.02`; normal above 16%: increase both by `0.02`;
- squall below 20%: reduce the second `crestStart` endpoint by `0.02`; squall above 28%: increase it by `0.02`.

Keep each endpoint inside `0.05` to `0.70`, retain distinct `smoothstep` edges, and commit the tuned constants with the Task 2 files only after the focused tests and typecheck pass again.

- [ ] **Step 5: Compare the post-change performance capture**

At 1920 by 1080, use the same title-scene camera, browser, and machine as Task 1. Warm up for 10 seconds, record one FPS reading per second for 10 seconds, and calculate:

```text
newAverage = (sample1 + sample2 + ... + sample10) / 10
retainedPercent = (newAverage / baselineAverage) * 100
```

Expected: `retainedPercent >= 95`. Record both averages and the retained percentage in the execution report.

- [ ] **Step 6: Handle pointer-lock limitations without overstating acceptance**

If automation cannot enter gameplay because pointer lock is unavailable, complete the title-scene shader and performance checks, record the exact blocked interaction, and ask for a manual calm/normal/squall gameplay pass. Do not report the coverage, camera-attachment, or night checks as passed without seeing them.

- [ ] **Step 7: Report the final evidence**

Report:

- focused test result and count;
- typecheck result;
- full-suite result and count;
- production build result;
- shader console result at both viewports;
- calm, normal, and squall coverage estimates;
- daylight and night observations;
- baseline FPS, new FPS, and retained percentage;
- any pointer-lock limitation;
- final `git status --short`, distinguishing the foam work from pre-existing unrelated changes.

Do not create a verification-only commit when no tracked file changed.
