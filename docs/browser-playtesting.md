# Browser Playtesting

## Request a Run

The current chat coordinates all subagents. It asks for the tester count before each run. Choose an integer from 1 through 10. Default: 5.

A count in the run request does not answer this question. The coordinator waits for a new answer before setup or browser actions.

Each tester completes its run in one continuous subagent turn. Its browser connection ends when that turn returns.

The coordinator starts testers in roster order. It uses the available subagent slots, excluding the coordinator and other active agents.

When capacity is full, it waits for a tester to stop. It records that result. The runtime releases completed subagents when slots are needed. Then the coordinator starts the next queued tester. No close-agent tool is required.

All waves keep the same server and batch inputs. Keep the requested tester count even when fewer slots are available. Ten testers means ten total runs, not ten required simultaneous connections.

With three tester slots, a ten-tester batch starts three testers. Each completion permits the next queued tester to start.

## Tester Count and Profiles

| Testers | Profiles in roster order |
|---|---|
| 1 | balanced |
| 2 | cautious, reckless |
| 3 | cautious, balanced, reckless |
| 4 | cautious, resourceful, bold, reckless |
| 5 | cautious, resourceful, balanced, bold, reckless |
| 6–10 | Start with the five-profile order. Append its first `count - 5` profiles in the same order. |

Ten testers run each profile twice. Each run uses a new subagent and a separate browser tab.

Give each tester a unique ID: `<profile>_<occurrence>`. Count each profile's occurrences from 1 in roster order. Use this ID for the subagent task name, report folder, and comparison entry. Even a single tester uses `balanced_1`. Subagent task names permit lowercase letters, digits, and underscores.

The ten-tester roster is `cautious_1`, `resourceful_1`, `balanced_1`, `bold_1`, `reckless_1`, `cautious_2`, `resourceful_2`, `balanced_2`, `bold_2`, `reckless_2`.

- Cautious: Protect food, medicine, tools, and Energy. Prefer safe counters. Dive only when survival needs its reward.
- Resourceful: Seek low-cost gains. Time food, care, and repairs to prevent waste. Avoid risks with weak rewards.
- Balanced: Protect critical resources. Accept useful risks. Mix eating, fishing, repairs, care, dives, items, and event choices.
- Bold: Pursue high-value rewards and dive often. Spend supplies to stay ready. Avoid near-certain death.
- Reckless: Seek high rewards. Dive often and delay care. Prefer dangerous choices that do not make death certain.

## Shared Game Setup

Create the batch folder first. Run this command from the checkout being tested:

```powershell
npm run playtest:serve -- --batch-dir <absolute-batch-folder> --port 4173
```

The runner builds once into `<batch-folder>/build/dist/`. It serves those static files without live reload.
It refuses to overwrite a prior build. Do not use the development server or shared `dist/` directory.

Wait for `<batch-folder>/build/build.json` to report `ready` before starting testers.
Copy its commit, checkout path, server URL, source hash, and build hash into `batch.json`.
Append the playtest query to the reported server URL. Keep its base path.

The source hash includes tracked files, unignored files, and playtest environment files.
Dirty checkouts are supported. The commit alone does not identify their contents; the source hash does.
Environment file values are never written to metadata.

The runner rejects changes during compilation. During testing, it checks file lists and file metadata every second.
Source changes, build changes, and commit changes stop the server. The runner marks `build.json` as `invalidated`.
Do not rebuild or restart that batch. Use a new batch folder after changes stop.

The coordinator creates one unsigned 32-bit seed and two distinct missing item IDs selected uniformly.
It builds the catalog-order loadout from every remaining item.

Every tester uses this playtest URL:

```text
/?playtest=survival&seed=<decimal-uint32>&missing=<instance-id>&missing=<instance-id>
```

Every tester shares the server URL, test URL, seed, missing IDs, loadout, commit, hashes, worktree, and maximum day 55.

## Browser Access Rules

Each tester controls one browser tab. Use visible page controls and visible page state only. Do not inspect browser storage, source, scripts, internals, network data, hidden state, or use developer tools, direct APIs, console commands, DOM injection, or automation scripts.

## Targeted Regression Tasks

Cover all three tasks once in each batch. Assign each task to any active tester. Record each result in the tester report and `comparison.md`.

### Event Target Isolation

- Trigger: Keep Shotgun visible when a CHEST, SALVAGE, or Island event target appears.
- Player action: Select the event target once.
- Expected visible result: The event opens. Shotgun does not activate, fire, move, or leave inventory.
- Failure evidence: Record a missed event, any Shotgun action, or any Shotgun inventory change.
- Screenshot: Capture both targets before selection and the open event afterward.
- Report entry: Record event name, selected target, Shotgun state before and after, and visible result.

### Wreckage Leave

- Trigger: Enter Wreckage with too little Energy to search and with Carlitos unavailable.
- Player action: Choose Leave.
- Expected visible result: Wreckage resolves, focus closes, and normal day controls return. Energy and inventory stay unchanged.
- Failure evidence: Record an ignored Leave, a pending Wreckage event, blocked controls, or resource changes.
- Screenshot: Capture the choices before Leave and normal day controls after return.
- Report entry: Record Energy, Carlitos's unavailable reason, enabled choices, visible result, and restored controls.

`Return to boat` also declines the focused encounter without cost. It must restore normal controls for all focused events.

### Chest Attack Choices

- Trigger: Reach Chest Attack and wait until its reveal finishes.
- Player action: Record Health without selecting a choice. Then select Attack.
- Expected visible result: Attack appears before damage. Health decreases only after selecting Attack. The event then resolves.
- Failure evidence: Record missing Attack, damage before selection, automatic resolution, or an unresponsive Attack.
- Screenshot: Capture visible Attack with pre-selection Health. Capture changed Health after selection.
- Report entry: Record Health before waiting, before selection, and after selection. Record when the event resolved.

## Fishing Controls

Bait is automatic. Do not select it. Select `Fish`. Wait for `CLICK THE WATER TO CAST`. Click visible water.

## Result Files

Store each batch at `<main-repository>/.superpowers/browser-playtests/<batch-id>/`. Serve only the batch's frozen build, never live checkout files.

Create `batch.json` before players start. Record `testerCount` and all selected testers, including queued testers. Each tester records `testerId`, profile, subagent ID, status, report path, and screenshot paths. Use `queued` before dispatch and `running` during play. Replace these statuses with a final status when each tester stops.

Keep batch ID, created and completed timestamps, commit, source worktree, main repository, server URL, test URL, seed, missing IDs, loadout, and maximum day. Only the coordinator writes `batch.json` and `comparison.md`.

Also record `buildMetadataPath`, `sourceHash`, `buildHash`, `invalidatedAt`, and `invalidationReason`.
Set `buildMetadataPath` to `build/build.json`. Set both invalidation fields to null for a valid batch.

Create one folder per selected tester: `<tester-id>/report.md` and `<tester-id>/screenshots/`. Testers write only inside their own folders. Each player updates its report after every decision. Preserve partial files after a failure.

Each report records its tester ID, profile, status, outcome, reached day, final visible resources and inventory, actions with reasons, resource and inventory changes, events and choices, disabled controls, confirmed UI bugs, screenshot paths, and missing screenshot reasons.

Capture start state, the first two event choices, the first visible critical resource state, final state, and every visible game or browser failure.

## Stop Rules

Stop on a normal ending or confirmed failure. Otherwise finish day 55 and stop before every day 56 action. If day 56 appears, capture it without another control.

Testers do not return interim results. The coordinator waits while each active tester continues. It does not resume a returned tester because that browser connection is no longer available.

Retry an enabled unchanged control only when its first attempt has no visible result. Retry twice. Do not retry after a focus, highlight, text, value, or presentation change.

One tester failure does not stop the others.

## Build Invalidation

Check build metadata before each tester wave and after each wait. Stop the batch if the runner exits unexpectedly.
If the build is invalidated, copy its timestamp and reason into `batch.json`.
If the runner exits without invalidation metadata, record the detection time and `Runner exited unexpectedly` in `batch.json`.
Apply the same invalidation rules. Do not rewrite build metadata.
Tell active testers to stop controls and finalize partial reports. Do not start remaining testers.
Use `batch-invalidated` for interrupted and unstarted testers. Preserve finished tester statuses and all artifacts.
An invalidated batch is not evidence of a game failure or a controlled balance result.

After all testers stop, stop the runner. A normal shutdown changes build status to `stopped`.

## Failure Statuses

- `normal-ending`: A normal ending. It is not a game failure.
- `day-55-cap`: Day 55 completed without an earlier stop.
- `game-failure`: A confirmed game failure.
- `browser-failure`: The browser fails while the tester turn is active.
- `player-task-failure`: The tester returns early without an active-turn game or browser failure.
- `batch-invalidated`: Source changes, build changes, or runner failure interrupted the batch or prevented a tester from starting.

A missing browser after a tester returns is expected cleanup. It does not change the result to `browser-failure`.

## Review the Comparison

After all testers stop, `comparison.md` lists every tester ID separately. It compares days, endings, resources, inventory, major choices, failures, UI issues, and profile differences. It names missing tester data and differences between repeated profiles. `batch.json` then records final statuses, paths, and completion time.

For invalidated batches, report observed results and missing data only. Omit balance and profile comparisons.

## Change Approval

Do not change game code, tests, balance, UI, assets, configuration, or workflow code without user approval.

After analysis, list each proposed change at the end. Wait for explicit approval before implementation.
