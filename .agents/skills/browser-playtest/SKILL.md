---
name: browser-playtest
description: Use when the user requests AI browser playtests for survival mode in this repository.
---

# Browser Playtest

The current chat runs one shared survival batch with collaboration subagents.

## Before Every Run

Read `docs/browser-playtesting.md`, including its targeted regression tasks.

Ask for the tester count: "How many testers, from 1 through 10? Default: 5." Wait for the answer.

Accept only an integer from 1 through 10. Ask again for an invalid count.

A count in the run request does not answer this question. Always wait for a new answer before setup or browser actions.

Use the guide's "Tester Count and Profiles" section for roster order, profile behavior, and unique tester IDs.

Ten testers use each profile twice. Each occurrence is a separate tester, with its own subagent, browser tab, and folder.

Record the current checkout with `git rev-parse --show-toplevel`. Build from that checkout, including its current changes.

Find the stable artifact root only with:

```powershell
$gitCommon = git rev-parse --path-format=absolute --git-common-dir
$mainRepository = Split-Path -Parent $gitCommon
```

Create one UTC timestamp and random suffix for `<batch-id>`. Create `$mainRepository/.superpowers/browser-playtests/<batch-id>/` and one folder per selected tester ID.

Start the frozen build runner from the tested checkout:

```powershell
npm run playtest:serve -- --batch-dir <absolute-batch-folder> --port 4173
```

Wait for `build/build.json` to report `ready`. Read its commit, source worktree, server URL, source hash, and build hash.
Serve only this batch's static build. Do not use a development server or shared `dist/` directory.
Do not overwrite, rebuild, or restart a batch build. Create a new batch if startup fails.
Keep the runner active for every wave. Source, build, or commit changes invalidate the batch and close the server.

Create one unsigned 32-bit seed. Select two distinct scavenging item instance IDs uniformly without replacement. Build the loadout from every other instance in catalog order. Use this exact URL:

```text
/?playtest=survival&seed=<decimal-uint32>&missing=<instance-id>&missing=<instance-id>
```

Append the query to the runner's server URL, preserving its base path.
Share the URL, seed, missing IDs, loadout, commit, hashes, worktree, and maximum day `55` across all players.

Before spawning players, write `batch.json` with all selected testers, including queued testers. This example shows one tester. Replace `testerCount` and the tester list with the confirmed roster.

```json
{
  "batchId": "<batch-id>",
  "createdAt": "<UTC timestamp>",
  "completedAt": null,
  "commit": "<commit>",
  "sourceWorktree": "<absolute path>",
  "mainRepository": "<absolute path>",
  "buildMetadataPath": "build/build.json",
  "sourceHash": "<SHA-256 from build metadata>",
  "buildHash": "<SHA-256 from build metadata>",
  "invalidatedAt": null,
  "invalidationReason": null,
  "serverUrl": "<server URL>",
  "testUrl": "<full test URL>",
  "seed": 0,
  "missingItemIds": ["<id>", "<id>"],
  "loadout": ["<catalog-order IDs>"],
  "maximumDay": 55,
  "testerCount": 1,
  "testers": [{
    "testerId": "balanced_1",
    "profile": "balanced",
    "subagentId": null,
    "status": "queued",
    "reachedDay": null,
    "outcome": null,
    "reportPath": "balanced_1/report.md",
    "screenshotPaths": []
  }]
}
```

## Player Run

Use collaboration subagents only. Start testers in roster order. Use each tester ID as its subagent task name. Spawn as many players as available slots permit, excluding the coordinator and other active agents.

Only the coordinator writes `batch.json` and `comparison.md`. Save each returned subagent ID in its tester entry. Set that entry's status to `running`.

When capacity is full, wait for an active player to stop. Record its final status and artifact paths. The runtime releases completed subagents when slots are needed. No close-agent tool is required.

Then spawn the next queued tester with a new subagent. Keep the shared server and batch inputs unchanged across waves. Preserve the requested tester count. Ten testers means ten total runs, even when fewer than ten can run at once.

With three tester slots, start three testers. Start each queued tester when an active tester finishes. Stop only after all requested testers have final statuses.

Each player owns its browser connection only during that active subagent turn. The player must reach a stop condition before returning its final message.

Do not return an interim result because the run is long. Continue browser actions in the same turn. Keep the report current after every decision.

The coordinator waits with long `collaboration.wait_agent` calls. It does not use `collaboration.followup_task` to resume a player that already returned. A returned player's browser connection is not recoverable.

Give each player its tester ID, profile, shared inputs, assigned regression tasks, absolute tester folder, and these rules:

- Control one separate browser tab through visible page controls only.
- Do not inspect source, scripts, page internals, network data, hidden state, or browser storage.
- Do not use developer tools, direct APIs, console commands, DOM injection, or automation scripts.
- Seek survival and rescue. Do not choose deliberate or certain death.
- Bait is automatic. Do not select it.
- Select `Fish`. Wait for `CLICK THE WATER TO CAST`. Click visible water.
- Checkpoint `report.md` after every decision.
- Capture only encountered problems. Save useful evidence in `<tester-id>/screenshots/`.
- Do not capture routine starts, successful events, low resources, normal endings, or the day cap.
- Write only inside the assigned tester folder. Do not edit another tester's files or shared batch files.
- Stop controls and finalize the partial report if the coordinator reports batch invalidation.

Each report includes tester ID, profile, status, specific outcome, reached day, final resources, inventory, and the decision log.
Include events, choices, resource changes, blocked controls, and confirmed or suspected problems.
Keep a chronological log of actions, reasons, and resource or inventory changes.

Follow the guide's "Problem Screenshots" and "Ending Details" sections.
Capture one useful view per distinct problem. Add another only when it shows new diagnostic evidence.
Record routine states and successful regressions in text. Leave `screenshotPaths` empty when no problem needs a screenshot.
Explain missing screenshots only for problems that could not be captured.

Lead the final report with rescued, died, day cap, or stopped without an ending, plus its day and cause.
Include exact ending text, last event and action, resources before and after, final inventory, and cause uncertainty.
For rescue, list observed signals. For death, name the visible cause. Do not infer hidden ending logic.
For failure, record the defect, steps, expected and actual behavior, retries, recovery, and whether the character remained alive.
Distinguish a blocked control from an unrecoverable run. Do not use `normal-ending` or `game-failure` as the entire outcome.

## Stop and Retry

Stop with `normal-ending` for rescue or death shown by the game. Name the ending and visible cause in the outcome.
A normal death is not a game failure. Stop with `game-failure` when a confirmed defect requires stopping the test.
Name the defect and its effect. Stop with `browser-failure` only when the browser fails during the active player turn.
Stop with `player-task-failure` when the player returns before an ending or day 55 without an active-turn failure.

Do not test browser recovery after a player returns. A missing browser after return is expected lifecycle cleanup, not a new browser failure.

Otherwise complete day 55 and stop with `day-55-cap` before any day 56 action.
If day 56 appears, record it in text without using another control. Do not take a routine cap screenshot.

Retry an enabled unchanged control only after its first attempt produces no visible result. Retry twice, for three total attempts. Do not retry if focus, highlights, text, values, or presentation changed.

One tester failure does not stop other testers. Preserve every partial report and screenshot.

## Build Invalidation

Check `build/build.json` before each wave and after each wait. Stop the batch if the runner exits unexpectedly.
If invalidated, copy its timestamp and reason into `batch.json`.
If the runner exits without invalidation metadata, record the detection time and `Runner exited unexpectedly` in `batch.json`.
Apply the same invalidation rules. Do not rewrite build metadata.
Tell active testers to stop controls and finalize reports. Do not start remaining testers.
Use `batch-invalidated` for interrupted and unstarted testers. Preserve completed results and all artifacts.
Do not count build invalidation as a game failure. Do not compare balance across an invalidated batch.

## Compare

After all players stop, update `batch.json` with final statuses, reached days, specific outcomes, artifact paths, and completion time.
Verify that the tester entry count matches `testerCount` and every entry has a final status and specific outcome.
For unstarted testers, leave `reachedDay` null and explain the interruption in `outcome`.

Write `comparison.md` with one entry per tester ID. Include days, endings, visible resources, inventory, major choices, failures, UI issues, profile differences, and explicit missing tester data. Compare repeated profiles without merging their results.

Lead each row with the specific outcome and day, then give its status, last event, action, cause, and resources.
Explain why a run ended or stopped. List only screenshots of encountered problems.

For invalidated batches, report observed results and missing data only. Omit balance and profile comparisons.

Stop the runner after all players stop. Normal shutdown changes build status to `stopped`.

## Change Approval

Do not change game code, tests, balance, UI, assets, configuration, or workflow code without user approval.

After analysis, list each proposed change at the end. Wait for explicit approval before implementation.
