# Subagent Browser Playtest Workflow Design

## Goal

Add one repeatable browser playtest workflow for survival mode.

The current Codex chat coordinates the run. It uses collaboration subagents instead of separate Codex chats.

The workflow preserves reports after temporary worktrees are removed.

## Scope

Recover the approved browser playtest entry and its verified empty-night fix.

Replace the previous chat-based coordinator with current-chat collaboration subagents.

Improve compound fishing guidance and runtime error labels.

Add a project skill and human documentation.

Run three browser testers after implementation and verification.

## Non-goals

- Do not add a bot API.
- Do not add direct game controls.
- Do not expose hidden game state.
- Do not add a browser automation package.
- Do not change survival balance.
- Do not keep the obsolete separate-chat workflow.
- Do not preserve the superseded quiet-day workaround.

## Coordinator Model

The current chat is the only coordinator.

When the user requests browser playtests, the coordinator asks for the tester count before starting.

The question recommends three testers. Accept one, two, or three testers.

The current chat supports three concurrent tester subagents. Do not create tester waves above this limit.

The coordinator uses collaboration subagents. It does not create, fork, or message separate Codex chats.

The coordinator starts one Vite server. Every tester uses the same server and test URL.

The coordinator creates shared inputs, starts testers, waits for them, and writes the comparison.

One tester failure does not stop other testers.

## Tester Assignment

Use these assignments:

- One tester: balanced.
- Two testers: cautious and reckless.
- Three testers: cautious, balanced, and reckless.

All testers receive the same seed, missing item IDs, loadout, source commit, and maximum day.

Each tester controls one separate browser tab through visible page controls.

Each tester writes only its assigned profile folder.

## Shared Inputs

Create one unsigned 32-bit seed per batch.

Select two distinct scavenging item instance IDs uniformly without replacement.

Build the loadout from every other instance in catalog order.

Use the exact development URL contract:

```text
/?playtest=survival&seed=<decimal-uint32>&missing=<instance-id>&missing=<instance-id>
```

All testers start survival directly with the same inputs.

Test mode does not read, write, or delete browser save data.

## Stable Artifact Storage

Store every batch under the main repository:

```text
.superpowers/browser-playtests/<batch-id>/
```

Do not store final evidence only inside a temporary implementation worktree.

Resolve the main repository before starting the batch. Record its absolute path in `batch.json`.

Use one UTC timestamp and random suffix for the batch ID.

Use this layout:

```text
<batch-id>/
  batch.json
  cautious/
    report.md
    screenshots/
  balanced/
    report.md
    screenshots/
  reckless/
    report.md
    screenshots/
  comparison.md
```

Create only the profile folders required by the selected tester count.

`batch.json` records:

- Batch ID and timestamps.
- Tested commit and source worktree.
- Main repository path.
- Server URL and full test URL.
- Seed, missing IDs, and full loadout.
- Tester profile, subagent ID, status, report path, and screenshot paths.

Each tester checkpoints `report.md` after every decision.

The coordinator preserves all partial evidence after failures.

Temporary worktree cleanup must not remove batch artifacts.

## Player Access Rules

Tester subagents use the in-app browser.

They control the game only through visible page controls.

They can read visible text, labels, values, inventory, focus, highlights, and enabled states.

They cannot inspect source, scripts, page internals, network data, hidden state, or browser storage.

They cannot use developer tools, direct game APIs, console commands, DOM injection, or automation scripts.

All testers seek survival and rescue. They never choose deliberate or certain death.

## Player Profiles

### Cautious

Protect resources early. Hold food, medicine, tools, and Energy.

Prefer safe counters. Avoid risky dives unless survival needs the reward.

### Balanced

Protect critical resources. Accept useful risks.

Mix eating, fishing, repairs, care, dives, items, and event choices.

### Reckless

Seek high rewards. Dive often and delay care.

Prefer dangerous choices that do not make death certain.

## Compound Actions

Some commands start a compound action by focusing compatible items.

When `Fish` focuses Bait, the UI shows visible `Choose Bait` guidance.

The page structure exposes the same guidance as readable status text.

The player then selects one enabled focused Bait item.

A visible focus or highlight is a result. It is not a blocked control.

Apply the same rule to other compound actions.

## Runtime Error Labels

Use `WEBGL UNAVAILABLE` only for verified WebGL capability or initialization failures.

Use `GAME ERROR` for other startup or runtime failures.

Keep the original error detail visible for diagnosis.

Do not classify an undefined value, event error, or action error as a WebGL failure.

## Empty Night Fix

An empty eligible night-event pool returns the `night-calm-fallback` definition.

Treat this fallback as a quiet night before event presentation starts.

Do not pass it to the event bundle loader.

Keep a regression test with seed `3051382588` and the observed loadout.

Do not keep the earlier day-calm presentation workaround.

## Stop Rules

Stop a tester on a normal ending or confirmed failure.

Otherwise, complete day 55 and stop before any day 56 action.

If day 56 appears, capture it without using another control.

Retry an enabled control only when it produces no visible result.

Retry twice. This gives three total attempts.

Do not retry when focus, highlights, text, values, or presentation changed.

Use these statuses:

- `normal-ending`
- `day-55-cap`
- `game-failure`
- `browser-failure`
- `player-task-failure`

## Reports and Screenshots

Each report contains:

- Profile, status, outcome, and reached day.
- Final visible resources and inventory.
- Chronological actions with short reasons.
- Resource and inventory changes.
- Events and choices.
- Disabled or blocked controls.
- Confirmed UI bugs.
- Missing screenshot reasons.

Save screenshots for:

- Start state.
- First two event choice states.
- First visible critical resource state.
- Final state.
- Each visible game or browser failure.

The coordinator writes `comparison.md` after all testers stop.

Compare days, endings, resources, inventory, choices, failures, and UI issues.

Keep missing tester data explicit.

## Documentation

Create `docs/browser-playtesting.md` for human readers.

It explains:

- How to request a run.
- The mandatory tester-count question.
- Profile assignment.
- Shared inputs and direct survival startup.
- Browser-only access rules.
- Artifact locations and schemas.
- Stop rules and failure statuses.
- How to review a comparison report.

Add one short pointer in `AGENTS.md` to this guide.

Keep operational agent instructions in `.agents/skills/browser-playtest/SKILL.md`.

Remove all instructions that create or fork separate Codex chats.

## Implementation Recovery

Build the final feature on branch `codex/subagent-browser-playtests` in an isolated worktree.

Use the detached commits as reference. Do not merge their obsolete intermediate state.

Recover these final capabilities:

- Development-only playtest query parsing and validation.
- Direct survival startup with the exact seed and loadout.
- Disabled save storage in test mode.
- The empty-night fallback fix.
- The final project skill behavior.

Preserve unrelated working tree changes.

## Verification

Use focused tests for:

- Query activation and validation.
- Exact seed and missing items.
- Direct survival startup.
- Disabled save storage.
- Normal development and production startup.
- Empty night fallback behavior.
- Fishing guidance and readable status.
- WebGL and general runtime error labels.

Then run:

- Full test suite.
- Typecheck.
- Production build.

After verification, run the three testers selected for this request.

Use cautious, balanced, and reckless profiles.

Keep the resulting batch in the main repository.

## Success Criteria

The workflow never creates a separate Codex chat.

It always asks for one, two, or three testers before a new run.

Three remains the recommended count.

The selected collaboration subagents run inside the current chat.

All results survive implementation worktree cleanup.

Fishing exposes the next required item choice.

Non-WebGL errors no longer claim WebGL is unavailable.

The empty-night regression passes.

The full test suite, typecheck, and production build pass.

The acceptance batch contains three completed tester reports and one comparison.
