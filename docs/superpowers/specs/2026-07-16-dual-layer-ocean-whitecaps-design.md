# Dual-Layer Ocean Whitecaps Design

- **Status:** Approved
- **Date:** 2026-07-16
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest
- **Scope:** More visible procedural foam on ocean wave crests

## 1. Objective

The ocean should show clear, moderate foam patches on breaking wave crests. Calm water should carry scattered whitecaps that remain visible from the ship and lifeboat. Rough weather should increase their frequency without covering the water surface.

The current shader multiplies a high crest threshold, a high slope threshold, and one narrow breakup field. That product removes most foam in calm conditions. This change will broaden the existing foam body and add a brighter cap to the tallest ridges.

## 2. Scope

The change includes:

- broader wind-broken foam patches on high and steep waves;
- thin bright whitecaps on the strongest ridges;
- capped weather response for both foam layers;
- distance fading before the horizon;
- focused tests and browser inspection when the in-app backend is available.

The change excludes hull wakes, shoreline foam, particles, textures, persistent foam simulation, and changes to wave displacement or buoyancy.

## 3. Foam Layers

The shader will derive both layers from `vHeight`, `vWaveSlope`, `uAmplitudeScale`, and the existing warped breakup fields.

The body layer will lower the calm crest and slope thresholds enough to produce scattered patches on ordinary high waves. Its breakup mask will retain broad wind-stretched gaps and fine edge erosion. The shader will mix this layer toward the current desaturated `uFoamColor` at moderate opacity, preserving some water color beneath it.

The cap layer will use a higher crest threshold and a steeper slope response. It will occupy a narrow subset of the body layer and use a stricter breakup mask. The shader will mix caps closer to `uFoamColor`, producing thin bright ridges without a flat white sheet.

The final foam amount will clamp to one. The cap cannot appear outside the body layer's crest region.

## 4. Weather, Lighting, and Distance

Calm water will use moderate body coverage and sparse caps. The current weather amplitude will lower both thresholds and raise coverage within fixed limits. Squalls will produce more patches and longer cap fragments while leaving dark water between them.

Both layers will use the existing distance fade. Fine cap detail will disappear first, followed by the broader body foam before the fog-dominated horizon. This ordering will limit shimmer.

Foam will continue to suppress direct sun highlights beneath it. Body foam will soften the highlight, while bright caps will remove more of it. Atmospheric reflection, trough absorption, fog, and direct-light visibility will retain their current order.

## 5. Architecture and Performance

`OceanRenderer` will keep one plane, one material, and one draw call. The fragment shader will retain `foamBreakup()`, replace `crestFoam()` with `foamBody()`, and add `foamCap()`. `foamCap()` will multiply its result by the body crest response before returning. No new renderer state or public method will enter the API.

The shader may add one breakup evaluation and a few `smoothstep`, multiply, and mix operations. It will add no texture lookup, render pass, geometry, allocation, or runtime asset.

`World`, `BoatWorld`, `WaveField`, water exclusions, and celestial-light synchronization will remain unchanged.

## 6. Verification

Test-driven implementation will add a failing shader contract before production edits. Focused tests will verify that:

- the fragment shader computes separate body and cap masks;
- the cap derives from the crest region and cannot form as an independent surface layer;
- both layers use weather response and distance fading;
- the combined foam suppresses sun glint and mixes through `uFoamColor`;
- existing ocean lighting and direct-light synchronization tests remain green.

Run the focused ocean tests, full test suite, typecheck, and production build. If the in-app browser backend is available, inspect daylight scavenging and calm, squall, and night survival at 1280 by 720 and 1920 by 1080.

## 7. Acceptance Criteria

1. Calm water shows visible broken foam patches on some high wave crests.
2. Thin bright caps appear only on the tallest, steepest parts of those patches.
3. Rough weather increases foam within a cap and preserves dark gaps between patches.
4. Body foam and whitecaps fade before the horizon without persistent shimmer.
5. Foam reduces direct sun glint while retaining the existing atmosphere and water color response.
6. The ocean keeps one draw call and adds no assets, textures, particles, or persistent simulation.
7. Wave displacement, buoyancy, exclusions, day-night light synchronization, and renderer lifecycle behavior remain intact.
8. Focused tests, the full suite, typecheck, and production build pass.
