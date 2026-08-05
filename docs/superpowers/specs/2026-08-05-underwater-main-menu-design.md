# Underwater Main Menu Design

## Goal

Replace the current ship title view with a dedicated underwater main menu.

The menu shows a drowned sailor scene on the ocean floor.

The existing scavenging intro and gameplay remain unchanged after the menu transition.

## Visual direction

The scene uses the game's dark maritime comedy.

It stays melancholy and strange without gore or strong horror.

The camera remains fixed on the seabed.

It looks straight toward a small sunken wooden boat in the middle distance.

The boat is the main subject.

A crooked skeleton sits inside it.

Loose bones rest inside the boat and near one side.

Rocks, seaweed, algae, and wreck debris frame the foreground.

Small fish, bubbles, and drifting matter make the water feel alive.

Two sharks cross the background and side layers.

Cool blue-green light enters from above.

Warm wood and pale bones separate the main subject from the water.

Fog hides the scene boundaries and supports depth.

The upper water stays visually quiet behind the title.

## Composition

The scene has three clear depth layers.

The foreground contains rocks, plants, loose bones, and small debris.

The middle layer contains the boat and seated skeleton.

The background contains sharks, fish, fog, and weak light shafts.

The boat remains readable at supported desktop aspect ratios.

The skeleton silhouette must remain clear inside the boat.

The screen center stays open enough for the scene subject.

The title remains at the top.

The `START` action remains at the bottom.

The `HOW TO PLAY` action remains in the upper-right corner.

## Source assets

Use the supplied Poly Pizza models as local pinned GLB assets.

- Boat: `https://poly.pizza/m/YwdXrwbN3o`
- Rock: `https://poly.pizza/m/d2VWOdthtR`
- Rock: `https://poly.pizza/m/54jZKTAt5p`
- Rock: `https://poly.pizza/m/li0YBlBEMz`
- Bone model: `https://poly.pizza/m/bU5RLZnq6v`
- Bone model: `https://poly.pizza/m/VGtSTNRf2O`
- Large bone: `https://poly.pizza/m/A67un3x9nV`
- Animated shark: `https://poly.pizza/m/AyHTK3zUSG`

Use the most complete bone model for the seated figure.

Use the remaining bone models as loose remains.

Use every supplied rock model once before repeating any rock.

Reuse existing local fishing models for the small fish.

Reuse existing local seaweed models where they suit the composition.

Record each source identifier, creator, license, hash, triangle count, and processing date.

Add every asset to `src/assets/ATTRIBUTION.md`.

## Architecture

Add `MainMenuPhase` as the first game phase.

The phase owns its scene, menu world, animator, UI, fade state, and event listeners.

Add `UnderwaterMenuAssets` for the pinned menu models and animation clips.

The app loader loads these assets with the other required game assets.

The asset library owns shared model resources and disposes them with the game.

Add `UnderwaterMenuWorld` to build the scene graph.

It owns the seabed, lighting, fog, plants, debris, particles, and placed model instances.

Add `UnderwaterMenuAnimator` to update all continuous motion.

It receives elapsed time and frame delta from `MainMenuPhase`.

Add `MenuUI` for the title, start action, guide action, guide dialog, and pointer-lock error.

Remove title and guide ownership from `GameUI`.

`GameUI` continues to own scavenging intro, HUD, pause, and scavenging ending surfaces.

Add a menu visual state to `SceneRenderer`.

It contains only the menu elapsed time needed by rendering.

## Phase flow

`Game` creates `MainMenuPhase` during initialization.

`Game.start()` starts the menu phase and the shared render loop.

Selecting `HOW TO PLAY` opens the existing guide content inside `MenuUI`.

Selecting `START` requests pointer lock immediately.

The menu does not start its fade before pointer lock succeeds.

Successful pointer lock starts a 0.7-second fade to black.

The fade blocks repeat actions.

After the fade, `Game` removes and disposes `MainMenuPhase`.

`Game` then creates and starts `ScavengePhase` with the shared renderer and camera.

`ScavengePhase.start()` detects the existing pointer lock and begins the current intro.

The scavenging ending action labelled `BACK TO MAIN MENU` returns to `MainMenuPhase`.

Survival actions labelled `START FROM THE SHIP` continue to start a fresh scavenging run.

## Scene construction

Build the seabed as one low-poly uneven mesh with a sand material.

Place the boat in the middle layer and angle it slightly for readable depth.

Pose the seated skeleton asymmetrically inside the hull.

Keep bones static after construction.

Place the three rock models as foreground and middle-layer anchors.

Add a small set of authored broken planks and rope-like debris.

Group debris by story instead of distributing it evenly.

Use cool fog and directional top light for the main value structure.

Use low ambient light for readable shadows and contacts.

Use small warm material accents only on human objects.

## Animation

The camera never moves.

Two shark instances follow separate closed paths.

They use the source swimming animation with different time offsets.

Their paths stay behind or beside the boat.

They never cover the title or `START` action for long.

Two small fish schools follow slower looped paths.

Plant vertices sway through one shared time uniform.

Bubbles use a fixed particle pool and loop their positions in the shader.

Fine suspended matter uses another small fixed particle pool.

Light shafts and caustic intensity change slowly.

The boat, rocks, skeleton, and loose bones remain still.

Animation updates reuse vectors, matrices, samples, and arrays.

No update or render path performs repeated setup or avoidable allocations.

## UI and access

Keep the current title text and menu labels.

Keep visible keyboard focus for both menu actions.

The guide remains a modal dialog with trapped focus.

Escape closes the guide and restores focus to its opener.

The world remains dominant behind sparse menu UI.

The fade uses an opaque black menu layer.

Do not add reduced-motion behavior.

## Error handling

Treat every menu model and required shark animation as a required asset.

A missing or invalid asset stops game creation.

The launch error screen names the failed menu asset.

A pointer-lock failure cancels the transition.

`MenuUI` shows the existing pointer-lock guidance and permits another attempt.

Disposal removes UI nodes, listeners, mixers, particles, model instances, and scene roots.

Repeated disposal remains safe.

## Asset validation

Add a dedicated menu model manifest, fetch process, audit command, and metadata file.

The audit checks exact expected files.

It checks source hashes, embedded resources, finite bounds, triangle limits, and attribution entries.

It also checks that the shark contains a usable swimming animation.

The fetch process publishes the complete model set atomically.

Do not add remote runtime downloads or asset fallbacks.

## Tests

Add asset-library tests for cloning, animations, failed loads, and disposal.

Add `MenuUI` tests for actions, focus, the guide dialog, and pointer-lock errors.

Add `MainMenuPhase` tests for updates, fade timing, blocked repeat input, and disposal.

Add game lifecycle tests for menu-to-scavenging and scavenging-ending-to-menu transitions.

Test that pointer lock starts the existing intro without another click.

Test that failed pointer lock leaves the menu active.

Test that all frame updates stop after disposal.

Run the full test suite, type check, asset audit, and production build.

Inspect the final menu at standard 16:9, wide, and small desktop viewports.

## Non-goals

Do not change scavenging gameplay, the existing scavenging intro, or survival gameplay.

Do not add menu audio, settings, save slots, credits, or new menu actions.

Do not add camera drift, orbit, or player control in the menu.

Do not add gore or a reduced-motion variant.

## Acceptance criteria

The game opens on the dedicated underwater menu after required assets load.

The fixed camera clearly frames the boat and seated skeleton.

The scene includes the supplied rocks, bones, shark, and boat assets.

Plants, bubbles, fish, and animated sharks keep the scene alive.

The title, `START`, and `HOW TO PLAY` remain clear and keyboard accessible.

`START` fades to black and begins the current intro without another click.

Pointer-lock failure keeps the menu usable.

Returning to the main menu creates a fresh working menu phase.

All validation, tests, type checks, and the production build pass.
