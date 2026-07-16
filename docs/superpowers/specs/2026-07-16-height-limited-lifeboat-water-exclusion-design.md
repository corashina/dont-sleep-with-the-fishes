# Height-limited lifeboat water exclusion

## Problem

The lifeboat water exclusion now follows the rounded hull footprint, but the shader still discards every ocean fragment inside that footprint regardless of height. The exclusion therefore forms a vertical prism through the ocean surface. It prevents wave crests from entering the boat, but it also removes water below the hull and exposes an oval hole.

## Intended behavior

The lifeboat exclusion will discard an ocean fragment only when both conditions hold:

- the fragment lies inside the existing tapered X/Z footprint;
- the fragment's local Y coordinate is at or above the lifeboat floor.

Water below the floor remains rendered. The hull and floor occlude it from above, while exterior views retain the water surface below the boat. Wave crests that rise to floor height still disappear before they enter the interior.

The shader will transform each displaced ocean fragment with the exclusion object's `worldToLocal` matrix before applying the height test. This keeps the cutoff attached to the lifeboat while it heaves, pitches, and rolls.

## Data model and integration

`WaterExclusionRegion` will accept an optional `minimumLocalY`. A region without this value keeps the current unlimited vertical behavior. `OceanRenderer` will upload one minimum-Y uniform per exclusion and use a safe low sentinel for regions that omit the value.

The lifeboat build will expose `minimumLocalY` equal to `FLOOR_HEIGHT` (`-0.38`). Both scavenging and survival phases will pass that value to `createWaterExclusion`. The freighter will omit it, so its existing exclusion remains unchanged.

The existing `halfWidth`, `halfLength`, and `taperStart` values remain unchanged. This fix changes the vertical scope only.

## Shader rule

For each active exclusion, the fragment shader will compute:

1. the ocean fragment position in the vessel's local coordinates;
2. the tapered half-width at the fragment's local Z position;
3. whether the local X/Z point lies inside the footprint;
4. whether local Y is greater than or equal to `minimumLocalY`.

The shader discards the fragment only when the footprint and height checks both pass.

## Tests

Tests will cover:

- a lifeboat-local point inside the footprint and above the floor is excluded;
- the same X/Z point below the floor is preserved;
- tapering still rejects points outside the rounded bow and stern;
- exclusions without `minimumLocalY` keep their current behavior;
- `OceanRenderer` resets and uploads minimum-Y uniforms with the other exclusion data;
- lifeboat construction and both game phases pass the floor cutoff through to the renderer.

## Visual acceptance

Inspect the lifeboat during scavenging and survival in calm and high waves. The oval hole must no longer appear below the hull. Wave crests must not render through the floor or the boat interior. The freighter exclusion must look unchanged.

