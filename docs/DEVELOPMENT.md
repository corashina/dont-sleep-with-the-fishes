# Development

[Game overview](../README.md) · [Architecture](ARCHITECTURE.md) · [Assets](ASSETS.md)

Read [AGENTS.md](../AGENTS.md) before editing. Read the [visual style guide](../VISUAL_STYLE_GUIDE.md) before player-facing visual changes.
Use the repository's stop-slop writing rule for documentation and UI text.

## Setup

Install Bun and Node.js. Package scripts use both runtimes.
Asset fetch scripts also use PowerShell 7 (`pwsh`); some audio processing uses Python.
Committed runtime assets support normal development without fetching them again.

```sh
bun install
bun run dev
```

Open the URL printed by Vite. The server binds to `127.0.0.1`.
The configured base path is `/dont-sleep-with-the-fishes/`.

## Commands and checks

[package.json](../package.json) defines the commands. [bun.lock](../bun.lock) records dependency versions.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start Vite with source reloads. |
| `bun run test` | Run Vitest once. |
| `bun run test:watch` | Run Vitest in watch mode. |
| `bun run lint` | Run ESLint with zero allowed warnings. |
| `bun run typecheck` | Check TypeScript without emitting files. |
| `bun run build` | Run lint, TypeScript checks, and the production build into `dist/`. |
| `bun run preview` | Serve an existing production build. |
| `bun run models:check` | Check item, ship, fishing, event, menu, and texture assets. |
| `bun run thumbnails:check` | Check generated item thumbnails. |
| `bun run powershell:check` | Check PowerShell script portability. |

Pass test paths to run a focused check:

```sh
bun run test tests/SurvivalSession.test.ts tests/SurvivalSaveStore.test.ts
```

Choose checks for the changed behavior. Rate proposed new tests before writing them, as required by AGENTS.md.
For documentation edits, check relative links, source paths, commands, and `git diff --check`.

## Inspect the game

Open System Tuning with Backquote. Use Event Test to inspect encounters, endings, or the item animation lab.
Use weather overrides to inspect Calm, Overcast, Squall, Rain, Wind, Thunderstorm, Waves, or Fog.
Overrides persist through browser preferences. Clear them before assessing normal event weather.

Graphics controls include water, shadows, anti-aliasing, ambient occlusion, and post-processing.
[PhysicsOptions](../src/physics/PhysicsOptions.ts) defines scavenging physics defaults and stored overrides.
Physics modes are `enabled`, `debug`, and `off`. Changing enabled state requires a reload.

Use [EventTest](../src/app/EventTest.ts) for inspection setup and [PostProcessingConsole](../src/ui/PostProcessingConsole.ts) for tuning controls.
For water internals, read [Water rendering](WATER_RENDERING.md).

## Simulations and browser runs

| Command | Purpose |
| --- | --- |
| `bun run balance:survival` | Run the balance simulation and check its encoded rescue thresholds. |
| `bun run simulate:scenarios` | Print loadout and outcome statistics. |
| `bun run simulate:scenarios:slice` | Write a selected simulation slice. |
| `bun run simulate:scenarios:report` | Combine slice results into a report. |

The scenario runner accepts `SIM_SEEDS`, `SIM_LOADOUT_LIMIT`, and `SIM_FISHING_SUCCESS`.
Use a small loadout limit while investigating. Read [balanceSimulation](../src/survival/balanceSimulation.ts) for policy and model limits.
Simulation results measure that policy, not human play.

For slices, set `SIM_OUTPUT` and either `SIM_INDICES` or all three `SIM_SAMPLE_TOTAL`, `SIM_SAMPLE_START`, and `SIM_SAMPLE_COUNT` values.
For reports, set `SIM_REPORT_DIR` to the slice folder and `SIM_REPORT_OUTPUT` to an artifact path.
The report writer otherwise targets `docs/scenario-simulation.md`.
Read [the slice runner](../scripts/simulate-scenarios-slice.ts) and [report writer](../scripts/simulate-scenarios-report.ts) for option details.

The browser playtest server creates a fixed build and records its source commit and hashes:

```sh
bun run playtest:serve --batch-dir <absolute-new-batch-folder> --port 4173
```

Use a new batch folder. The server stops if source or build files change.
Read [frozenPlaytest](../scripts/frozenPlaytest.ts) for build metadata and invalidation rules.

For a seeded survival entry, append these parameters to the server URL:

```text
?playtest=survival&seed=123&missing=cannedFood-1&missing=baitTin-1
```

The parser requires a 32-bit unsigned seed and two distinct pickup instance IDs.
It supplies the remaining pickups. This entry works in development or playtest mode.
See [BrowserPlaytest](../src/app/BrowserPlaytest.ts) for validation.
Record the seed, missing pickups, build metadata, and observed result for reproducible reports.

## Build and deploy

```sh
bun run build
bun run preview
```

Deploy `dist/` to a static host. Match its URL path to `base` in [vite.config.ts](../vite.config.ts).
The checked-in base assumes `/dont-sleep-with-the-fishes/`; change it before building for a different path.

[Deploy to GitHub Pages](../.github/workflows/deploy-pages.yml) runs on pushes to `master` and manual dispatch.
Deployment waits for the Ubuntu build job.
That job checks models and textures, then runs lint, TypeScript checks, and the production build.

## Analytics

Set the public `VITE_GA_MEASUREMENT_ID` before a production build.
For GitHub Pages, use the repository Actions variable with that name.
For another host, configure the build environment or use [.env.example](../.env.example) as the `.env.production` template.
An empty or invalid ID disables analytics.

| Event | Trigger | Parameters |
| --- | --- | --- |
| `game_start` | Start scavenging, including restart. | None. |
| `game_death` | Dorothy, Health, or Hull ending. | `ending_type`, `survival_day`. |
| `game_win` | Rescue or Kraken ending. | `ending_type`, `survival_day`. |

Ending IDs are `dorothy`, `death`, `sinking`, `rescue`, and `kraken`.
The Dorothy ending uses day zero. Survival endings use the current day.
Loading a save does not emit another start. Inspection runs suppress gameplay events.
Development, playtest builds, localhost, loopback hosts, and URLs with a `playtest` parameter disable the tag.
The tag loads without blocking startup.

Source: [GoogleAnalytics](../src/browser/GoogleAnalytics.ts), with coverage in [GoogleAnalytics tests](../tests/GoogleAnalytics.test.ts) and [SurvivalAnalytics tests](../tests/SurvivalAnalytics.test.ts).
