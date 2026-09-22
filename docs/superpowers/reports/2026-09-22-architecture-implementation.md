# Architecture implementation report

Completed on 2026-09-22 in the separate worktree, branch `codex/architecture-plan`.
All six tasks are implemented. The independent review found two Important defects. Both are fixed.
No Critical findings, deferred minors, or declined judgments remain.

## Changes

- Dedicated adapters own their presenters directly. Empty presentation layers and the coordinator are removed.
- Authored factories create focused presenters. Interaction targets are cached.
- SurvivalEventFlow owns event operations and cancellation. FocusedEventView only handles display.
- Pure choice rules serve both display and session validation.
- Browser and test code use one Game constructor with explicit dependencies.
- Disposal completes after pose cleanup throws. Focus display failures restore controls and report the original error.

No packages, lockfiles, assets, or Heart of the Sea files changed.

## Commits

| Task | Commit |
| --- | --- |
| Dedicated adapters | c86f5a59 |
| Remove empty layers | 444260df |
| Authored factories | 805513b5 |
| One event operation owner | e3a4e2de |
| Shared choice rules | e7ec7d8e |
| One Game construction path | 3c59c8a8 |

The commit containing this report contains the final review fixes.

## Verification

- `node node_modules/vitest/vitest.mjs run`: 161 files, 1,294 tests passed after all source changes.
- `npm exec --yes --package=bun -- bun run build`: lint, TypeScript, and production build passed.
- Vite reports the existing large-chunk warning. Some tests retain the existing Rapier initialization warning.
- Four new review regressions failed first. All four passed after fixes. Their affected suites passed 99 tests.
- Review regression importance: 98/100. They cover cleanup after errors and focus error recovery.
- A deliberate detachment mutation failed the dedicated disposal regression. The source was restored and verification passed.
- `git diff --check` passed. Final diff review found no unrelated file changes.

## Browser checks

Focused developer smoke checks used the production preview. No survival playtest batch was run.
Checks observed UI state and console errors. They do not constitute a full visual review.

| Scenario | Result |
| --- | --- |
| Startup | Main menu loaded without console errors. |
| Leak | Duct tape resolved the event; Day 2 controls returned. |
| Drifting Chest | Focus opened, Return to boat worked, and Let it drift resolved. |
| Shower Night | Bucket resolved the event; Day 2 controls returned. |
| Ghosts | Flashlight resolved the event; Day 2 controls returned. |
| Handyman | Food trade resolved; Compass appeared and Day 2 controls returned. |
| Rescue | Journey ended dialog showed Rescue found you. |
| Restart | Start from the ship loaded the ship intro and pause controls. |

Leak, Drifting Chest, and Shower Night ran before the final error-path fixes.
Startup, Ghosts, Handyman, Rescue, and restart ran on the final build. No console errors were observed.
Hidden-page resume passed automated tests; it was not checked in the browser.
Pointer-lock resume was not confirmed in the in-app browser.

## Rulings I made

- Ruling: Use Bun from npm exec because no Bun binary is installed — locked dependencies remain unchanged — cost if wrong: local tooling setup only.
- Ruling: For behavior-preserving refactors, characterize behavior before changes and keep tests green; reserve red/green for missing contracts — avoids artificial failures — cost if wrong: weaker detection without targeted mutation checks.
- Ruling: Assert light intensity and ignore empty transform targets in cancellation test — visibility alone does not indicate emitted light — cost if wrong: missed visual cancellation; retained geometry assertions cover rendered effects. Test importance 95/100.
- Task 4: Ruling: Use drifting-supplies in camera tests instead of handyman; only drifting events are inspectable. Cost if wrong: missed non-drifting camera behavior.

## Handoff

The branch and worktree are preserved. No merge or push was performed.
The temporary execution logs are removed after this report is committed.
