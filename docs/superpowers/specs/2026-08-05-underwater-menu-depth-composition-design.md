# Underwater Menu Depth Composition Design

## Context

The current menu shows a small sunken boat on a flat seabed. A seated procedural skeleton fills the boat. The game title is an HTML overlay.

The revised scene must show more open water and stronger depth. The small boat and the wreck of Dorothy must share the main visual role.

## Goals

- Keep the camera at its current world position.
- Rotate the camera upward to show more water and less seabed.
- Keep the small wooden boat in the foreground.
- Leave only the skull in the small boat.
- Put the game title on a wooden sign in the scene.
- Add distant sand hills, sparse plants, rocks, and small wooden debris.
- Add a large, simplified wreck of Dorothy behind the small boat.
- Keep the current animated sharks, fish, bubbles, particles, and plants.
- Keep START and HOW TO PLAY as accessible HTML actions.

## Non-goals

- Do not add a new downloaded model.
- Do not reuse the complete playable Dorothy scene.
- Do not add a second shipwreck, anchor, audio, action, or menu state.
- Do not move the camera during menu updates.
- Do not add reduced-motion behavior.
- Do not add frame-update allocations.

## Composition

### Camera

Keep `MENU_CAMERA_POSITION` at `[0, 1.35, 7.8]`.

Change the fixed look target from `[0, 1.15, -4.8]` to `[0, 2.0, -4.8]`. This rotation places more open water above the subjects. It moves the visible seabed into the lower part of the frame.

The camera position, quaternion, field of view, and projection stay fixed during menu updates.

### Foreground title sign

Place the sign near the camera on the left at `[-2.65, 0.05, 1.8]`.

Use two uneven wooden posts and one wide wooden board. Rotate the sign toward the camera around the vertical axis. Add a small negative roll. The sign must look planted in the sand.

The board uses one `CanvasTexture`. Create the texture once at construction. Draw weathered brown wood, worn edges, dark seams, and the exact title:

`don't sleep with the fishes`

Use pale bone or parchment lettering. Keep high contrast at all required viewports. The board must not cover the small boat.

Remove the visible HTML title. Keep one visually hidden heading with the same title for accessibility. Preserve the current action placement with an explicit layout row. Do not depend on the hidden heading for spacing.

### Small boat and skull

Keep the current boat as the foreground subject. Keep its current approximate position and scale.

Remove the procedural torso, ribs, arms, and legs. Do not instantiate loose bone parts near the boat or in the distant debris. Place the skull inside the boat. Tip it slightly so it rests against the damaged interior.

Do not render `fishBone`, `largeBone`, or the procedural `SkeletonAssembly` in the menu. The committed model pipeline can remain unchanged in this revision.

### Distant Dorothy wreck

Create a simplified procedural Dorothy. Use the playable ship only as a proportion and identity reference.

The wreck contains these readable parts:

- one long damaged hull;
- one low deck strip;
- one wheelhouse or bridge block;
- one short funnel;
- one broken mast with one loose yard;
- two or three torn hull plates or exposed frame marks.

Place the wreck behind the small boat near `[4.5, -0.9, -22]`. Rotate it around all three axes. Show a broad diagonal silhouette. Bury the lower hull in a sand hill.

Use cool desaturated steel and green paint. Add small warm rust and exposed wood accents. Do not build rooms, furniture, collisions, physics, or gameplay anchors.

### Distant seabed

Add a separate low-poly distant seabed system behind the current foreground plane.

Build three overlapping ridge bands from static buffer geometry. The nearest band starts behind the small boat. The farthest band fades into fog. Keep the highest hills in the lower third of the frame.

Add these fixed background details:

- six to nine small rock clusters;
- eight to twelve sparse plant silhouettes;
- six to ten broken planks or small ship fragments;
- two short trails of debris that lead toward Dorothy.

Do not add another wreck or a large anchor. Keep open gaps between detail groups.

## Components

### `MenuTitleSign`

Create the sign geometry, title texture, materials, and root group. Expose one idempotent `dispose()` method. Dispose the canvas texture, geometries, and materials exactly once.

### `SunkenDorothyWreck`

Create the simplified wreck from static procedural geometry. Expose its root group and one idempotent `dispose()` method.

### `DistantSeabed`

Create ridge geometry and fixed background detail groups. Reuse shared rock, plant, wood, and sand materials. Expose its root group and one idempotent `dispose()` method.

### `UnderwaterMenuWorld`

Compose the three new components. Remove the procedural skeleton assembly from the scene. Place only the skull in the small boat. Apply the new fixed camera target.

Construction remains transactional. If one component fails, dispose all components already created. World disposal releases each owned component once.

## Animation and performance

The new sign, wreck, ridges, rocks, and debris are static.

The current sharks, fish, bubbles, suspended matter, kelp, and caustics keep their current animation.

Do not add geometry creation, material creation, texture creation, array creation, or scene traversal to the update path.

## UI behavior

START and HOW TO PLAY keep their current behavior and positions. The menu layout reserves the former title row after the visible title is removed.

The title sign is decorative Three.js content. The visually hidden HTML heading keeps the title available to assistive technology.

Pointer lock, the 0.7-second fade, intro handoff, and return-to-menu flow do not change.

## Testing

Add focused tests for these contracts:

- the camera position stays `[0, 1.35, 7.8]`;
- the camera uses the new upward target;
- the update path does not move the camera;
- the procedural skeleton root is absent;
- the skull remains inside the boat;
- no loose bone model is added to the scene;
- the title sign exists on the left foreground and owns one texture;
- the visible HTML title is absent and the hidden heading remains;
- Dorothy has the required named silhouette parts;
- distant ridge and debris groups exist with bounded counts;
- new resources dispose exactly once;
- partial construction failure cleans completed components.

Run the complete test suite, type-check, production build, and menu asset audit.

Repeat browser QA at `1440x810`, `1920x800`, and `1024x700`. Confirm the sign is readable, the boat and Dorothy share focus, the skull is visible, the seabed stays low in frame, and no foreground or distant geometry edge appears.

## Acceptance criteria

- The camera position is unchanged and its direction shows more open water.
- The small boat reads first and Dorothy reads clearly behind it.
- Only the skull remains in the small boat.
- The title appears on the left wooden sign, not as visible HTML overlay text.
- Dorothy looks large, damaged, tilted, and partly buried.
- Distant sand hills and small debris create depth without filling every gap.
- Existing animation and menu interaction remain unchanged.
- No new runtime asset or package is added.
- Tests, type-check, build, asset audit, and viewport QA pass.
