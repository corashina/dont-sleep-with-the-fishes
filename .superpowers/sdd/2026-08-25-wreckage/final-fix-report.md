# Wreckage final fix report

## Scope

This wave fixes all final review findings. It does not change approved gameplay values.

Unrelated tracked and untracked work remains unchanged.

## Important findings

### 1. Search used injury cues

Fix:

- Added the separate `injury` choreography beat.
- Kept the `search` beat free of red flash and camera jolt cues.
- Routed only `wreckage.search-injury` to the injury beat.
- Tested the full choice, completion, and result flow.

RED:

- `injury` duration was missing.
- Normal search returned `redFlash: 1` at its midpoint.
- The normal search flash was visible before result resolution.

GREEN:

- Normal search moves debris with no injury cue.
- The injury result starts one flash and one camera jolt.

Files:

- `src/survival/events/wreckageChoreography.ts`
- `src/survival/events/WreckagePresentation.ts`
- `tests/wreckageChoreography.test.ts`
- `tests/WreckagePresentation.test.ts`

### 2. Cleanup failures stopped later cleanup

Fix:

- Routed dive settlement and beat settlement through `runCleanupSteps()`.
- Routed beat cancellation, dive release, state reset, and scene hiding through the helper.
- Included dive release in full disposal cleanup.
- Kept beat resolution after dive release errors.
- Preserved primary dive action errors with `ignoreCleanupError()`.

RED:

- A dive settlement error left the item-use promise pending until test timeout.
- A dive clear error left both scene roots visible.
- A disposal error left eight world children and owned resources alive.

GREEN:

- Each method reports the first cleanup error.
- Later cleanup steps still run.
- Pending work resolves, roots hide, and owned resources dispose.

Files:

- `src/survival/events/WreckagePresentation.ts`
- `tests/WreckagePresentation.test.ts`

### 3. Catalog coverage checked weights only

Fix:

- Replaced the weight-only assertion with exact table-driven outcome assertions.
- The table covers result IDs, weights, presentation keys, resources, item gains, damage, pressure, and scuba breakage.

RED:

- This was a test coverage gap. No approved catalog value required a production change.

GREEN:

- The new exact table passed against all 17 Wreckage outcomes.

Files:

- `tests/survivalEvents.test.ts`

## Minor findings

### 1. The wreck was hidden during surface reveal

Fix:

- Added wreck visibility to reveal, search, injury, and surface hold samples.

RED:

- The wreck remained hidden halfway through reveal.

GREEN:

- The wreck is visible during reveal and after a surface result.

Files:

- `src/survival/events/wreckageChoreography.ts`
- `tests/WreckagePresentation.test.ts`

### 2. Search moved every debris piece

Fix:

- Derived and stored one selected debris index during `stage()`.
- Applied approach motion only to that piece.
- Carlitos retrieval uses the same seeded selection.
- Collapse still drops all debris.

RED:

- Carlitos retrieval moved indices `[0, 1, 2, 3]`.

GREEN:

- Seed `5` moves only index `1`.

Files:

- `src/survival/events/WreckagePresentation.ts`
- `tests/WreckagePresentation.test.ts`

### 3. Static debris matrices rebuilt every active frame

Fix:

- Cached four base matrices during `stage()`.
- Updated one matrix during search motion.
- Updated all matrices only during collapse motion.
- Reused cached matrices when search motion completes.
- Added no update-path allocations.

RED:

- A reveal start and frame made eight debris matrix writes.

GREEN:

- Reveal makes no debris matrix writes.
- Search motion writes only the selected matrix.

Files:

- `src/survival/events/WreckagePresentation.ts`
- `tests/WreckagePresentation.test.ts`

### 4. Metadata cast hid missing generated entries

Fix:

- Replaced the broad `as unknown as Record` cast.
- Added an explicit `satisfies` record for all `EventModelId` values.
- Added checked conversion for generated bounds tuples.

RED:

- This was a compile-time coverage gap. It had no runtime behavior test.

GREEN:

- Typecheck, event model validation, and production build pass.

Files:

- `src/survival/eventModelManifest.ts`

### 5. Revealed-dive lifecycle lacked direct tests

Fix:

- Added direct tests for settlement, replacement, and disposal.
- Each test uses `revealUnderwaterScene: true`.
- Each test checks camera and selected item restoration.

RED:

- This was a direct coverage gap. Existing controller behavior needed no production change.

GREEN:

- All three revealed-dive lifecycle tests pass.

Files:

- `tests/DivePresentationController.test.ts`

### 6. Registry ownership test used a plain ghost

Fix:

- Replaced the ghost group with a `containerShip` `EventModelInstance`.
- Verified instance forwarding and owned `dispose()` forwarding.

RED:

- This was an ownership coverage gap. Existing forwarding needed no production change.

GREEN:

- The owned instance identity and disposal assertions pass.

Files:

- `tests/EventPresentationRegistry.test.ts`

## Verification

- Focused RED run: 9 expected failures across choreography and presentation coverage.
- Focused GREEN run: 5 files passed, 142 tests passed.
- `npm run typecheck`: passed.
- `npm run models:check:events`: passed.
- `npm run build`: passed.
- Full suite: 56 files ran, 1,626 tests passed, and 2 known baseline tests failed.

Known baseline failures:

- `tests/SurvivalFishingFlow.test.ts`: fishing flow order assertion.
- `tests/BoatWorld.test.ts`: fishing line origin tolerance assertion.

## Self-review

- Approved event weights, costs, rewards, damage ranges, pressure, and breakage remain unchanged.
- Surface visuals follow the project style guide.
- Debris animation reuses stored matrices and scratch objects.
- The update path adds no array, matrix, vector, or callback allocation.
- Cleanup uses the established helpers and keeps the first reported error.
- Unrelated untracked files remain unchanged and unstaged.

## Concerns

- The two known baseline failures remain unchanged as required.
- The production build reports the existing large chunk warning.
