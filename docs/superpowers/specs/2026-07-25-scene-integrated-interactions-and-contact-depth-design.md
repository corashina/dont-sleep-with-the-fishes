# Scene-Integrated Interactions and Contact Depth Design

**Date:** 2026-07-25  
**Status:** Approved  
**Approach:** Projected routine cards, authored freighter construction, and local contact accents

## Goal

Complete three ordered recommendations from `docs/VISUAL_AUDIT.md`:

1. keep routine fishing results and broken-item repair choices beside their
   physical subjects;
2. bring the crew-cabin and wheelhouse focal areas toward the lifeboat's
   authored-construction standard;
3. add selective local contact depth to those freighter areas and the survival
   supply platform.

The result must preserve gameplay rules, keyboard operation, reduced-motion
behavior, authored layout and item placement, renderer fallback, deterministic
construction, shared-wave motion, and exactly-once resource disposal.

## Visual Interpretation

The work applies the visual guide's scene-integrated interface, authored-form,
and restrained contact-depth pillars. Routine survival decisions remain visibly
part of the boat tableau. Freighter detail explains assembly through layers,
attachments, and purposeful asymmetry instead of indiscriminate polygon count.
Contact accents seat selected objects without outlining broad surfaces or
adding global grime.

## Architecture

The implementation has three independently testable slices in dependency
order:

1. `SurvivalUI` reuses existing projected interaction anchors to place compact
   routine-dialog cards.
2. freighter construction helpers add non-colliding detail to the existing ship
   geometry and the specific crew-cabin furniture placements.
3. a shared local contact-depth factory supplies reusable seam and footprint
   meshes to the accepted freighter details and survival supply display.

No gameplay module receives presentation-only state. No new render pass,
depth/normal target, screenshot harness, or general UI component framework is
introduced.

## Slice 1: Projected Routine Dialogs

### Presentation

Replace the full-viewport cinematic presentation of the fishing result and
repair target chooser with compact scene cards:

- the fishing result card is positioned from the current `fishing-tools`
  projection;
- the repair chooser is positioned from the current `repair-tools` projection;
- each card clamps to the safe viewport area and flips horizontally or
  vertically when its preferred side would overflow;
- the sea, lifeboat, rod, toolbox, and supplies remain visually unobscured;
- journal, pause, events, and endings retain their existing presentation.

The cards use the established ink, parchment, timber, typography-role, and
focus vocabulary. Normal motion uses a short material-aware reveal. Reduced
motion uses the settled pose without travel.

### Interaction and accessibility

Fishing retains its Continue command and repair retains the same target list,
Cancel command, Escape behavior, shortcut entry, live announcements, and focus
return. While either routine choice is active, unrelated controls remain
`inert` and focus remains trapped in the active card. The card remains a modal
dialog semantically because the gameplay state requires a response, but it no
longer owns a full-screen visual backdrop.

`SurvivalUI` stores the latest projected anchor positions and repositions an
open card whenever `setAnchors` runs. If an anchor is temporarily invisible or
outside the view, the card clamps to a deterministic safe fallback near the
relevant side of the survival tableau; it never falls back to a full-screen
overlay.

### Ownership

`src/ui/SurvivalUI.ts` continues to own DOM construction, modal order, focus,
and commands. `src/styles/main.css` owns the card material and responsive
layout. `SurvivalPhase` and gameplay session contracts do not change.

## Slice 2: Freighter Construction

### Exterior target

The crew-cabin and wheelhouse receive economical explanatory detail:

- layered roof fascia and drip edges;
- framed window and sill profiles;
- corner and header brackets;
- selected seam strips and fasteners;
- one restrained asymmetric repair plate.

The additions remain inside or immediately adjacent to the existing visual
shell. They do not create colliders or change room bounds, rail clearances,
doors, navigation, evacuation, or the title-screen composition.

### Interaction target

The existing `cabin-desk-aft` and `cabin-bookcase-forward` model instances gain
small construction groups containing edge bands, feet or cleats, bracket or
hinge plates, and attachment cues. The underlying models, transforms,
colliders, searchable surfaces, physical slot identifiers, standing points,
and item placement rules remain unchanged.

### Ownership

`src/world/ShipGeometry.ts` owns exterior construction meshes and their shared
geometry through its existing build/disposal contract. `src/world/ShipFurniture.ts`
owns model-instance accents through its existing generated-geometry set. Added
details reuse `ShipMaterials` and do not allocate during update or render.

## Slice 3: Selective Local Contact Depth

### Technique

Create `src/world/ContactDepthLayer.ts`, a small factory that owns:

- one reusable unit footprint geometry;
- one reusable unit seam geometry;
- one restrained dark transparent material configured with disabled depth
  writes and polygon offset;
- a named root group and idempotent `dispose`.

The factory exposes methods for adding scaled, rotated footprint and seam
instances without creating new materials or geometries per accent. Callers own
the returned layer and dispose it exactly once.

### Freighter application

Apply contact accents only to:

- crew-cabin and wheelhouse wall/deck junctions;
- accepted roof/fascia overlaps and bracket recesses;
- the `cabin-desk-aft` and `cabin-bookcase-forward` floor contacts.

The accents do not participate in collision or item-surface validation and do
not extend across broad deck areas.

### Survival application

Attach a contact layer to the lifeboat's motion hierarchy. Add:

- narrow accents beneath the supply-platform rails and selected slat joints;
- one irregular footprint per supply group at its authored base transform.

`BoatSupplyDisplay` synchronizes footprint visibility with each group's
`visibleCopies` state. Footprints remain on the platform while the item root
performs a temporary use animation, then continue to match the restored base
state. The contact layer follows lifeboat buoyancy because it is attached below
the same boat motion root, while the shared wave field remains untouched.

### Rendering limits

There is no screen-space AO, depth texture, normal pass, dynamic AO sampling,
or post-processing profile change. Sea, sky, broad hull surfaces, and controls
receive no contact treatment. The accents are static except for inventory
visibility and vessel motion inherited from their parents.

## Failure and Cleanup

Ship construction remains transactional: if detail or contact creation throws,
`createShip` disposes any completed child builds and the shared materials before
rethrowing. `BoatWorld` and `BoatSupplyDisplay` add their contact resources to
their explicit ownership paths. Disposal is idempotent and active item-use
animation still restores its exact base transform before resolving.

No presentation fallback may alter gameplay state. An off-screen projected
anchor affects card placement only.

## Testing

### Routine dialogs

Update `tests/SurvivalUI.test.ts` to verify:

- fishing and repair cards are compact projected dialogs without
  `cinematic-overlay` or a full-viewport backdrop;
- anchor-derived positioning, deterministic fallback, edge flipping, and
  viewport clamping;
- stable positioning updates without DOM recreation;
- Continue, target selection, Cancel, Escape, focus trap, background `inert`,
  and focus restoration;
- reduced-motion settled treatment and short-height containment.

Update `tests/SurvivalPhase.test.ts` only if an existing phase mock or
presentation contract requires adjustment; gameplay commands and outcomes must
remain identical.

### Freighter construction

Update `tests/ShipGeometry.test.ts` and `tests/ShipFurniture.test.ts` to verify:

- the named exterior and furniture construction groups exist;
- detail bounds stay within the accepted focal areas;
- `cabin-desk-aft` and `cabin-bookcase-forward` retain the same transforms,
  colliders, searchable surfaces, slots, and standing points;
- no construction detail is added to structural collider arrays;
- generated geometry is shared and disposed exactly once.

### Contact depth

Add `tests/ContactDepthLayer.test.ts` and update
`tests/BoatSupplyDisplay.test.ts`, `tests/BoatWorld.test.ts`, and ship-focused
tests to verify:

- footprint and seam instances share geometry and material;
- the layer material uses the approved depth-write and polygon-offset settings;
- freighter accents are limited to the approved targets;
- supply footprints track inventory visibility and remain at base placement
  during item-use animation;
- repeated disposal releases every owned resource exactly once;
- partial construction cleanup remains leak-free.

## Visual Verification

Check normal and reduced motion at 1280×720 and 1920×1080:

- fishing catch and miss results;
- repair selection with one and several broken items;
- viewport-edge and short-height routine-card placement;
- title-screen crew-cabin/wheelhouse silhouette;
- active traversal near the crew-cabin desk/bookcase cluster;
- survival supply platform with sparse and full inventories.

Compare contacts on both light and dark materials. The local accents must read
as seating and assembly at gameplay distance, not as black stickers, global
outlines, or extra grime.

## Acceptance Criteria

The work is complete when all three slices pass focused and full automated
verification, the production build succeeds, the visual matrix confirms the
accepted composition at both desktop viewports, and no gameplay, layout,
accessibility, shared-wave, renderer-fallback, or disposal contract regresses.
