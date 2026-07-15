# Focused Code and Test Cleanup Design

**Date:** 2026-07-15

## Context

The repository contains 10,909 TypeScript source lines and 11,522 test lines across 484 passing tests. The audit found unused production code, production exports used only by tests, repeated scene-resource and UI formatting logic, and tests that pin decorative implementation details.

This cleanup will preserve gameplay behavior and the contracts that keep the game usable and safe to change. Those contracts cover accessibility, asset integrity, navigation and collision safety, and resource ownership.

## Goals

- Remove production code without runtime callers.
- Consolidate repeated logic when each copy owns the same responsibility.
- Move lightweight test utilities out of production modules.
- Remove tests that duplicate stronger coverage or pin decorative details.
- Keep representative tests for each approved contract.
- Preserve runtime behavior, visuals, assets, and error semantics.

## Non-goals

- Redesign gameplay, UI, ship layout, or visual assets.
- Split large declarative files for file size alone.
- Create generic helpers for incidental arithmetic such as local clamp functions.
- Meet a target test count or coverage percentage.
- Change third-party assets or their provenance records.

## Production cleanup

### Dead code

Delete `src/game/scoring.ts` because the runtime does not import it. Remove its isolated test file.

Remove unused exports and members:

- `itemDefinition` and `createInitialItemState` from `ItemState`.
- `GameLifecycle` and `GameLifecycleActions` from `GameLoop`.
- `ITEM_ARTWORK_IDS` from `uiArtwork`.
- The unused `mount` and `reducedMotion` fields from `Game`. Keep constructor-local values that configure the renderer, UI, and motion behavior.
- `cabinetTopSurfaces` from `ShipLayout`.
- A test-only constant or inspection method when its sole test is also removed. Retain the method when it supports an approved core contract.

The implementation audit will confirm each symbol has no runtime caller before deletion.

### Test-only utilities

Move deterministic sequence random generation into `tests/helpers`. Production keeps the seeded random generator used by the game.

Move water-exclusion containment calculations and boat-storage envelope measurements into test helpers. Production keeps the transforms and bounds required at runtime.

Retain a test seam when removing it would force tests to construct a browser, WebGL renderer, or asynchronous asset pipeline. Keep such seams narrow and tied to a core contract.

### Shared scene resources

Add a small world utility that traverses mesh roots, collects owned geometries and materials, and disposes owned resource sets. `BoatWorld`, `World`, and model-library owners will use it where their ownership rules match.

The utility will not infer ownership. Each caller will decide which roots and resources it owns. Shared model templates, moon textures, renderer resources, and phase resources will keep their current owners.

### Shared UI formatting

Extract one time-formatting function for `GameUI` and `SurvivalUI`. The function will preserve clamping, rounding, padding, and output text.

### Launch cleanup

Replace the repeated active-game disposal blocks in `launchGame` with one local helper. The helper will dispose the current game once and clear the reference.

### Error handling

Resource cleanup will keep its current order. Cleanup paths that encounter several failures will continue later cleanup and rethrow the first failure. The refactor will not add recovery behavior or suppress errors.

## Test cleanup

### Contracts to keep

Retain tests for:

- Scavenging and survival rules, inventory, events, endings, and phase transitions.
- Keyboard operation, focus management, live announcements, unavailable reasons, target sizes, and reduced motion.
- Navigation reachability, collision safety, item placement, and lifeboat storage separation.
- Asset manifests, embedded resources, provenance ledger consistency, triangle limits, and representative malformed assets.
- Resource ownership, top-level idempotent disposal, construction rollback, and stale or reentrant callbacks.

### Tests to remove or consolidate

Remove CSS selector and style-string assertions that do not protect accessibility. Remove assertions for decorative colors, materials, object counts, and shader source text when a behavioral test protects the same feature.

Keep one owner-level disposal test and one shared-versus-owned boundary test per resource owner. Remove repeated checks for each geometry, material, or texture.

Remove tests that reject superseded layouts by historical object ID. Keep current reachability, clearance, and overlap validation.

Consolidate malformed-model cases around representative failure classes. Keep committed-asset validation in `bun run models:check`.

Combine repeated UI cases into table-driven tests when they exercise the same command, modal, focus, or rendering path. Keep distinct accessibility outcomes separate.

Delete tests for removed production APIs. Update imports to use test helpers where the test still protects a core contract.

## Implementation sequence

1. Record the baseline test and line counts.
2. Remove confirmed dead code and its isolated tests.
3. Relocate test-only utilities and update core tests.
4. Add shared resource and time-formatting helpers with focused tests.
5. Refactor callers without changing behavior.
6. Prune duplicate and implementation-detail tests subsystem by subsystem.
7. Run the full verification suite and inspect both game phases in a browser.
8. Compare source lines, test lines, test cases, and verification time with the baseline.

## Verification

Run these commands after the cleanup:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

Open the game in a browser and smoke-test both phases. Confirm scavenging movement, pickup, carrying, throwing, evacuation, survival actions, keyboard focus, modal handling, and restart. Check the browser console for errors.

## Acceptance criteria

- The verification commands pass.
- Both game phases complete the smoke checks without console errors.
- Runtime behavior and visuals match the pre-cleanup game.
- Each remaining test maps to an approved core contract.
- Deleted tests fall into one documented category: duplicate, implementation-specific, historical, or dead-code coverage.
- Production no longer exposes lightweight utilities used only by tests, except for retained browser, WebGL, or asset-loading seams.
- The final report records before-and-after line counts and test counts.
