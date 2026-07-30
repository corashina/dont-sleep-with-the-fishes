# Drifting Event Presentation Design

## Scope

Implement five survival events:

- Drifting Loot
- Drifting Bottle
- Check the Back
- Mystery Chest
- Flowers

Preserve the current working-tree changes.

Use an isolated worktree for implementation. Copy the current working-tree
state into it. Do not alter the original checkout.

## Sources

Use `docs/EVENT_PROGRESS.md` as the local rule source.

Use the unofficial event reference to confirm original behavior:

- https://unoffdontsleepwiththefishes.fandom.com/wiki/Events

Use the original game only as a character reference. Do not copy its artwork.

## Visual direction

Keep the world dominant. Show each event through physical staging.

Use the four project pillars:

- Authored illustrated forms
- Scene-integrated interface
- Tactile keyed motion
- Restrained print treatment

Use cool sea tones and worn warm objects. Keep silhouettes clear at play
distance. Use negative space to preserve maritime isolation.

Do not add reduced-motion behavior.

## Interface

Show the event title during the cover transition.

Attach contextual choices to the event subject. Keep item choices on physical
supplies.

Lock all choices until the reveal ends.

Show Energy costs and unavailable reasons beside each contextual choice.

Use a concise result caption near the held subject. Do not use a large result
panel for night events.

Drifting Loot keeps its result until the player confirms.

## Architecture

Use one controller for each event presentation.

Each controller owns:

- Its scene nodes
- Its animation state
- Its temporary model copies
- Its projected interaction anchor
- Its cancellation and reset logic

The shared model library owns imported geometry, material, and texture
resources. It disposes each resource once.

`BoatWorld` coordinates controllers. It does not select outcomes.

`SurvivalSession` owns event rules and state changes.

`SurvivalPhase` owns lifecycle order:

1. Cover the scene.
2. Stage the event.
3. Render and settle the staged scene.
4. Remove the cover.
5. Run the visible event reveal.
6. Unlock choices.
7. Resolve the selected outcome.
8. Run the physical result.
9. Hold the result.
10. Cover and clear the scene.
11. Reveal dawn.

## Outcome data

Give each weighted result a stable presentation key.

The resolver returns that key with the resolved action. Presentation code uses
the key directly.

Presentation code must not infer an outcome from health, inventory, or resource
deltas.

Use injected randomness for all event draws.

## Shared motion

Use the shared wave field for all floating objects.

Use one wave sample per floating cluster when a shared sample is sufficient.
Use fixed scratch values in frame updates.

Do not allocate scene objects, vectors, or arrays in update paths.

Use keyed motion for reveals and interactions:

- Small anticipation
- Decisive travel
- Restrained overshoot or impact
- Imperfect held pose
- Clean reset

## Drifting Loot

### Model choices

Use both approved variants:

- [Barrel by Don Carson](https://poly.pizza/m/cu9GJ0j13fj)
- [Crate by Quaternius](https://poly.pizza/m/3VGWnZPXmG)

### Reveal

Stage the selected model under cover.

Slide it from an offset into the shared waves over 0.9 seconds. Use a short
anticipation and restrained overshoot.

Attach the interaction label to the floating model.

### Choices

`Retrieve It` costs 3 Energy.

Pull the model toward the stern over 1.1 seconds. Lift it over the rail with
visible weight.

`Let It Drift` moves it away over 0.8 seconds. Lower it behind a wave.

### Result

Hold the recovered model near the stern.

Show the exact reward beside it:

- 2 Food
- 2 Bait
- 2 repair material
- 1 Energy Bar

Clear the model after confirmation.

## Drifting Bottle

### Model

Use [Bottle of Wine by Jeremy](https://poly.pizza/m/13g9ucgxbHV).

Replace its material with restrained translucent green glass. Add a cork and a
rolled paper insert.

### Reveal

Play one soft glass knock under cover.

Slide the bottle from the right over 0.9 seconds. Let it pass the boat slightly,
then settle into the waves.

Turn the paper toward the camera. Do not make its text readable.

### Choices

The Fishing Net sweeps under the bottle and lifts it with wet drag.

The Swim Ring travels beyond the bottle. Pull both back toward the boat.

Sleep leaves the bottle for one final knock.

### Result

A retrieval holds the bottle above the rail. Show Bottled Paper beside it.

A missed bottle drifts backward. Give it one final highlight before it leaves.

Show a broken or lost tool before the bottle clears.

## Check the Back

### Model

Use [Fish by Poly by Google](https://poly.pizza/m/aEyLrUMMoUK).

Use a separate authored face built for this project. Do not source or copy the
original face.

### Reveal

Keep the camera forward during one stern flop.

Pause. Turn the camera halfway. Show one wet tail or shadow for a brief,
readable moment.

Present `Check the Back` and `Ignore`.

### Choices

Ignore returns the camera forward with an uneasy settle.

Check completes the camera turn.

### Results

The common result throws the fish aboard. Let it overshoot and settle near the
supplies. Add 1 Food.

The empty result holds on wet boards and one rolling drop.

The rare result places a still face close to the stern. Cut event sound. Snap
to black after the held stare. Record `I Looked at Me`.

The rare face can occur only after one prior Check the Back encounter.

Use result weights 500 fish, 50 empty, and 1 face.

## Mystery Chest

### Model

Use [Chest by Quaternius](https://poly.pizza/m/O72u4Drp8k).

Keep its thick ribs, plank seams, and small lock. Use wet dark wood and tarnished
metal.

Create a controlled lid group. Add authored teeth inside the lid for the mimic
result.

### Reveal

Show one chest corner under dark water.

Raise it slowly. Bump it against the gunwale. Slide the full chest into view
over 0.9 seconds.

Hold on the lock.

### Choices

Leave sends the chest away stern-first.

Take pulls the chest in two heavy motions. Pause after the first pull.

### Results

The safe result lands the chest on deck with one rebound.

The mimic result opens the lid into teeth. Lunge once toward the camera. Deal
25 player damage.

Use result weights 80 safe and 30 mimic.

Require Danger 1 and no Chest aboard.

## Flowers

### Model

Use [Lily Pad by Poly by Google](https://poly.pizza/m/0-_GjMekeob).

Recolor the flower to pale grey-white. Use muted dark green for the pad.

### Reveal

Let one flower enter first.

Add a loose field behind it as the cover opens. Clone the approved model with
authored scale, rotation, and spacing differences.

Use shared-wave samples with small fixed phase differences. Keep the horizon
open.

### Choices

The Fishing Net sweeps below several stems and lifts one cluster.

The Bucket gathers water and flowers. Drain it slowly before lifting it aboard.

`Let Them Drift` holds the camera while the field passes.

### Result

Collected flowers settle as one wet cluster aboard. Show a concise Flowers
caption.

Uncollected flowers separate and leave. Hold one last flower beside the boat.

Use event weight 2. Allow days 2 through 13. Allow one appearance.

Set the Flowers flag for Fishing Net or Bucket. Do not add a pressure limit.

## Audio

Reuse existing event reveal, item handling, impact, water, and chest cues where
they fit.

Add only missing cues:

- Soft bottle knock
- Stern fish flop
- Short mimic lid snap

Keep event audio scoped to the survival phase. Cancel it when the event clears.

## Error handling

Reject an invalid presentation key before animation starts.

If a model fails to load, use a small authored fallback model for that event.
Do not block the phase lifecycle.

Resolve all interrupted animation promises during clear or dispose.

Reset camera, weather, eligible items, labels, and event audio exactly once.

## Tests

Add deterministic rule tests for:

- Event weights
- Day bounds
- Appearance limits
- Chest requirements
- Bottled Paper exclusion
- Flowers flag
- Rare face prerequisite
- Stable presentation keys

Add controller tests for:

- Reveal completion
- Choice animation
- Each result key
- Held pose
- Clear during animation
- Promise completion
- Shared-wave sampling
- No repeated setup in update paths
- Resource disposal

Add phase tests for:

- Cover before staging
- Reveal before choice unlock
- Item motion before resolution
- Result animation before hold
- Clear before dawn
- Camera reset after Check the Back

Run visual checks at normal desktop size. Confirm subject framing, label
placement, silhouette contrast, and result readability for every outcome.
