---
name: browser-playtest
description: Use when the user requests AI browser playtests for survival mode in this repository.
---

# Browser Playtest

The current chat runs one shared survival batch with collaboration subagents.

## Before Every Run

Ask for the tester count: "How many testers: 1, 2, or 3? Default: 3." Wait for the answer.

A count in the run request does not answer this question. Always wait for a new answer before setup or browser actions.

| Testers | Profiles |
|---|---|
| 1 | balanced |
| 2 | cautious, reckless |
| 3 | cautious, balanced, reckless |

Use this profile contract:

- Cautious: Protect food, medicine, tools, and Energy. Prefer safe counters. Dive only when survival needs its reward.
- Balanced: Protect critical resources. Accept useful risks. Mix eating, fishing, repairs, care, dives, items, and event choices.
- Reckless: Seek high rewards. Dive often and delay care. Prefer dangerous choices that do not make death certain.

Record the tested commit with `git rev-parse HEAD`. Record the current checkout with `git rev-parse --show-toplevel`. Start one Vite server from that current checkout. Do not use the main repository for the server.

Find the stable artifact root only with:

```powershell
$gitCommon = git rev-parse --path-format=absolute --git-common-dir
$mainRepository = Split-Path -Parent $gitCommon
```

Create one UTC timestamp and random suffix for `<batch-id>`. Create `$mainRepository/.superpowers/browser-playtests/<batch-id>/` and only the selected profile folders.

Create one unsigned 32-bit seed. Select two distinct scavenging item instance IDs uniformly without replacement. Build the loadout from every other instance in catalog order. Use this exact URL:

```text
/?playtest=survival&seed=<decimal-uint32>&missing=<instance-id>&missing=<instance-id>
```

Use one server URL, test URL, seed, missing IDs, loadout, commit, worktree, and maximum day `55` for every player.

Before spawning players, write `batch.json`:

```json
{
  "batchId": "<batch-id>",
  "createdAt": "<UTC timestamp>",
  "completedAt": null,
  "commit": "<commit>",
  "sourceWorktree": "<absolute path>",
  "mainRepository": "<absolute path>",
  "serverUrl": "<server URL>",
  "testUrl": "<full test URL>",
  "seed": 0,
  "missingItemIds": ["<id>", "<id>"],
  "loadout": ["<catalog-order IDs>"],
  "maximumDay": 55,
  "testers": [{
    "profile": "<profile>",
    "subagentId": null,
    "status": null,
    "reportPath": "<profile>/report.md",
    "screenshotPaths": []
  }]
}
```

## Player Run

Use collaboration subagents only. Call `collaboration.spawn_agent` once for each selected profile. Save every returned subagent ID in `batch.json`.

Each player owns its browser connection only during that active subagent turn. The player must reach a stop condition before returning its final message.

Do not return an interim result because the run is long. Continue browser actions in the same turn. Keep the report current after every decision.

The coordinator waits with long `collaboration.wait_agent` calls. It does not use `collaboration.followup_task` to resume a player that already returned. A returned player's browser connection is not recoverable.

Give each player its profile, shared inputs, absolute profile folder, and these rules:

- Control one separate browser tab through visible page controls only.
- Do not inspect source, scripts, page internals, network data, hidden state, or browser storage.
- Do not use developer tools, direct APIs, console commands, DOM injection, or automation scripts.
- Seek survival and rescue. Do not choose deliberate or certain death.
- Bait is automatic. Do not select it.
- Select `Fish`. Wait for `CLICK THE WATER TO CAST`. Click visible water.
- Checkpoint `report.md` after every decision.
- Save screenshots in `<profile>/screenshots/`.

Each report includes profile, status, outcome, reached day, final visible resources, final inventory, chronological actions with reasons, resource and inventory changes, events and choices, disabled or blocked controls, confirmed UI bugs, screenshot paths, and missing screenshot reasons.

Capture screenshots for the start state, first two event choice states, first visible critical resource state, final state, and each visible game or browser failure.

## Stop and Retry

Stop with `normal-ending` for a normal ending. A normal ending is not a game failure. Stop with `game-failure` for a confirmed game failure. Stop with `browser-failure` only when the browser fails during the active player turn. Stop with `player-task-failure` when the player returns before an ending or day 55 without an active-turn game or browser failure.

Do not test browser recovery after a player returns. A missing browser after return is expected lifecycle cleanup, not a new browser failure.

Otherwise complete day 55 and stop with `day-55-cap` before any day 56 action. If day 56 appears, capture it without using another control.

Retry an enabled unchanged control only after its first attempt produces no visible result. Retry twice, for three total attempts. Do not retry if focus, highlights, text, values, or presentation changed.

One tester failure does not stop other testers. Preserve every partial report and screenshot.

## Compare

After all players stop, update `batch.json` with final statuses, report paths, screenshot paths, and completion time. Write `comparison.md` with days, endings, visible resources, inventory, major choices, failures, UI issues, profile differences, and explicit missing tester data.

## Change Approval

Do not change game code, tests, balance, UI, assets, configuration, or workflow code without user approval.

After analysis, list each proposed change at the end. Wait for explicit approval before implementation.
