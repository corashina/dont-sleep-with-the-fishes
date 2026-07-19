# Scavenging Look Cone Design

- **Status:** Approved design; awaiting written-spec review
- **Date:** 2026-07-19
- **Scope:** Desktop scavenging phase

## Objective

Keep the player's view facing the ship's forward route during scavenging. The player may look within a 90-degree horizontal cone and a 45-degree vertical cone, both centered on the default forward view.

## Behavior

- The horizontal yaw range is 45 degrees left and right of the default forward heading, for a 90-degree total arc.
- The vertical pitch range is 22.5 degrees above and below level, for a 45-degree total arc.
- Mouse movement that reaches either boundary stops rotating the camera farther in that direction. Moving the mouse back toward the center responds at the existing sensitivity.
- The player still moves relative to the constrained camera heading.
- Starting a run and resetting the player restore the centered forward view.
- The restriction applies to the scavenging player controller. Title and survival cameras keep their existing behavior.

## Architecture

`PlayerController` already owns yaw, pitch, player-relative movement, and camera placement. It will define the look-cone constants and clamp accumulated yaw and pitch immediately after consuming mouse input. `InputController` will continue reporting raw pointer-lock deltas, and `ScavengePhase` will continue managing phase lifecycle only.

The initial yaw remains `Math.PI` and the initial pitch remains `0`. The controller clamps yaw to `Math.PI - Math.PI / 4` through `Math.PI + Math.PI / 4`, and pitch to `-Math.PI / 8` through `Math.PI / 8`.

## Error Handling and Accessibility

The bounds are deterministic and contain no failure path. Pointer-lock pause, blur clearing, reduced-motion camera shake, and keyboard movement retain their present behavior. Reduced-motion shake adds to the already-clamped view only when placing the camera, so it does not change the player-controlled limits.

## Tests

`PlayerController.test.ts` will verify that oversized horizontal mouse deltas stop at both 45-degree yaw limits and oversized vertical deltas stop at both 22.5-degree pitch limits. Existing movement tests will continue proving that movement follows the visible camera-space heading.

## Verification

Run `bun run test`, `bun run typecheck`, and `bun run build`. In the browser, begin a scavenging run and confirm that the mouse reaches each edge of the forward-facing view cone without changing heading farther, then returns smoothly toward center.
