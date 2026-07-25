# Balance and Interface Polish Design

**Date:** 2026-07-25  
**Status:** Approved  
**Approach:** Minimal, tightly scoped patch

## Goal

Apply eight bounded balance and presentation corrections without introducing a
new component system, changing gameplay flow, or expanding the desktop scope.
The work should reinforce the existing darkly comic maritime treatment while
preserving keyboard access, reduced-motion behavior, deterministic game rules,
and explicit Three.js resource ownership.

## Scope

1. Start survival with Hull and Food meters at 100.
2. Recompose the scavenging start screen.
3. Refresh and slightly enlarge the three-slot carry indicator.
4. Remove mapped textures from the storage workroom and its adjacent cargo
   model.
5. Enlarge survival item tooltips.
6. Move the normal survival camera forward.
7. Make End Day visually match Begin Evacuation.
8. Restore a gradual End Day blackout.

No saves, touch controls, new gameplay, persistent progression, broad UI
refactor, or general material-system redesign is included.

## Balance

Set `SURVIVAL_BALANCE.start.hull` to `100` and
`SURVIVAL_BALANCE.start.hunger` to `0`. The Food condition meter displays
`100 - hunger`, so this produces a starting Food value of 100.

The pooled `food` resource remains derived from saved and recovered canned
food. This change does not grant 100 consumable food units or alter item
quantities.

## Scavenging start screen

The start screen uses a full-height vertical composition:

- The breach warning, title, description, and control legend form a top group.
- The Begin Evacuation button sits in a bottom action group.
- Pointer-lock error copy appears with the bottom action so it remains close to
  the control that can resolve it.
- The sentence “Desktop keyboard and mouse required. Click to enable mouse
  look.” is removed.

The Begin Evacuation button receives a minimum width of 310 pixels and minimum
height of 74 pixels. Its existing accessible button semantics, keyboard focus,
hover, and active states remain intact.

Replace the left-weighted darkness with a top-and-bottom vignette. The center
band stays substantially transparent so the freighter and horizon remain
visible. The top band supports the title group; the bottom band supports the
action group. The layout must remain usable at 1280×720 and 1920×1080, including
short desktop heights.

## Carry indicator

Increase each carry circle from 88 to 96 pixels at the normal desktop layout.
The existing three-unit capacity and weight expansion remain unchanged: an
item with weight greater than one still occupies and illustrates multiple
slots.

Refine the slot and item artwork rather than changing its data contract:

- use a slightly irregular illustrated ring instead of a pristine software
  circle;
- retain a strong dark contour at gameplay distance;
- keep per-item color families;
- use selective light shapes rather than uniform highlights;
- ensure every icon remains recognizable at slot size;
- retain empty, filled, and item-type DOM states.

The compact breakpoint scales proportionally and must not overlap the pocket
watch or viewport edge.

## Freighter texture exceptions

Remove color, roughness, normal, and bump maps from:

- all `storageWorkroom` wall segments, corner caps, and roof surfaces; and
- the visually adjacent aft-port cargo model,
  `cargo-crate-aft-port`.

These targets keep muted solid colors, roughness, metalness where applicable,
and flat shading. Other freighter rooms, cargo models, floors, hull surfaces,
and the newly added texture assets remain unchanged.

Any replacement materials must have one explicit owner and be disposed exactly
once with the existing ship material lifecycle.

## Survival interface

Increase `.boat-tooltip` to a maximum width of 340 pixels, padding of 14 by
18 pixels, a 1rem contextual type size, and a 1.4 line height. Existing
projection, edge flipping, focus visibility, semantic descriptions,
unavailable reasons, and viewport containment remain unchanged.

Restyle End Day to visually match Begin Evacuation:

- use the same red-brown timber palette and illustrated grain treatment;
- retain the survival screen’s bottom-right placement;
- use matching display scale, contextual typography, border, shadow, and
  irregular contour;
- preserve distinct hover, active, focus-visible, disabled, and
  `aria-disabled` states.

This is a styling alignment only; End Day behavior and shortcut `7` do not
change.

## Survival camera

Move the normal authored survival camera forward along the boat and retarget it
slightly toward the interactive supply area. The new pose should reduce the
foreground bench’s screen coverage while retaining the lifeboat silhouette,
repair tools, fishing rod, saved supplies, and projected interaction anchors.

Only the base survival pose changes. The dedicated fishing camera endpoints,
fishing transitions, buoyant motion rig, shared wave field, and exact camera
restoration contracts remain unchanged.

## End Day fade

Use an opacity-only black sleep cover for normal motion:

- entering night fades from transparent to black over 2.5 seconds;
- leaving the covered state fades back over the same duration;
- the transition completion contract continues to resolve on the opacity
  transition with its timeout fallback;
- the cover never intercepts pointer input.

Remove the scale-based reveal so black cannot appear to snap across the center
of the screen. With `prefers-reduced-motion: reduce`, preserve the current
near-immediate transition while keeping the same state order.

## Testing and verification

Update focused automated tests for:

- starting Hull 100 and displayed Food 100 semantics;
- removal of the start-screen fine print;
- start button and start-layout structural classes;
- three carry slots, weight expansion, and item artwork identity;
- storage workroom and `cargo-crate-aft-port` material assignments;
- replacement material ownership and exactly-once disposal;
- the new base survival camera pose and unchanged fishing endpoints;
- sleep-cover class behavior, duration contract, interruption, and reduced
  motion.

Run the focused tests first, then the full test suite and production build.
Perform visual checks at 1280×720 and 1920×1080 for:

- the start screen’s top/bottom hierarchy, ship visibility, and keyboard focus;
- empty, partially filled, and full carry indicators;
- the storage workroom and adjacent aft-port cargo crate;
- the survival base tableau and projected tooltip bounds;
- End Day hover, focus, disabled state, and the complete blackout/return fade;
- reduced-motion behavior.

## Acceptance criteria

The change is complete when all eight requested corrections are visible or
behaviorally verified, unrelated uncommitted work remains intact, focused and
full automated verification pass, and no renderer-independent gameplay,
resource-ownership, keyboard, or reduced-motion contract regresses.
