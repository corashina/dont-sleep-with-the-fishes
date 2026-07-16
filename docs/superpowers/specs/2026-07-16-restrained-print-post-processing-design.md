# Restrained Print Post-Processing Design

**Date:** 2026-07-16
**Status:** Approved

## Objective

Apply a restrained print-horror treatment to the WebGL scene in both game phases. The treatment will recall the current *Don't Sleep With The Fishes* storefront presentation while preserving the clearer navigation, item recognition, procedural sky, weather, and ocean rendering in this project.

The change covers scene color grading, halftone, grain, edge treatment, phase-aware profiles, renderer integration, resize handling, fallback, disposal, tests, and browser verification. It does not change gameplay, UI structure, world geometry, materials, lighting rules, weather rules, or third-party assets.

## Reference Findings

The design uses the current [Steam store page](https://store.steampowered.com/app/4834070/Dont_Sleep_With_The_Fishes/) and [SteamDB screenshot index](https://steamdb.info/app/4834070/screenshots/), checked on 2026-07-16.

The official screenshots use a print-like grade rather than a modern bloom-heavy finish. Repeated traits include:

- coarse halftone or ordered surface texture across characters, props, sky, and water;
- crushed near-black edges around a brighter central play area;
- cool cyan water and sky highlights paired with warm ochre or brown mids;
- clipped daylight whites and strong local contrast;
- slight color separation and scan-like contamination near high-contrast edges;
- heavier grain and edge pressure during night and storm scenes.

This project already applies CSS grain and vignette above the UI, but it does not grade the WebGL scene. A scene-space effect can respond to image luminance, keep HTML controls sharp, and treat custom shaders and standard materials consistently.

## Chosen Direction

Use a shared Three.js post-processing pipeline with a restrained default intensity. The game will render each phase through an `EffectComposer` containing a scene pass, one custom print-grade shader pass, and an output pass for tone mapping and color-space conversion.

The pipeline will not add bloom, depth of field, motion blur, screen-space ambient occlusion, or full-screen blur. Those effects do not appear central to the reference treatment and would cost clarity or frame time.

## Architecture

`Game` will own one `PostProcessingPipeline` beside the existing `WebGLRenderer`. The pipeline will survive phase transitions and restarts, follow the renderer's viewport, and release its render targets before `Game` disposes the renderer.

`PhaseContext` will expose a narrow scene-rendering interface in addition to the renderer. The phases still need the renderer canvas for input and pointer lock. Their `render` methods will send the active scene, camera, and typed visual state to the scene-rendering interface instead of calling `WebGLRenderer.render` directly.

Production will supply the post-processing implementation. Tests can supply a small recorder or direct renderer without constructing WebGL resources.

The renderer interface will accept these inputs:

- scene and perspective camera;
- game phase: scavenging or survival;
- survival time: day or night when applicable;
- survival weather: calm, overcast, or squall when applicable;
- normalized sinking severity for scavenging;
- reduced-motion preference.

The pipeline will derive shader uniforms from this state through pure profile-selection functions. World classes will continue to own sky, fog, lighting, ocean, and presentation cues.

## Component Responsibilities

- `src/rendering/SceneRenderer.ts` defines the render-state types and the narrow render, resize, and dispose contract.
- `src/rendering/postProcessingProfiles.ts` maps phase state to bounded shader settings without allocating per frame.
- `src/rendering/PostProcessingPipeline.ts` owns the composer, render target, passes, uniforms, resize behavior, fallback delegation, and cleanup.
- `src/Game.ts` creates the pipeline, puts it in `PhaseContext`, resizes it, and disposes it before the `WebGLRenderer`.
- `src/phases/ScavengePhase.ts` reports scavenging state and sinking severity when rendering.
- `src/survival/SurvivalPhase.ts` reports the current day phase and weather when rendering.
- `src/styles/main.css` keeps the UI texture overlay but reduces its broad vignette so the scene and UI do not receive two stacked edge-darkening treatments.

## Shader Treatment

The print-grade pass operates on the rendered scene before final output conversion. It applies the following operations in order:

1. Compress highlights and apply a mild S-curve. The curve will retain detail on bright decks, water reflections, clouds, and item surfaces.
2. Apply restrained split toning. Shadows move toward blue-green, mids and highlights receive a small ochre bias, and global saturation drops slightly.
3. Add luminance-aware halftone. The pattern affects midtones most, fades from deep shadows and highlights, and weakens near the center of the screen. The shader defines cell size in CSS-screen pixels so device pixel ratio does not change the apparent pattern scale.
4. Add a soft elliptical vignette. The center remains broad enough for first-person navigation and projected boat interactions.
5. Add subpixel RGB separation in the outer part of the frame. The offset stays below one CSS pixel and approaches zero in the central play area.
6. Add fine monochrome grain. Normal play updates the grain at a low frequency to avoid static banding. Reduced-motion mode holds one stable grain sample.

All profile values will use finite typed numbers and clamp to documented safe ranges before reaching shader uniforms.

## Phase Profiles

The profile selector will blend between a small set of bounded targets rather than switch unrelated effects on and off.

### Scavenging

Scavenging uses the brightest and most graphic profile. It has the clearest halftone and a cool maritime grade. Sinking severity can strengthen only the outer vignette within a low maximum range. It cannot darken the screen center, change saturation, or increase RGB separation.

### Survival Day

Day survival uses a warmer, softer grade and less halftone than scavenging. The boat, saved items, and interaction anchors remain the visual focus.

### Survival Night

Night survival cools the shadows and reduces halftone strength to prevent noise from filling dark areas. The grade raises the darkest usable values enough to retain item silhouettes without turning night into daylight.

### Overcast Weather and Squalls

Overcast weather adds a small cold bias and grain increase. Squalls add the strongest permitted grain and edge pressure, but neither profile changes the central vignette floor or introduces flashes, blur, camera distortion, or animated chromatic jitter.

## Rendering Quality and Performance

The composer will use one scene render target and one custom grade pass, followed by the required output pass. It will not allocate textures, vectors, colors, or profile objects inside the frame loop.

The render target will request multisampling up to the renderer's supported limit, capped at four samples, so post-processing does not replace the current antialiased scene with obvious jagged edges. The composer will use the same viewport and device-pixel-ratio cap that `Game` already applies.

The shader will use a fixed number of texture reads. It will not sample depth, generate blur levels, or load lookup textures. The implementation target is a modest frame-time increase at 1920x1080 and stable 60 FPS on the project's normal verification hardware. Browser review will compare the performance overlay before and after the change and record any sustained regression greater than 15 percent.

## Fallback and Error Handling

`Game` will create the post-processing pipeline during renderer setup. If composer or shader setup fails, it will install a direct scene renderer that delegates to the existing `WebGLRenderer.render` path. The game must still start and support both phases.

The implementation will not retry initialization in the frame loop. It will not download a replacement shader or texture. Resize calls with non-positive dimensions will do nothing, matching the existing phase behavior.

Cleanup will tolerate partial initialization. The pipeline will dispose any passes and render targets it created, then `Game` will continue with model, sky, renderer, and canvas cleanup under the existing first-error preservation rules.

## UI and Accessibility

Post-processing applies only to the WebGL canvas. HTML text, focus indicators, buttons, projected interaction controls, dialogs, live regions, and the crosshair remain outside the composer.

The CSS treatment layer will retain subtle paper or ink texture but reduce its broad edge vignette. Critical-state UI will keep its existing semantic red vignette because it communicates danger. Reduced-motion mode will freeze shader grain and continue to disable existing nonessential UI movement.

No control, shortcut, pointer-lock behavior, focus rule, ARIA label, or announcement changes as part of this work.

## Automated Testing

Tests will cover:

- profile selection for scavenging, survival day, survival night, overcast weather, and squalls;
- clamping of sinking severity and all numeric shader settings;
- stable grain state under reduced motion;
- the visual state each phase sends to the scene renderer;
- composer and direct-renderer resize behavior;
- fallback selection when post-processing construction fails;
- cleanup order and idempotent disposal across restart and final game disposal;
- preservation of the renderer canvas used by pointer-lock input;
- absence of remote post-processing assets or new runtime dependencies.

Existing tests must continue to pass. Type checking and the production build must succeed.

## Browser Verification

Browser review will cover 1280x720 and 1920x1080 at 100 percent zoom:

- scavenging start screen and active play near the beginning of the timer;
- scavenging active play at critical sinking severity;
- survival day in calm and overcast weather;
- survival night and squall presentation;
- a projected item interaction and an open survival dialog;
- reduced-motion presentation;
- phase transition, restart, resize, and final disposal.

Reviewers will check central visibility, item color identity, sky and water gradients, UI contrast, edge darkness, halftone scale, grain shimmer, chromatic fringing, antialiasing, and frame rate. The scene must retain the project's existing custom atmosphere while showing a visible connection to the official print-horror treatment.

## Acceptance Criteria

1. Both game phases render through the shared post-processing interface in production.
2. The WebGL scene shows restrained split toning, luminance-aware halftone, vignette, edge-only RGB separation, and monochrome grain.
3. Scavenging, survival day, survival night, and squall conditions use distinct bounded profiles.
4. Sinking severity affects only the outer vignette within its allowed range.
5. Reduced-motion mode freezes grain and adds no animated shader effect.
6. HTML UI and interaction behavior remain outside post-processing and retain their current accessibility contracts.
7. The CSS overlay no longer doubles the normal scene vignette.
8. Failed post-processing setup falls back to direct scene rendering.
9. Resize, restart, phase transition, and disposal release post-processing resources correctly.
10. No new package, remote request, downloaded texture, or third-party asset enters the project.
11. The model checks, tests, type check, and production build pass.
12. Browser checks in both phases show readable items, stable texture, acceptable antialiasing, and no sustained frame-rate regression greater than 15 percent on the verification machine.
