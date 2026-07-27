# Illustrated Post-Processing Design

**Date:** 2026-07-27
**Status:** Approved design, pending written-spec review
**Approach:** Refine and activate the existing authored pipeline

## Goal

Give the game a richer illustrated maritime image without making the treatment
filter-heavy or expensive. The result should use stronger tonal separation,
selective contact depth, and restrained print texture to support the existing
models, materials, lighting, composition, and animation.

The visual target is the middle ground between the supplied references:
noticeably more authored and graphic than the current game, but quieter and
more readable than the heavily processed reference. Low quality targets
integrated laptop graphics at 1080p. High quality improves contact depth without
changing the art direction.

## Existing Context

Production currently constructs `DirectSceneRenderer`, which provides selective
GTAO and hover outlines. A dormant `PostProcessingPipeline` already contains
immutable weather and phase profiles plus one combined print shader for tonal
shaping, posterization, ink framing, halftone, vignette, grain, and chromatic
aberration.

This design consolidates those paths. It does not introduce a second competing
post stack.

## Player-Facing Control

Add one compact `Visual Quality` control to both existing pause overlays:

- `Low` is the default and conservative integrated-graphics mode.
- `High` improves AO resolution, sampling, and denoising only.
- Both choices use identical grading and print values.
- The control is keyboard-operable, has a visible focus state, and communicates
  selection with text and shape rather than color alone.
- A change takes effect immediately and is saved in local browser storage.
- Missing, malformed, or obsolete saved values resolve to `Low`.

The control uses the existing pause-panel material, typography, and command
language. It does not create a new settings screen or add persistent HUD.

## Visual Treatment

### Color and tone

- Use cool cyan and blue-grey shadows for sea, sky, and distant forms.
- Keep timber, rust, parchment, and practical lights warmer so human-made
  objects separate from the environment.
- Increase midtone contrast without crushing dark deck materials or interiors.
- Compress highlights softly to retain detail in the sky, water, pale
  structures, and sails.
- Preserve enough shadow lift for interactive objects to remain readable.
- Keep accent saturation concentrated in safety colors and small comic details
  instead of increasing every color uniformly.

### Contact depth

Apply screen-space AO only to explicitly opted-in opaque geometry:

- collectible and survival-supply props;
- opaque ship geometry needed to occlude those props;
- selected seams, overlaps, interiors, and contact points.

Water, sky, transparent glass, broad unsupported outlines, and DOM interface
layers do not contribute AO. The composite must seat objects rather than make
the scene uniformly dirtier.

### Print treatment

- Use subtle posterization with enough levels to protect ocean and sky
  gradients.
- Keep stable grain and sparse halftone quiet at baseline and concentrated in
  midtones.
- Retain a soft irregular frame and restrained vignette. The processed canvas
  remains below the DOM interface, so controls are not darkened.
- Remove baseline chromatic aberration. It softens silhouettes and requires
  additional scene-color samples.
- Do not add bloom, depth of field, motion blur, or a separate LUT pass.

## Rendering Architecture

One owned composer performs the passes in this order:

1. scene render;
2. selective ambient occlusion;
3. hover outline;
4. combined grading and print shader;
5. output color-space conversion.

The combined shader remains full resolution in both modes and reads scene color
once per pixel. Tone shaping, color separation, posterization, frame, halftone,
vignette, and grain stay in that one pass.

The production game creates this consolidated pipeline instead of constructing
`DirectSceneRenderer` directly. `DirectSceneRenderer` remains the terminal
fallback, not an independently evolving visual path.

## Quality Modes

### Low

- Full-resolution scene, hover outline, grading, and print treatment.
- Half-resolution selective AO.
- Six to eight AO samples with restrained denoising.
- Standard 8-bit composer targets unless visual verification demonstrates
  unacceptable gradient banding.

### High

- Full-resolution scene, hover outline, grading, and print treatment.
- Full-resolution selective AO.
- Twelve to sixteen AO samples with cleaner denoising.
- A higher-precision composer target is permitted only if screenshot and
  performance comparisons show a material benefit.

Changing quality updates or resizes owned render resources only when the setting
changes. It does not allocate or repeat setup in the frame loop.

## Profiles and Data Flow

The existing immutable profile selection remains deterministic:

- one scavenge profile;
- calm, overcast, and squall survival profiles;
- mild day and night variants of each survival weather profile.

The profiles express one coherent base treatment with restrained conditional
variation. Weather and time may shift shadow tint, highlight warmth, contrast,
print pressure, and vignette, but they must not become separate art styles.

The active phase continues to send `SceneVisualState` to the renderer. Profile
selection returns an existing immutable object without allocation. Quality
state affects AO configuration only. Grain time remains slowly quantized so the
texture reads as printed variation rather than video noise.

All shader inputs are finite and clamped. Gameplay rules, random sources, wave
state, buoyancy, and vessel motion do not depend on post-processing state.

## Ownership and Lifecycle

The consolidated pipeline owns its composer, render targets, passes, generated
ink-frame texture, listeners, and quality state. It disposes each owned resource
exactly once.

AO opt-in remains owned by the world or asset builder that creates each mesh.
Changing a quality setting does not transfer mesh or material ownership.

Resize updates composer and pass sizes only for finite dimensions and supported
pixel ratios. No pass, target, uniform object, profile object, or temporary
vector is created during `render`.

## Failure Handling

Fallback is progressive:

1. If selective AO cannot initialize or reconfigure, disable AO while retaining
   the hover outline, grade, print treatment, and output conversion.
2. If the consolidated composer cannot initialize, report the failure and use
   `DirectSceneRenderer`.
3. If direct composer setup is also unavailable, render the scene directly.

Presentation failure never changes gameplay state. Invalid dimensions or
quality values are ignored or resolved to safe defaults rather than being
forwarded to GPU resources.

## Verification

### Automated

Add or update tests for:

- pass order and production pipeline selection;
- Low and High AO resolution, sample, and denoise configuration;
- immediate quality changes and saved-setting validation;
- immutable profile selection and value clamping;
- single-sample scene-color grading without chromatic aberration;
- water and transparent geometry excluded from AO;
- progressive construction and reconfiguration fallback;
- finite resize limits;
- listener removal and exactly-once disposal;
- absence of render-loop allocations introduced by the feature.

Run the TypeScript typecheck, focused rendering/UI tests, the full Vitest suite,
and the production Vite build.

### Visual

Capture fixed-camera comparisons with grading off, AO off, raw AO, Low, and High
for:

- scavenge;
- survival calm day;
- survival overcast;
- survival squall;
- survival night.

Inspect at 1280x720 and 1920x1080. Confirm:

- readable dark deck and interior detail;
- retained sky and water highlights;
- no visible ocean or sky banding;
- no AO halos, shimmer, or transparent-surface artifacts;
- stable hover outlines;
- distinguishable sea, sky, ship structure, wood, props, and accent colors;
- unchanged interface readability.

Developer-only comparison controls may extend the existing AO debug modes with
a grade-off mode. They are not player-facing settings.

### Performance

On the selected integrated-laptop test machine at 1920x1080, Low must:

- sustain 60 frames per second in the representative fixed-camera scenes;
- add no more than approximately 20 percent GPU frame time over direct
  rendering;
- preserve stable frame pacing during resize, phase transitions, and quality
  changes.

If Low misses the budget, reduce AO resolution, samples, or denoising before
weakening the full-resolution color grade. High may cost more but must remain
stable and free of intermittent allocation or resource churn.

## Acceptance Criteria

The work is complete when:

- the game reads as cool, melancholic maritime space surrounding warmer
  human-made objects;
- contrast and color separation are visibly stronger without crushed shadows
  or clipped highlights;
- AO improves selected contacts rather than outlining or dirtying the scene;
- print treatment remains subordinate to geometry, materials, lighting, and
  composition;
- Low and High preserve the same art direction;
- Low meets the approved integrated-graphics performance budget;
- all automated, build, visual, fallback, accessibility, and lifecycle checks
  pass.
