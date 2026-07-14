# Scavenging Weight Circles Design

**Status:** Approved

**Date:** 2026-07-14

## Goal

Match the original game's scavenging capacity display. The HUD shows three circles at the top center. Carried items fill one circle for each weight unit.

## Layout

`GameUI` replaces the bottom-left `IN YOUR ARMS` block with a top-center capacity group. The group contains three equal circles in one row. Empty circles use a dark translucent fill and a heavy blue-black outline based on the original game's HUD.

The existing objective, saved-count display, timer, crosshair, prompt, and feedback remain available. The timer stays at the upper right. Pickup and save feedback appears below the circle row so it stays inside the viewport.

At narrow desktop widths, CSS reduces the circle size and spacing. The row stays centered.

## Item Artwork

The existing `uiArtwork` module gains one inline SVG portrait for each scavenging item type. Each portrait uses a recognizable silhouette and the current Kenney model colors. The circle clips the portrait so the artwork fills its interior.

The project will not copy artwork from *Don't Sleep With The Fishes*. The new portraits follow this project's illustrated HUD style and ship with the existing source bundle.

## Slot Allocation

`GameUI.renderCarry` expands `snapshot.carriedItems` in pickup order. It repeats each item type once per weight unit, then adds empty circles until the row contains three circles.

Examples:

- One canned food item produces one food portrait and two empty circles.
- One medical kit produces two medical-kit portraits and one empty circle.
- One canned food item followed by duct tape produces one portrait for each item and one empty circle.
- One scuba set produces three scuba portraits.

Dropping, saving, or losing the most recent carried item removes all circles assigned to that item on the next render.

## Text and Semantics

The capacity group contains no visible label, numeric value, item list, hidden copy, or ARIA summary. The circles and their portraits are decorative HUD elements.

Stable data attributes remain available for tests and DOM updates. They carry no user-facing text.

## Error Handling

The session already prevents carried weight from exceeding three. The renderer still limits output to three circles so an invalid snapshot cannot expand the HUD.

An unknown item artwork identifier fails during development through the typed `ItemId` artwork map. Empty capacity always renders as three empty circles.

## Testing

Implementation follows test-driven development. `GameUI` tests will cover:

- three empty circles at startup;
- one weight-one item;
- two mixed weight-one items in pickup order;
- one weight-two item;
- one weight-three scuba set;
- removal after a drop or save snapshot;
- absence of visible and hidden capacity text;
- top-center and narrow-width CSS contracts.

Artwork tests will require a portrait for each `ItemId` and safe class handling through the existing `uiArtwork` API.

The final checks run the focused UI tests, the full Vitest suite, TypeScript type checking, and the production build.

## Scope

This change affects the scavenging HUD and item artwork helpers. Carry capacity, item weights, pickup order, drop behavior, saving, survival inventory, and 3D item models keep their current rules.
