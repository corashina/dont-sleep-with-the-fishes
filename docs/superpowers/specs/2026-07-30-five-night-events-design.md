# Five Night Events Design

Date: 2026-07-30

## Goal

Make five night events clear through physical staging, keyed motion, sound, and concise text.

The events are:

- Shark Men.
- Shower Night.
- Windy Night.
- Bad Sleep.
- Thunderstorm.

Keep their current deterministic rules unchanged.

## References

Use the local event brief as the primary presentation source:

- `docs/EVENT_PROGRESS.md`

Use the public event reference for factual checks:

- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Events>

Use the project visual guide for all player-facing work:

- `docs/VISUAL_STYLE_GUIDE.md`

Use one external model:

- [Animated Shark by Quaternius](https://poly.pizza/m/YYsK3gRCBZ)
- Public Domain, CC0.
- FBX and glTF formats.

Do not copy artwork, layouts, textures, or models from the original game.

## Scope

This work adds:

- A dedicated Shark Men presentation.
- The selected animated shark asset and its attribution.
- A coded human hand for exact rail contact.
- Clear weather reveals for Shower Night, Windy Night, and Thunderstorm.
- A narrow-gap dream presentation for Bad Sleep.
- Event-specific choice and result motion.
- Event-specific audio from current assets.
- Exact result feedback.
- Focused presentation, lifecycle, and integration tests.

This work does not add:

- New event rules.
- New outcome weights.
- New resource effects.
- New weather models.
- New sleep models.
- New wind models.
- New audio downloads.
- Reduced-motion behavior.

## Current state

The five event definitions already match the public rule reference.

Shower Night, Windy Night, and Thunderstorm have initial weather choreography.

Their current motion needs stronger staging and clearer held results.

Shark Men lacks a dedicated physical tableau.

Bad Sleep lacks its narrow-gap dream presentation.

The worktree contains unrelated user changes.

Implementation must preserve those changes.

## Visual interpretation

The design follows the visual guide's four pillars.

### Authored illustrated forms

Shark Men uses the selected shark as a starting form.

Several tinted copies create varied circling paths.

Only fins and short body sections break the water during the reveal.

One coded hand has uneven fingers, wet planes, and long nails.

It touches the rail at a precise authored point.

Weather events rely on existing rain, spray, waves, supplies, and lighting.

Bad Sleep uses the boat and supplies as dream subjects.

It does not add a creature.

### Scene-integrated interface

The world stays dominant.

A short top caption names the immediate threat.

Item choices remain attached to their physical supplies.

Sleep remains a compact contextual choice.

Result text states the exact gain, loss, damage, or broken item.

No new generic event panel covers the scene.

### Tactile keyed motion

Each beat uses anticipation, decisive travel, restrained overshoot, and a held result.

Lost items leave with clear direction.

Broken items deform or collapse before cleanup.

Damaging results use one main impact and one smaller settle.

All borrowed props return to their exact base pose when they remain aboard.

### Restrained print treatment

Existing post-processing stays authoritative.

Weather, lighting, materials, and composition carry the events.

No new full-screen effect hides the physical staging.

## Shared presentation order

1. The sleep cover closes.
2. `BoatWorld` stages the event.
3. Event audio starts when required.
4. The cover reveals the authored scene.
5. The world reveal finishes before choices unlock.
6. The player selects an item or Sleep.
7. The selected physical action plays.
8. `SurvivalSession` resolves the deterministic result.
9. The world plays the matching result.
10. Exact feedback appears and holds.
11. The cover closes.
12. The world clears all event state.
13. Calm presentation state returns before dawn.

## Shark Men

### Reveal

Start the ominous event cue before the cover opens.

Show one fin crossing the far side.

Add several fins on different paths.

Keep the paths fast enough to lose exact attacker positions.

Raise one wet hand beside the nearest rail.

Drag its nails along the rail with a boat-creak sound.

Use one small camera circle.

End on the held hand and two readable fins.

### Choices

The Harpoon Gun lifts, aims, and fires with one hard recoil.

The Swim Ring travels toward the nearest fin.

The Scuba Gear lowers below the rail.

Sleep leaves the hand searching along the hull.

### Results

A safe Harpoon result stops the cue and scatters all fins.

A lost Swim Ring travels under the water between two hands.

A broken Swim Ring stretches before tearing and settling.

Scuba success returns four Food while the damaged suit rises back.

Scuba failure uses one close underwater strike and one hull impact.

Sleep damage uses one fast fin pass and one heavy hull hit.

The safe Sleep result lets the hand withdraw without spectacle.

## Shower Night

### Reveal

The reveal lasts 3.4 seconds.

Fade into an overcast sky and sparse rain.

Raise the camera slightly.

Yaw across the deck and tilt toward the first drops.

Lift the supplies once as rain strikes them.

Settle into steady rain without constant camera motion.

### Choices

The Bucket catches rain with visible splashes.

The Umbrella opens, overshoots, and sheds water from its edge.

The Map spreads as a weak canopy and sags.

Sleep leaves rain crossing the frame.

### Results

A safe tool settles under steady rain.

A broken tool buckles and drops.

Damage uses one hull roll.

Rain remains active through the result hold.

Calm weather returns under the closing cover.

## Windy Night

### Reveal

The reveal lasts 3.6 seconds.

Sweep the camera across the deck with one small roll.

Lift supplies in uneven groups.

Move spray and mist across the frame.

End with one stronger gust and a quiet hold.

### Choices

The Fishing Net stretches across supplies and lashes them down.

The Map catches the gust, flaps, and leaves the boat.

The Umbrella opens and inverts with one sharp snap.

Sleep leaves the deck unsecured.

### Results

Broken items fold and settle low.

Lost items travel with the wind.

A damaging result rolls the hull once.

Two broken items react in sequence.

Wind reduces after the result hold.

Calm weather returns under the closing cover.

## Bad Sleep

### Reveal

Keep the sleep cover nearly closed.

Open narrow gaps at uneven positions.

Show the boat through wrong, still camera angles.

Pulse the caption with one slow breath.

Move one ordinary supply a few centimeters.

Pause, then return it slightly wrong.

Do not show a creature.

### Choices

The Bucket lifts as an awkward comfort object.

The Flashlight lifts without revealing a threat.

The Swim Ring presses close to the camera.

The Umbrella opens inside the boat and knocks the rail.

Sleep dismisses the choices and closes the gaps.

### Results

Safe choices end with one quiet exhale.

A broken Umbrella opens too far, catches, and collapses.

Sleep holds black for one extra beat.

Every prop returns to its exact base state before dawn.

## Thunderstorm

### Reveal

The reveal lasts 4 seconds.

Build rain, spray, rough waves, and camera motion.

Sweep the camera toward the horizon.

Use one strong lightning flash to silhouette the supplies.

Play thunder after the flash.

Hold the storm at full force.

### Choices

The Anchor drops and its chain pulls taut.

The Bucket bails through one broad arc.

The Umbrella braces against the wind and twists.

Sleep leaves the boat exposed.

### Results

A safe Anchor steadies the camera.

Bucket water leaves over the rail.

A broken tool collapses after the impact.

Lost items leave during a lightning flash.

Damage uses one large hull kick and one smaller settle.

The storm remains active through the result hold.

Calm weather returns under the closing cover.

## Components and ownership

### `SharkMenPresentation`

Add `src/survival/SharkMenPresentation.ts`.

It owns:

- Its root group.
- Shark scene clones.
- Event-only material clones.
- The coded hand geometry.
- Waterline accent meshes.
- Reveal and result animation state.
- Reused vectors, quaternions, and wave samples.

It exposes:

- `stage()`.
- `reveal()`.
- `playChoice(choiceId)`.
- `react(outcome, response)`.
- `clear()`.
- `settleForVisibilityChange()`.
- `update(time, delta)`.
- `dispose()`.

It shares loaded shark geometry across clones.

It disposes each owned resource once.

It creates no objects during update.

### `WeatherEventAnimator`

Extend the current class.

It owns:

- Shower Night reveal, choice, and result motion.
- Windy Night reveal, choice, and result motion.
- Bad Sleep camera and supply motion.
- Thunderstorm reveal, choice, and result motion.
- Fixed splash and transient effect pools.

It restores camera and supply poses after every operation.

### `SurvivalUI`

Add a Bad Sleep cover profile.

The profile keeps most of the cover closed.

It exposes narrow gaps without blocking event controls.

It keeps keyboard focus visible.

It shows exact result feedback after the world reaction.

### `BoatWorld`

Own `SharkMenPresentation`.

Coordinate it with the current generic and weather presenters.

Keep one operation token for cancellation.

Route choice motion before deterministic resolution.

Route physical results after resolution.

### `SurvivalPhase`

Keep the current lifecycle order.

Select the Bad Sleep cover profile by event identifier.

Do not unlock choices before the reveal completes.

Restore command focus after cleanup.

### `SurvivalSession`

Keep the current rules unchanged.

Remain the sole owner of mutable survival state.

## Audio

Use only current audio assets.

Shark Men uses:

- Event reveal.
- Boat creak.
- Harpoon Gun.
- Dive entry.
- Hard wave impact.

Shower Night uses:

- Rain.
- Bucket rain.
- Umbrella.

Windy Night uses:

- Strong wind.
- Item handling.
- Hard wave impact.

Bad Sleep uses:

- Going to sleep.
- Item handling.
- Umbrella.

Thunderstorm uses:

- Rain.
- Rough ocean.
- Thunder and lightning.
- Anchor chain.
- Bucket rain.
- Umbrella.
- Hard wave impact.

Audio follows the current preference and scope controls.

## Determinism

Rules use only the current injected random source.

Presentation motion never changes rules.

Shark paths and effect pools use fixed authored values.

They do not consume rule randomness.

The shared wave field remains the water source of truth.

## Error handling

Unknown event or choice identifiers do not start custom motion.

Unavailable item choices fail before any outcome draw.

Interrupted motion settles to a valid held or base pose.

Hidden documents cancel pending work through the current operation token.

Missing shark data falls back to coded fins and the rail hand.

The fallback keeps Shark Men readable.

Dispose resolves active promises and releases each resource once.

Missing presentation data never changes an event result.

## Tests

### Asset tests

- Verify the shark manifest entry.
- Verify the model loads.
- Verify the attribution entry.
- Verify the fallback remains available.

### Choreography tests

- Verify reveal start, middle, held, and restored poses.
- Verify each supported item action.
- Verify safe, broken, lost, damage, and severe results.
- Verify choice props return to their exact base transforms.
- Verify Bad Sleep gaps remain narrow.
- Verify Bad Sleep restores every prop before dawn.
- Verify lightning precedes thunder.
- Verify two Windy Night item breaks react in sequence.

### Lifecycle tests

- Verify choices unlock after reveal.
- Verify cancellation restores camera and supplies.
- Verify cover profiles reset during cleanup.
- Verify event roots hide after cleanup.
- Verify disposal occurs once.
- Verify focus returns after the event.

### Regression tests

- Verify the five event rule definitions do not change.
- Run focused event and presentation tests.
- Run the full test suite.
- Run TypeScript checks.
- Run the production build.

## Visual verification

Run each event through the event test path.

Check each reveal and result at 1280 by 720.

Confirm these facts:

- The threat is readable before choices unlock.
- The selected item action is visible.
- The result is visible without a large panel.
- Captions do not cover the main subject.
- Rain and darkness preserve supply silhouettes.
- Bad Sleep remains readable through narrow gaps.
- Cleanup leaves no event model, weather, or camera offset.

## Acceptance criteria

Shark Men clearly shows circling sharks and one human hand.

Shower Night clearly shows steady rain affecting the exposed boat.

Windy Night clearly shows loose supplies threatened by strong gusts.

Bad Sleep clearly feels like a shallow and interrupted dream.

Thunderstorm clearly shows rain, rough water, lightning, and delayed thunder.

Each choice has a distinct physical action.

Each result has a readable held pose and exact feedback.

The selected shark is the only new external model.

All rules remain unchanged.

All focused tests, full tests, type checks, and the production build pass.
