# Sunk with Dorothy Ending Design

## Goal

Add the first scavenging ending: a player who remains aboard Dorothy when the
scavenging countdown expires watches the ship sink and receives the ending
"Sunk with Dorothy." Reduce the scavenging duration from two minutes to one
minute.

## Player flow

1. The scavenging countdown begins at `01:00`.
2. Before the deadline, the player can evacuate through the existing action
   while inside the lifeboat station rectangle.
3. When the countdown reaches zero, merely standing inside that rectangle
   automatically counts as evacuation. No click is required at the deadline.
4. A player outside the rectangle fails. Gameplay input stops, pointer lock is
   released, the HUD disappears, and an exterior sinking cinematic begins.
5. After Dorothy is effectively submerged, the ending panel appears.
6. Three seconds later, the `BACK TO MAIN MENU` button appears and receives
   focus.
7. Activating the button performs a full restart and returns to the scavenging
   title screen with a fresh session.

## Evacuation rules

The existing lifeboat station rectangle is the sole source of truth for
evacuation eligibility. The player position is evaluated in ship-local space
so the zone remains correct while Dorothy moves.

The session receives evacuation eligibility as a boolean when advancing time.
If a time step reaches or crosses the deadline, the session resolves success
when that boolean is true and failure otherwise. This keeps the rule
deterministic and testable without Three.js or a renderer.

Manual evacuation remains available before the deadline and uses the same
rectangle. The prior radial distance check is replaced rather than retained as
a second, conflicting definition.

## Cinematic direction

The failure cinematic lasts exactly eight seconds:

1. Cut immediately to a wide three-quarter exterior camera that frames Dorothy
   against the sea and keeps the lifeboat visible at a distance.
2. Hold briefly, then give Dorothy a heavy starboard list and bow-down pitch.
3. Accelerate the final descent until the hull and deck are below the shared
   wave field.
4. Keep the camera authored and restrained, with only a slight settling drift
   and no player control.
5. Continue independent lifeboat buoyancy, ocean motion, weather, and ship
   effects throughout the sequence.
6. Darken the live scene when Dorothy is effectively submerged, then place the
   ending panel over it.

Motion uses keyed anticipation, decisive travel, and accelerating mass rather
than a linear translation. The player and scavenging physics stop during the
cinematic. Dorothy's complete hierarchy moves together, including its deck
details and effects.

## Ending presentation

The ending uses a restrained full-screen ink-and-paper treatment over the
darkened scene:

- Kicker: `ENDING I`
- Title: `SUNK WITH DOROTHY`
- Body: `You stayed aboard for one trip too many.`
- Delayed action: `BACK TO MAIN MENU`

The screen omits supply statistics to preserve the quiet ending beat. The
button stays absent for three seconds, then appears with visible hover,
keyboard focus, and activation states. Gameplay cannot dismiss the screen
early.

## Architecture and ownership

### Shared scavenging rules

A single exported rule defines the 60-second duration and replaces duplicated
duration constants in the session, phase, UI calculations, and tests.

### Session

`ScavengeSession` owns deterministic deadline resolution and terminal status.
It knows only whether the player is eligible to evacuate, not how the world
calculates that eligibility.

### Phase

`ScavengePhase` owns lifecycle coordination:

- samples the ship-local evacuation rectangle;
- passes eligibility into session time advancement;
- stops input and player simulation on failure;
- releases pointer lock;
- advances the ending sequence;
- coordinates world, camera, and UI presentation;
- reports successful scavenging exactly once.

### Ending state machine

A small pure state machine advances through:

`playing -> sinking -> endingHold -> menuReady`

Its elapsed times, transitions, and output are deterministic. The sinking stage
lasts exactly eight seconds. The ending hold lasts exactly three
seconds. It does not own browser timers.

### Cinematic controller

A dedicated scavenging cinematic controller maps sinking-stage elapsed time to
Dorothy's pitch, roll, sink offset, camera position, camera target, wave
intensity, and final scene-darkening amount. Calculations are isolated from
rendering and expose stable key states for unit tests.

### World

`World` applies the supplied sinking transform to Dorothy and continues using
the shared wave field for the ocean and lifeboat. Scavenging physics simulation
is disabled during the cinematic. World construction and resource ownership
do not change.

### UI

`GameUI` owns the ending markup, styling, focus, and restart interaction. It
renders explicit ending-stage state from the phase instead of scheduling its
own reveal timeout. Disposal removes listeners and prevents stale restart
callbacks.

## Error and lifecycle behavior

The feature introduces no assets or asynchronous loading. Restart and disposal
invalidate the active ending presentation, remove UI listeners, and prevent a
stale cinematic from changing a new phase. The restart callback is accepted
only once.

If the phase receives a large frame delta that crosses more than one boundary,
the pure state machine consumes it deterministically and produces the correct
latest stage. A deadline-crossing frame resolves evacuation from the position
sample taken for that gameplay step.

## Verification

Automated tests cover:

- the initial timer and elapsed results use 60 seconds;
- inside the rectangle at the deadline auto-evacuates;
- outside the rectangle at the deadline fails;
- manual evacuation uses the same rectangle;
- deadline resolution is stable for exact and overshooting time steps;
- ending stages transition at their exact boundaries;
- cinematic ship and camera values match authored key moments;
- player input and scavenging physics stop during the cinematic;
- ocean, weather, ship effects, and lifeboat buoyancy continue;
- the ending appears only after the sinking stage;
- the button remains absent for three seconds and is focused when revealed;
- restart fires once and returns to a fresh scavenging title screen;
- disposal prevents stale ending updates;
- existing scavenging, world ownership, and lifecycle suites remain green.

## Out of scope

- Additional endings or an ending-selection gallery
- New ship, ocean, audio, or UI art assets
- Supply statistics on this ending
- Alternate reduced-motion behavior
- Changes to survival-phase endings
