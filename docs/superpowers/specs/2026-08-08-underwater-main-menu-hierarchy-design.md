# Underwater Main Menu Hierarchy Refinement

## Goal

Make the game title visible and memorable.
Keep the underwater world as the main visual subject.
Make `START` the clear primary action.
Keep the boat and skull story easy to read.

## Selected direction

Paint the title on Dorothy's camera-facing hull.
Use the wreck as the title structure.
Do not add a third wooden board.

The visual order is:

1. Game title.
2. `START` sign.
3. `HOW TO PLAY` sign.
4. Boat, skull, wreck damage, and distant life.

## Title

Split the title across two lines:

```text
DON'T SLEEP
WITH THE FISHES
```

Use worn bone paint with a dark edge.
Add chipped edges, salt streaks, and uneven fading.
Keep damage away from key letter shapes.

Create the title as a transparent canvas texture.
Place its decal mesh against the camera-facing hull.
Align the mesh with the hull angle.
Offset it enough to prevent surface flicker.

Create the geometry, texture, and material once.
`SunkenDorothyWreck` owns and disposes these resources.
Do not animate the title.

## Composition

Reduce each board dimension by 25 to 35 percent.
Keep the `START` board larger than the guide board.
Move both boards outward and lower.
Keep each board inside a 4:3 desktop view.

Preserve a clear gap between the boards.
Show the boat and skull inside this gap.
Do not let either board cover the title.

Lower the foreground rocks' brightness and saturation.
Use the rocks as side frames.
Do not let them compete with the wreck.

Keep fish, sharks, and dense bubbles outside the title area.
Empty water around the title must improve reading and loneliness.

## Wreck and story

Keep the current low-poly wreck structure.
Make its existing list and seabed contact more visible.
Lower part of the hull into an irregular sand berm.

Replace one complete rail section with broken segments.
Give the mast a clearer damaged angle.
Keep all damage attached and structurally clear.

Move the skull from the open seabed into the small boat.
Place the existing large bone across one gunwale.
The pose must suggest an idle arm.
Keep the joke dry and easy to miss.

## Light and color

Keep cool teal light across the scene.
Use warm rust and bone tones for the wreck, title, and signs.
Do not use bright comedy colors.

Aim one existing light shaft toward the wreck title.
Keep the shaft soft and weaker than the title contrast.
Do not add a new shadow-casting light.

Give `START` a faint warm idle glow.
Keep `HOW TO PLAY` neutral while idle.
Use light and shape changes together for focus.

## Interaction

Keep the current world-space sign hit targets.
Keep the hidden semantic buttons in `MenuUI`.
Keep the current mouse and keyboard data flow.

On hover or keyboard focus:

- Brighten the board text and edges.
- Tilt the board slightly toward the camera.
- Keep the posts visually connected to the board.
- Use the same state for mouse and keyboard input.

Store stable base rotations.
Set focus transforms from those bases.
Do not accumulate rotation across state changes.

After `START`, clear both focus states.
Disable both actions during the existing black fade.
Do not change the phase transition timing.

## Error state

Keep the existing pointer-lock live region.
Show its message on a small illustrated strip near `START`.
Keep the strip clear of the title and boat.
Hide the strip when the player starts another pointer-lock attempt.

## Component boundaries

`SunkenDorothyWreck` owns the title, wreck damage, materials, and disposal.

`MenuSigns` owns both action boards, hit targets, and visual focus states.

`MenuSceneLayout` owns sign positions, footprints, and boat prop transforms.

`UnderwaterMenuWorld` attaches the skull and bone to the boat.
It also assembles the existing scene components.

`MenuUI` owns semantic controls, the guide dialog, and pointer-lock error text.

`MainMenuPhase` keeps the current focus callbacks and transition flow.

`UnderwaterLightShafts` keeps its current animation system.
Only fixed shaft placement and appearance values may change.

Do not add a new package or external asset.
Do not add a new frame-loop allocation.
Do not add new menu actions or camera movement.

## Verification

Add focused tests for these requirements:

- The wreck owns a two-line title mesh and its resources.
- Title resources dispose once.
- The title faces the camera and clears the boat.
- Each board dimension is 25 to 35 percent smaller.
- `START` remains larger than `HOW TO PLAY`.
- Both boards fit a 4:3 desktop view.
- Mouse hover and keyboard focus use the same state.
- Focus changes use stable base transforms.
- Transitioning clears focus and disables both actions.
- Pointer-lock errors remain visible near `START`.
- The skull and large bone are attached inside the boat.
- The skull no longer uses a seabed placement.
- Protected footprints do not overlap.

Run the focused menu tests.
Run the full test suite, type check, and production build.

Inspect these viewport sizes:

- 1024 by 768.
- 1365 by 768.
- 1440 by 900.
- 1920 by 1080.

Inspect idle, mouse focus, keyboard focus, guide, error, and fade states.
Inspect both low and high visual quality modes.

## Success criteria

The title is the first visual read.
`START` is the clear primary action.
The title remains readable across tested desktop views.
The signs do not hide the boat, skull, or wreck title.
The wreck reads as damaged, heavy, and partly buried.
The skull and bone add one quiet dark-comedy beat.
The scene keeps its cool, lonely underwater mood.
All resources clean up through the existing lifecycle.
