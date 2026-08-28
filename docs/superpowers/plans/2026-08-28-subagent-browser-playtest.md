# Subagent Browser Playtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable browser playtests that use one to three collaboration subagents in the current chat.

**Architecture:** A pure query parser creates an immutable survival startup. `launchGame` passes it into `Game`, which starts survival directly and disables saves. The project skill keeps coordination in the current chat and stores all evidence in the main repository.

**Tech Stack:** TypeScript, Three.js, Vite, Vitest, Codex project skills, collaboration subagents, in-app browser controls.

**Spec:** `docs/superpowers/specs/2026-08-28-subagent-browser-playtest-design.md`

## Global Constraints

- Work on branch `codex/subagent-browser-playtests` in an isolated worktree.
- Preserve all unrelated working tree changes.
- Add no browser automation package.
- Ask for one, two, or three testers before each new browser run.
- Recommend three testers.
- Never create or fork separate Codex chats.
- Store batch artifacts in the main repository.
- Use only visible page controls and visible page state during player runs.
- Disable save storage access in browser playtest mode.
- Stop after day 55 and before every day 56 action.
- Read `VISUAL_STYLE_GUIDE.md` before editing player-facing error copy.
- Do not restore the superseded quiet-day workaround.

---

### Task 1: Recover and validate browser playtest input

**Files:**
- Create: `src/app/BrowserPlaytest.ts`
- Create: `tests/BrowserPlaytest.test.ts`

**Interfaces:**
- Produces: `BrowserPlaytestStartup`
- Produces: `BrowserPlaytestInputError`
- Produces: `parseBrowserPlaytest(search: string, development: boolean): BrowserPlaytestStartup | null`

- [ ] **Step 1: Write the failing parser test**

Create `tests/BrowserPlaytest.test.ts` with the exact startup and invalid-input cases:

```ts
import { describe, expect, it } from 'vitest';
import {
  BrowserPlaytestInputError,
  parseBrowserPlaytest,
} from '../src/app/BrowserPlaytest';

describe('browser playtest input', () => {
  it('keeps normal development startup without playtest input', () => {
    expect(parseBrowserPlaytest('?stats', true)).toBeNull();
  });

  it('ignores playtest input in production', () => {
    expect(parseBrowserPlaytest(
      '?playtest=survival&seed=7&missing=map-1&missing=knife-1',
      false,
    )).toBeNull();
  });

  it('uses the exact seed and removes two item instances', () => {
    const startup = parseBrowserPlaytest(
      '?playtest=survival&seed=4294967295&missing=cannedFood-2&missing=baitTin-1',
      true,
    );

    expect(startup?.seed).toBe(4294967295);
    expect(startup?.missingItemIds).toEqual(['cannedFood-2', 'baitTin-1']);
    expect(startup?.savedItems.map(({ instanceId }) => instanceId))
      .not.toContain('cannedFood-2');
    expect(startup?.savedItems.map(({ instanceId }) => instanceId))
      .not.toContain('baitTin-1');
    expect(Object.isFrozen(startup)).toBe(true);
    expect(startup?.savedItems.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    ['?playtest=survival&missing=map-1&missing=knife-1', 'seed'],
    ['?playtest=survival&seed=01&missing=map-1&missing=knife-1', 'seed'],
    ['?playtest=survival&seed=4294967296&missing=map-1&missing=knife-1', 'seed'],
    ['?playtest=survival&seed=1&missing=map-1', 'missing'],
    ['?playtest=survival&seed=1&missing=map-1&missing=map-1', 'missing'],
    ['?playtest=survival&seed=1&missing=map&missing=knife-1', 'missing'],
    ['?playtest=menu&seed=1&missing=map-1&missing=knife-1', 'playtest'],
  ])('rejects %s at %s', (search, parameter) => {
    expect(() => parseBrowserPlaytest(search, true)).toThrow(
      new BrowserPlaytestInputError(parameter),
    );
  });
});
```

- [ ] **Step 2: Run the parser test and confirm RED**

Run: `npm test -- tests/BrowserPlaytest.test.ts`

Expected: FAIL because `src/app/BrowserPlaytest.ts` does not exist.

- [ ] **Step 3: Add the immutable parser**

Create `src/app/BrowserPlaytest.ts` with this public shape:

```ts
export interface BrowserPlaytestStartup {
  readonly seed: number;
  readonly missingItemIds: readonly [
    ScavengeItemInstanceId,
    ScavengeItemInstanceId,
  ];
  readonly savedItems: readonly ItemInstance[];
}

export class BrowserPlaytestInputError extends Error {
  constructor(readonly parameter: string) {
    super(`Invalid browser playtest parameter: ${parameter}.`);
    this.name = 'BrowserPlaytestInputError';
  }
}

export function parseBrowserPlaytest(
  search: string,
  development: boolean,
): BrowserPlaytestStartup | null;
```

Use `URLSearchParams`. Accept one canonical unsigned 32-bit seed and exactly two distinct catalog instance IDs.

Return frozen copies in catalog order. Return `null` outside development or without `playtest`.

- [ ] **Step 4: Run the parser test and confirm GREEN**

Run: `npm test -- tests/BrowserPlaytest.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the parser layer**

```powershell
git add -- src/app/BrowserPlaytest.ts tests/BrowserPlaytest.test.ts
git commit -m "feat: parse browser playtest startup"
```

### Task 2: Start survival directly and isolate saves

**Files:**
- Modify: `src/Game.ts`
- Modify: `src/app/launchGame.ts`
- Modify: `tests/GameDirector.test.ts`
- Modify: `tests/launchGame.test.ts`

**Interfaces:**
- Consumes: `BrowserPlaytestStartup`
- Adds: `GameTestOptions.browserPlaytest?: BrowserPlaytestStartup | null`
- Adds: `LaunchEnvironment { search: string; development: boolean }`
- Extends: `LaunchDependencies.createGame(..., browserPlaytest)`

- [ ] **Step 1: Write failing direct-start tests**

Add tests to `tests/GameDirector.test.ts` that pass this value:

```ts
const browserPlaytest = {
  seed: 42,
  missingItemIds: ['map-1', 'knife-1'],
  savedItems: [{ instanceId: 'carlitos-1', type: 'carlitos' }],
} as const;

const game = Game.forTest(factories, {
  ...options,
  browserPlaytest,
  saveStorage,
  createSeed,
});

expect(factories.menu).not.toHaveBeenCalled();
expect(factories.survival).toHaveBeenCalledWith(
  expect.anything(),
  {
    kind: 'fresh',
    savedItems: browserPlaytest.savedItems,
    seed: 42,
    scavengeElapsedSeconds: 0,
  },
  expect.any(Function),
  expect.any(Function),
);
expect(createSeed).not.toHaveBeenCalled();
expect(saveStorage.load).not.toHaveBeenCalled();
expect(saveStorage.save).not.toHaveBeenCalled();
expect(saveStorage.clear).not.toHaveBeenCalled();
```

Keep an existing normal-start assertion that creates the menu.

- [ ] **Step 2: Run the director tests and confirm RED**

Run: `npm test -- tests/GameDirector.test.ts`

Expected: FAIL because `browserPlaytest` is not supported.

- [ ] **Step 3: Add startup selection in `Game`**

Pass `BrowserPlaytestStartup | null` into `Game.initialize()`.

Use this branch before initial phase construction:

```ts
if (browserPlaytest === null) {
  this.activateMenu(false);
} else {
  this.seed = browserPlaytest.seed;
  this.activateSurvival(Object.freeze({
    kind: 'fresh',
    savedItems: browserPlaytest.savedItems,
    seed: browserPlaytest.seed,
    scavengeElapsedSeconds: 0,
  }), false);
}
```

Pass `null` save storage when `browserPlaytest` exists. Let `Game.start()` start the selected initial phase once.

- [ ] **Step 4: Run the director tests and confirm GREEN**

Run: `npm test -- tests/GameDirector.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing launch propagation tests**

Add tests to `tests/launchGame.test.ts`:

```ts
it('parses development playtest input before loading assets', async () => {
  const dependencies = createLaunchDependencies();
  const handle = launchGame(
    mount,
    dependencies,
    'disabled',
    {
      search: '?playtest=survival&seed=42&missing=map-1&missing=knife-1',
      development: true,
    },
  );

  await handle.completion;

  expect(dependencies.createGame).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.any(Function),
    expect.objectContaining({ seed: 42 }),
  );
});

it('rejects invalid playtest input before loading assets', async () => {
  const dependencies = createLaunchDependencies();
  const handle = launchGame(mount, dependencies, 'disabled', {
    search: '?playtest=survival&seed=42&missing=map-1',
    development: true,
  });

  await expect(handle.completion).resolves.toBeNull();
  expect(dependencies.loadModels).not.toHaveBeenCalled();
});
```

Add a production test that passes the same query with `development: false` and expects `null` startup.

- [ ] **Step 6: Run launch tests and confirm RED**

Run: `npm test -- tests/launchGame.test.ts`

Expected: FAIL because `LaunchEnvironment` does not exist.

- [ ] **Step 7: Parse before asset loading**

Add this launch input:

```ts
export interface LaunchEnvironment {
  readonly search: string;
  readonly development: boolean;
}
```

Default it from `window.location.search` and `import.meta.env.DEV`.

Call `parseBrowserPlaytest()` before `renderLoading()` and `loadGameAssets()`. Pass the result into `createGame`.

- [ ] **Step 8: Run focused startup tests**

Run: `npm test -- tests/BrowserPlaytest.test.ts tests/GameDirector.test.ts tests/launchGame.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the startup layer**

```powershell
git add -- src/Game.ts src/app/launchGame.ts tests/GameDirector.test.ts tests/launchGame.test.ts
git commit -m "feat: start browser playtests in survival"
```

### Task 3: Keep empty night draws quiet

**Files:**
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Consumes: existing `drawEvent('night')`
- Produces: existing `quiet-night` outcome for `night-calm-fallback`

- [ ] **Step 1: Write the exact failing regression test**

Add this test to `tests/SurvivalSession.test.ts`:

```ts
it('treats a night fallback as a quiet night', () => {
  const session = new SurvivalSession(saved(
    'cannedFood', 'cannedFood', 'cannedFood', 'baitTin', 'baitTin',
    'ductTape', 'compass', 'map', 'spyglass', 'fishingNet', 'knife',
    'bucket', 'flareGun', 'scubaSet', 'anchor', 'radio', 'umbrella',
    'swimRing', 'shotgun', 'carlitos',
  ), { seed: 3051382588 });

  expect(session.endDay()).toMatchObject({
    accepted: true,
    code: 'quiet-night',
    cue: 'nightfall',
  });
  expect(session.snapshot()).toMatchObject({
    state: 'nightEvent',
    pendingEventId: null,
    journalEntries: [{ day: 1, nighttime: { kind: 'quiet' } }],
  });
});
```

- [ ] **Step 2: Run the regression and confirm RED**

Run: `npm test -- tests/SurvivalSession.test.ts -t "treats a night fallback as a quiet night"`

Expected: FAIL because `pendingEventId` becomes `night-calm-fallback`.

- [ ] **Step 3: Reuse one quiet-night path**

Add this branch and helper in `SurvivalSession`:

```ts
const event = this.drawEvent('night');
if (event.id === 'night-calm-fallback') return this.beginQuietNight();
this.openEvent(event);
return this.commit('event-opened', event.prompt, {}, 'nightfall');

private beginQuietNight(): ActionOutcome {
  this.state = 'nightEvent';
  this.pendingJournalNighttime = createQuietJournalNightRecord();
  this.finalizeJournalDay();
  return this.commit(
    'quiet-night',
    'The night passes without incident.',
    {},
    'nightfall',
  );
}
```

Use `beginQuietNight()` for the existing quiet-night chance branch.

- [ ] **Step 4: Run the session tests and confirm GREEN**

Run: `npm test -- tests/SurvivalSession.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the empty-night fix**

```powershell
git add -- src/survival/SurvivalSession.ts tests/SurvivalSession.test.ts
git commit -m "fix: keep empty night draws quiet"
```

### Task 4: Separate WebGL failures from game failures

**Files:**
- Modify: `src/Game.ts`
- Modify: `src/app/launchGame.ts`
- Modify: `tests/GameConstruction.test.ts`
- Modify: `tests/launchGame.test.ts`

**Interfaces:**
- Produces: `WebGlInitializationError`
- Consumes: `renderGameFailure(mount, error)`
- Keeps: `renderWebGlFailure(mount, error)` for `WebGlInitializationError`

- [ ] **Step 1: Read the visual guide**

Run: `Get-Content -Raw VISUAL_STYLE_GUIDE.md`

Confirm the copy-only error change needs no CSS, material, lighting, or animation change.

- [ ] **Step 2: Write failing error classification tests**

Add these assertions to `tests/launchGame.test.ts`:

```ts
it('shows GAME ERROR for a runtime failure', async () => {
  const error = new Error('event bundle failed');
  const dependencies = createLaunchDependencies({
    createGame: () => { throw error; },
  });

  await launchGame(mount, dependencies).completion;

  expect(mount.textContent).toContain('GAME ERROR');
  expect(mount.textContent).toContain('event bundle failed');
  expect(mount.textContent).not.toContain('WEBGL UNAVAILABLE');
});

it('keeps WEBGL UNAVAILABLE for renderer initialization failure', async () => {
  const dependencies = createLaunchDependencies({
    createGame: () => {
      throw new WebGlInitializationError(new Error('WebGL context failed'));
    },
  });

  await launchGame(mount, dependencies).completion;

  expect(mount.textContent).toContain('WEBGL UNAVAILABLE');
  expect(mount.textContent).not.toContain('GAME ERROR');
});
```

Add this case to `tests/GameConstruction.test.ts`:

```ts
it('classifies renderer construction errors as WebGL initialization failures', async () => {
  const cause = new Error('WebGL context failed');
  constructionMocks.WebGLRenderer.mockImplementation(() => { throw cause; });
  const { Game, WebGlInitializationError } = await import('../src/Game');

  expect(() => new Game(
    document.createElement('main'),
    {} as PropModelLibrary,
    {} as ShipFurnitureLibrary,
    {} as SkyAssets,
    {} as LifeboatAssets,
    {} as ShipAssets,
    {} as MenuModelLibrary,
    {} as MenuSandAssets,
    physicsRuntime,
  )).toThrow(WebGlInitializationError);
});
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run: `npm test -- tests/GameConstruction.test.ts tests/launchGame.test.ts`

Expected: FAIL because `WebGlInitializationError` and `GAME ERROR` do not exist.

- [ ] **Step 4: Add explicit error ownership**

Add this exported error in `src/Game.ts`:

```ts
export class WebGlInitializationError extends Error {
  constructor(cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(message, { cause });
    this.name = 'WebGlInitializationError';
  }
}
```

Wrap only `new WebGLRenderer(...)` failures in this type.

Add this screen in `src/app/launchGame.ts`:

```ts
function renderRuntimeFailure(mount: HTMLElement, error: unknown): void {
  renderSystemScreen(mount, {
    kind: 'error',
    kicker: 'GAME ERROR',
    title: 'Unable to continue',
    lead: 'The game stopped after an unexpected error.',
    detail: errorMessage(error),
  });
}
```

Route `WebGlInitializationError` to `renderWebGlFailure()`. Route other unknown failures to `renderRuntimeFailure()`.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run: `npm test -- tests/GameConstruction.test.ts tests/launchGame.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit error classification**

```powershell
git add -- src/Game.ts src/app/launchGame.ts tests/GameConstruction.test.ts tests/launchGame.test.ts
git commit -m "fix: classify game failures accurately"
```

### Task 5: Replace separate chats with collaboration subagents

**Files:**
- Create: `.agents/skills/browser-playtest/SKILL.md`
- Create: `docs/browser-playtesting.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Trigger: `$browser-playtest` or a browser playtest request
- Tester count: one, two, or three
- Default recommendation: three
- Output: `<main-repository>/.superpowers/browser-playtests/<batch-id>/`

- [ ] **Step 1: Write the skill behavior checklist**

Use this checklist before creating the skill:

```text
[ ] asks for tester count before every run
[ ] recommends 3
[ ] maps 1 -> balanced
[ ] maps 2 -> cautious, reckless
[ ] maps 3 -> cautious, balanced, reckless
[ ] uses collaboration subagents only
[ ] contains no create_thread, fork_thread, separate chat, or Codex task workflow
[ ] resolves the main repository from the common Git directory
[ ] stores batch artifacts in the main repository
[ ] uses one server, seed, URL, and loadout
[ ] explains that Bait is automatic
[ ] tells players to click water after Fish
[ ] stops before day 56
```

- [ ] **Step 2: Create the operational project skill**

Create `.agents/skills/browser-playtest/SKILL.md` with this frontmatter:

```yaml
---
name: browser-playtest
description: Use when the user requests AI browser playtests for survival mode in this repository.
---
```

Define the coordinator contract from the specification.

Require the main agent to ask for tester count and wait before every new run.

Require `collaboration.spawn_agent` for every tester. Do not reference Codex app thread tools.

Tell the coordinator to derive the stable root from:

```powershell
$gitCommon = git rev-parse --path-format=absolute --git-common-dir
$mainRepository = Split-Path -Parent $gitCommon
```

Tell each player that Bait is automatic. After `Fish`, wait for `CLICK THE WATER TO CAST`, then click visible water.

- [ ] **Step 3: Create the human guide**

Create `docs/browser-playtesting.md` with these exact sections:

```markdown
# Browser Playtesting

## Request a Run
## Tester Count and Profiles
## Shared Game Setup
## Browser Access Rules
## Fishing Controls
## Result Files
## Stop Rules
## Failure Statuses
## Review the Comparison
```

Explain the one-to-three assignment and stable artifact path. State that the current chat coordinates all subagents.

- [ ] **Step 4: Link the guide from `AGENTS.md`**

Append one short instruction:

```markdown
Before AI browser playtests, read [`docs/browser-playtesting.md`](docs/browser-playtesting.md).
```

- [ ] **Step 5: Validate the workflow text**

Run:

```powershell
rg -n "create_thread|fork_thread|separate Codex|new chat" .agents/skills/browser-playtest/SKILL.md docs/browser-playtesting.md
rg -n "collaboration|tester count|Default: 3|CLICK THE WATER TO CAST|browser-playtests" .agents/skills/browser-playtest/SKILL.md docs/browser-playtesting.md
```

Expected: the first command finds nothing. The second command finds every required concept.

- [ ] **Step 6: Commit the skill and guide**

```powershell
git add -- .agents/skills/browser-playtest/SKILL.md docs/browser-playtesting.md AGENTS.md
git commit -m "feat: coordinate browser playtests with subagents"
```

### Task 6: Verify the implementation

**Files:**
- Verify: all source, test, skill, and guide files changed by Tasks 1 through 5.

**Interfaces:**
- Normal production startup remains the menu.
- Browser playtest startup uses no save storage.
- No new dependency exists.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm test -- tests/BrowserPlaytest.test.ts tests/GameDirector.test.ts tests/GameConstruction.test.ts tests/launchGame.test.ts tests/SurvivalSession.test.ts tests/SurvivalFishingFlow.test.ts tests/SurvivalUI.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all tests pass with exit code zero.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: exit code zero.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite finish with exit code zero.

- [ ] **Step 5: Review the final diff**

Run:

```powershell
git diff master...HEAD --check
git diff --stat master...HEAD
git status --short
```

Confirm no package file changed. Confirm unrelated main-worktree changes remain untouched.

### Task 7: Run the selected three-tester acceptance batch

**Files:**
- Create outside the feature worktree: `<main-repository>/.superpowers/browser-playtests/<batch-id>/batch.json`
- Create outside the feature worktree: `<main-repository>/.superpowers/browser-playtests/<batch-id>/<profile>/report.md`
- Create outside the feature worktree: `<main-repository>/.superpowers/browser-playtests/<batch-id>/<profile>/screenshots/`
- Create outside the feature worktree: `<main-repository>/.superpowers/browser-playtests/<batch-id>/comparison.md`

**Interfaces:**
- Uses: exactly three collaboration subagents
- Profiles: cautious, balanced, reckless
- Shared maximum day: 55

- [ ] **Step 1: Create stable shared inputs**

Resolve the main repository from the common Git directory.

Generate one batch ID, unsigned seed, and two distinct missing catalog IDs.

Write `batch.json` before spawning testers. Record the tested commit and feature worktree.

- [ ] **Step 2: Start one Vite server**

Run from the feature worktree:

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
```

Verify the direct survival URL loads before spawning players.

- [ ] **Step 3: Spawn exactly three tester subagents**

Call `collaboration.spawn_agent` three times from this chat.

Assign cautious, balanced, and reckless. Give every agent the same URL and its absolute profile folder.

Require each agent to read the browser-control skill and the project skill before browser actions.

- [ ] **Step 4: Wait for all three testers**

Use `collaboration.wait_agent` with long waits.

Do not stop other testers when one fails. Preserve every completed report and screenshot.

- [ ] **Step 5: Write the comparison**

Read the three reports. Write `comparison.md` with outcomes, days, resources, inventory, major choices, failures, and UI issues.

Update `batch.json` with final statuses, paths, and completion time.

- [ ] **Step 6: Stop the Vite server and verify artifacts**

Stop only the server started for this batch.

Verify all four Markdown files and every referenced screenshot exist under the main repository.

- [ ] **Step 7: Commit any product defect fix separately**

If a tester finds a confirmed product defect, stop completion claims.

Use systematic debugging and TDD. Commit the fix separately, rerun focused verification, then repeat the affected acceptance run.

Do not commit ignored batch artifacts.
