# Persistent hull and crest foam

Date: 2026-09-24
Branch: codex/ocean-foam
Status: Written design for user review. Implementation is not approved yet.

## Intent and scope

Improve hull foam and crest foam within the existing ocean. Target the best appearance that sustains 60 FPS on desktop.
Continue in the ocean-foam worktree. Preserve the wave shape, buoyancy, and gameplay.

The user approved the direction: persistent GPU foam, surface flow, gradual decay, varied detail, and correct lighting.
The user previously requested visual test scripts and screenshots before production integration. Keep that workflow for this revision.

Realism means believable formation, motion, contact, and aging. Retain the illustrated, weathered style in VISUAL_STYLE_GUIDE.md.
Use broad readable forms, cool wet margins, and restrained detail. Avoid uniform white bands and repeated circular holes.

Scope includes surface pores and foam trails. Separate bubble particles, spray, ripples, FFT replacement, and new gameplay are excluded.

## Current behavior

OceanRenderer owns the water material, surface meshes, exclusion uniforms, and High quality captures.
Both quality modes share oceanFoam.ts. Crest generation already uses wave compression from the displacement Jacobian.
Hull generation uses the existing curved exclusion profile and contact height.

Coverage is currently recomputed each frame. Detail moves with a constant wind offset.
The material cannot retain patches after their source disappears. Pore relief also uses a fixed light direction.

Replace this instantaneous foam path. Do not keep a second legacy implementation.

## Proposed components

- OceanFoamSimulation owns persistent GPU state, time stepping, origin changes, and hull transform history.
- oceanFoamSimulationShader owns deposition, transport, and decay calculations.
- oceanFoam.ts shades the stored coverage and freshness using reusable detail textures.
- A focused shared GLSL module supplies the existing surface sampling and hull profile calculations where needed.
- OceanRenderer owns the simulation lifetime and schedules it before water rendering.

Use existing Three.js render targets and shader materials. Add no packages.
Share calculation code rather than maintaining separate wave or hull formulas.
Do not change the CPU wave model to implement a visual effect.

## Persistent field

Use one square field centered near the main camera. Its coordinates represent displaced world XZ positions.
Start with a 256-meter extent. High uses 1024 by 1024 texels. Low uses 512 by 512 texels.
The grid stores patch coverage. Material textures provide detail smaller than a grid cell.
These sizes are starting settings for measured tuning, not performance claims.

Use two reusable RGBA half-float render targets. Store crest coverage and fresh crest mass in R and G.
Store hull coverage and fresh hull mass in B and A. Separate channels support independent lab comparisons and decay tuning.
Freshness is fresh mass divided by coverage, with a guarded denominator. All channels remain finite and bounded.
The target pair uses about 16 MiB on High and 4 MiB on Low, excluding driver overhead.

Targets have no depth, stencil, or multisampling. State is linear data, not color.
Check half-float render-target support at resource setup. Report a clear initialization error when unavailable.
Do not silently select the obsolete foam path. Desktop High already requires half-float captures.
This shared requirement also applies to the revised Low foam and must be checked during validation.

Snap the field origin to texel increments. Reproject previous samples using the previous origin.
Keep overlapping history. Clear newly exposed space and reject out-of-range samples; never wrap field edges.
Fade coverage across the outer 16 meters of the square to hide its boundary.
Large camera jumps beyond the field extent clear history.

## Formation, transport, and aging

Run the simulation at a fixed 30 Hz. Render water at the display frame rate.
Interpolate previous and current state with each target's own origin. This adds at most one simulation step of visual delay.
Cap catch-up at four steps. Discard excess backlog and advance the simulation clock to the current update time.
Clear history after backwards time or gaps above 0.25 seconds.
A paused clock must neither generate nor age foam. First use starts with clear targets and deposits current sources.

For each step:

1. Evaluate local water motion and backtrace to the previous field.
2. Sample coverage and fresh mass with bilinear filtering.
3. Apply time-based decay and limited spreading.
4. Add crest and hull sources, scaled by the fixed step.
5. Clamp coverage and ensure fresh mass never exceeds coverage.

Use the existing wave displacement's time derivative for local horizontal water velocity.
Include a small drift along the dominant wave direction. Wave-driven motion must remain visible.
Use the same surface coordinate mapping for generation, advection, and rendering to avoid double displacement.
For field sampling, recover wave coordinates from world XZ with two bounded inverse-displacement iterations.
Include existing geometry distance weighting and vortex displacement in contact sampling.
Validate that this approximation keeps foam aligned during rough waves and near the vortex.

Crest deposition uses the current compression and weather thresholds as its starting point.
Keep broad connected patches near breaking crests. Tune the source to avoid covering calm water with white foam.
Hull deposition uses current contact height and the same tapered bounds as water exclusion.
Use relative water/hull speed to strengthen impacts and leading edges. Quiet contact receives weaker deposition.
No source may exist below an airborne hull or inside an excluded hull.

Identify hulls by persistent WaterExclusionRegion object identity, not array position.
Retain previous transforms in fixed storage for the existing maximum of two regions.
Derive point velocity from consecutive transforms, including rotation and vertical motion.
Interpolate transforms for fixed steps. Reset motion history for new regions or discontinuous clock/camera resets.
A moved hull must leave foam behind. Removing a region stops deposition but lets its existing foam decay.

Start with a coverage half-life of 3 seconds and a freshness half-life of 0.8 seconds.
These are art settings, not claims about physical sea foam. Permit separate crest and hull constants after comparison.
Fresh foam forms thick irregular patches. Older foam opens into thin connected strands, then disappears.
Avoid excessive diffusion that turns patches into smooth clouds.

## Material and lighting

Generate original, tileable foam detail textures with a deterministic offline script.
Bake coverage and relief for dense and thin foam. Use warped, varied cavities and connected branching gaps.
Do not copy source images or shader code from the research references.
Commit the generator and its output assets so the result can be reproduced.

Blend two detail scales, with different rotations and offsets. Use a broad irregular breakup mask to hide repetition.
Move detail with local flow using two phase-offset samples. Crossfade their resets to prevent texture jumps and excessive stretching.
Use mipmaps and pixel-footprint filtering. Unresolved pores converge toward average coverage instead of vanishing or flickering.
High uses both fine layers. Low uses fewer detail samples with the same persistent field and aging behavior.

Freshness controls density, pore opening, relief strength, roughness, and wetness.
Derive a surface normal from relief and shade it with the actual light direction.
Dense foam is rough and diffuse. Thin edges retain more underlying water color and reflection.
Composite before the existing blood-ocean tint and fog. Night foam must receive night lighting without a white glow.

## Renderer integration and lifecycle

Separate foam preparation from the current capture-only early return in OceanRenderer.prepareWater.
Advance foam once per ocean update version, not once per mesh or camera callback.
Keep capture preparation camera-specific. Reflection, depth, and shadow passes must not advance foam.
Use a reentrancy guard and restore renderer state in a finally block after each offscreen pass.
Restore targets, viewport, scissor, clear behavior, XR state, and shadow settings that the pass changes.

Consume exclusions and follow coordinates at preparation time, after callers finish updating them.
This preserves the current ordering in World, BoatWorld, and the lab.
Uniforms point to preallocated resources. No per-frame arrays, vectors, materials, targets, or CPU pixel readbacks.

Quality changes create replacement targets before releasing old targets. They intentionally reset foam history.
Dispose targets, materials, geometry, and owned detail textures exactly once.
Handle context restoration by clearing field history before reuse.
Propagate setup and shader errors. Do not hide a failed simulation behind static foam.

## Visual and performance acceptance

First extend the existing standalone lab and capture script. Use production components with lab-only source controls.
Run before/after views at identical camera positions, wave times, weather, and deterministic warm-up steps.
A static time assignment alone is insufficient once foam has history.

Keep all twelve existing scenes. Add source-off decay, moving-hull trails, camera scrolling, pause/resume, and quality changes.
Capture close motion sequences as well as screenshots. Show those results before production integration.
The script must fail on shader or WebGL errors.

Visual acceptance requires:

- Broad irregular crest foam with visible remnants after the source passes.
- Hull foam attached at contact, followed by detached patches as the hull moves.
- No fresh hull foam from a raised hull after a clean reset.
- An already formed trail may remain when a hull is raised, then must decay.
- Varied pore sizes and connected gaps without a visible grid or repeated circles.
- Stable detail during camera movement and gradual distance filtering.
- No foam jumps when the camera crosses an origin boundary.
- Correct daylight, night, fog, blood-ocean tint, and vortex placement.

Measure matched baseline and changed full-game scenes, not only the lab.
Record GPU, browser, resolution, pixel ratio, water quality, and frame-time percentiles.
Use the current desktop at 1920 by 1080 and pixel ratio 1 as the initial benchmark setting.
Warm up for 10 seconds, then sample at least 30 seconds in representative calm and rough-water scenes.
Target a 95th-percentile frame time no greater than 16.7 ms.
Start with a 1.5 ms incremental GPU budget for foam; measure with nonblocking timer queries when available.
Report unavailable GPU timing honestly. Never infer GPU cost from screenshot generation time.
If the baseline misses 60 FPS, report both results and the foam delta without claiming the target is met.
Tune grid resolution and material samples within this design before adding complexity.

## Verification priorities

Only add tests rated at least 90 out of 100, per repository rules.

- 98: GPU history persists after deposition stops, then decays; channels remain finite and bounded.
- 98: Raised hulls do not deposit, and transformed hulls generate foam at the correct contact.
- 95: Origin changes preserve overlap and clear exposed space without wrapping.
- 95: Fixed stepping, pause, resets, and render callbacks do not duplicate simulation updates.
- 95: Renderer state is restored after success and failure; quality changes and disposal release resources.
- 95: Existing GPU visual capture checks, extended with motion and aging evidence.

Use deterministic GPU readback only inside test tooling. Do not assert visual quality from changed-pixel counts alone.
Run affected ocean tests, lint, type checking, and the production build.
Record unrelated baseline failures separately. Do not expand this work into unrelated fixes.

## Sources and adaptation

- [Rare: The Technical Art of Sea of Thieves](https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf): feedback foam buffers, object contact, and texture-shaped coverage.
- [Crest foam documentation](https://docs.crest.waveharmonic.com/Manual/Appearance/Foam.html): accumulated generation, decay, and detail sampling.
- [Dupuy and Bruneton: whitecaps research implementation](https://github.com/jdupuy/whitecaps): compression-based whitecaps and filtered distant coverage.

The architecture above is an adaptation for this repository. Those sources do not establish our performance or visual quality.

## Review and handoff

This document records the approved direction as a concrete design.
After written-spec approval, create the implementation plan through the writing-plans skill.
Implementation starts only after the plan is reviewed and its execution method is selected.
