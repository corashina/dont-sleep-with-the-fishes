# Task 4 Report

## Implemented

- Added a separate drifting-item camera state machine.
- Added enter, follow, return, hidden, clear, and dispose camera handling.
- Reused camera vectors, quaternions, and matrix during frame updates.
- Replaced the stern cargo rest with `drifting-item-bow-rest`.
- Moved cargo and bottle retrieval results to the bow rest.
- Replaced cargo-only world methods with shared drifting-item methods.
- Used shared retrieve and leave keys for all three drifting items.
- Projected the active drifting-item result root.

## TDD Evidence

### RED

Command:

`npx --no-install vitest run tests/BoatWorld.test.ts`

Result: 6 failed and 164 passed.

Four failures reported `world.enterDriftingItemView is not a function`.
Two cargo cases first exposed incomplete test model fixtures. I corrected those fixtures before implementation checks.

### GREEN

Command:

`npx --no-install vitest run tests/BoatWorld.test.ts`

Result: 170 passed and 0 failed.

Command:

`npx --no-install vitest run`

Result: 1,673 passed and 0 failed across 128 files.

The suite still prints existing Three.js asset warnings and Rapier deprecation warnings.

## Files Changed

- `src/survival/BoatWorld.ts`
- `src/survival/FeaturedEventPresentations.ts`
- `src/survival/DriftingCargoPresentation.ts`
- `src/survival/DriftingBottlePresentation.ts`
- `tests/BoatWorld.test.ts`

## Self-review

- Confirmed the focus state is separate from fishing state.
- Confirmed the focus update runs after featured-event motion.
- Confirmed the camera focus update creates no objects or arrays.
- Confirmed each replaced camera promise resolves once.
- Confirmed obsolete BoatWorld cargo-only methods are removed.
- Confirmed `git diff --check` reports no patch errors.

## Concern

`npx --no-install tsc --noEmit` still reports Task 5 call sites and mocks that use removed cargo-only methods.
Task 5 must switch those call sites to the new drifting-item API.
