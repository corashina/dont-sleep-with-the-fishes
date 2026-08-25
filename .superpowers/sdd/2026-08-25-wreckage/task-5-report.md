# Task 5 Report: Dedicated Wreckage Presentation

## Implementation

- Added `WreckagePresentation` for the dedicated wreckage event.
- Created sparse surface debris, ship, silt, loot, creature, ghost, injury flash, and recovered debris.
- Reused choreography samples and scratch transforms in update paths.
- Added surface search, Carlitos delegation, dive, result reactions, return, settlement, clear, and disposal flows.
- Extended `DedicatedEventEnvironment` with featured models, dive control, and Carlitos delegation.

## Tests

- Added lifecycle, dive, reaction, delegation, and cleanup tests.
- Corrected the brief's model expectation with approval: `anglerFish` is a featured model, not an event model.
- The test records event-model creation as `containerShip`, `ghost` and featured clones as `anglerFish`, `driftingBarrel`.

## RED / GREEN Evidence

- RED: `npx vitest run tests/WreckagePresentation.test.ts` failed because `WreckagePresentation` did not exist.
- GREEN: `npx vitest run tests/WreckagePresentation.test.ts tests/wreckageChoreography.test.ts` passed: 18 tests.
- Full suite: 1,599 passed. Two known baseline failures remain in `SurvivalFishingFlow.test.ts` and the BoatWorld rod-tip test.

## Files

- `src/survival/events/WreckagePresentation.ts`
- `src/survival/eventPresentationTypes.ts`
- `tests/WreckagePresentation.test.ts`

## Self-review

- Scene resources created here are tracked and disposed.
- Update paths reuse samples, transforms, geometry, and material state.
- Dive cleanup runs once and active beats always resolve on clear, settlement, or disposal.
- The ship uses the required position and rotation.

## Concerns

- `npx tsc --noEmit` remains blocked until Task 6 marks wreckage dedicated and supplies the new environment fields in `BoatWorld`.
- `bun` is not available in this worktree. I used `npx` as directed.
