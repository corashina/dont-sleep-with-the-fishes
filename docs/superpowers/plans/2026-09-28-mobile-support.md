# Mobile Support Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Track each step below.

**Goal:** Make the complete game playable in landscape with touch controls and lower mobile render cost.
**Architecture:** Shared gameplay actions accept desktop and touch input. A game-level mobile gate handles rotation and interruption. Existing survival views gain touch targets and compact layouts.
**Tech Stack:** TypeScript, Three.js, DOM/CSS, Vitest, Vite. No new dependency.
**Spec:** docs/superpowers/specs/2026-09-28-mobile-support-design.md

## Global Constraints

- Read AGENTS.md and VISUAL_STYLE_GUIDE.md before changes.
- Support landscape layouts from 568 by 320 CSS pixels through tablet sizes.
- Give every touch button a hit area at least 48 by 48 CSS pixels.
- Cap mobile device pixel ratio at 1 initially.
- Preserve each valid saved setting independently.
- Only implement new tests rated 90 or above.
- No reduced-motion variants, gameplay balance changes, or compatibility layers.
- Use existing English, Polish, and Argentine Spanish language support.
- Work exclusively in this isolated checkout. Each task owns its listed files.
- User explicitly requested implementation and multiple agents; execute after plan self-review without another permission question.

## Review Focus

- A finger cancelled while moving must stop motion and require Resume (Task 1).
- Rotation during preparation must block the newly installed phase (Task 3).
- Rotation over an existing modal must preserve that modal and its pause (Tasks 1, 2, 3).
- Touches over overlapping world targets must not select hidden items (Task 2).
- Missing or throwing storage must retain valid defaults and session choices (Task 3).

## Shared interfaces

Task 3 creates src/browser/deviceCapabilities.ts:
`prefersTouchControls(): boolean` checks the coarse primary pointer safely when matchMedia is unavailable.
Task 1 and Task 2 may import this function before Task 3 lands.

Task 3 extends GamePhase with `setMobileSuspended?(suspended: boolean): void`.
Task 1 implements it on MainMenuPhase and ScavengePhase; Task 2 implements it on SurvivalPhase.
True blocks input and suspends the phase without destroying its prior pause/modal state.
False restores only the mobile suspension, leaving prior pause/modal state intact.
The global gate emits false only after a deliberate Resume click in landscape.
Game skips phase updates while suspended and calls the hook when installing a new phase.

Task 1 owns src/styles/touch-controls.css and imports it from its TouchControls module.
Task 2 owns src/styles/mobile.css and imports it from src/main.ts.
Task 3 owns src/styles/mobile-gate.css and imports it from its MobileViewportController module.
Each task owns a separate i18n helper module, using current language and language-change subscription.
Do not edit other agents' files. Report required cross-task edits to the coordinator.

### Task 1: Scavenging touch controls and explicit session control

**Files:** src/input/InputController.ts; new src/input/TouchControls.ts; src/styles/touch-controls.css; new src/i18n/touchMessages.ts; src/phases/MainMenuPhase.ts; src/phases/ScavengePhase.ts; src/game/GameLoop.ts; src/player/PlayerController.ts if necessary; src/ui/GameUI.ts if necessary; focused input/menu/scavenge tests.
**Produces:** Touch movement, look, actions, and pause; mobile suspension hooks; main menu start without pointer lock on touch.

- [x] Rate tests: input cancellation and concurrent touch 100; session start/pause 100; desktop regression 95.
- [x] Add failing behavioral tests: simultaneous movement/look/interact, one action per tap, cancel clears movement and sprint, pointer lock never requested on touch, resume does not lose an existing modal pause.
- [x] Run focused failing tests using node node_modules/vitest/vitest.mjs run <files> --maxWorkers=2 --minWorkers=1.
- [x] Implement explicit control acquisition for desktop and touch without pretending touch has pointer lock. Keep existing collision and carry behavior.
- [x] Implement fixed left stick, right drag surface, Interact/Jump/Sprint/Pause controls. Use independent pointer IDs and pointer capture. Sprint is a toggle. All touch hit areas are 48 CSS pixels or larger. Hide controls during modal/intro/ending as appropriate; provide touch intro skip.
- [x] Integrate mobile suspension and actual-touch input selection. Clear all held/queued input on interruption and phase disposal. Do not activate an interaction from a camera drag.
- [x] Run focused tests, self-review, and record exact commands/results in .superpowers/sdd/mobile-support/task-1-report.md.
- [x] Commit only owned files after verification if Git permissions allow; otherwise report pending files to coordinator.

### Task 2: Survival touch interactions and compact layout

**Files:** src/ui/BoatAnchorView.ts; src/ui/Survival*.ts; src/survival/SurvivalPhase.ts; src/survival/SurvivalVisibilityController.ts if needed; src/styles/mobile.css; src/main.ts (stylesheet import only); index.html (viewport-fit only); new src/i18n/mobileUiMessages.ts; relevant focused survival UI tests.
**Produces:** Touch-accessible survival game; responsive safe-area layout; SurvivalPhase.setMobileSuspended hook.

- [x] Read the complete anchor selection and fishing paths before editing. Rate target selection and fishing tests 95; phase interruption 100.
- [x] Add failing behavioral tests for touch selection without hover, overlapping/occluded targets, cast/reel deduplication, mobile pause preserving an existing pause/modal.
- [x] Implement touch hit areas and item actions using existing projection and visibility rules. Prefer exact visible hits, then nearest valid expanded target. Never activate occluded items.
- [x] Ensure fishing, return, rear view, events, journal, trade, settings, guide, and ending controls work by touch. Tap water casts; large visible button reels during bite. Keep click and pointer handlers from issuing duplicate actions.
- [x] Add responsive mobile stylesheet. Keep center clear, controls >=48px, safe areas respected, short landscape panels scrollable with reachable close buttons. Keep desktop layouts intact.
- [x] Implement setMobileSuspended without auto-resuming an existing pause, and ensure hidden-document touch sessions require explicit resume.
- [x] Add localized touch copy and guide instructions as needed through a dedicated helper to avoid shared-file edits.
- [x] Run focused tests and record results in .superpowers/sdd/mobile-support/task-2-report.md.
- [x] Commit only owned files after verification if Git permissions allow; otherwise report pending files to coordinator.

### Task 3: Mobile viewport gate and rendering defaults

**Files:** src/browser/deviceCapabilities.ts; src/browser/MobileViewportController.ts; src/styles/mobile-gate.css; src/i18n/mobileViewportMessages.ts; src/Game.ts; src/app/GamePhase.ts; runtime construction files under src/app as needed; src/browser/storage.ts; src/rendering/visualQuality.ts, waterQuality.ts, shadowQuality.ts, antiAliasingQuality.ts; viewport/preference/Game focused tests.
**Produces:** Shared interfaces above, portrait and interruption gate, consistent canvas sizing, lower default rendering cost.

- [x] Rate viewport/interruption tests 100; preferences tests 90; render sizing tests 95.
- [x] Add failing tests: coarse pointer starts with low quality; saved high remains high; throwing storage works; portrait blocks new phase; return to landscape needs click; cancelled/hidden state cannot auto-resume; same effective size does not resize buffers.
- [x] Implement capability helper and controller with visible-viewport dimensions, orientation gate, safe-area prompt, explicit Resume, language refresh, and listener cleanup.
- [x] Gate input during suspension using phase hooks and an overlay. Block startup/transition input in portrait. Keep an existing game pause or settings panel intact.
- [x] Update Game resize handling, phase installation, and disposal. Cap initial coarse-pointer render ratio at 1, desktop at 2. Actual touch input selection must not reset graphics settings.
- [x] Apply low defaults only where saved preferences are invalid/missing. Keep ambient occlusion composite/low. Avoid allocations and repeated resize setup in frame updates.
- [x] Run focused tests and record results in .superpowers/sdd/mobile-support/task-3-report.md.
- [x] Commit only owned files after verification if Git permissions allow; otherwise report pending files to coordinator.

### Task 4: Integration, independent review, and validation

**Files:** Covering tests and owned implementation files only as review fixes require; docs/superpowers/plans/2026-09-28-mobile-support.md for progress.

- [x] Review each task against its report and spec. Dispatch independent review and route findings back to the owning agent.
- [x] Run lint, TypeScript check, all tests, and Vite production build through Node (Bun is absent).
- [x] Inspect browser at 568x320, 844x390, 915x412, and 1024x768 where browser tools support viewport control.
- [ ] Complete the rendered menu-to-ending touch flow and physical multi-touch checks. The available browser disabled WebGL. Automated interaction tests and DOM layout checks passed.
- [x] Record unavailable physical-device tests honestly; do not infer phone GPU performance from desktop results.
- [x] Dispatch whole-branch review on the most capable model. Fix important findings and recheck covering tests.
- [x] Save implementation commits in the isolated worktree. Do not merge or publish without user instruction.


Final implementation: all task reviews and the final scoped review passed. All 179 files and 1,222 tests passed. Lint, TypeScript, and the production build passed. See `docs/mobile-support-validation.md` for evidence and remaining device checks.
