# Task 11 Implementation Report

## Commit

- Implementation commit: `6bddbda` (`feat: wire playable first-person evacuation loop`)

## Commands and results

- `bun run test -- tests/ScavengeSession.test.ts tests/smoke.test.ts tests/world.test.ts`
  - Red: failed for the expected missing `ScavengeSession.penalize`, `World.landItem`, and `src/ui/GameUI.ts` contracts.
  - Green: 3 files passed, 43 tests passed.
- `bun run typecheck`
  - Passed with no TypeScript errors.
- `bun run test`
  - Passed: 11 files, 101 tests.
- `bun run build`
  - Passed; Vite produced `dist/`.
  - Advisory only: the minified JavaScript chunk is 514.10 kB, above Vite's default 500 kB warning threshold.
- `git diff --check`
  - Passed with no whitespace errors.

## Files changed

- `index.html`
- `src/Game.ts`
- `src/main.ts`
- `src/styles/main.css`
- `src/ui/GameUI.ts`
- `src/game/ScavengeSession.ts`
- `src/world/World.ts`
- `tests/ScavengeSession.test.ts`
- `tests/smoke.test.ts`
- `tests/world.test.ts`

## Deviations and adaptations

- Preserved the prior worker's valid partial Task 11 test edits, including the additional `World.landItem` regression test, and verified all three new contracts failed before implementation.
- Adapted the plan's pointer-lock callbacks to the actual `InputController.requestPointerLock(): Promise<boolean>` API by explicitly discarding the caught promise with `void`. Session start/resume still occurs only after the browser emits `pointerlockchange` and the canvas is confirmed locked.
- Reformatted long expressions and nested countdown-status selection for repository readability without changing the brief's behavior.

## Concerns and handoff

- No browser-based visual or gameplay QA was used as completion evidence. The root agent still needs to verify the start, pointer-lock, movement, interaction, pause, success/failure, and replay loop manually.
- The production build has a non-blocking Vite chunk-size advisory noted above.

---

## Review-fix pass

### Commit

- Review-fix commit: `01020fb` (`fix: harden playable loop lifecycle`)

### Findings addressed

- Results now list the saved supply names and elapsed time as well as slot count.
- Timeout and terminal fall frames re-check session status after tick, movement, and interaction. Terminal mutations synchronize elapsed/sinking state before the frame can continue, and rejected stale flight callbacks no longer mutate world state.
- Failure now displays a 1.25-second sinking/failure presentation before the final result.
- `Game.dispose()` is idempotent and now cancels animation, removes global listeners, exits pointer lock only when its canvas owns it, resets carry state, disposes input/interaction/world/UI/renderer resources, and removes the renderer canvas.
- `GameUI` owns removable button handlers, removes its root on disposal, and makes repeated disposal harmless.
- Pointer-lock rejection now displays actionable start/resume feedback.
- Lifeboat slot DOM is rebuilt only when the saved count changes; the broad per-frame HUD live region was narrowed to contextual/status feedback.
- Saved items now use a short 0.25-second settle into their lifeboat slot, completing immediately for reduced-motion users.

### TDD and verification

- Added red tests for gameplay stage gating after timer expiry, terminal fall penalty, and evacuation interaction; pointer-lock start/pause/resume policy; delayed failure/result sequencing; result details; stable slots; pointer-lock feedback; UI teardown/replay callbacks; direct `Game.dispose()` wiring; rejected stale flight callbacks; and saved-item settle behavior.
- Initial focused red run failed for the expected missing loop-policy module and UI contracts; the saved-item settle test separately failed against the prior snap behavior.
- Focused green run: 6 files passed, 76 tests passed.
- Final `bun run test`: 14 files passed, 123 tests passed.
- Final `bun run typecheck`: passed with no TypeScript errors.
- Final `bun run build`: passed and produced `dist/`; the minified application chunk is 518.45 kB, retaining Vite's non-blocking 500 kB advisory.
- Final `git diff --check`: passed with no whitespace errors.

### Files changed in review fix

- `bun.lock`
- `package.json`
- `src/Game.ts`
- `src/game/GameLoop.ts`
- `src/game/ItemState.ts`
- `src/interaction/InteractionSystem.ts`
- `src/styles/main.css`
- `src/ui/GameUI.ts`
- `src/world/World.ts`
- `tests/GameLifecycle.test.ts`
- `tests/GameLoop.test.ts`
- `tests/GameUI.test.ts`
- `tests/world.test.ts`

### Deviations and concerns

- Added `jsdom` as a test-only dependency so real DOM listener removal, detached-button behavior, result rendering, and UI disposal could be asserted without browser QA or a renderer mock framework.
- Extracted only pure frame/phase/lifecycle policies from `Game`; Three.js ownership and rendering remain in the public `Game` orchestrator.
- Browser visual/gameplay QA remains intentionally unclaimed and is still required from the root agent.
