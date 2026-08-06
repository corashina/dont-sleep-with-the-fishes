# Underwater Menu Scene Expansion Design

## Goal

Improve the underwater menu composition without changing the camera or menu actions.
Make Dorothy readable as the original ship while keeping the menu model simple.
Fill the full view with layered scenery, bubbles, fish, and sharks.
Prevent visible model overlap and clipping.

## Visual direction

Keep the illustrated low-poly style from `VISUAL_STYLE_GUIDE.md`.
Use clear foreground, middle, and horizon layers.
Keep the small boat and Dorothy as the two main scene objects.
Use wide prop groups instead of uniform clutter.
Keep clear sand around the boat, skull, signs, and Dorothy.

## Composition

Keep the current camera position and target.
Keep the small boat in the foreground.
Move Dorothy to world Z between -18 and -22.
This places it about 26 to 30 scene units from the unchanged camera.
Turn Dorothy close to a side view, near a 90-degree yaw, so its full length is visible.
Place Dorothy behind the small boat without hiding either silhouette.

Spread rocks, coral, kelp, seaweed, and debris across the full visible width.
Arrange them in broad groups that continue from the foreground to the hills.
Keep the center readable and avoid a dense wall of props.
Extend the mountain layers across the full horizon.
Keep the farthest mountain layer highest.

## Dorothy wreck

Build a dedicated menu wreck from the proportions of the full Dorothy ship.
Do not reuse the full gameplay ship graph, interiors, furniture, or collision data.
Use a simpler geometry set that preserves the main silhouette.

Include these large forms:

- a long hull with clear bow and stern shapes,
- the main deck,
- the main deckhouses,
- two funnels,
- one mast,
- simple outer rails,
- a few large damaged hull plates.

Omit small windows, interior rooms, furniture, and minor deck equipment.
Bury only the lowest hull edge in the sand.
Use restrained rust and worn paint to separate the ship from the seabed.

## Seabed material and geometry

Keep the sand low-poly.
Use larger dunes, small ripples, and irregular height changes.
Add subtle deterministic vertex-color variation to break the current flat surface.
Do not use a photographic texture.
Keep the sand readable beneath the caustic overlay.

## Bubbles and suspended matter

Distribute bubbles through several camera-facing depth bands.
Cover the center, sides, top edge, and corners of the view.
Keep the distribution deterministic.
Vary bubble size by depth without adding per-frame allocations.
Keep suspended matter softer and denser than bubble rings.

## Fish and sharks

Give each shark a separate ellipse with a distinct depth and height.
Give each fish school a separate wide path.
Increase spacing inside each school.
Avoid repeated crossings near the center.
Use the full horizontal view while preserving the boat and Dorothy silhouettes.

## Placement safety

Define clear placement zones for the boat, skull, signs, Dorothy, and large rocks.
Keep plants, coral, and debris outside those zones.
Allow only a small, intentional sand intersection at each grounded object.
Do not allow visible prop-to-prop intersections.
Check moving actor paths against the main static silhouettes.

## Structure

Keep Dorothy, distant terrain, particles, plants, and animation as separate menu components.
Store static placement data outside per-frame methods.
Reuse geometry and materials for repeated procedural details.
Do not add compatibility paths or new runtime dependencies.

## Verification

Add or update focused tests for:

- Dorothy proportions, side orientation, distance, and required main parts,
- full-width bubble distribution and deterministic particle data,
- separated shark and fish paths,
- sand geometry and color variation,
- protected placement zones and static model separation,
- exact resource disposal.

Run the focused menu tests, the full test suite, and the production build.
Inspect the menu in the browser at several viewport sizes.
Check the full animation loop for clipping and central crowding.
