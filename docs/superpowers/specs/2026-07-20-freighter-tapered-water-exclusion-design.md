# Freighter Tapered Water Exclusion Design

## Goal

Make ocean water meet the freighter's lower hull along its sides and rounded ends in the title scene and while it rides waves. Keep water from rendering through the upper hull. Preserve player collision and the lifeboat's current water treatment.

## Root Cause

The freighter hull narrows from a 6.25-unit half-width at its upper edge to 5.375 units at its lower edge. Its lower hull also shortens by four percent. The ocean exclusion uses one fixed, 6.05-unit half-width footprint at every height above local Y `0.76`.

At the waterline, that footprint extends 0.675 units beyond each lower side. The shader discards those wave fragments, producing the visible empty strips. The fixed bow and stern taper produces the same mismatch at both ends.

## Considered Approaches

1. Interpolate the exclusion footprint from the lower hull outline to the upper hull outline by fragment-local height. This follows the existing tapered mesh and keeps higher water from passing through its sides. **Selected.**
2. Use the lower hull outline at every height. This fills the side strips but permits higher wave crests to render through the upper hull.
3. Shrink the current fixed footprint. This reduces the gap but still leaves a mismatch across the hull height.

## Design

`ShipGeometry` will describe the freighter exclusion with two outlines derived from the same hull dimensions and taper used by `main-hull-body`:

| Hull edge | Half width | Half length | Taper start | Local Y |
| --- | ---: | ---: | ---: | ---: |
| lower | 5.375 | 17.28 | 13.44 | 0.76 |
| upper | 6.25 | 18 | 14 | 1.86 |

`WaterExclusion` will carry the optional lower outline and the upper local Y alongside its existing upper bounds and minimum local Y. The freighter passes both outlines. The lifeboat passes no lower outline and retains its fixed footprint.

`OceanRenderer` will store one lower outline and one interpolation height per fixed exclusion slot. For a fragment at or above the lower hull edge, the fragment shader will interpolate the half width, half length, and taper start from the lower outline to the upper outline. It will then apply the existing rounded-end test against that interpolated shape. Fragments below the lower edge remain visible. Above the upper edge, the shader uses the upper footprint.

The world continues to update the exclusion matrix from the freighter root after buoyancy and sinking movement. Collision boxes, arc colliders, items, and player movement remain ship-local and unchanged.

## Tests and Verification

- Add pure exclusion coverage for a point beside the lower straight side that must remain water, and the corresponding point at the upper hull that must be excluded.
- Assert that freighter uniform uploads include both outlines and the local-height range while lifeboat slots retain their fixed profile.
- Keep the transformed-world exclusion test to cover pitch, roll, and root movement.
- Run focused water-exclusion and world tests, the full test suite, typecheck, and production build.
- Inspect the title scene over multiple wave positions and an active scavenging run when pointer lock is available. Confirm continuous water at the hull sides, bow, and stern, with no water cutting through the hull.

## Constraints

- Use the shared wave field and the existing exclusion transform.
- Add no per-frame Three.js resource or allocation beyond the current exclusion update path.
- Do not alter freighter collision, player navigation, item placement, lifeboat geometry, or reduced-motion behavior.
