# Scavenging HUD Clock Layout Design

**Date:** 2026-07-16

## Goal

Reduce the active scavenging HUD to the controls the player needs while moving through the ship. The top center will show three carry-weight circles with the pocket watch and numeric countdown beneath them. The FPS counter remains in its current position.

## Scope

This change affects the active scavenging HUD in `GameUI`. Start, pause, failure, and result screens keep their current copy and layout. Survival UI and the standalone FPS counter remain unchanged.

## HUD Content

`GameUI` will remove these active-HUD elements:

- the upper-left objective and its “CAPTAIN'S ORDER” and “LOAD THE LIFEBOAT” text;
- the upper-right saved-supply count and its “IN THE BOAT” label;
- the watch status text that changes from “SHIP LISTING” through the danger states.

The centered HUD cluster will contain:

1. the existing three carry-weight circles;
2. the illustrated pocket watch;
3. the numeric countdown inside the watch.

The prompt and crosshair keep their current positions and behavior.

## Structure and Layout

`GameUI` will place the pocket-watch element inside the existing centered `.carried` container after the weight-circle row. The container will use a vertical layout with centered children. This shared container keeps the watch aligned with the circles across desktop and narrow viewport rules without matching two unrelated absolute positions.

The watch will use normal flow within the centered container instead of its current upper-right absolute position. A small gap will separate the watch from the circles. Responsive rules may reduce watch dimensions or spacing, but the watch must remain below the circles without overlap.

## Countdown Readability

The countdown will use a light ink color on a compact dark backing within the watch face. The backing will cover the part of the black watch hands behind the digits. The countdown remains centered, uses tabular numerals, and keeps the red critical-time treatment at 30 seconds or less.

## State and Behavior

`GameUI.render` will continue updating the countdown and the root sinking-severity attribute. The severity attribute still drives the critical vignette. The UI will stop querying and updating the removed sinking-status and saved-count elements.

Saved-item state, result summaries, carry-circle rendering, timer progression, and phase transitions remain unchanged.

## Testing

`tests/GameUI.test.ts` will cover:

- absence of the objective, saved-count, and sinking-status elements;
- DOM order of the weight-circle row followed by the pocket watch;
- presence of the watch artwork and numeric countdown;
- CSS rules that center the cluster, place the watch in normal flow, and give the countdown a contrasting backing;
- preservation of critical countdown styling.

The focused test must fail before production code changes. After implementation, run the GameUI test, full test suite, typecheck, and production build. Inspect active scavenging at desktop and narrow viewport widths to confirm alignment, timer readability, prompt placement, and the unchanged FPS overlay.

## Acceptance Criteria

- No objective text appears in the upper-left during scavenging.
- No saved-count or watch-status text appears in the upper-right.
- The FPS overlay remains visible and unchanged.
- The three weight circles stay centered at the top.
- The watch and countdown sit directly below the circles.
- The countdown does not visually merge with the watch hands.
- Critical-time color and animation still work.
- Start, pause, failure, result, and survival interfaces retain their current behavior.
