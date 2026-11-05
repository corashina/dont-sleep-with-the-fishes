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
The game serves from the site root.

## Commands and checks

[package.json](../package.json) defines the commands. [bun.lock](../bun.lock) records dependency versions.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start Vite with source reloads. |
| `bun run test` | Run Vitest once. |
| `bun run test:watch` | Run Vitest in watch mode. |
| `bun run lint` | Run ESLint with zero allowed warnings. |
| `bun run typecheck` | Check game and Pages Function TypeScript without emitting files. |
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

Cloudflare Pages hosts the game at <https://dontsleepwiththefishes.pages.dev/>. [wrangler.jsonc](../wrangler.jsonc) configures the project.
Pages serves `dist/` as static files.
The Pages Function in [functions/api/event.ts](../functions/api/event.ts) handles `POST /api/event`.

Run the site locally after a build:

```sh
bun run build
bunx wrangler pages dev
```

Pages builds and deploys each push to `master`.
It also deploys other branches as previews and posts the preview URL on the pull request.

| Setting | Value |
| --- | --- |
| Project | `dontsleepwiththefishes` |
| Production branch | `master` |
| Build command | `bun install --frozen-lockfile && bun run models:check && bun run build` |
| Output directory | `dist` |

Run `bunx wrangler types functions/worker-configuration.d.ts` after you change `wrangler.jsonc`.

## Analytics

The game sends events to the Pages Function with `navigator.sendBeacon`.
The function validates each event and writes one row to the `fishes_events` Workers Analytics Engine dataset.
The function adds the country from Cloudflare request data. The game sends no country, cookie, or user ID.

| Event | Trigger | Fields |
| --- | --- | --- |
| `visit` | Application start, one time for each page load. | None. |
| `game_start` | Start scavenging, including restart. | None. |
| `game_end` | Any ending. | `ending`, `day`. |

Ending IDs are `dorothy`, `death`, `sinking`, `rescue`, and `kraken`.
The Dorothy ending uses day zero. Survival endings use the current day.
Loading a save does not send another start. Inspection runs send no gameplay events.
Development builds, playtest builds, localhost, loopback hosts, and URLs with a `playtest` parameter send no events.

| Row column | Value |
| --- | --- |
| `index1`, `blob1` | Event name. |
| `blob2` | Country code, or `XX` when unknown. |
| `blob3` | Ending ID, or empty. |
| `double1` | Day, or `0`. |

Analytics Engine keeps rows for 3 months.

To read the data, copy [.env.example](../.env.example) to `.env` and set the account ID and a token with "Account Analytics: Read".
Then run `bun run analytics:report` with `7`, `30`, or `90` days. The default is 7.
The report prints visits by country, game starts, and game ends by ending with the median day.

Source: [eventContract](../src/analytics/eventContract.ts), [Analytics](../src/browser/Analytics.ts), [event function](../functions/api/event.ts), and [analytics-report](../scripts/analytics-report.mjs).
Coverage: [AnalyticsEventContract tests](../tests/AnalyticsEventContract.test.ts), [Analytics tests](../tests/Analytics.test.ts), and [SurvivalAnalytics tests](../tests/SurvivalAnalytics.test.ts).
