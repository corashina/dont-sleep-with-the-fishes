# Centered HUD and Whole-Item Interaction Design

**Date:** 2026-07-13

## Goal

Refine the player-facing interface so survival information has a clearer hierarchy, full-screen states share a centered focal point, and recovered items are operated through their visible 3D models instead of small orange dots. Preserve all survival rules, action availability, keyboard controls, focus behavior, and phase flow.

## Scope

This change covers:

- the persistent lifeboat survival HUD;
- start, pause, fishing-choice, event, outcome, failure, result, and ending overlays in both game phases;
- projected interaction targets for recovered survival items;
- hover and focus feedback for recovered 3D item models;
- responsive layout, accessibility semantics, and regression tests for these elements.

It does not change resource rules, hunger calculations, action costs, event outcomes, shortcuts, the underlying inventory, or the fixed interactions for the hull patch and horizon.

## Persistent Survival HUD

The HUD uses three clear zones:

- The complete journal marker moves to the top center. Its artwork, day, phase, and weather remain one component.
- Health, Food, Energy, and Hull move to the top right as one condition group.
- The top left becomes empty. The loose Food, Bait, Repair, and Rescue tallies are removed from persistent presentation.

The existing performance statistics display is separate, unfinished work already present in the worktree. This change must preserve it and position it below the relocated condition group so the two do not overlap.

At narrower desktop widths, the centered journal and right-aligned meters scale down independently while keeping their semantic positions. The layout must avoid overlap at the project's supported desktop viewport sizes.

## Food Meter Semantics

The game's `hunger` value remains the source of truth and continues to increase as the character becomes hungrier. Presentation converts it to satiety:

```text
displayedFood = clamp(100 - hunger, 0, 100)
```

The meter label and accessible name become `FOOD`. Its number, fill width, and `aria-valuenow` use `displayedFood`, so a well-fed character has a full bar and the bar drains as hunger rises. The existing danger threshold of hunger at or above 70 maps to Food at or below 30. Danger copy becomes `LOW`, and `aria-valuetext` describes the displayed Food value as low.

Gameplay previews and outcome deltas may continue to use the word hunger where they describe the underlying survival effect, such as `HUNGER -35`. No rules or snapshot fields are renamed.

## Centered Full-Screen States

Every full-screen state in both phases uses the viewport center as its shared focal point:

- scavenging start, pause, failure, and result screens;
- survival pause, fishing choice, event, outcome, and ending screens.

The heading, supporting text, choices, warnings, and primary buttons are horizontally centered and grouped vertically around the viewport midpoint. The vignette, dark backing texture, and content group use the same center rather than the current top-biased survival composition.

Each overlay contains a bounded inner content region. If event choices or accessibility text make the content taller than the available viewport, the inner region scrolls without moving the overlay backdrop or clipping reachable controls. Existing focus trapping, topmost-modal ordering, pause precedence, focus restoration, and reduced-motion behavior remain unchanged.

## Whole-Item Interaction

### Projected bounds

`BoatWorld` continues to own knowledge of 3D item instances. For each visible recovered prop, it calculates a world-space bounding box, projects the box corners through the survival camera, and derives a screen-space rectangle. The interaction-anchor data supplied to `SurvivalUI` gains the target rectangle and camera depth in addition to the existing identity, action, visibility, depletion, and remaining-use data.

The projected rectangle receives small screen-space padding and a minimum accessible target size. Bounds for partially visible items are clamped to the viewport. An item with invalid projected geometry, a center behind the camera, or no viewport intersection is marked invisible. When item rectangles overlap, camera depth controls stacking so the nearer item receives pointer input.

Fixed interactions remain point anchors. The hull patch and horizon keep their compact orange dots and current tooltips because they do not have an obvious recovered item model to click.

### Accessible DOM targets

`SurvivalUI` retains one DOM button per interaction anchor. This preserves native click and keyboard activation, focus navigation, ARIA descriptions, shortcut metadata, unavailable explanations, and modal background suppression.

Recovered-item buttons are positioned and sized from their projected rectangles. Their surface is visually transparent and has no orange-dot pseudo-element, so the visible 3D item becomes the apparent control. Fixed-anchor buttons keep the existing circular presentation and marker.

Clicking anywhere in an item target invokes the same validated action path used today. Depleted or otherwise unavailable items remain focusable so their tooltip and reason can be read, but `aria-disabled` and the existing command guard prevent execution. Busy state continues to disable command dispatch.

### Model highlight and tooltip feedback

Pointer entry and keyboard focus on a recovered-item button publish its anchor ID through `SurvivalPhase` to `BoatWorld`. The matching model receives a restrained brightness or emissive highlight without changing its geometry, depletion state, or stored base colors. Moving the pointer away, blurring focus, opening a modal, entering a busy state, removing the anchor, or disposing the phase clears the highlight.

Highlight material state must be instance-local so highlighting one duplicate does not affect another instance that shares source assets. Restoring the highlight must respect the existing depleted-item tint.

The existing tooltip content remains the source for item name, remaining uses, condition, shortcut, cost, effect, risk, and unavailable reason. It appears on hover or focus and is positioned relative to the item-sized target with the current viewport-edge avoidance.

## Component Responsibilities and Data Flow

- `BoatWorld` measures and projects 3D item bounds, reports depth, and applies or clears model highlights.
- `SurvivalPhase` passes projected targets to the UI and relays highlight changes back to the world. It does not duplicate action validation.
- `SurvivalUI` renders the HUD and overlays, sizes accessible targets, determines their visual variant from whether they represent an item or a fixed action, and emits hover/focus identity changes.
- `GameUI` keeps its existing overlay behavior while adopting the shared centered full-screen layout rules.
- The stylesheet owns the new HUD positions, centered overlay composition, marker visibility variants, responsive collision avoidance, and focus-visible treatment.

The normal frame update remains:

```text
BoatWorld item transforms
  -> projected item rectangles and fixed points
  -> SurvivalUI DOM target geometry
  -> pointer/focus identity
  -> SurvivalPhase relay
  -> BoatWorld model highlight
```

Action dispatch continues through the existing `SurvivalUI` callback and `SurvivalSession` availability checks.

## Failure Handling

- Invalid or fully off-screen item projections create no active pointer target.
- A removed or hidden item clears any active highlight before its DOM target is removed or hidden.
- Highlight requests for unknown or no-longer-visible IDs are treated as a request to clear the current highlight.
- Opening any modal clears scene highlighting and makes background targets inert.
- Long overlay content remains reachable through its scrollable inner region.
- Reduced-motion preference removes highlight and tooltip transitions but preserves the state change itself.

## Accessibility

- Item interactions remain real buttons and retain mouse, Tab, Shift+Tab, Enter, and Space operation.
- Focus-visible styling surrounds the projected target without restoring the orange item marker.
- Unavailable item buttons remain discoverable with `aria-disabled` rather than disappearing from focus order.
- The Food meter exposes the displayed satiety value, not the internal hunger value.
- Centering does not alter dialog roles, accessible labels, live regions, focus traps, or focus-return behavior.
- Fixed scene actions retain visible markers, ensuring that the horizon and repair patch remain discoverable.

## Verification

Automated tests will verify:

- Food renders as `100 - hunger`, uses the matching fill width and ARIA value, and enters `LOW` danger state at Food 30 or below;
- hunger-based session rules and action previews are unchanged;
- the loose supply-tally section is absent from the persistent HUD;
- the complete journal remains intact and the stylesheet positions it at top center;
- the condition group is positioned at top right and performance statistics are below it;
- all full-screen overlay families use centered content and vignette rules, with bounded overflow behavior;
- projected item rectangles handle size, padding, minimum target dimensions, partial viewport intersection, invisibility, and depth;
- recovered-item targets have no orange marker while fixed targets retain one;
- pointer hover and keyboard focus highlight the correct instance and all clearing paths restore it;
- clicks, keyboard activation, shortcuts, unavailable explanations, modal inertness, pause precedence, and focus restoration continue to work.

The full typecheck, test suite, and production build must pass after implementation.
