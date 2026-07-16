# Dynamic height-aware lifeboat water exclusion

## Problem

The lifeboat water exclusion now follows the rounded hull footprint, but the shader still discards every ocean fragment inside that footprint regardless of height. The exclusion therefore forms a vertical prism through the ocean surface. It prevents wave crests from entering the boat, but it also removes water below the hull and exposes an oval hole.

## Intended behavior

The lifeboat exclusion will evaluate every displaced ocean fragment against the boat and discard it only when both conditions hold:

- the fragment lies inside the existing tapered X/Z footprint;
- the fragment's local Y coordinate is at or above the lifeboat floor.

Water below the floor remains rendered. The hull and floor occlude it from above, while exterior views retain the water surface below the boat. Wave crests that rise to floor height still disappear before they enter the interior. Water outside the tapered footprint remains visible against the outer hull at every wave height.

The shader will transform each displaced ocean fragment with the exclusion object's `worldToLocal` matrix before applying the height test. The test therefore uses the fragment's current wave-displaced height rather than a frame-level estimate. The cutoff stays attached to the lifeboat while it heaves, pitches, and rolls.

The implementation will not resize or move the full exclusion once per frame. That approach would sample one wave height for an area whose vertices sit at different heights and could make the boundary jump. Per-fragment evaluation follows the existing ocean geometry without temporal smoothing or a translucent edge.

## Data model and integration

`WaterExclusionRegion` will accept an optional `minimumLocalY`. A region without this value keeps the current unlimited vertical behavior. `OceanRenderer` will upload one minimum-Y uniform per exclusion and use a safe low sentinel for regions that omit the value.

The lifeboat build will expose `minimumLocalY` equal to `FLOOR_HEIGHT` (`-0.38`). Both scavenging and survival phases will pass that value to `createWaterExclusion`. The freighter will omit it, so its existing exclusion remains unchanged. Existing callers that omit the value retain the unlimited vertical behavior.

The existing `halfWidth`, `halfLength`, and `taperStart` values remain unchanged. This fix changes the vertical scope only.

## Shader rule

For each active exclusion, the fragment shader will compute:

1. the ocean fragment position in the vessel's local coordinates;
2. the tapered half-width at the fragment's local Z position;
3. whether the local X/Z point lies inside the footprint;
4. whether the displaced fragment's local Y is greater than or equal to `minimumLocalY`.

The shader discards the fragment only when the footprint and height checks both pass.

## Tests

Tests will cover:

- a lifeboat-local wave fragment inside the footprint and above the floor is excluded;
- the same X/Z point below the floor is preserved during a wave trough;
- tapering still rejects points outside the rounded bow and stern;
- exclusions without `minimumLocalY` keep their current behavior;
- `OceanRenderer` resets and uploads minimum-Y uniforms with the other exclusion data;
- lifeboat construction and both game phases pass the floor cutoff through to the renderer;
- rotation and parent scaling do not detach the height test from the boat.

## Visual acceptance

Inspect the lifeboat during scavenging and survival in calm and high waves. During a trough, the ocean must remain visible below and outside the hull without exposing the bright scene background. During a crest, water may climb the outer side but must not render through the floor or enter the boat interior. The freighter exclusion must look unchanged.

