# Underwater Menu Scene Refinement

## Goal

Improve the underwater start scene without changing its core layout or adding external assets.
Keep the world dominant and the screen center clear.
Show the full composition in both visual quality modes.

## Visual direction

Keep the illustrated, weathered, low-poly sea style.
Use cool water tones for the environment.
Use rust and worn wood for human debris.
Use light, fog, distance, and empty space to show depth and loneliness.

## Composition

Keep the menu boat in the center foreground and the Dorothy wreck in the middle distance.
Move both wooden signs closer to the camera.
Keep one sign on each side and preserve a clear view through the center.

Place two irregular mountain layers behind the wreck.
The nearer layer must frame the wreck silhouette.
The farther layer must add depth without becoming the main subject.
Terrain edges must join the main seabed without visible steps or gaps.

Group new debris near the wreck and along its implied damage path.
Do not fill every empty area.
Keep debris clear of the boat, signs, wreck, plants, and other props.

## Dorothy wreck

Replace the current coarse hull with a custom low-poly hull built from seven longitudinal cross-sections.
Use at least six perimeter vertices at each full cross-section.
Keep flat shading and a visible low-poly character.

Taper the bow and stern.
Give the deck a slight longitudinal curve.
Keep the existing damaged list and distant side view.

Keep two funnels.
Place both funnels on the ship centerline and separate them along the ship length.
Add bases and top rims.
Give each funnel a different tilt below 0.12 radians to show damage.

Retain deckhouses, mast, rails, and torn plates.
Adjust their positions to fit the revised hull and funnel layout.
Use seams, overlaps, and contact shadows to explain attachment.

## Light and atmosphere

Add a dedicated light-shaft component.
Use four broad, transparent shafts that descend from above.
Vary their width, angle, opacity, and reach.
Animate them with one shared time uniform.
Do not allocate objects during frame updates.

Keep the existing seabed caustics.
Reduce their flat overlay appearance through lower contrast and better interaction with top light.
Use hemisphere and directional light to make the upper water visibly brighter than the seabed.

Tune the existing GTAO pass for shorter and clearer contact shading.
Focus AO on contacts, seams, overlaps, interiors, and crevices.
Avoid broad dirty halos.
Keep the same scene content in both quality modes.
Only AO resolution and sample count may change between modes.

## Bubbles

Increase the bubble count from 144 to at least 240.
Add per-particle size and rise-speed attributes.
Use different drift phases and depth bands.
Keep all motion in the existing GPU shader.

Use both broad ambient columns and denser sources near the wreck.
Keep suspended matter separate from bubbles.
Make the size and speed ranges visible without hiding the wreck or signs.

## Seabed contact and debris

Use `menuSeabedHeight` as the source for grounded object heights.
Keep the lowest visible point from 0.02 to 0.10 world units below the local seabed.
Do not allow visible floating or deep burial.

Add procedural debris with existing materials and simple geometry.
Add at least 12 nearby pieces across broken planks, bent plates, ribs, pipe fragments, and small wreck parts.
Vary scale and rotation.
Reuse geometry and materials across repeated parts.

## Component boundaries

`SunkenDorothyWreck` owns wreck geometry, materials, transforms, and disposal.
`DistantSeabed` owns ridges, mountains, and distant ground detail.
`UnderwaterLightShafts` owns light-shaft geometry, shader state, animation, and disposal.
`UnderwaterParticles` owns bubble and suspended-matter pools.
`MenuSceneLayout` owns fixed positions, terrain height, footprints, and visibility rules.
`UnderwaterMenuWorld` assembles components and connects animation callbacks.

Do not add new packages or external models.
Preserve the existing construction rollback and disposal behavior.

## Validation

Add tests for these requirements:

- The hull has enough longitudinal and side facets to avoid the old box shape.
- Both funnels sit on the centerline and use different longitudinal positions.
- Both signs use a world Z position of at least 3.6 and remain inside the minimum viewport.
- Mountain layers remain behind the wreck and join the seabed.
- Bubble size factors span at least 0.65 to 1.70.
- Bubble rise-speed factors span at least 0.70 to 1.60.
- Grounded prop bottoms remain from 0.02 to 0.10 units below the local terrain.
- Protected footprints do not overlap.
- New components release their geometry and materials.

Run the focused menu tests, the full test suite, type checking, and the production build.
Inspect the scene at 1365 by 768 and 1920 by 1080.
Inspect both low and high visual quality modes.

## Success criteria

The wreck reads as a complete low-poly ship instead of a box assembly.
Its funnels read as ship structures placed along the vessel length.
Mountains remain visible behind the wreck.
The signs feel closer and remain easy to select.
Bubbles show clear size and speed variation.
Top light makes the upper water brighter than the seabed.
AO clearly strengthens local contacts without dirtying open surfaces.
No visible model floats, sinks too far, or intersects another protected object.
The seabed contains more narrative debris while keeping useful empty space.
