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

## Fix Round 1

### Implementation

- Added operation tokens. Clear, settlement, staging, disposal, and later actions invalidate pending dive work.
- Kept the reaction and return sequence in one active beat. Update changes its existing state without creating a promise or object.
- Resolved dive reactions after return. Dive release now happens after return completes.
- Called dive cleanup only when this presentation owns the borrowed dive.
- Collected and disposed cloned ghost geometry, materials, and textures.
- Limited red flash and camera jolt to the injury result.
- Applied debris approach and falling-debris sample values to the debris instances.

### Tests

- Added entry interruption, active-hold cancellation, owned settlement, full return, release order, and no-borrowed-cleanup coverage.
- Added ghost GPU resource disposal coverage.
- Added visible debris approach and falling-debris checks.
- Added choreography coverage for debris approach.

### Commands and Output

```text
npx vitest run tests/WreckagePresentation.test.ts tests/wreckageChoreography.test.ts
```

Initial RED output: 11 failures. They covered unowned cleanup, return timing, stale dive continuation, visible debris motion, result effects, and ghost disposal.

Final GREEN output:

```text
Test Files  2 passed (2)
Tests  26 passed (26)
```

```text
npx tsc --noEmit
```

Output: blocked by Task 6. `BoatWorld` lacks the new dedicated environment fields. Wreckage is not yet a dedicated route.

```text
npx vitest run --reporter=dot
```

Output:

```text
Test Files  2 failed | 54 passed (56)
Tests  2 failed | 1607 passed (1609)
```

The two failures are the known `SurvivalFishingFlow` order test and BoatWorld rod-tip test.
