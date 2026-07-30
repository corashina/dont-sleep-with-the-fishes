# Restless and Supernatural Events Design

Date: 2026-07-30

## Goal

Make five night events clear through physical staging, keyed motion, sound, and concise text.

The events are:

- Restless Waves.
- Man in the Fog.
- Ghosts.
- Eerie Melody.
- Face on the Moon.

Use `docs/EVENT_PROGRESS.md` as the local presentation source.

Use the original event rules documented by the unofficial event reference:
<https://unoffdontsleepwiththefishes.fandom.com/wiki/Events>

## Scope

This work adds complete reveal, choice, result, cleanup, and test flows for all five events.

It adds:

- Two complete weather event flows.
- One supernatural event presenter.
- One event model library.
- Four individual low-poly models.
- One event audio asset.
- Temporary moon-face shader controls.
- Focused rule, presentation, audio, lifecycle, and asset tests.

It does not add model kits.

It does not add new story routes or endings.

It does not add reduced-motion behavior.

## Source analysis

### Restless Waves

Restless Waves starts on day 3.

Its event weight is 30.

Its cooldown is 35 days.

| Choice | Weight | Result |
| --- | ---: | --- |
| Anchor | 1 | No rule cost |
| Swim Ring | 50 | 10-20 Hull damage |
| Swim Ring | 50 | Break the Swim Ring |
| Sleep | 50 | 20-30 Hull damage and set Energy to 1 |
| Sleep | 50 | 15-25 Hull damage and lose one random item |

### Man in the Fog

Man in the Fog starts on day 6.

Its event weight is 18.

Its cooldown is 40 days.

It requires Pressure 1.

The project uses Pressure as its Danger value.

| Choice | Weight | Result |
| --- | ---: | --- |
| Compass | 1 | No rule cost |
| Telescope | 1 | Add 1 Pressure |
| Flashlight | 70 | Add 2 Pressure, lose 20 Health, and set Energy to 1 |
| Flashlight | 35 | Add 2 Pressure |
| Sleep | 50 | Add 1 Pressure and lose 10-30 Hull |
| Sleep | 50 | Add 1 Pressure, lose 20 Health, and set Energy to 2 |

These results do not change Rescue Progress.

### Ghosts

Ghosts starts on day 8.

Its event weight is 25.

Its cooldown is 38 days.

It requires Pressure 1.

| Choice | Weight | Result |
| --- | ---: | --- |
| Flare Gun | 1 | Consume the Flare Gun |
| Flashlight | 60 | No rule cost |
| Flashlight | 40 | Set Energy to 1 |
| Sleep | 60 | Set Energy to 2 |
| Sleep | 30 | Set Energy to 1 |

### Eerie Melody

Eerie Melody starts on day 13.

Its event weight is 19.

Its cooldown is 30 days.

It requires Pressure 2.

| Choice | Weight | Result |
| --- | ---: | --- |
| Bucket | 1 | Break the Bucket and set Energy to 1 |
| Telescope | 1 | Lose 50-90 Hull and 50 Health |
| Umbrella | 1 | Lose 40-60 Hull and set Energy to 1 |
| Duct Tape | 1 | Consume the Duct Tape |
| Sleep | 60 | Set Energy to 0 |
| Sleep | 40 | Lose 50-90 Hull and 50 Health, then set Energy to 1 |

### Face on the Moon

Face on the Moon starts on day 17.

Its event weight is 5.

Its cooldown is 50 days.

It requires Pressure 3.

| Choice | Weight | Result |
| --- | ---: | --- |
| Umbrella | 1 | Set Energy to 2 |
| Telescope | 60 | Break the Telescope and set Energy to 1 |
| Telescope | 40 | Add 1 Pressure |
| Sleep | 100 | Set Energy to 0 |
| Sleep | 20 | Set Energy to 2 |

The Telescope Pressure result does not change Rescue Progress.

## Asset selection

Use individual low-poly models only.

### Man in the Fog

Use [Man in Suit by Quaternius](https://poly.pizza/m/mQnGoME1ez).

The model uses CC0.

Its formal outline gives the distant figure a clear shoulder and coat shape.

### Ghosts

Use [Ghoooooost by Nikki Morin](https://poly.pizza/m/112vpcommxv).

The model uses Creative Commons Attribution.

Add its author, title, license, and source link to `src/assets/ATTRIBUTION.md`.

### Eerie Melody

Use [Animated Woman by Quaternius](https://poly.pizza/m/nIItLV9nxS).

The model uses CC0.

Its dress gives the reclined siren a long, readable shape.

Use [Rock Flat by Kenney](https://poly.pizza/m/CrSoV13mCU).

The model uses CC0.

Its broad top supports the reclined pose without extra rock models.

### Audio

Use [woman humming cathedral by Pennywind](https://freesound.org/people/Pennywind/sounds/816687/).

The recording uses CC0.

Trim a clean event loop from the source.

Record the source and license in `src/assets/ATTRIBUTION.md`.

## Visual interpretation

The events follow the visual style guide's north star and four pillars.

### Authored illustrated forms

Retain each model's low-poly plane economy.

Replace imported materials with project-owned event materials.

Use cool grey, cyan, faded violet, and restrained red values.

Add only details that improve the gameplay silhouette.

Avoid smooth primitive replacement models.

### Scene-integrated interface

Keep the fixed survival camera active.

Keep the event title and concise caption at the top.

Attach item choices to physical supplies in the boat.

Keep Sleep as a compact contextual choice.

Do not add a centered event panel.

### Tactile keyed motion

Use anticipation, decisive travel, restrained overshoot, and a held pose.

Do not add constant character wobble.

Keep continuous ocean motion fluid.

Use the shared wave field for ocean, boat, supply, and rock motion.

### Restrained print treatment

Keep existing post-processing authoritative.

Use light, fog, value, and silhouette to create clarity.

Do not hide weak staging with heavy grain or vignette.

## Guidance sequence

Each event uses the same player-facing order.

1. The sleep cover closes.
2. The world stages weather, models, audio, and sky state.
3. The event title and reveal caption appear.
4. The cover opens.
5. The world reveal finishes.
6. Physical and contextual choices become active.
7. The selected item performs its event beat.
8. The deterministic rule result resolves.
9. The world holds one readable result pose.
10. The cover closes.
11. The event clears before dawn.

Choices do not appear before the reveal finishes.

## Event staging

### Restless Waves

The reveal lasts 3.8 seconds.

The boat follows three uneven rises from the shared wave field.

The camera moves with the hull.

Supplies roll and lift from the same wave source.

The third rise ends on a steep crest.

The boat then settles into a readable list.

#### Anchor

The Anchor drops through a 1.75-second keyed beat.

The chain extends with visible weight.

The final catch reduces supply roll and levels the deck.

#### Swim Ring

The Swim Ring moves against the gunwale for 1.3 seconds.

One wave compresses the Ring.

The Ring rebounds with a small overshoot.

#### Sleep and results

Sleep leaves supplies loose.

Hull damage creates one side impact.

A broken Ring tears and settles low.

Item loss slides one selected supply across the deck and overboard.

The final listed pose holds before cleanup.

### Man in the Fog

The reveal lasts 4.2 seconds.

The fog weather profile applies before the cover opens.

The camera pans across empty water.

The Man in Suit appears near the middle of the sweep.

He moves slightly closer.

He disappears before choices become active.

The horizon remains barely readable.

#### Compass

The Compass rises for 1.2 seconds.

Its needle searches, overshoots, and settles.

The camera follows one clear bearing.

Fog thins along that bearing during the safe result.

#### Telescope

The Telescope rises for 1.45 seconds.

The camera pushes toward its view.

The view contains empty distance.

#### Flashlight

The Flashlight sweeps a narrow beam for 1.35 seconds.

An attack brings the same man model close.

He performs one short grab.

The camera jerks once.

#### Sleep and results

Sleep lowers the camera toward grey water.

Damage holds the close figure for less than one second.

Cleanup removes the figure and restores normal fog.

### Ghosts

The reveal lasts 4 seconds.

Create five clones of Ghoooooost.

Stage them at separate horizon points.

Move them inward at different authored speeds.

One ghost stops beside the left gunwale.

The other four hold at distinct distances.

Motion stays slow and slightly uneven.

#### Flare Gun

The Flare Gun fires upward.

A red flash makes every ghost a hard silhouette.

The ghosts thin into mist after the flash.

The Flare Gun leaves the boat through its consumed-item path.

#### Flashlight

The Flashlight sweeps across the nearest face.

A safe result dissolves every ghost.

An Energy result leaves the nearest ghost watching.

#### Sleep and results

Sleep closes the view while pale ghost shapes remain faintly visible.

The sleep cover can show them through a restrained pale mask.

Do not use a hull impact without a damaging rule result.

Hold the empty left side after the ghosts vanish.

### Eerie Melody

The reveal lasts 4.4 seconds.

Start the humming beneath the closed sleep cover.

Apply dense fog before uncovering the scene.

Stage Rock Flat in the shared wave field.

Pose Animated Woman in a reclined position on the rock.

Pull fog sideways to reveal both forms.

The siren turns her head toward the boat.

The melody becomes clear after the head turn.

#### Bucket

The Bucket rises over the camera for 1.35 seconds.

Its broken result drops with one sharp metal sound.

#### Telescope

The Telescope rises for 1.45 seconds.

The camera narrows toward the siren's face.

An attack drives the siren forward in one fast lunge.

The camera and hull take one heavy strike.

#### Umbrella

The Umbrella opens as a thin shield.

Its damaging result twists the shield and rolls the hull.

#### Duct Tape

The Duct Tape presses over the listening point.

This beat stays direct and deadpan.

The safe result cuts the melody sharply.

#### Sleep and results

Sleep lets the melody fill the scene.

Energy loss dims the scene without a false impact.

Attack results keep the melody through the lunge.

The melody stops when the lunge settles.

Fog then covers the rock and siren.

### Face on the Moon

The reveal lasts 3.8 seconds.

Keep the sea calm.

Hold the normal moon first.

Add the left eye.

Add the right eye after a short pause.

Add the mouth last.

Pull the mouth into a restrained grin.

Reduce star visibility as the face becomes clear.

Keep the face fixed in moon-local coordinates.

#### Umbrella

The Umbrella opens upward for 1.5 seconds.

Its canopy blocks the moon.

Only a weak halo remains around the edge.

#### Telescope

The Telescope rises for 1.45 seconds.

The camera pushes toward one moon eye.

A broken result snaps the Telescope backward.

A Pressure result widens the grin without moving the moon.

#### Sleep and results

Sleep closes while the grin remains visible at one cover edge.

Energy loss dims the scene and lowers the camera.

Cleanup hides every face feature before dawn.

## Components and ownership

### `EventModelLibrary`

Add `src/survival/EventModelLibrary.ts`.

Add `src/survival/eventModelManifest.ts`.

The library loads each source GLTF once.

It creates isolated scene clones for event presenters.

The owning asset bundle disposes source textures and model data once.

Event presenters dispose only their owned replacement materials.

### `WeatherEventAnimator`

Keep Restless Waves and Man in the Fog in `WeatherEventAnimator`.

Replace the procedural fog man with the selected Man in Suit clone.

Keep pure timing samples in `weatherEventChoreography.ts`.

Do not allocate objects during `update()`.

### `SupernaturalEventAnimator`

Add `src/survival/SupernaturalEventAnimator.ts`.

It owns:

- Five ghost clones.
- One siren clone.
- One rock clone.
- Event-only materials.
- Named model parts.
- Reveal, choice, and result state.
- Reused transform and wave samples.

It exposes:

- `stage(eventId)`
- `reveal(eventId)`
- `playItemUse(eventId, choiceId, instanceId)`
- `react(eventId, outcome, response)`
- `clear()`
- `settleForVisibilityChange()`
- `update(time, delta)`
- `dispose()`

It disposes each owned material once.

It releases pinned supply actors through the existing supply display contract.

### Pure supernatural choreography

Add `src/survival/supernaturalEventChoreography.ts`.

Pure functions return reveal, item, and result samples.

The functions do not read renderer state.

They do not consume gameplay randomness.

They write into caller-owned sample objects.

### `Skybox`

Add temporary moon-face uniforms and methods.

The controls are:

- Face reveal progress.
- Grin width.
- Star visibility scale.
- Event dim amount.

Generate the face inside the existing moon shader.

Do not create a second moon mesh.

`resetTransient()` clears every moon-face value.

### `BoatWorld`

`BoatWorld` owns both event animators.

It coordinates them with `EventPresentationLayer`.

It stages every supported presenter before removing the sleep cover.

It runs reveal and reaction promises in parallel.

It keeps one cancellation token for all event presentation work.

### `SurvivalAudio`

Add `eerieMelody` to the audio manifest.

Load it as an event-only loop.

`SurvivalAudio` owns its playback state.

It starts the loop when Eerie Melody begins.

It stops the loop on safe results, settled attacks, cleanup, pause disposal, and phase disposal.

### `SurvivalPhase`

Keep rule resolution order unchanged.

Start choice motion before rule resolution.

Send the accepted outcome to world and audio presenters.

Keep choices disabled during reveal and result motion.

Restore focus after dawn.

### `SurvivalSession`

`SurvivalSession` remains the only rule-state owner.

Add the missing Pressure eligibility requirements.

Align Man in the Fog Pressure results with the source.

Remove unsupported Rescue Progress changes from Man in the Fog.

Remove unsupported Rescue Progress changes from Face on the Moon.

### `SurvivalUI`

Keep the existing top caption and physical item anchors.

Keep keyboard focus inside active event controls.

Add only the pale ghost mask needed during the Sleep choice.

The mask does not block controls or replace world staging.

## Data flow

1. `SurvivalSession` opens one event.
2. `SurvivalPhase` applies the event weather.
3. `BoatWorld` stages the correct presenters.
4. `SurvivalAudio` starts event audio when required.
5. The UI shows the title and reveal caption.
6. The sleep cover opens.
7. The world reveal completes.
8. The UI enables valid choices.
9. The world performs the chosen physical beat.
10. `SurvivalSession` resolves the deterministic result.
11. World, sky, item, and audio reactions use that result.
12. The UI holds the readable result.
13. The cover closes.
14. Central cleanup restores all transient state.
15. Dawn begins.

## Determinism

Rule results use only the existing injected random source.

Presentation motion never changes rule state.

Ghost positions and speeds use fixed authored values.

The moon face uses deterministic shader math.

The shared wave field controls ocean, boat, supply, and rock motion.

No presentation code consumes rule randomness.

## Error handling

Unknown event or choice IDs do not start event motion.

Missing item actors fall back to the existing generic item beat.

Failed event model loading fails asset setup with a clear source ID.

An interrupted reveal restores camera and item transforms.

Hidden documents settle active motion through the current lifecycle token.

Central cleanup always clears weather, model visibility, sky values, audio, and supply poses.

Dispose resolves pending presentation promises.

Dispose releases every owned resource once.

## Tests

### Rules

- Verify each event weight, earliest day, and cooldown.
- Verify Pressure 1 for Man in the Fog and Ghosts.
- Verify Pressure 2 for Eerie Melody.
- Verify Pressure 3 for Face on the Moon.
- Verify all listed outcome weights and effects.
- Verify Man in the Fog does not change Rescue Progress.
- Verify Face on the Moon does not change Rescue Progress.
- Verify deterministic boundary rolls.

### Weather presentation

- Verify the 3.8-second Restless Waves reveal.
- Verify three distinct wave rises.
- Verify shared wave scaling for ocean, boat, and supplies.
- Verify Anchor stabilization and chain extension.
- Verify Swim Ring compression and rebound.
- Verify the 4.2-second fog reveal.
- Verify the man appears and disappears before choices.
- Verify Compass, Telescope, and Flashlight beats.
- Verify the close grab only occurs on the harmful Flashlight result.

### Supernatural presentation

- Verify five ghost clones use distinct transforms and speeds.
- Verify the left ghost reaches the gunwale.
- Verify red flare silhouettes and ghost dissolves.
- Verify the Sleep ghost mask clears.
- Verify the siren starts reclined on the rock.
- Verify the head turn precedes the clear melody.
- Verify Bucket, Telescope, Umbrella, and Duct Tape beats.
- Verify the attack lunge and hull strike.
- Verify every model returns hidden after cleanup.
- Verify update paths allocate no new model objects.
- Verify event materials are disposed once.

### Sky presentation

- Verify the two eyes and mouth appear in order.
- Verify star visibility falls during the reveal.
- Verify Umbrella occlusion leaves a weak halo.
- Verify Telescope motion targets one eye.
- Verify Pressure widens the grin.
- Verify Energy loss dims the scene.
- Verify every exit path resets moon uniforms.

### Audio

- Verify Eerie Melody starts beneath the cover.
- Verify safe results stop it sharply.
- Verify attacks keep it through the lunge.
- Verify cleanup, pause, and disposal stop it.
- Verify other events do not start the melody.

### Integration and UI

- Verify each event stages before uncovering.
- Verify choices stay disabled during reveal.
- Verify item and scene beats run together.
- Verify the result hold completes before cleanup.
- Verify keyboard focus stays within active choices.
- Verify focus returns after dawn.
- Verify all five events work through the event test scene.

### Assets

- Verify all four model files exist.
- Verify the audio file exists.
- Verify model metadata names the expected source IDs.
- Verify Ghoooooost attribution exists.
- Verify audio source metadata exists.

## Acceptance criteria

The player identifies every event before choices appear.

The player sees the selected physical response.

The player understands safe, damage, item, Pressure, and Energy results from the scene.

No event leaves weather, models, audio, sky changes, or item poses after cleanup.

All rule, presentation, audio, lifecycle, type, and build checks pass.

The final visual check uses all five event test scenes at 1280 by 720.
