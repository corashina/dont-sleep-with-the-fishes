# Scavenging Physics Design

## Summary

Add a contained rigid-body demonstration to the scavenging phase. A new barrel
will react to the freighter's existing wave-driven motion, collide with a
minimal ship enclosure, and settle with believable weight. The player will not
interact physically with the barrel in this increment.

Rapier will provide the rigid-body simulation. Project-owned adapters will keep
Rapier details out of gameplay, rendering, and general world-construction
interfaces.

## Goals

- Add one new physics-driven test barrel without changing either existing
  static barrel.
- Drive the physics enclosure from the exact rendered freighter transform,
  whose pose already comes from the shared wave field and sinking state.
- Provide a thin deck, ship box colliders, and sealed perimeter barriers.
- Keep the barrel fully contained.
- Use deterministic fixed-step simulation that is testable without a renderer.
- Give every physics resource and scene node one clear, idempotent owner.
- Establish a boundary that can later support player-to-body interaction
  without implementing that interaction now.

## Non-goals

- Replacing current player movement or collision handling.
- Applying rigid-body physics to scavenging items or existing deck furniture.
- Letting the player push, carry, or otherwise interact with the test barrel.
  Player and barrel collision layers will not interact, so the player may pass
  through it in this increment.
- Allowing the barrel to fall overboard.
- Simulating buoyancy, water contact, joints, breakage, audio, or damage.
- Adding player-facing UI or debug visuals to production presentation.

## Visual interpretation

The feature reuses the existing illustrated barrel model and makes its weight
legible through physical response rather than decoration. Moderate friction,
low restitution, and natural settling support the visual guide's authored
forms and tactile motion. Motion comes from gravity and the shared wave-driven
ship transform; there is no random impulse, idle wobble, or exaggerated bounce.

The physics enclosure is invisible in production. A development-only debug
view may expose collider outlines, but no primitive debug geometry will be
part of the player-facing scene.

## Architecture and ownership

### Physics runtime

`src/physics/PhysicsRuntime.ts` will own Rapier initialization and expose a
small factory interface. The runtime will load once alongside existing assets
in `launchGame`. `PhaseContext` will receive the factory rather than the raw
Rapier module.

Rapier initialization failure will be represented by a dedicated
`PhysicsLoadError`. Launch will dispose any successfully loaded sibling assets
and render a styled system error instead of constructing a partial game.

The shared runtime has no per-phase bodies or colliders. Each scavenging phase
creates a fresh physics simulation.

### Fixed-step clock

`src/physics/FixedStepClock.ts` will implement renderer-independent stepping:

- fixed timestep: `1 / 60` second;
- maximum substeps per frame: `3`;
- negative and non-finite deltas: treated as zero;
- excess accumulated time beyond the substep cap: dropped;
- caller-owned callback: invoked once per accepted substep.

The clock will not allocate in its update path.

### Scavenging simulation

`src/physics/ScavengePhysics.ts` will be the sole owner of:

- one Rapier world;
- one position-based kinematic rigid body representing the freighter;
- all colliders attached to that body;
- one dynamic barrel rigid body and its collider;
- fixed-step state and reusable transform scratch values.

Its public API will accept plain transform data and return plain barrel pose
data. Three.js objects and gameplay sessions will not enter this module.

Rapier 0.19.3's body `translation()` and `rotation()` getters necessarily
allocate wrapper objects and provide no caller-owned output form. The
simulation may call each getter once after all accepted substeps of an active
rendered update. It must not call them inside the substep loop, and all
project-owned update data remains preallocated.

`dispose()` will be idempotent. It will free the Rapier world exactly once;
freeing the world releases its bodies and colliders.

### World integration

`World` will own the barrel's cloned Three.js group and one
`ScavengePhysics` instance. The clone will share the furniture library's
geometry and materials, as existing furniture clones do, so `World` will remove
the clone but will not dispose those shared resources.

The barrel visual will be a direct scene child because its pose is produced in
world space. It will cast and receive shadows through the existing model
configuration.

On disposal, `World` will remove the barrel visual and dispose
`ScavengePhysics` as separate cleanup steps. Constructor rollback will do the
same if any later world-construction stage fails.

## Collider model

All enclosure colliders are attached to the kinematic freighter body and use
freighter-local coordinates.

### Deck

A thin cuboid covers the freighter footprint:

- width: `FREIGHTER_DIMENSIONS.width`;
- length: `FREIGHTER_DIMENSIONS.length`;
- thickness: `0.2`;
- top face: `FREIGHTER_DIMENSIONS.deckY`.

### Existing ship obstacles

Every existing `CollisionBox` in `ShipBuild.colliders` will become a Rapier
cuboid using its local center and half-extents. This includes the current
box-based walls, furniture, deck details, and railing segments. Existing
`CollisionArc` values will not be translated in this increment.

The conversion from `CollisionBox` to center and half-extents will be a pure
exported function. Invalid or non-positive extents will fail construction with
a descriptive error.

### Sealed containment

Four additional cuboids will form a closed rectangle on the inside of
`playerNavigationBounds.safe`:

- thickness: `0.25`;
- height above deck: `2`;
- two side barriers spanning the safe length;
- two end barriers spanning the safe width.

These barriers deliberately close evacuation gaps and approximate the curved
ends. They are a safety enclosure, not a replacement for rendered rail
geometry.

### Barrel

The dynamic body starts upright at freighter-local position
`[6, FREIGHTER_DIMENSIONS.deckY + 0.575, -6]`, transformed into world space by
the initial freighter transform. This position is on the open cargo deck, away
from the two existing barrels and the central navigation lane.

Its collider is a Y-axis cylinder:

- radius: `0.54`;
- half-height: `0.55`;
- mass: `35`;
- friction: `0.65`;
- restitution: `0.05`;
- linear damping: `0.15`;
- angular damping: `0.1`.

These are initial authored tuning values. They may be adjusted during visual
verification only if the acceptance behavior below is preserved and the final
values are covered by tests.

## Runtime data flow

For each active scavenging frame:

1. `World` samples and smooths the freighter pose from the shared wave field
   and sinking state, exactly as it does now.
2. `World` applies that pose to the rendered freighter.
3. `ScavengePhysics.update` receives the freighter's world translation and
   rotation plus the active frame delta.
4. The fixed-step clock determines zero to three substeps.
5. Across accepted substeps, the previous submitted freighter pose is
   interpolated toward the current rendered pose. Each interpolated transform
   is submitted with Rapier's next-kinematic-position API before stepping.
6. After the final step, `ScavengePhysics` calls Rapier's translation and
   rotation getters once each, then copies those wrapper values into reusable
   plain pose output. These two third-party wrapper allocations are the sole
   update-path exception.
7. `World` copies that pose to the barrel visual.

The interpolation prevents a long render frame from applying the whole ship
movement in the first physics substep.

The simulation starts only when the scavenging session is actively playing.
It does not advance on the title presentation, while paused, while the document
is hidden, or after the session reaches a terminal state. The rendered barrel
retains its last pose while simulation is frozen. Restarting scavenging creates
a fresh simulation and returns the barrel to its authored spawn.

## Containment recovery

After each update, `ScavengePhysics` validates the barrel pose. It resets the
body to its authored spawn and clears linear and angular velocity if:

- any translation or rotation component is non-finite;
- the barrel center lies outside the sealed containment rectangle;
- the barrel center falls more than `2` units below the deck.

Recovery is a defensive fallback. Correct collision behavior should keep the
barrel contained without invoking it.

## Error handling

- Rapier preload failure prevents game construction and uses the existing
  system-screen presentation.
- Invalid collider data throws during `ScavengePhysics` construction.
- `World` constructor rollback removes the barrel visual and frees a partially
  constructed physics simulation in reverse acquisition order.
- Cleanup continues through all owners while preserving the first error,
  following the existing `runCleanupSteps` convention.
- No runtime physics error mutates scavenging inventory, timers, player state,
  or phase results.

## Testing

### Pure unit tests

- Fixed-step accumulation produces expected step counts for common frame
  sequences.
- The substep cap drops excess time deterministically.
- Paused calls produce no steps.
- `CollisionBox` conversion produces correct centers and half-extents.
- Invalid extents fail with stable error messages.

### Rapier integration tests

Using the real initialized Rapier runtime:

- the barrel remains at rest on a level, stationary deck;
- a controlled kinematic tilt or translation causes barrel movement;
- the barrel cannot cross any of the four sealed barriers;
- the same initial state and freighter-transform sequence produces matching
  barrel poses within a fixed numeric tolerance;
- invalid and escaped poses reset to spawn with zero velocities;
- repeated disposal is safe.

### World and launch tests

- `World` adds exactly one test barrel without replacing the two existing
  barrels.
- world updates synchronize the barrel visual from physics output.
- inactive scavenging states do not advance physics.
- constructor rollback and normal disposal each release their owned physics
  resources and remove the visual once.
- physics preload participates in sibling rollback and surfaces a styled launch
  error.

### Verification

Run focused physics and world tests, then:

- full Vitest suite;
- TypeScript typecheck;
- production Vite build;
- manual scavenging check at normal and late sinking amplitudes.

## Acceptance criteria

- A separate third barrel is visible on the open cargo deck when scavenging
  begins.
- It responds to wave-driven freighter pitch, roll, heave, and translation by
  sliding, tipping, rolling, colliding, and settling.
- It does not receive random or decorative motion.
- It collides with the deck, existing box obstacles, and sealed perimeter.
- It cannot fall overboard during normal or late sinking motion.
- It cannot be pushed or manipulated by the player in this increment.
- Physics freezes outside active scavenging play and resets on phase restart.
- Simulation stepping is fixed, capped, repeatable, and renderer-independent.
- Existing scavenging rules, static props, player collision, and survival
  behavior remain unchanged.
