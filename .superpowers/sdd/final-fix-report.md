# Final Physical Inventory Review Fix Report

Date: 2026-07-12

## Scope

Implemented only the five findings from the final whole-branch review:

1. Recovered canned-food and bait-tin depletion is now tracked separately from loose aggregate gains.
2. Unavailable numeric day-action shortcuts announce their stored reason through the polite live region.
3. Continue renders and synchronizes updated props/anchors before closing the outcome and restoring focus.
4. Scavenging failure summaries enumerate saved instance states rather than deprecated type aliases.
5. Carried items use explicit list/row classes with visible block/grid spacing.

## Root Causes

- `BoatWorld` derived physical canned-food and bait-tin uses from aggregate stores. Fishing/diving gains therefore refilled recovered props after consumption.
- `SurvivalUI.handleKeyDown` returned immediately for unavailable actions without publishing the reason.
- `SurvivalPhase.handleContinue` called `hideOutcome` before `renderSnapshot`; focus restoration evaluated stale anchors, after which synchronization removed the focused control.
- `GameUI.showFailureResult` inspected one deprecated type-level status per item type, so it missed a saved non-first duplicate.
- Carried rows were unclassified inline spans with no explicit list layout.

## RED Evidence

### Recovered food/bait and BoatWorld sync

Command:

```text
bun run test tests/SurvivalSession.test.ts tests/BoatWorld.test.ts -t "recovered|refill"
```

Observed before production changes: exit 1; 3 failed, 1 passed, 29 skipped. Both session snapshots lacked `recoveredFood`/`recoveredBait`, and the second canned-food prop remained visible after aggregate food increased (`expected true to be false`).

### Unavailable numeric shortcuts

Command:

```text
bun run test tests/SurvivalUI.test.ts -t "announces unavailable numeric shortcuts"
```

Observed before production changes: exit 1; the publication list was empty (`expected [] to have a length of 2`).

### Continue synchronization and focus

Command:

```text
bun run test tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts -t "Continue|moves focus"
```

Observed before production changes: exit 1; 2 failed. The UI render invocation occurred after `hideOutcome` (`expected 12 to be less than 8`), and after consuming the last can focus fell to `<body>` instead of the horizon anchor.

### Saved duplicate failure summary

Command:

```text
bun run test tests/GameUI.test.ts -t "saved duplicate"
```

Observed before production changes: exit 1; summary contained `SAVED — NONE` rather than `SAVED — CANNED FOOD` when only `cannedFood-2` was saved.

### Carried list DOM/CSS

Command:

```text
bun run test tests/GameUI.test.ts -t "renders carry weight"
```

Observed before production changes: exit 1; the carried container had no `carried-list` class.

## GREEN Evidence

Focused commands after implementation:

```text
bun run test tests/SurvivalSession.test.ts tests/BoatWorld.test.ts -t "recovered|refill"
# 2 files passed; 4 tests passed

bun run test tests/SurvivalUI.test.ts -t "announces unavailable numeric shortcuts"
# 1 file passed; 1 test passed

bun run test tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts -t "Continue|moves focus"
# 2 files passed; 5 tests passed

bun run test tests/GameUI.test.ts -t "saved duplicate|renders carry weight"
# 1 file passed; 2 tests passed
```

Affected suites:

```text
bun run test tests/SurvivalSession.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/GameUI.test.ts
# 6 files passed; 92 tests passed
```

Final verification:

```text
bun run typecheck
# exit 0

bun run test
# 25 files passed; 260 tests passed

bun run build
# exit 0; TypeScript and Vite production build succeeded

git diff --check
# exit 0
```

## Files Changed

Production:

- `src/survival/survivalTypes.ts`
- `src/survival/SurvivalSession.ts`
- `src/survival/BoatWorld.ts`
- `src/survival/SurvivalPhase.ts`
- `src/ui/SurvivalUI.ts`
- `src/ui/GameUI.ts`
- `src/styles/main.css`

Tests:

- `tests/SurvivalSession.test.ts`
- `tests/BoatWorld.test.ts`
- `tests/SurvivalUI.test.ts`
- `tests/SurvivalPhase.test.ts`
- `tests/SurvivalPhaseFocus.test.ts`
- `tests/GameUI.test.ts`

## Self-Review

- Recovered counters initialize directly from saved-instance inventory contributions, decrement only for actually consumable negative aggregate deltas, never increase on positive gains, and are exposed as required snapshot fields.
- Aggregate food/bait behavior and seeded random action behavior are unchanged.
- `BoatWorld` uses only recovered counters for physical can/tin presentation; all other item charge paths are unchanged.
- Shortcut handling prevents the unavailable numeric key default and reuses the existing versioned polite-announcement path, so identical repeated reasons remain observable.
- Continue synchronizes snapshot/UI/world anchors first, then closes the outcome. Terminal presentation remains after outcome closure so ending focus is not overwritten.
- Focus validation rejects disconnected controls, direct or ancestor-hidden controls, inert controls, aria-hidden controls, disabled controls, and aria-disabled controls before falling back to the first usable anchor.
- Failure summary iteration sees enumerable instance records (legacy aliases are non-enumerable) and retains duplicates.
- No unrelated functionality or dependencies were added.

## Independent Review

A read-only reviewer inspected the complete working-tree diff against the five findings and the approved design. Verdict: **Ready to merge**, with no Critical, Important, or Minor findings. The reviewer independently passed `bun run typecheck`, `bun run test` (25 files, 260 tests), and `git diff --check` and did not modify the checkout.

## Concerns

- Vite continues to emit the existing advisory that the main minified JavaScript chunk exceeds 500 kB. The build succeeds; bundle splitting is outside this review scope.
- No browser visual run was added for these review-only fixes; DOM/CSS, focus, state, full-suite, typecheck, and production-build verification are green.
