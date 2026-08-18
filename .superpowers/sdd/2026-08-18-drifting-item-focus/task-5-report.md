# Task 5 Report

## Implemented

- Replaced obsolete cargo-only phase calls with the shared drifting-item API.
- Added explicit entry, choice, result, return-ready, and return states.
- Added selection-first focus for barrels, chests, and bottles.
- Awaited world entry, retrieve, delegate, leave, and exit transitions.
- Kept event bundles active until camera return completed.
- Restored the same focus panel after rejected choices.
- Kept pickup results at the bow until the player continued.
- Added interruption guards for dispose, restart, hidden-page, and stale transitions.
- Added bottle reward summaries for the shared result flow.
- Changed drifting-item anchors to use `eventFocusId` without tooltips.

## TDD Evidence

### RED

Command:

`npx --no-install tsc --noEmit`

Result: TypeScript reported obsolete cargo-only phase and test calls.

After the first lifecycle integration, the focused suite had 14 failures.
The old tests bypassed selection or expected choices during reveal.

### GREEN

Command:

`npx --no-install tsc --noEmit`

Result: passed with no errors.

Command:

`npx --no-install vitest run tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts tests/SurvivalSession.test.ts`

Result: 493 passed and 0 failed across 3 files.

Command:

`npx --no-install vitest run`

Result: 1,692 passed and 0 failed across 128 files.

Command:

`npx --no-install --prefix "C:\Users\Corashina\Documents\Projects\dont-sleep-with-the-fishes" vite build --config "C:\Users\Corashina\Documents\Projects\dont-sleep-with-the-fishes\.worktrees\drifting-item-focus\vite.config.ts"`

Result: 417 modules transformed. The production build completed in 6.54 seconds.

The suite still prints existing Three.js asset warnings and Rapier deprecation warnings.
The build still prints the existing chunk-size warning.

## Files Changed

- `src/survival/BoatWorld.ts`
- `src/survival/SurvivalPhase.ts`
- `src/survival/SurvivalSession.ts`
- `src/ui/SurvivalUI.ts`
- `tests/BoatWorld.test.ts`
- `tests/SurvivalPhase.test.ts`
- `tests/SurvivalSession.test.ts`
- `tests/SurvivalUI.test.ts`

## Self-review

- Confirmed one session choice resolves each drifting item.
- Confirmed rejected choices restore the same focus panel.
- Confirmed result continue does not clear the event or bundle.
- Confirmed camera exit completes before cleanup and bundle release.
- Confirmed stale asynchronous transitions do not update disposed or restarted phases.
- Confirmed the hidden-page path does not resolve the event twice.
- Confirmed the obsolete cargo-only phase API is absent from source and tests.
- Confirmed `git diff --check` reports no patch errors.

## Concern

No correctness concern remains.
The existing test and build warnings remain outside this task.

## Fix Round 1

### Changes

- Classified initialized `eventFocusId` anchors as available during active events.
- Kept those anchors locked before selection initializes and while the UI is busy.
- Made `eventFocusId` anchors publish world hover and focus highlights.
- Added an active-event regression test for enablement, highlighting, and selection.

### Tests

RED:

`npx --no-install vitest run tests/SurvivalUI.test.ts`

Result: 1 failed and 98 passed. The active focus anchor was locked.

GREEN:

`npx --no-install vitest run tests/SurvivalUI.test.ts`

Result: 99 passed and 0 failed.

`npx --no-install tsc --noEmit`

Result: passed with no errors.

`npx --no-install vitest run`

Result: 1,692 passed and 0 failed across 128 files.

### Commit

`fix: keep drifting item focus anchors interactive`

## Final Fix Wave

### Changes

- Added an explicit hidden rule for the pickup choices.
- Added a computed visibility regression for the return-only state.
- Gave the drifting-item dialog a heading label.
- Restored Flowers collection to its authored stern deck target.
- Added visibility gates before choice resolution, pickup results, and camera return.
- Removed the duplicate full scene matrix traversal from focused frames.
- Added regressions for Flowers placement, hidden lifecycle boundaries, dialog access, and frame traversal.

### Tests

RED:

`npx --no-install vitest run tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts`

Result: 6 failed and 489 passed. The failures covered all five Important findings.

GREEN:

`npx --no-install vitest run tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts`

Result: 495 passed and 0 failed.

`npx --no-install tsc --noEmit`

Result: passed with no errors.

`npx --no-install vitest run`

Result: 1,695 passed and 0 failed across 128 files.

`npx --no-install --prefix "C:\Users\Corashina\Documents\Projects\dont-sleep-with-the-fishes" vite build --config "C:\Users\Corashina\Documents\Projects\dont-sleep-with-the-fishes\.worktrees\drifting-item-focus\vite.config.ts"`

Result: 417 modules transformed. The production build completed in 9.74 seconds.

One repeated focused batch hit an unrelated host timeout.
The isolated timed test passed, and the final full suite passed.

### Commit

`fix: address drifting item final review`
