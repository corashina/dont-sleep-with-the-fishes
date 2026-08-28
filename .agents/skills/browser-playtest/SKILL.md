---
name: browser-playtest
description: Use when the user requests AI browser playtests for survival mode in this repository.
---

# Browser Playtest

Coordinate one shared survival run. Use browser evidence from each player.

## Before Every Run

Ask for the tester count: "How many testers: 1, 2, or 3? Default: 3." Wait for the answer.

Assign profiles:

| Testers | Profiles |
|---|---|
| 1 | balanced |
| 2 | cautious, reckless |
| 3 | cautious, balanced, reckless |

Cautious players save supplies and select low-risk choices. Balanced players use normal risk. Reckless players select high-risk choices early.

Find the stable artifact root:

```powershell
$gitCommon = git rev-parse --path-format=absolute --git-common-dir
$mainRepository = Split-Path -Parent $gitCommon
```

Create one batch directory at `$mainRepository/.superpowers/browser-playtests/<batch-id>/`.

Start one server from `$mainRepository`. Create one seed and two distinct valid item instance IDs. Build one survival playtest URL with that seed and both `missing` values. Use one loadout for every player.

## Run

Use collaboration subagents only. Call `collaboration.spawn_agent` once for each assigned profile. Give each player the shared server URL, seed, missing item IDs, loadout, profile, and batch directory.

Each player starts a fresh browser session at the shared URL. Use visible browser controls only. Do not use saved browser state, prior evidence, page scripts, developer tools, or console access.

Tell every player:

- Bait is automatic. Do not select it.
- Select `Fish`.
- Wait for `CLICK THE WATER TO CAST`.
- Click visible water.
- Continue until the day 55 night resolves or the game ends.
- Do not start day 56.
- Save a profile report in the batch directory.

Each report states the profile, shared setup, day reached, outcome, decisions, visible defects, and evidence paths. Use `completed`, `game-failure`, or `blocked` as its status.

After every player returns, compare reports in the batch directory. Write one comparison report there. State agreements, profile differences, failures, and blocked work.
