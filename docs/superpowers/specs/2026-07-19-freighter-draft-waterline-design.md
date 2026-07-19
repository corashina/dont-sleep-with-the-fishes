# Freighter Draft Waterline Design

## Goal

Seat the scavenging freighter at the sea surface from the first title frame and keep its water exclusion aligned while it bobs, without changing player-local collision.

## Root Cause

The freighter hull begins at local Y `0.76`, while the buoyancy update places the ship root at the sampled wave height with no fixed draft. At mean sea level, the lower hull therefore sits 0.76 units above the water. As the root moves down on a wave, the water-exclusion height gate sees higher ship-local water values and begins discarding the visible surface abruptly.

## Considered Approaches

1. Add a fixed 0.76-unit draft to the freighter root. This aligns mean sea level with the hull's lower edge, preserves the existing taper and height-gated water mask, and keeps player movement local. **Selected.**
2. Retune only the water-exclusion height gate. This changes when water clips, but leaves the hull visibly above the water.
3. Move the hull geometry and collision data downward. This would require reauthoring player, item, and collision coordinates without improving buoyancy.

## Design

`World` will own a `FREIGHTER_DRAFT` constant of `0.76`, derived from the freighter hull's existing lower edge (`HULL_TOP_Y - HULL_HEIGHT`). The constructor will place the ship root at `-FREIGHTER_DRAFT` so the title scene has the correct waterline before its first buoyancy update.

Each world update will compose the same draft with the existing scripted sinking and wave-driven heave:

```text
ship Y = sinking offset + freighter wave heave - freighter draft
```

Pitch and roll remain unchanged. The freighter water-exclusion profile stays at 6.05 by 17.6, tapers from 13.6, and gates below local Y 0.76. Because the ship root still drives both the visual hull and exclusion transform, the mask follows the bobbing hull. Collision boxes, arc colliders, item positions, and player movement stay in ship-local coordinates.

## Tests

- Extend the world construction/update regression to require the initial `-0.76` root Y and the drafted buoyancy composition.
- Retain the existing tests for unchanged local collision resolution and transformed freighter exclusion coverage.
- Run the focused world suite, full test suite, typecheck, and production build.

## Constraints

- Do not change the ocean shader, water-exclusion helper, lifeboat profile, hull geometry, collision data, or reduced-motion behavior.
- Add no per-frame allocation or new Three.js resource.
