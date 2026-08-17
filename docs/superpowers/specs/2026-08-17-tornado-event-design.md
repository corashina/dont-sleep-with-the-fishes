# Tornado Event Design

## Goal

Replace the Whirlpool event with a dangerous animated Tornado event.
Keep the current event balance, choices, outcomes, and fixed world position.

## Event Identity

- Replace the event ID `whirlpool` with `tornado` across the game and tests.
- Change the player-facing title to `Tornado`.
- Describe a wind funnel at sea instead of circling water.
- Add no compatibility alias for the old ID.
- Keep the dangerous classification, night timing, pressure, and event weights.

## Gameplay

Keep the Anchor, Swim Ring, and Sleep choices unchanged.
Keep every probability, item effect, resource effect, delayed effect, and outcome text unchanged.
This change affects the event identity and presentation only.

## Asset

Reuse the existing low-poly Tornado model now stored as `whirlpoolCore.glb`.
Rename the file and model ID to `tornadoCore`.
Update the model manifest, bundle manifest, fetch scripts, lock data, metadata, and attribution entry.
Keep the source license and source URL unchanged.

Load the model through `DedicatedEventEnvironment.eventModels`.
The presentation owns its model instance and disposes it during cleanup.

## Presentation

Replace `WhirlpoolPresentation` with `TornadoPresentation`.
Place its world root at the current whirlpool center: X `12.8`, Z `-19`.
Keep the camera stationary.
Stand the model upright with its base at the sea surface.
Keep the tornado at this fixed position for reveal, item use, and reactions.

Remove all whirlpool-only visuals and state:

- the ocean vortex wave;
- the water depression;
- the dark submerged funnel;
- the six spiral water streams.

Add sparse sea spray and wind bands at the funnel base.
Use cool sea tones and low-poly forms from the visual style guide.
Keep the effect clear at play distance and leave the screen center open.

## Animation

Replace `whirlpoolChoreography` with `tornadoChoreography`.
Keep animation samples pure and apply them through `TimedPresentationAnimation`.

The reveal grows the tornado from its base, increases opacity, and accelerates rotation.
The idle state uses continuous rotation with a small slow sway.
Item-use animation keeps the tornado active while the existing item motion plays.
Reaction animation keeps the tornado fixed, then reduces its scale, spray, and spin before it fades.
Bad outcomes do not move the tornado toward the boat.

Reuse objects, samples, geometry, and materials during per-frame updates.
Do not allocate or rebuild resources in the update path.

## Naming and Routes

Rename files, classes, constants, types, object names, route entries, bundle keys, audio conditions, and lab mappings.
Remove all runtime use of `whirlpool` and `whirlpoolCore`.
Historical documentation and the unchanged third-party model title can retain the source term when required for attribution.

## Error Handling and Cleanup

Use the existing event-bundle failure behavior if the model cannot load.
Do not add a fallback model or procedural tornado.
Hide all tornado effects when the event clears.
Dispose the model instance, owned geometry, and owned materials once.
Restore the stationary camera through the existing lifecycle.

## Tests

Update event, route, bundle, session, UI, audio, timing, and item-use tests to use `tornado`.
Add focused presentation checks for:

- the fixed X and Z position;
- an upright visible model;
- increasing reveal scale and spin;
- continuous idle rotation;
- sparse base effects;
- no whirlpool funnel or water streams;
- no ocean vortex strength or depression;
- stable position during bad outcomes;
- cleanup and disposal.

Keep tests that prove the existing choices, odds, effects, and durations.
Run the focused tests, type checks, and the full test suite.

## Non-Goals

- Do not change event balance or inventory effects.
- Do not move the tornado toward the boat.
- Do not add a new camera move.
- Do not add a new audio asset.
- Do not add reduced-motion behavior.
