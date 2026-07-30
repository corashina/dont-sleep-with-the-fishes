# Ocean Distance Continuity Design

## Goal

Remove the flat water band near the horizon.

Keep near and middle-distance waves readable.

Keep the current vertex count, draw calls, textures, and shared wave field.

## Root cause

The near ocean grid ends 90 units from its center.

Its low-quality cells are about 0.94 units wide.

Its high-quality cells are about 0.63 units wide.

The old horizon ring used uniform radial spacing.

Its first low-quality cell was about 21 units wide.

Its first high-quality cell was about 14 units wide.

This sudden density change flattened the rendered wave shape.

Clear-weather fog also reached about 93 percent by 150 units.

That fog removed the remaining middle-distance wave contrast.

## Chosen approach

Redistribute the existing horizon vertices with a power curve.

Concentrate cells beside the near grid.

Grow cell size gradually where fog can hide it.

Keep a small water-color contribution under strong middle-distance fog.

Complete the fog near the true horizon.

Move the final fog color toward the sky horizon color.

## Quality settings

Use a radial exponent of `1.75` for both quality levels.

| Quality | Radial segments | First cell | Fog start | Fog end | Fog limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 48 | about 1.15 | 150 | 650 | 0.86 |
| High | 72 | about 0.57 | 180 | 750 | 0.82 |

The fog limit preserves 14 percent water color on low quality.

The fog limit preserves 18 percent water color on high quality.

## Geometry

Keep the dense center surface unchanged.

Keep the eight horizon panels and one horizon mesh.

Remap each radial axis after panel construction.

Use normalized radial progress raised to exponent `1.75`.

Apply the same remap to both axes of each corner panel.

Do not add vertices, indices, panels, materials, or draw calls.

## Shader flow

Calculate water color, reflections, light, and foam as before.

Calculate the existing exponential fog factor.

Limit that factor in the middle distance.

Blend the limit toward full fog between the quality fog distances.

Blend the fog target from fog color toward horizon color over the same range.

Keep ordered dither after fog.

## Ownership

`OceanRenderer` owns the graded geometry and horizon fog uniform.

The constructor creates each resource once.

`setQuality` replaces geometry and updates the existing fog uniform.

`dispose` disposes each geometry and the shared material once.

## Shared wave contract

Do not change `WaveField`, buoyancy, or vessel motion.

The vertex shader still uses the shared four-wave payload.

The fix changes only mesh sampling and distance fog presentation.

## Performance

The vertex count stays unchanged.

The vertex shader still evaluates the same four waves per vertex.

The fragment shader adds one `smoothstep` and two simple mixes.

The frame loop adds no CPU work or allocations.

## Tests

Check the first radial cell against the near-grid cell size.

Check that radial cells grow toward the horizon.

Check that each quality keeps its previous vertex count.

Check quality-specific horizon fog settings.

Check quality changes and repeated disposal.

Run focused ocean and world tests.

Run the full test suite and production build.

Inspect the clear-day start screen.

Confirm waves stay readable into the middle distance.

Confirm the final horizon fade has no flat cyan slab.

## Scope

Change only ocean geometry construction, ocean fog presentation, and tests.

Do not change mesh count, camera range, sky geometry, or post-processing.
