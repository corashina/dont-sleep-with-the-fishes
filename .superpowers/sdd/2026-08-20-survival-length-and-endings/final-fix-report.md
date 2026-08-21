# Final fix report

## Scope

- Base commit: `480212fd6291b91b0e9f5eeb6a463cf95ca7eea3`.
- Branch: `codex/survival-length-endings`.
- Date: 2026-08-21.
- All seven final review findings are fixed.

## Fixes

1. The simulator now repairs Hull at or below 60.
2. The simulator fishes or dives before it considers Bottled Paper.
3. The simulator sends Bottled Paper only when exactly one Energy remains.
4. Direct policy tests protect repair, fishing, and Bottled Paper order.
5. Rescue-trace dives now show `RESCUE TRACE FOUND`.
6. Restart uses the shared cleanup runner and attempts all restart steps.
7. A lifecycle test protects restart after outgoing disposal fails.
8. Event validation sums all `loseRandom` quantities in each outcome.
9. Pressure helpers now test values below zero and above four.
10. Quiet-night balance now belongs to `survivalBalance.ts`.
11. GameUI caches the Dorothy record and skips repeated text writes.

No visual layout or style changed.

## Balance evaluation

Command: `npm run balance:survival`.

The command evaluated 1,330 loadouts with 100 seeds each.

It also evaluated the equal-size no-signal control cohort.

| Metric | Result | Target |
| --- | ---: | ---: |
| Total policy runs | 133,000 | 133,000 |
| Rescued | 94,555 | — |
| Dead | 37,780 | — |
| Sunk | 665 | — |
| Taken | 0 | 0 |
| Blocked | 0 | 0 |
| Rescue rate | 0.7109398496240602 | 0.68 through 0.72 |
| Average rescue day | 30.46214372587383 | 29 through 32 |
| Average no-signal rescue day | 36.02335853639426 | 36 through 40 |
| Blocked loadouts | 0 | 0 |
| Unrescued loadouts | 0 | 0 |

The command exited with code zero.

No tuning was required.

The rescue curve, Energy system, pressure model, and damage caps did not change.

## Verification

- Focused tests: 12 files passed. All 695 tests passed.
- Full suite: 108 files passed. All 1,782 tests passed.
- Typecheck: `npm run typecheck` exited with code zero.
- Build: `npm run build` exited with code zero. Vite transformed 429 modules.
- Obsolete grep: no matches in `src`, `tests`, or `README.md`.
- Whitespace check: `git diff --check` found no errors.
- Scope check: only final-fix source, tests, and this report changed.

## Concerns

- The no-signal average is 0.02335853639426 days above its lower limit.
- The deterministic command enforces this limit on every full run.
- The full suite emits existing Three.js mock and Rapier deprecation warnings.
- The build emits the existing large-chunk warning.
- No functional concern remains open.
