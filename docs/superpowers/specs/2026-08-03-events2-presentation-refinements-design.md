# EVENTS2 Presentation Refinements

## Goal

Implement every request in `EVENTS2.md`.

Preserve current worktree edits. Keep the existing event architecture.

## Visual Direction

Use restrained, uncanny maritime staging. Keep the scene darkly comic and melancholic.

Improve silhouettes, position, value, and motion before effects. Use tactile keyed motion for event cues.

Use the shared wave field for continuous water motion. Keep post-processing restrained.

## Architecture

Change each current event presenter and choreography module directly.

Keep event rules, UI, audio timing, rendering, camera motion, and world construction in their current owners.

Extend event stage data with a deterministic variant seed where left or right placement is required.

Derive one side from the seed when the event starts. Keep that side stable until the event clears.

Presenters apply deterministic poses. They must not allocate objects during frame updates.

Each presenter owns and disposes each new geometry, material, and particle system exactly once.

## Rules and Interaction

### Check the Back

Label the choices `Yes` and `No`.

`Yes` resolves the current fish result or the rare empty result. Remove the face result.

`No` uses the normal sleep flow and the current ignore result.

Do not reveal the stern result before the player selects `Yes`.

### Drifting Bottle

Move Drifting Bottle from the night event pool to the day event pool.

Keep its current retrieval rules, one-appearance rule, and absent-paper rule.

### Flowers

Remove the Flowers world interaction target.

Do not show a hover outline, tooltip, or pointer action for the flowers.

Keep the event choice available through the normal event UI.

### Other People

Remove the `Let It Pass` choice and its outcome.

The lantern sleep action remains the way to ignore the ship.

## Event Presentation

### Check the Back

Show the initial prompt while the camera faces forward.

After `Yes`, use a slower smooth camera turn toward the stern.

Show the fish on the back of the boat for the fish result. Show an empty stern for the rare empty result.

After `No`, use the normal sleep transition. Do not turn toward the stern.

### Bad Sleep

Play the yawn after the event fade opens and the cue becomes visible.

Keep supplies, boat props, and the camera fixed during the cue.

Use only a small eyelid closure to show the player starting to sleep.

Keep current item choice and result behavior after the cue.

### Man in the Fog

Lower the man until the waterline crosses the middle of his body.

Keep the silhouette readable through the fog.

### Ghosts

Delay the ghosts after the cue starts. Reveal them in uneven groups.

Orient each ghost toward its current path direction.

Remove the converging motion and burst effect. End with quiet dispersal or a held watch pose.

### Eerie Melody

Raise the island and siren above the highest local wave crest.

Use separate material values and restrained fill light to keep both readable at distance.

Increase fog density and improve depth layering without hiding the focal silhouettes.

### Face on the Moon

Keep the face restrained and uncanny.

Use deeper uneven eyes, an asymmetric mouth, and a tense grin. Avoid a jump scare or grotesque gore.

Keep the face readable against the moon at normal play distance.

### Drifting Bottle

Remove the circle under the bottle.

Reuse the fishing bite particle language around the bottle.

Sample the shared wave field for lift, pitch, and roll.

Place the bottle farther from the hull on a seeded left or right side.

Keep it visible through normal boat roll and wave motion.

### Flowers

Cover most visible foreground and midground water with authored irregular flower groups.

Keep the groups fixed in horizontal placement during the cue.

Sample the shared wave field for each group. Apply restrained lift, pitch, and roll.

Start with cloned models. Use instancing only if load tests show a performance problem.

### Midnight Tour

Place the island farther from the boat on a seeded left or right side.

Lower the island so more green surface remains visible near the water.

Keep the local wave crest below the green top.

Preserve the current visit, result, and cleanup flow.

### Night Trader

Show the trader boat when the event cue starts.

Remove the trader model and chest model from the boat.

Remove the arrival animation. Keep restrained shared-wave motion.

Preserve the current exchange choices and reward presentation.

### Other People

Show the ship when the event cue starts.

Place it farther from the player.

Remove the quick reveal travel. Move the ship slowly for the full event.

Preserve the current signal and rescue result behavior.

### Handyman

Replace the current weak hand pose with one large hand outside the boat.

Aim the palm toward the player. Let the fingers lurk over or through the gunwale.

Use a restrained idle motion with small wrist drift and uneven finger tension.

Keep the hand attached to one clear root. Preserve trade, touch, and sleep interactions.

## State and Cleanup

`stage()` resets each actor, selects any seeded side, and captures required camera state.

`reveal()` starts the deterministic cue. Choice and result methods retain their current contracts.

`clear()` cancels active work and restores camera, visibility, interaction, and borrowed actors.

`dispose()` releases new resources once. Existing cancellation behavior remains unchanged.

Unsupported event, choice, and result IDs retain their current safe behavior.

## Tests

Add or update focused tests for these requirements:

- Check the Back shows Yes and No, removes the face result, and keeps rare empty.
- Check the Back does not turn or reveal a result before Yes.
- Bad Sleep delays the yawn and keeps the camera, boat, and supplies fixed.
- Man in the Fog is half underwater.
- Ghosts appear late, face their paths, and never converge or burst.
- Eerie Melody keeps island and siren above waves and readable through denser fog.
- Face on the Moon uses the new uncanny face geometry.
- Drifting Bottle belongs to day events, uses particles, follows waves, and supports both seeded sides.
- Flowers has no interaction target, covers the view, stays horizontally fixed, and follows waves.
- Midnight Tour supports both seeded sides and keeps waves below the green top.
- Night Trader starts visible without trader or chest models.
- Other People has no pass choice, starts visible at distance, and cruises slowly.
- Handyman presents a large player-facing palm with restrained idle motion.
- Changed presenters reset and dispose their state correctly.

Run focused event tests first. Then run the complete test suite, type check, and production build.

## Acceptance Criteria

Every item in `EVENTS2.md` is visible in the event test harness and normal survival flow.

Random side choices are deterministic and stable for each event.

The shared wave field remains the source for water motion.

No changed frame update allocates objects. Each new resource has one clear owner.

All tests, type checks, and the production build pass.
