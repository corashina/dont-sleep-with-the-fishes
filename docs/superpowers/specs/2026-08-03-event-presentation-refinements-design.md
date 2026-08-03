# Event Presentation Refinements

## Goal

Implement every request in `EVENTS.md`.

Keep the existing event architecture. Preserve current worktree edits.

## Visual Direction

Use authored, irregular maritime forms. Keep the scene darkly comic and melancholic.

Use keyed motion for event cues. Use the shared wave field for continuous water motion.

Keep effects restrained. Improve silhouettes, scale, staging, and motion before post-processing.

## Architecture

Change each current event presenter and choreography module directly.

Keep event rules, UI, rendering, camera motion, and world construction in their current owners.

Choreography functions produce deterministic poses from time, seed, choice, and result state.

Presenters apply these poses. They must not allocate objects during frame updates.

Each presenter owns and disposes each new geometry and material exactly once.

## Event Changes

### Dangerous Waters

Increase the rock group from three rocks to seven rocks.

Use varied scale, rotation, spacing, and silhouettes. Keep the channel readable from the boat.

Keep every rock pose fixed during reveal, choice, and result presentation.

Move the boat and camera when relative motion is required. Do not wave-sample the rocks.

### Leak

Create three visible hull holes and streams on each boat side.

Keep the streams active through reveal and choice presentation. Reduce them only after a resolved repair.

Spread the interior water across the full usable floor width. Keep its depth visually even.

Use the shared wave sample only for small surface movement. Do not create an uneven side pool.

### Windy Night

Add one worn paper sheet to the weather event presenter.

Show it only during the Windy Night reveal cue.

Move it from left to right with a deterministic keyed path, flips, and short flutter beats.

Hide and reset it after the cue. Dispose its geometry and material with the presenter.

### Whirlpool

Turn the player camera toward the right side during the reveal cue.

Increase the visible vortex radius from 2.35 to 4.7 world units.

Add a clear dark funnel center. Use rotating surface rings and descending spiral streams.

Keep the vortex on the starboard side. Keep its surface placement tied to the shared wave field.

### Shark Men

Remove Shark Men from the event phase map, copy map, event catalog, and tests.

Do not keep a compatibility stub. Remove all supporting references.

### Mystery Chest

Disable the pointer hover outline for the Mystery Chest event subject only.

Keep keyboard operation and contextual choice text clear.

Place the chest upright, as it would stand on a floor.

Sample the shared wave field for lift, pitch, and roll while it floats.

Keep the motion restrained so the chest retains its weight.

### Chest Attack

Use the persistent chest display as the position source.

Stage the attack chest at the normal chest deck pose used after drifting loot acquisition.

Keep existing rattle, mimic, choice, and result choreography relative to that pose.

### School of Fish

Move the school center farther ahead. Keep the nearest orbit outside the boat hull.

Raise fish bodies closer to the surface. Show more than fins and brief flashes.

Increase silver value contrast and readable body scale without making the school luminous.

Keep all fish motion deterministic and wave-aware.

### Swarm of Anglerfish

Place the local waterline at each anglerfish body's vertical midpoint.

Use the shared wave field for lift, pitch, and roll.

Orbit fish around the boat through deterministic choreography.

Distribute starting angles across a full circle. Keep visible fish on both left and right sides.

Preserve the uneven group timing and cold lure-light treatment.

## State and Cleanup

`stage()` resets each changed actor and captures any required camera base pose.

`reveal()` starts the deterministic cue. Choice and result methods retain their current contracts.

`clear()` cancels active work and restores camera, visibility, and borrowed actors.

`dispose()` releases new resources once. Existing cancellation behavior remains unchanged.

Unsupported event and choice IDs retain their current safe behavior.

## Tests

Add or update focused tests for these requirements:

- Dangerous Waters creates seven rocks and keeps their transforms fixed.
- Leak streams appear on both sides and the interior water covers the full floor.
- Windy Night shows, moves, resets, and disposes the paper sheet.
- Whirlpool looks right, uses the larger radius, and contains a dark funnel.
- Mystery Chest has no pointer hover outline and follows the shared waves.
- Mystery Chest keeps an upright base pose.
- Chest Attack uses the persistent chest deck pose.
- School fish bodies stay visible at the intended distance.
- Anglerfish occupy both sides, orbit, remain half-submerged, and follow waves.
- Shark Men has no catalog, copy, phase, or test reference.

Run the focused event tests first. Then run the complete test suite and type check.

## Acceptance Criteria

Every item in `EVENTS.md` is visible in the event test harness and normal survival flow.

All event rules remain deterministic. The shared wave field remains the water-motion source.

No new frame update allocates objects. All new resources have one clear owner.

All tests and the type check pass.
