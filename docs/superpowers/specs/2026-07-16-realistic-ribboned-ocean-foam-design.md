# Realistic Ribboned Ocean Foam Design

## Context

The current shader combines wave height, slope, and a sine-based breakup mask. A sampled 180 by 180 world-unit area shows why players struggle to see the result:

| Wave amplitude scale | Visible foam body | Visible bright cap |
| --- | ---: | ---: |
| 0.78, calm | 0.02% | 0.00% |
| 1.00, normal | 2.31% | 0.10% |
| 1.18, rough | 6.28% | 1.16% |
| 1.35, squall | 10.22% | 2.76% |

The breakup mask also uses two smooth sine bands. Those bands lack the torn channels, frayed borders, and nested brightness that make ocean foam read as whitewater.

## Goal

Create wind-aligned ribboned whitecaps with enough coverage to remain visible in calm water. The shader should produce broad grey-green foam bodies, bright cream crest cores, torn gaps, and small edge detail. Weather should increase coverage without turning the ocean into a solid white surface.

Target surface coverage:

- Calm water: 7% to 10%
- Normal water: 12% to 16%
- Squall water: 20% to 28%

## Scope

Change the ocean fragment shader and its focused tests. Keep the existing ocean mesh, wave displacement, buoyancy, exclusions, atmosphere, lighting, and public API.

Do not add texture files, geometry, particles, render passes, runtime allocations, public methods, or draw calls.

## Visual Model

### Broad foam body

The body mask uses a lower crest and slope envelope than the current shader. It supplies the visible area and carries a subdued grey-green foam color. Weather lowers the crest threshold and increases coverage within the target ranges.

### Bright crest core

The cap mask multiplies the finished body mask. A higher crest and slope threshold keeps the cap inside the whitewater. The shader gives this core a cream-white mix and a shorter distance range than the body.

### Ribbon texture

The fragment shader builds the texture from three scales:

1. Coarse anisotropic noise stretches patches along the established wind vector.
2. Medium domain-warped noise opens channels and splits long bands into irregular ribbons.
3. Fine noise roughens the borders and cuts small holes near the camera.

The shader samples all scales in world space. Time offsets move the pattern along the wind vector at a low speed. The foam stays attached to the water as the camera moves.

The broad ribbon mask survives toward the horizon. Fine border detail fades first, followed by the bright cap. This ordering avoids distant shimmer while retaining readable whitewater.

## Shader Architecture

`OceanRenderer.ts` keeps one `ShaderMaterial` and one plane mesh. The fragment shader replaces `foamBreakup()` with fixed-cost helpers:

- `hash21(vec2)` returns deterministic pseudo-random values.
- `valueNoise(vec2)` interpolates four hash samples.
- `foamRibbonNoise(vec2)` combines coarse wind-space noise with one domain warp.
- `foamEdgeNoise(vec2)` adds a small high-frequency border term.

The shader reuses `uTime`, `uAmplitudeScale`, `uDetailFade`, `vHeight`, `vWaveSlope`, `vViewDepth`, and `vWorldPosition`. It adds no uniforms.

The foam calculation follows this sequence:

1. Calculate a weather value from the clamped amplitude scale.
2. Build a crest and slope envelope for the body.
3. Multiply that envelope by the ribbon mask.
4. Apply fine edge erosion near the camera.
5. Derive the cap from the body, stricter crest data, and a tighter ribbon threshold.
6. Apply separate body and cap distance fades.
7. Clamp the combined foam mask before lighting and color mixes.

All `smoothstep` ranges keep distinct lower and upper edges. The shader clamps weather values and final masks to prevent invalid interpolation weights.

## Color and Lighting

The body uses the existing `uFoamColor` at a moderate mix weight. The cap mixes farther toward `uFoamColor` and receives a small sun-color contribution when direct light remains visible. Night palettes retain their tint because the shader does not inject a fixed white color.

Foam suppresses the water glint before the shader applies body and cap color. The cap suppresses more glint than the body. Fog and ordered dithering keep their current position after foam composition.

## Performance

The shader uses a fixed noise budget. It avoids a general FBM loop and texture lookup. The target implementation adds one domain warp, two coarse or medium value-noise evaluations, and one fine evaluation per visible fragment.

Fine noise is multiplied by a fade that reaches zero near `uDetailFade.x`. At 1920 by 1080, the title-scene average frame rate should stay within 5% of the current ocean under the same 10-second capture.

## Testing

Focused tests will assert:

- The shader defines hash, value-noise, ribbon, and edge helpers.
- The ribbon helper uses the wind and cross-wind axes.
- The body mask includes domain-warped breakup and fine edge erosion.
- The cap depends on the finished body mask.
- Weather changes body and cap thresholds.
- Fine detail, cap, and body use separate distance treatment.
- The shader clamps the combined foam amount.
- The old sine-only `foamBreakup()` helper no longer exists.

Verification will run:

- `bun run test tests/OceanRenderer.test.ts tests/WaterExclusion.test.ts tests/WaveField.test.ts`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `git diff --check`

## Visual Acceptance

Inspect calm, normal, and squall water at 1280 by 720 and 1920 by 1080. Confirm these points:

- Calm water shows visible ribbons across 7% to 10% of nearby crests.
- Normal and squall states increase coverage without forming a continuous sheet.
- Bright caps stay inside broader foam bodies.
- Ribbons follow the wind and do not slide with camera motion.
- Fine edges do not shimmer near the horizon.
- Night foam keeps the scene tint instead of glowing white.
- The browser console reports no shader compilation errors or warnings.

Pointer-lock restrictions may block automated access to the active phases. In that case, automated shader compilation and the available title render provide partial evidence, and a manual gameplay pass completes visual acceptance.
