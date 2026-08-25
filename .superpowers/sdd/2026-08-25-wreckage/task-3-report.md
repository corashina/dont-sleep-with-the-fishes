# Task 3 report: Pure Wreckage Choreography

## Implementation

- Added `WreckageBeat` with nine authored beats and fixed durations.
- Added `WreckageSample` with scalar cue fields.
- Added `createWreckageSample()` for one reusable sample object.
- Added `wreckageBeatDuration()` and `sampleWreckageBeat()`.
- Reset every output field before each sample.
- Clamped elapsed seconds to beat progress.
- Used shared clamp and smooth-step helpers for all range cues.

## Tests

- Added duration coverage for all nine beats.
- Added reused-object coverage for collapse, creature, and ghost cues.
- Added reset coverage for inactive cues.
- `npx tsc --noEmit`: passed.
- `npx vitest run --configLoader runner --config vitest.config.ts tests/wreckageChoreography.test.ts`: 11 passed.
- Full suite: 1,591 passed; 2 known baseline failures remained.

## RED/GREEN evidence

- RED attempt after adding tests: Vitest config loading failed because the worktree node module link triggered an access-denied error.
- GREEN run with `--configLoader runner`: all 11 choreography tests passed.

## Files

- `src/survival/events/wreckageChoreography.ts`
- `tests/wreckageChoreography.test.ts`

## Self-review

- The implementation has no scene or object allocations in sampling.
- The output object is reused.
- The cues match the brief values and formulas.
- `git diff --check` passed.

## Concerns

- The default Vitest config loader fails in this worktree. The runner loader works.
- Full-suite failures are the known `SurvivalFishingFlow` and BoatWorld rod-tip tests.
