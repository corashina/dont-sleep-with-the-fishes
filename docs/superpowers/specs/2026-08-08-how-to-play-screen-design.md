# How to Play Screen Design

## Goal

Improve the static How to Play dialog for first-time players.

The screen must teach the game loop quickly. It must strengthen the maritime style and remain easy to scan.

The full guide must fit within a 1280 by 720 viewport without scrolling.

## Scope

This work changes the How to Play dialog only.

It keeps the current title menu, game rules, input model, dialog state, and focus behavior.

It does not add a tutorial, pages, game state, saved settings, or new runtime error handling.

## Chosen Direction

Use an Emergency Briefing Board.

The board combines a short game summary, two connected stages, and one compact control strip.

This direction balances fast reading, clear teaching, and the weathered maritime style.

## Layout

Use one centered briefing board with five vertical areas:

1. A small kicker: `BEFORE THE WATER WINS`.
2. The main title: `HOW TO PLAY`.
3. One sentence that explains the full game loop.
4. Two equal stage cards connected by a rope line.
5. A compact control strip, lifeboat note, and Back button.

Keep the two stage cards side by side at desktop widths.

Each card contains a stage number, title, objective, and three action rows.

Each action row contains one decorative illustrated icon, one command label, and one short instruction.

Place the Back button below the control strip. Keep it centered and easy to find.

## Content

Use this header summary:

> Save what you can. Reach the lifeboat. Survive until rescue.

### Stage 1: Escape Dorothy

Use this objective:

> Dorothy sinks in 60 seconds.

Use these action rows:

- `SEARCH` — Find food, tools, and emergency supplies.
- `CARRY` — Carry items with a total weight of 3.
- `SAVE` — Throw supplies into the lifeboat. Then get aboard.

### Stage 2: Survive the Sea

Use this objective:

> Stay alive and keep the hull intact until rescue.

Use these action rows:

- `PREPARE` — Fish, repair the hull, and use saved supplies.
- `WATCH` — Protect Health, Food, Energy, and Hull.
- `END DAY` — Use the lantern when ready. Night events follow.

Add this small stage stamp:

> RESCUE CHANCE RISES EACH DAY

### Controls

Keep the six current ship controls:

- Move: W, A, S, D
- Look: Mouse
- Sprint: Shift
- Jump: Space
- Use or Take: Left Click
- Pause: Escape

Keep the separate lifeboat note:

> In the lifeboat, use the mouse or Tab. Press Enter or Space to choose.

## Visual Design

Use tarred wood for the main board. Use worn paper for both stage cards.

Use brass pins, rope, and small ochre safety marks as accents.

Keep the underwater background dark and quiet. Keep the board as the clear subject.

Use the current font roles. Keep display type for the title and stable numeral type for keys and numbers.

Use one consistent line and material style for all new icons.

Extend `uiArtwork` with six decorative pictograms for Search, Carry, Save, Prepare, Watch, and End Day.

Do not use color alone for stage order, meaning, or state.

## Components

`MenuUI` owns the static dialog structure and approved copy.

`uiArtwork` owns the six new vector pictograms.

`main.css` owns the briefing board, stage cards, rope connector, control strip, and responsive layout.

No new component or data layer is needed.

## Behavior and Access

Keep the current dialog behavior unchanged.

- The How to Play sign opens the dialog.
- The Back button closes the dialog.
- Escape closes the dialog.
- Keyboard focus stays inside the open dialog.
- Closing the dialog restores focus to its opener.

Keep icons decorative with `aria-hidden="true"` and `focusable="false"`.

Keep semantic headings, lists, control terms, control definitions, and the dialog description.

Keep visible keyboard focus and clear text labels.

## Responsive Rules

At 1280 by 720, show the complete board without vertical or horizontal scrolling.

At widths above 820 pixels, keep both stage cards side by side.

At widths of 820 pixels or less, stack the stage cards.

Allow the board to scroll on viewports that cannot contain the stacked layout.

## Tests

Update the `MenuUI` tests to verify:

- The approved header, objectives, action labels, and rescue stamp.
- The six current ship controls and the lifeboat note.
- The two-stage semantic structure.
- Decorative icons remain hidden from assistive technology.
- Existing open, Escape, focus lock, and focus restore behavior still works.

Verify the rendered screen at 1280 by 720. Confirm that the board has no scrollbars.

Verify one narrow viewport. Confirm that cards stack and all content remains reachable.

Run the focused MenuUI tests, the full test suite, type checking, and the production build.

## Acceptance Criteria

- A player can identify both game stages in one glance.
- The screen teaches the 60-second limit, carry limit, lifeboat transfer, daily actions, night transition, and rescue goal.
- The full guide fits at 1280 by 720 without scrolling.
- The screen matches the weathered maritime style guide.
- Mouse and keyboard users can open, read, and close the dialog.
- Existing menu behavior and tests remain valid.
