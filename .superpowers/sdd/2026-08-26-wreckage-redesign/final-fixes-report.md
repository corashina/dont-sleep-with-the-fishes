# Wreckage Final Review Fixes

## Result

All five review findings are fixed.

- Focus failures now restore the UI state.
- Entry, Back, and choice failures keep the first error.
- UI callback failures reach the fatal error reporter.
- All eight debris bounds have more than `0.18` units of clear water.
- Every debris bound stays on the starboard side.
- The debris keeps its authored waterline float.
- A nine-vertex low-poly seabed appears only during the underwater hold.
- The seabed owns and disposes one geometry and one material.
- Wreckage always shows all four choices.
- Send Carlitos shows a clear reason when unavailable.
- Send Carlitos still costs three Carlitos energy.
- The Wreckage result close label is `Close Wreckage result`.

## RED Evidence

The first focused RED run used four files and 191 tests.

- 13 tests failed.
- 178 tests passed.
- Focus recovery produced five failures.
- Debris and seabed coverage produced five failures.
- Carlitos visibility produced two failures.
- The Wreckage close label produced one failure.

The UI error reporter RED run selected two tests.

- Both tests failed.
- Vitest found two unhandled rejections.

The seabed hold-end RED run selected one test.

- The test failed because the seabed stayed visible after the hold.

## GREEN Evidence

The targeted GREEN run passed five files and 414 tests.

The model check passed all 20 event models.

The focused regression run passed 12 files and 895 tests.

The full suite passed 50 files and 1,607 tests.

TypeScript passed with zero errors.

The production build passed after transforming 501 modules.

The build kept the existing large-chunk warning.

`git diff --check` passed with zero errors.
