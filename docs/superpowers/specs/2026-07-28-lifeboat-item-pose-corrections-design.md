# Lifeboat Item Pose Corrections

## Scope

Correct six item poses in the canonical lifeboat storage layout without
changing the display bench, the other item placements, or the requirement
that scavenging and survival use identical transforms.

## Root Cause

The canonical layout correctly derives support height from rotated model
bounds, but several slots use generic rotations that do not account for the
authored axes of their production models. The medical kit is also assigned to
the wrong support surface, and the vertical swim ring sits too close to the
seated viewpoint.

## Approved Composition

- Move the medical kit from the shelf to the left side of the floor arc near
  the toolbox, while keeping it fully visible and clear of adjacent props.
- Stand the map upright on the display shelf with its illustrated face toward
  the player.
- Rest the duct tape on its cylindrical side on the shelf.
- Rotate the harpoon gun so its long axis reads across the player's view at a
  slight diagonal instead of pointing toward the camera.
- Give the umbrella a compound tilt so its canopy and handle appear naturally
  supported by the deck.
- Move the vertical swim ring farther toward the bow and inward until its full
  silhouette is visible from the seated view.

## Architecture

All changes remain in `src/world/BoatStorage.ts`, the single deterministic
source for item surface, position, rotation, and scale. The existing
`restingSlot` bounds calculation will recompute contact height after each
rotation. Both scavenging storage and survival display continue consuming the
same canonical transforms with no phase-specific overrides.

## Verification

Placement tests will assert:

- the medical kit is classified as a floor item;
- map, duct tape, harpoon gun, umbrella, and swim ring have the approved
  axis-specific rotations;
- scavenging and survival transforms remain exactly identical;
- all production bounds contact their support surface, remain inside the hull,
  and do not overlap other items;
- bait remains closest to the fishing rod.

The running game will be visually inspected from the seated survival view to
confirm the map faces the player, each adjusted prop reads clearly, and the
swim ring is no longer clipped.
