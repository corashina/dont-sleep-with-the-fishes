# Six Night Events Design

Date: 2026-07-30

## Goal

Implement six survival events with clear physical staging and held outcomes.

The events are:

- Leak.
- School of Fish.
- Snatcher.
- Death Stare.
- Swarm of Anglerfish.
- Whirlpool.

Match the current event rules to the reference game.

Use authored low-poly forms, scene-integrated choices, tactile keyed motion,
and restrained print treatment.

## Sources

Event reference:

<https://unoffdontsleepwiththefishes.fandom.com/wiki/Events>

Project event notes:

[`docs/EVENT_PROGRESS.md`](../../EVENT_PROGRESS.md)

Project visual direction:

[`docs/VISUAL_STYLE_GUIDE.md`](../../VISUAL_STYLE_GUIDE.md)

## Scope

This work adds:

- Five pinned Poly Pizza GLB assets.
- Six dedicated event presentation modules.
- Pure choreography for reveal, item use, and outcomes.
- Exact Snatcher target staging.
- A shared vortex wave disturbance.
- Event-specific captions and exact result feedback.
- Missing rule constraints.
- Focused rules, choreography, lifecycle, ownership, and UI tests.

This work does not add:

- New events.
- New audio files.
- A new full-screen event panel.
- Runtime asset downloads.
- Reduced-motion behavior.
- Unrelated event refactors.

## Selected models

| Use | Model | License |
| --- | --- | --- |
| Leak hull insert | [Wood Planks](https://poly.pizza/m/hwQ1Fx5P8U) by Quaternius | CC0 1.0 |
| School fish | [Fish](https://poly.pizza/m/HkUAXudvBt) by Kenney | CC0 1.0 |
| Snatcher | [Enemy Small](https://poly.pizza/m/4LjT020LQh) by Quaternius | CC0 1.0 |
| Death Stare and Swarm | [Angler Fish](https://poly.pizza/m/85n5_RiSeSf) by Anonymous | CC-BY 3.0 |
| Whirlpool core | [Tornado](https://poly.pizza/m/2TBzV_5N0ci) by Poly by Google | CC-BY 3.0 |

Download and process each model during development.

Pin the source URL, asset ID, license, source hash, processed hash, and model
date in `src/assets/ATTRIBUTION.md`.

Bundle the processed GLB files with the game.

## Common player guidance

Each event uses this order:

1. Close the sleep cover.
2. Stage all hidden objects.
3. Open onto the main threat.
4. Show one short event caption.
5. Enable valid physical choices.
6. Animate the selected item.
7. Resolve the deterministic result.
8. Hold the exact result and feedback.
9. Close the cover.
10. Clear the event and reveal dawn.

The threat becomes readable before choices activate.

Valid supplies retain their physical anchors. They gain clear outlines and
labels.

Sleep remains a compact contextual choice.

The selected state differs from hover and focus.

Color supports meaning. Shape, motion, outline, and text carry meaning.

Safe, broken, lost, and damaging results use different motion.

The interface does not cover the central event subject.

## Visual interpretation

### Authored illustrated forms

Imported models provide the base silhouette.

Event modules add seams, wet bands, eyes, teeth, lure lights, water, foam,
and deliberate asymmetry.

The result must look authored for this boat. It must not look like a stock
asset display.

### Scene-integrated interface

Choices stay attached to recovered supplies.

Captions remain concise. Exact result feedback appears beside the existing
event interface.

The boat and event remain visible behind all guidance.

### Tactile keyed motion

Each action uses anticipation, decisive travel, restrained overshoot, and an
imperfect held pose.

Continuous ocean, buoyancy, and fish schooling remain fluid.

### Restrained print treatment

Existing post-processing remains authoritative.

Materials, lighting, composition, and motion create the event.

No new screen effect hides weak staging.

## Event designs

### Leak

#### Composition

Place the processed Wood Planks insert inside the starboard hull.

Cut one irregular split seam across two planks.

Keep the leak and the valid supplies visible in the same frame.

Add a fixed water-jet mesh pool, drip pool, shallow interior water plane, and
small splash pool.

#### Reveal

Open from black onto a thin water jet.

Pulse the jet through the split seam.

Let water collect inside the boat.

List the boat slightly toward starboard.

Push the camera toward the split, then settle.

#### Choices

- Duct Tape presses firmly over the seam.
- Bucket completes one heavy bailing arc.
- Map folds into the split with an awkward final shove.
- Sleep leaves the jet active.

#### Outcomes

A successful plug reduces the jet to drips.

A broken tool buckles, drops, and stays crooked.

Damage gives the boat one kick and makes the jet surge once.

A lost item slides across the wet deck and overboard.

Hold the wet final pose before the cover closes.

### School of Fish

#### Composition

Create a fixed pool of 24 Fish clones.

Use 18 to 24 fish according to the sampled choreography.

Vary scale, yaw bias, depth, and highlight value.

Do not randomize during rendering.

#### Reveal

Start with scattered silver flashes below the surface.

Gather the flashes into one rotating school.

Let the camera follow the school to the gunwale.

Sample the shared wave field for each visible fish.

#### Choices

- Fishing Net sweeps through the school with weight and drag.
- Bucket dips with one clumsy splash.
- Telescope pushes toward the camera and tracks one bright fish.
- Sleep lets the school pass.

#### Outcomes

A catch throws one clear fish onto the deck.

Show the exact Food gain.

A broken Net or Bucket stretches or twists, then holds low.

The remaining school scatters into darkness.

### Snatcher

#### Composition

Adapt Enemy Small into a wet maritime creature.

Use long fingers, oversized eyes, a hunched back, and an uneven jaw.

Keep the body mostly outside the gunwale.

Read the selected target from `pendingEventTargetId`.

#### Reveal

Show two fingers curling over the rail.

Show the head after a cautious pause.

Make the creature study the supplies.

Make it point at the selected target.

Give that physical item a strong target outline.

#### Choices

- Telescope swings down like a club.
- Swim Ring travels over the creature.
- Fishing Net snags after the creature moves.
- Harpoon Gun fires with one sharp recoil.
- Sleep leaves the target exposed.

#### Outcomes

A saved target settles into its original pose.

A sacrificed tool leaves the boat with decisive travel.

A stolen target catches on the rail for one beat, then drops overboard.

The creature gives one backward glance before leaving.

### Death Stare

#### Composition

Use one enlarged Angler Fish.

Add an authored jaw interior, uneven teeth, one dominant eye, and a wet lure.

Place the face in front of the boat.

Keep the supplies readable below its silhouette.

#### Reveal

Start the current event reveal cue under black.

Raise the fish slowly from the water.

Use fixed draining-water strands across its face.

Stop all keyed motion when its eye meets the camera.

Hold the stare longer than the other reveals.

#### Choices

- Flashlight sweeps across the eye.
- Umbrella opens as a thin shield.
- Food moves toward the rail.
- Harpoon Gun aims at the face.
- Fishing Net casts across the jaw.
- Sleep lowers the camera without removing the stare.

#### Outcomes

A safe result makes the eye blink once and the fish sink.

An attack uses one short lunge, one camera hit, and one heavy hull roll.

Broken items collapse into held poses.

Lost items travel into the mouth.

Hold the fish after impact before closing the cover.

### Swarm of Anglerfish

#### Composition

Create a fixed pool of 18 reduced Angler Fish clones.

Use 12 to 18 fish according to the sampled choreography.

Vary scale, lure height, yaw, darkness, and approach timing.

Keep the largest fish smaller than the Death Stare head.

#### Reveal

Start with three distant lure lights.

Add lights in uneven groups.

Move the lights inward below the shared wave surface.

Let several fish break the surface around the hull.

Turn the camera once as the circle closes.

#### Choices

- Fishing Net drops into the brightest cluster.
- Harpoon Gun fires through one opening.
- Flashlight sweeps across the swarm.
- Bait travels away from the boat.
- Sleep leaves the lights circling.

#### Outcomes

A safe sacrifice makes the lights follow the item and vanish.

A catch throws two fish onto the deck.

An attack moves several lights forward and snaps the camera back.

The Net breaks under one wet pull.

Hold empty dark water after the swarm leaves.

### Whirlpool

#### Composition

Flatten the processed Tornado model beneath the ocean surface.

Use it as the visible dark core. It is not the motion source.

Add fixed foam ribbons and debris pools above it.

Keep the dark center away from event controls.

#### Shared wave disturbance

Add an optional vortex disturbance to the shared wave field.

The disturbance state contains:

- Center.
- Radius.
- Depression.
- Tangential displacement.
- Rotation phase.
- Strength.

Apply the same disturbance math in CPU sampling and the ocean vertex shader.

Boat buoyancy, event props, foam, and ocean rendering read the same state.

The Whirlpool presentation changes only the disturbance state.

Reset its strength to zero during clear and dispose.

#### Reveal

Bend the surface into a broad circular pull.

Rotate foam and debris around the dark center.

Move the boat inward in three heavy beats.

Pull loose supplies toward the outside rail without detaching them.

#### Choices

- Anchor drops with a taut chain and a sharp final catch.
- Swim Ring presses between the hull and water.
- Sleep leaves the boat rotating toward the center.

#### Outcomes

A stable Anchor straightens the boat and slows the foam.

A broken Anchor snaps its chain and kicks the bow.

The Ring compresses, slips, or tears.

Severe failure throws two changed supplies overboard during one steep roll.

Hold the worst angle, then let the vortex release the boat.

## Architecture

### `EventPresentationCoordinator`

Add a coordinator for the six dedicated presentations.

It owns:

- One world root.
- One boat root.
- The six presentation modules.
- The active event route.

It exposes:

- `handles`.
- `stage`.
- `reveal`.
- `playItemUse`.
- `react`.
- `update`.
- `clear`.
- `settleForVisibilityChange`.
- `dispose`.

`BoatWorld` asks this coordinator first.

Existing generic and weather presentation paths handle all other events.

Only one path stages an event.

### Event presentation modules

Add one class for each event:

- `LeakPresentation`.
- `SchoolOfFishPresentation`.
- `SnatcherPresentation`.
- `DeathStarePresentation`.
- `AnglerfishSwarmPresentation`.
- `WhirlpoolPresentation`.

Each class implements one shared presentation interface.

Each class owns its roots, authored materials, effect geometry, and fixed
object pools.

### Pure choreography

Keep choreography free of Three.js objects.

Use one focused sampler per event.

Each sampler writes into caller-owned output records.

Sampler inputs contain:

- Normalized progress.
- Choice ID.
- Outcome class.
- Stable variant data.

Sampler outputs contain:

- Root translation and rotation.
- Camera offsets.
- Supply offsets.
- Effect strength.
- Visibility.
- Held state.

Tests can sample every stage without a renderer.

### `EventModelLibrary`

Load all five bundled GLB files once.

Keep immutable source roots.

Clone roots for event presentation.

Own shared source geometry, material, texture, and loader resources.

Dispose shared resources exactly once.

Event modules dispose only resources they create.

### Event presentation context

Pass one immutable context into `stage`.

It contains:

- Event ID.
- Snatcher target instance ID.
- Stable fish variant values.
- Current inventory state.

Move `pendingEventTargetId` into the main `SurvivalSnapshot` interface.

Remove the local module augmentation after all consumers use the main type.

### Outcome presentation data

Capture inventory state before event resolution.

Compare it with the state after resolution.

Create an immutable presentation result with:

- Resource deltas.
- Broken instance IDs.
- Lost instance IDs.
- Consumed instance IDs.
- Selected item condition.
- Snatcher target instance ID.

Pass this result to the active event module.

This data drives exact item motion for Leak, Snatcher, Death Stare, and
Whirlpool.

## Data flow

1. `SurvivalSession` selects an eligible event.
2. It selects the Snatcher target when required.
3. `SurvivalPhase` closes the sleep cover.
4. It builds the immutable presentation context.
5. `BoatWorld` stages the event.
6. The UI shows the reveal caption.
7. The coordinator reveals the active presentation.
8. The phase enables valid choices.
9. The coordinator animates the selected item.
10. The session resolves the weighted outcome.
11. The phase derives exact inventory changes.
12. The coordinator animates the result.
13. The UI shows exact feedback.
14. The phase closes the cover.
15. The coordinator clears all event state.
16. Dawn begins.

## Rule alignment

Keep all current outcome weights and effects.

Add these missing constraints:

| Event | Required change |
| --- | --- |
| Leak | `maximumAppearances: 1` |
| School of Fish | `minimumPressure: 1` |
| Snatcher | No rule change |
| Death Stare | `minimumPressure: 1` |
| Swarm of Anglerfish | `minimumPressure: 1` |
| Whirlpool | `minimumPressure: 1` |

Pressure is the project name for the reference game’s Danger value.

## Feedback

The reveal caption names the physical threat.

Result feedback shows exact resource changes.

Examples include:

- `FOOD +3`.
- `HULL -18`.
- `BUCKET BROKEN`.
- `MAP LOST`.
- `2 ITEMS LOST`.

Show item names when exact changed instances are known.

Keep the final physical result visible while feedback appears.

## Audio

Reuse current audio assets only.

Use existing event reveal, fish, item, tape, harpoon, impact, and anchor cues
where they match the visible action.

Do not add continuous background music.

## Error handling

Missing bundled event assets fail library construction with the asset name.

Unknown event IDs return control to existing presentation paths.

Unknown choice IDs produce no physical action and return `false`.

Cancelled animations resolve their pending promises.

Hidden-document settling applies the final held pose.

`clear` resets:

- Borrowed supply transforms.
- Camera offsets.
- Vortex strength.
- Visibility.
- Target outlines.
- Fixed effect pools.

Repeated `clear` and `dispose` calls remain safe.

## Performance

Allocate all fish, foam, splash, drip, water, and debris objects during setup.

Use stable arrays and maps.

Reuse all sample records, vectors, matrices, and quaternions.

Do not traverse scene graphs during per-frame updates.

Do not clone models during an event.

Do not create materials during an event.

Keep School at 24 fish or fewer.

Keep Swarm at 18 fish or fewer.

## Tests

### Rules

Test:

- Weight.
- Earliest day.
- Cooldown.
- Pressure requirement.
- Leak appearance limit.
- Snatcher target eligibility.
- Every current weighted outcome.

### Choreography

For each event, test:

- Exact identity at progress zero.
- Visible motion during the reveal.
- A readable held reveal pose.
- Distinct choice motion.
- Distinct safe, broken, lost, and damage motion.
- Exact reset after clear.
- Deterministic stable variants.

### Wave field

Test:

- Zero-strength vortex matches the default wave field.
- Vortex sampling is deterministic.
- CPU disturbance outputs remain finite.
- Vortex strength changes height, displacement, and normals.
- Boat buoyancy reads the disturbed field.
- Ocean uniforms receive the same vortex state.
- Clear restores zero strength.

### Presentation

Test:

- Coordinator routing.
- World-root and boat-root placement.
- Fixed fish counts.
- Snatcher target highlighting.
- Exact changed-item motion.
- Model resources dispose once.
- Event resources dispose once.
- Interrupted animations settle safely.

### Lifecycle and UI

Test:

- Threat reveal completes before choices activate.
- Invalid choices remain unavailable.
- Exact Food, Hull, broken-item, and lost-item feedback.
- Cover order around reveal and dawn.
- Event test mode can force each event.

### Visual verification

Use the event test menu for each event.

Check:

- 1280 by 720.
- 1920 by 1080.
- Low water quality.
- High water quality.
- Every choice.
- Safe and damaging outcomes.
- Missing optional items.
- Hidden-document interruption.

Confirm that the event subject, valid choices, caption, and result remain clear.

## Acceptance criteria

- All six events have dedicated physical reveals.
- Every valid item has event-specific motion.
- Every outcome has a clear held physical result.
- Snatcher visibly identifies its exact target.
- School shows its exact Food result.
- Death Stare stops keyed motion during the stare.
- Swarm closes around the whole boat.
- Whirlpool changes ocean rendering and buoyancy through one shared field.
- No per-frame object allocation or setup is added.
- Every new resource has one owner.
- All focused tests and the full test suite pass.
