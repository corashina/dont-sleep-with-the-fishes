# Browser Playtesting

## Request a Run

The current chat coordinates all subagents. It asks for the tester count before each run. Choose one, two, or three. Default: 3.

A count in the run request does not answer this question. The coordinator waits for a new answer before setup or browser actions.

Each tester completes its run in one continuous subagent turn. Its browser connection ends when that turn returns.

## Tester Count and Profiles

One tester uses balanced play. Two use cautious and reckless play. Three use cautious, balanced, and reckless play.

Cautious players protect food, medicine, tools, and Energy. They avoid risky dives unless survival needs the reward. Balanced players protect critical resources and accept useful risks. Reckless players seek high rewards, dive often, delay care, and avoid certain death.

## Shared Game Setup

The coordinator starts one server from the current checkout. It records the commit and checkout path. It creates one unsigned 32-bit seed, two distinct missing item IDs selected uniformly, and a catalog-order loadout from every remaining item.

Every tester uses this development URL:

```text
/?playtest=survival&seed=<decimal-uint32>&missing=<instance-id>&missing=<instance-id>
```

Every tester shares the server URL, test URL, seed, missing IDs, loadout, commit, worktree, and maximum day 55.

## Browser Access Rules

Each tester controls one browser tab. Use visible page controls and visible page state only. Do not inspect browser storage, source, scripts, internals, network data, hidden state, or use developer tools, direct APIs, console commands, DOM injection, or automation scripts.

## Fishing Controls

Bait is automatic. Do not select it. Select `Fish`. Wait for `CLICK THE WATER TO CAST`. Click visible water.

## Result Files

Store each batch at `<main-repository>/.superpowers/browser-playtests/<batch-id>/`. The main repository stores artifacts only. The current checkout starts the server.

Create `batch.json` before players start. It records batch ID, created and completed timestamps, commit, source worktree, main repository, server URL, test URL, seed, missing IDs, loadout, maximum day, and every tester's profile, subagent ID, status, report path, and screenshot paths.

Create only selected profile folders. Each selected folder contains `report.md` and `screenshots/`. Each player updates its report after every decision. Preserve partial files after a failure.

Each report records its profile, status, outcome, reached day, final visible resources and inventory, actions with reasons, resource and inventory changes, events and choices, disabled controls, confirmed UI bugs, screenshot paths, and missing screenshot reasons.

Capture start state, the first two event choices, the first visible critical resource state, final state, and every visible game or browser failure.

## Stop Rules

Stop on a normal ending or confirmed failure. Otherwise finish day 55 and stop before every day 56 action. If day 56 appears, capture it without another control.

Testers do not return interim results. The coordinator waits while each active tester continues. It does not resume a returned tester because that browser connection is no longer available.

Retry an enabled unchanged control only when its first attempt has no visible result. Retry twice. Do not retry after a focus, highlight, text, value, or presentation change.

One tester failure does not stop the others.

## Failure Statuses

- `normal-ending`: A normal ending. It is not a game failure.
- `day-55-cap`: Day 55 completed without an earlier stop.
- `game-failure`: A confirmed game failure.
- `browser-failure`: The browser fails while the tester turn is active.
- `player-task-failure`: The tester returns early without an active-turn game or browser failure.

A missing browser after a tester returns is expected cleanup. It does not change the result to `browser-failure`.

## Review the Comparison

After all testers stop, `comparison.md` compares days, endings, resources, inventory, major choices, failures, UI issues, and profile differences. It names missing tester data. `batch.json` then records final statuses, paths, and completion time.
