# Browser Playtesting

## Request a Run

Ask for the tester count before each run. Choose one, two, or three. Default: 3. The current chat coordinates all subagents.

## Tester Count and Profiles

One tester uses balanced play. Two use cautious and reckless play. Three use cautious, balanced, and reckless play.

## Shared Game Setup

The coordinator starts one server. It creates one seed, one URL, two distinct missing item IDs, and one loadout. All testers use this setup.

## Browser Access Rules

Each tester starts a fresh browser session. Use visible browser controls only. Do not use saved state, prior evidence, page scripts, developer tools, or console access.

## Fishing Controls

Bait is automatic. Do not select it. Select `Fish`. Wait for `CLICK THE WATER TO CAST`. Click visible water.

## Result Files

Store each batch at `<main-repository>/.superpowers/browser-playtests/<batch-id>/`. Each tester writes a profile report. The coordinator writes the comparison report.

## Stop Rules

Play until the day 55 night resolves or the game ends. Do not start day 56.

## Failure Statuses

Use `completed` for day 55. Use `game-failure` for an ending. Use `blocked` when browser work cannot continue.

## Review the Comparison

Review agreements, profile differences, failures, blocked work, and linked evidence.
