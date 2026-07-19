# Ocean horizon continuation design

## Problem

The procedural ocean is a dense 180-by-180 unit plane that follows the
camera. Its far edge is 90 units away, while the gameplay camera can see to
220 units. Rays just below the horizon therefore miss the ocean and reveal
the lower skybox, creating a grey band between the white horizon treatment
and visible water.

## Design

`OceanRenderer` will retain its existing dense central surface for nearby wave
detail. It will construct one additional, lower-density square ring from the
central surface edge to the camera's far distance. The central plane and ring
will be merged into one static `PlaneGeometry`-compatible render surface and
drawn with the existing ocean material and shared wave uniforms.

The ring is divided into four edge panels and four corner panels. Each edge
panel uses the same boundary vertex spacing as the central surface. Its shared
edge therefore receives identical Gerstner displacement, so no visible crack
or overlapping depth surface is introduced. The ring decreases tessellation
away from the player, where fog and perspective hide fine wave detail.

The horizon surface will extend beyond the gameplay camera far plane. This
keeps the water shader present for every visible ray below the horizon, while
the camera clipping plane remains unchanged for the rest of the game.

## Scope

The single shared `OceanRenderer` serves the title, scavenging, and survival
worlds, so the correction applies consistently to each phase. The skybox
palette, cloud treatment, wave field, fog values, and gameplay camera
configuration are otherwise unchanged.

## Verification

- Add geometry tests that prove the dense center remains unchanged and that
  the continuation reaches past the camera's 220-unit clip distance.
- Run the targeted ocean test red before implementation, then green after the
  geometry change.
- Run typecheck, the full test suite, and the production build.
- Inspect the title, scavenging, and survival views in a pointer-lock-capable
  desktop browser and confirm no grey strip or mesh seam is visible below the
  horizon.
