# Playtest fix checks

Run these checks from the main checkout, on branch `master`.
The playtest fixes are merged with the ending statistics and test removals.

Capture a screenshot only when a problem occurs.
Record the action, expected result, actual result, day, and resource values.
For an ending, state whether the player was rescued, died, or stopped because a control failed.
Include the exact cause and last action. Do not use a status code alone.

## Automated checks

Run the full suite:

```powershell
npm.cmd test -- --maxWorkers=2
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The build script needs Bun. If Bun is absent, run the same stages separately:

```powershell
npm.cmd run lint
npm.cmd run typecheck
& './node_modules/.bin/vite.cmd' build
```

The last command uses the installed project dependencies.
Do not continue to the next command if a command fails.

Run the focused regressions:

```powershell
npm.cmd test -- tests/SurvivalUI.test.ts tests/SurvivalFishingFlow.test.ts tests/SurvivalPhase.test.ts tests/SurvivalEventFlow.test.ts tests/FocusedEventExit.test.ts tests/SurvivalJournalActions.test.ts tests/SurvivalSaveStore.test.ts --maxWorkers=2
```

The event tests set exact conditions. They cover timing cases that are difficult to repeat manually.
They include Plane selection 0.01 seconds before expiry and Wreckage exits at Energy 0.

## Browser setup

Start the development server:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

Open the URL printed by Vite. Keep its `/dont-sleep-with-the-fishes/` path.
Use the backtick key to open **SYSTEM TUNING**.
Select an **Event test scene**, then select **ENTER EVENT** for a short event check.
These scenes check controls and presentation. They do not replace a normal survival run.

For a repeatable boat start, append this query to the game URL:

```text
?playtest=survival&seed=2644746644&missing=cannedFood-3&missing=spyglass-1
```

## 1. Handyman selection

World choices now use their actual depth beside item targets. The Hand no longer has unconditional priority over nearby items.
Contextual choices lock before asynchronous work starts. Later input cannot replace an accepted choice.

1. Enter the **Handyman** test scene.
2. Select **SWIM RING**, beside the Hand.
3. Wait for the trade and next dawn. Open the Journal.
4. Confirm that the entry names the swim ring. Confirm that Health did not decrease from touching the Hand.
5. Repeat with another available item. Check that only the selected item changes.
6. Enter a new Handyman scene. Select **HAND** directly. Confirm that this records **Touch the Hand**.

The UI tests also cover pointer, Enter, and Space activation of overlapping targets.

## 2. HUD and target alignment

The HUD now uses CSS clipping without a scroll container. Focus cannot move its projected targets away from the canvas.
Dialogs keep their own scrolling behavior.

1. Start at the boat. Open and close the Journal.
2. Move focus between targets. Use arrow keys to cycle overlapping targets.
3. Resize the window, then repeat the checks.
4. Confirm that the HUD stays visible and targets stay aligned with their objects.
5. Confirm that Journal controls remain reachable in a smaller window.

Use the exposed part of a model when targets overlap.
A browser tool that clicks a rectangle's center can hit the object in front of it.

## 3. Fishing after Continue

Fishing accepts a new attempt from the ready state. That state releases the rod from modal input blocking.
Return remains available, except while another action runs. Active casts retain their input and resource guards.

1. Select the rod. Cast into the water.
2. Select **BITE - REEL NOW** when it appears. Read the catch result.
3. Select **Continue**, then select the rod without returning to the boat.
4. Confirm that **CLICK THE WATER TO CAST** appears again.
5. Return before casting. Confirm that the new attempt refunds one Energy.
6. Repeat with no Energy. Confirm that fishing stays blocked and **Return to boat view** still works.
7. Repeat after a missed bite. Check that the previous attempt's reward or cost does not repeat.

## 4. Plane timing

1. Enter the **Plane** test scene.
2. Select the Flare Gun before the choice window closes.
3. Confirm that the signal completes, even if its animation passes the deadline.
4. Check the Journal. Confirm one signal entry and one item cost.
5. Enter a new Plane scene. Let the choice window expire before selecting an item.
6. Confirm **Let It Pass** and no item cost.

The existing timer and its duration remain unchanged. New regression tests protect these cases.

## 5. Duct Tape and the Journal

Accepted medicine, dive, and repair actions now create typed journal records using actual resource changes and item identities.
Checkpoints and saves preserve these records. Rejected actions create no record.

1. Check hull repair labels and salvage reward text. Confirm that they say **Duct Tape**.
2. Treat an injury. Finish the day and check the Journal.
3. Confirm the actual Health gain and the used medkit. At Health 90, the gain must be 10.
4. Dive. Check the Energy cost, recovered supplies, and any Health loss in the completed day's entry.
5. Repair the hull or a broken item. Check the recorded gain and used Duct Tape.
6. Try a blocked action. Confirm that it creates no journal entry and consumes nothing.
7. Enable auto-save in **SYSTEM TUNING**. Reach dawn, reload, then use **CONTINUE**.
8. Confirm that journal entries persist without repeated resource costs.

Repair quantities, costs, and repair strength remain unchanged. This change standardizes the displayed supply name.

## 6. Wreckage exits and Chest Attack

These cases protect unavailable choices, free exits, reveal timing, and automatic Chest Attack damage.

1. Use a run where Wreckage is available at Energy 0.
2. Ensure Carlitos is absent, hungry, or unable to act because of low Energy.
3. Select **Leave**. Confirm that normal boat controls return and no resource changes.
4. Repeat with **Return to boat**.
5. Enter the **Chest Attack** test scene. Record Health before the reveal finishes.
6. Confirm that Health stays unchanged during the reveal and no choice appears.
7. Confirm that the attack starts after the reveal and removes 25 Health.
8. Repeat with a usable Knife. Confirm 10 Health damage and a journal-only mitigation note.

Use the focused tests for exact Wreckage conditions and controlled Chest Attack animation boundaries.

## Verification record

Verified in the original fixes worktree on 2026-08-31:

- Baseline: 1,856 tests passed across 72 files.
- Final suite: 1,905 tests passed across 73 files. This adds 49 regression cases.
- Lint and TypeScript checks passed.
- Production Vite build passed. It reports a large-chunk warning.
- Bun was unavailable. The equivalent lint, TypeScript, and Vite build stages passed separately.
- Handyman browser check: selecting Swim Ring preserved Health 100 and recorded the swim ring trade.
- HUD browser check: focus no longer moved the overlay 65 pixels above the canvas.
- Journal open, close, and resize checks passed at 1280 × 720 and 800 × 600.
- Fishing browser check: missed bite → Continue → rod → casting prompt passed without a boat return.
- Cancelling that new cast restored Energy from 1 to 2. The HUD stayed at scroll position zero.
- Catch rewards, duplicate inputs, low Energy, save reloads, and exact event boundaries passed automated checks.

The browser checks were short development checks, not a complete survival batch.
No new browser ending result is claimed.
Only two problem screenshots were saved under `.superpowers/playtest-fixes/`:
`hud-shift-before.jpg` and `fishing-ready-blocked.jpg`.

After merging into `master` on 2026-08-31:

- All four deleted test files remain deleted.
- None of the 347 recorded, removed test declarations were restored.
- The current master baseline passed 1,378 tests before the merge.
- The merged suite passed 1,427 tests across 72 files, including the 49 new regression cases.
- Lint, TypeScript checks, and the production Vite build passed.
- Ending statistics and the revised browser testing instructions remain included.
