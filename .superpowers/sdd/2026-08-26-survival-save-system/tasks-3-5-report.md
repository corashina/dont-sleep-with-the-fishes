# Tasks 3 and 5 Report

Status: Complete.

Behavior:

- `SurvivalPhase` restores runs and emits only stable checkpoints.
- Busy, fishing, lab, disposed, and terminal states expose no checkpoint.
- Terminal presentation clears persisted run data once.
- `Game` owns save state and binds system tuning controls.
- Saving stays off by default. The enabled preference persists.
- Enabling saves the active stable survival checkpoint.
- Disabling deletes the checkpoint.
- Continue replaces menu, scavenge, or survival with a restored run.
- Continue exits pointer lock, resets the camera, and disposes the old phase.
- Stable day saves now reload when pending night journal data is null.

Tests:

- Required focus: 3 files passed, 312 tests passed, 0 failed.
- Related consumers: 3 files passed, 69 tests passed, 0 failed.
- Typecheck: passed with 0 errors.
- Full suite: 59 files passed, 1 file failed. 1710 tests passed, 1 failed.

Commit: `e55d9a8` (`feat: continue saved survival runs`).

Concern: The full-suite failure is pre-existing in `SurvivalUI.test.ts`.
It rejects the save-button focus outline added by commit `de533302`.
This gate did not change CSS or that test.
