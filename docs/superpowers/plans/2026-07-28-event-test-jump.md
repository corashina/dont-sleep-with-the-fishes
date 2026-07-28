# Event Test Jump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Event Test picker to System Tuning that starts any authored survival event with one usable instance of every recoverable item and then continues normal survival play.

**Architecture:** A pure app helper derives immutable picker descriptors and the all-items scavenging result from the authoritative catalogs. `PostProcessingConsole` owns only the picker DOM and callback. `Game` validates the event, replaces the active phase, and forwards the initial event identifier through `SurvivalPhase` to the existing `SurvivalSession` seam.

**Tech Stack:** TypeScript 5.9, Three.js, DOM APIs, Vitest with jsdom, Vite.

## Global Constraints

- The picker is development tooling inside the existing Backquote System Tuning panel.
- Start a fresh survival run with one usable instance of every `ITEM_IDS` entry.
- The selected event bypasses ordinary eligibility only for initial staging; normal rules apply after resolution.
- The fresh survival run starts on day one with normal starting meters.
- Preserve weather overrides across the jump.
- Keep phase replacement, camera reset, pointer-lock exit, generation guards, and disposal owned by `Game`.
- Do not add reduced-motion behavior or `prefers-reduced-motion` handling.
- Do not add URL configuration, saved presets, meter editing, altered outcomes, or a return-to-picker loop.

---

### Task 1: Event test catalog and loadout

**Files:**
- Create: `src/app/EventTest.ts`
- Create: `tests/EventTest.test.ts`

**Interfaces:**
- Consumes: `ITEM_IDS`, `ScavengeResult`, and `SURVIVAL_EVENTS`.
- Produces:
  - `EventTestOption { id: string; title: string; phase: 'day' | 'night' }`
  - `EVENT_TEST_OPTIONS: readonly EventTestOption[]`
  - `isEventTestId(id: string): boolean`
  - `createEventTestResult(): Readonly<ScavengeResult>`

- [ ] **Step 1: Write the failing catalog and loadout tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  EVENT_TEST_OPTIONS,
  createEventTestResult,
  isEventTestId,
} from '../src/app/EventTest';
import { ITEM_IDS } from '../src/game/ItemState';
import { SURVIVAL_EVENTS } from '../src/survival/events';

describe('EventTest', () => {
  it('derives ordered immutable options from the authored event catalog', () => {
    expect(EVENT_TEST_OPTIONS).toEqual(SURVIVAL_EVENTS.map(({ id, title, phase }) => ({
      id, title, phase,
    })));
    expect(Object.isFrozen(EVENT_TEST_OPTIONS)).toBe(true);
    expect(EVENT_TEST_OPTIONS.every(Object.isFrozen)).toBe(true);
    expect(isEventTestId(SURVIVAL_EVENTS[0]!.id)).toBe(true);
    expect(isEventTestId('missing-event')).toBe(false);
  });

  it('creates one usable-by-default instance of every recoverable item', () => {
    const result = createEventTestResult();
    expect(result).toEqual({
      savedItems: ITEM_IDS.map((type) => ({ instanceId: `${type}-1`, type })),
      elapsedSeconds: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.savedItems)).toBe(true);
    expect(result.savedItems.every(Object.isFrozen)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `bun run test -- tests/EventTest.test.ts`

Expected: FAIL because `src/app/EventTest.ts` does not exist.

- [ ] **Step 3: Implement the immutable event options and fresh loadout**

```ts
import { ITEM_IDS, type ItemInstance, type ItemInstanceId } from '../game/ItemState';
import type { ScavengeResult } from '../game/ScavengeSession';
import { SURVIVAL_EVENTS } from '../survival/events';

export interface EventTestOption {
  readonly id: string;
  readonly title: string;
  readonly phase: 'day' | 'night';
}

export const EVENT_TEST_OPTIONS: readonly EventTestOption[] = Object.freeze(
  SURVIVAL_EVENTS.map(({ id, title, phase }) => Object.freeze({ id, title, phase })),
);

const EVENT_TEST_IDS = new Set(EVENT_TEST_OPTIONS.map(({ id }) => id));

export function isEventTestId(id: string): boolean {
  return EVENT_TEST_IDS.has(id);
}

export function createEventTestResult(): Readonly<ScavengeResult> {
  const savedItems = ITEM_IDS.map((type): Readonly<ItemInstance> => Object.freeze({
    instanceId: `${type}-1` as ItemInstanceId,
    type,
  }));
  return Object.freeze({
    savedItems: Object.freeze(savedItems),
    elapsedSeconds: 0,
  });
}
```

- [ ] **Step 4: Run the focused test**

Run: `bun run test -- tests/EventTest.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/EventTest.ts tests/EventTest.test.ts
git commit -m "feat: define event test fixtures"
```

### Task 2: Event picker in System Tuning

**Files:**
- Modify: `src/ui/PostProcessingConsole.ts`
- Modify: `src/styles/main.css`
- Modify: `tests/PostProcessingConsole.test.ts`

**Interfaces:**
- Consumes: `EventTestOption` from Task 1.
- Produces:
  - `EventTestControls { options: readonly EventTestOption[]; enterEvent(id: string): void }`
  - Optional seventh `PostProcessingConsole` constructor argument for event controls.

- [ ] **Step 1: Add a failing menu interaction test**

Add an `EventTestControls` import and this test:

```ts
it('groups event test scenes and enters only after explicit activation', () => {
  const controls: PostProcessingControls = {
    getState: vi.fn(() => state()),
    setAmbientOcclusionMode: vi.fn(),
    setNumeric: vi.fn(),
  };
  const enterEvent = vi.fn();
  const mount = document.createElement('main');
  document.body.append(mount);
  const consoleMenu = new PostProcessingConsole(
    mount,
    controls,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      options: [
        { id: 'dangerous-waters', title: 'Dangerous Waters', phase: 'day' },
        { id: 'shower-night', title: 'Shower Night', phase: 'night' },
      ],
      enterEvent,
    },
  );
  const select = mount.querySelector<HTMLSelectElement>('[data-event-test-select]')!;
  expect(Array.from(select.querySelectorAll('optgroup'), (group) => group.label))
    .toEqual(['DAY', 'NIGHT']);
  expect(Array.from(select.options, (option) => [option.value, option.text]))
    .toEqual([
      ['dangerous-waters', 'Dangerous Waters'],
      ['shower-night', 'Shower Night'],
    ]);
  select.value = 'shower-night';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  expect(enterEvent).not.toHaveBeenCalled();
  mount.querySelector<HTMLButtonElement>('[data-event-test-enter]')!.click();
  expect(enterEvent).toHaveBeenCalledWith('shower-night');
  expect(mount.querySelector<HTMLElement>('[data-post-processing-panel]')!.hidden).toBe(true);
  consoleMenu.dispose();
});
```

- [ ] **Step 2: Run the focused test and confirm missing controls**

Run: `bun run test -- tests/PostProcessingConsole.test.ts`

Expected: FAIL because the constructor and event picker do not exist.

- [ ] **Step 3: Add the event control contract and section**

Add:

```ts
import type { EventTestOption } from '../app/EventTest';

export interface EventTestControls {
  readonly options: readonly EventTestOption[];
  enterEvent(id: string): void;
}
```

Accept `private readonly eventTestControls?: EventTestControls` after
`weatherControls`. Build an optional `EVENT TEST` section with
`data-event-test-select` and `data-event-test-enter`; create one `optgroup`
for each phase that has options. Use event titles for visible option text and
event IDs for values. The explanatory copy is:

```text
Starts a fresh survival run with every item usable.
```

In `handleClick`, validate the current selection against
`eventTestControls.options`, call `setOpen(false)`, then invoke
`eventTestControls.enterEvent(id)`. A dropdown `change` must not invoke the
callback.

- [ ] **Step 4: Style the action as a compact, deliberate system control**

Add:

```css
.post-processing-console__event-test {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.post-processing-console__event-test select,
.post-processing-console__event-test button {
  min-height: 32px;
  border: 1px solid #526c62;
  background: #101b19;
  color: #d7e4dd;
  font: inherit;
}
.post-processing-console__event-test select { min-width: 0; padding: 5px 7px; }
.post-processing-console__event-test button {
  padding: 5px 10px;
  color: #e7ba56;
  cursor: pointer;
}
.post-processing-console__event-test button:hover { background: #182522; }
```

- [ ] **Step 5: Run the focused test**

Run: `bun run test -- tests/PostProcessingConsole.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/PostProcessingConsole.ts src/styles/main.css tests/PostProcessingConsole.test.ts
git commit -m "feat: add event picker to system tuning"
```

### Task 3: Director-owned event jump and survival seam

**Files:**
- Modify: `src/Game.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `EVENT_TEST_OPTIONS`, `createEventTestResult()`, and
  `isEventTestId(id)`, plus the existing `SurvivalSession` `initialEventId`.
- Produces:
  - Optional fifth `GameFactories.createSurvival` argument `initialEventId?: string`.
  - Optional sixth production `SurvivalPhase` constructor argument.
  - Private `Game.enterTestEvent(id: string): void`.

- [ ] **Step 1: Add failing lifecycle coverage for jumps from both phase types**

Import `ITEM_IDS`, then add:

```ts
it('enters selected test events from scavenging and survival with every item', () => {
  const mount = document.createElement('main');
  document.body.append(mount);
  const scavenge = gamePhase();
  const firstSurvival = gamePhase();
  const secondSurvival = gamePhase();
  const survivalPhases = [firstSurvival, secondSurvival];
  const createSurvival = vi.fn(() => survivalPhases[createSurvival.mock.calls.length - 1]!);
  const game = Game.forTest({
    createScavenge: () => scavenge,
    createSurvival,
  }, {
    propModels: createTestPropModels(),
    shipFurniture: createTestShipFurniture(),
    skyAssets: createTestSkyAssets(),
    physicsRuntime,
    sceneRenderer: postProcessingSceneRenderer(),
    mount,
    createSeed: vi.fn()
      .mockReturnValueOnce(11)
      .mockReturnValueOnce(22)
      .mockReturnValueOnce(33),
  });

  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
  const select = mount.querySelector<HTMLSelectElement>('[data-event-test-select]')!;
  select.value = 'shower-night';
  mount.querySelector<HTMLButtonElement>('[data-event-test-enter]')!.click();

  expect(scavenge.dispose).toHaveBeenCalledOnce();
  expect(createSurvival).toHaveBeenLastCalledWith(
    expect.anything(),
    {
      savedItems: ITEM_IDS.map((type) => ({ instanceId: `${type}-1`, type })),
      elapsedSeconds: 0,
    },
    22,
    expect.any(Function),
    'shower-night',
  );
  expect(firstSurvival.resize).toHaveBeenCalledWith(window.innerWidth, window.innerHeight);
  expect(firstSurvival.start).toHaveBeenCalledOnce();

  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
  select.value = 'dangerous-waters';
  mount.querySelector<HTMLButtonElement>('[data-event-test-enter]')!.click();
  expect(firstSurvival.dispose).toHaveBeenCalledOnce();
  expect(createSurvival.mock.calls.at(-1)?.[4]).toBe('dangerous-waters');
  expect(secondSurvival.start).toHaveBeenCalledOnce();

  expect(() => (
    game as unknown as { enterTestEvent(id: string): void }
  ).enterTestEvent('missing-event')).toThrow(/unknown event test scene/i);
  expect(secondSurvival.dispose).not.toHaveBeenCalled();
  game.dispose();
});
```

- [ ] **Step 2: Run the focused lifecycle test and confirm no event section exists**

Run: `bun run test -- tests/GameLifecycle.test.ts`

Expected: FAIL because `[data-event-test-select]` is absent.

- [ ] **Step 3: Extend the factory and production phase seam**

Change the factory signature to:

```ts
createSurvival(
  context: PhaseContext,
  result: Readonly<ScavengeResult>,
  seed: number,
  onRestart: () => void,
  initialEventId?: string,
): GamePhase;
```

Forward the value from `activateSurvival` through `PRODUCTION_FACTORIES` into
`SurvivalPhase`. Add `initialEventId?: string` before the private
`testDependencies` overload argument and construct the real session with:

```ts
new SurvivalSession(savedItems, {
  seed,
  ...(initialEventId === undefined ? {} : { initialEventId }),
})
```

Update `SurvivalPhase.forTest` to pass `undefined` before its injected test
dependencies.

- [ ] **Step 4: Wire System Tuning to a validated director transition**

Pass this seventh console argument during `Game.initialize`:

```ts
{
  options: EVENT_TEST_OPTIONS,
  enterEvent: (id) => this.enterTestEvent(id),
}
```

Implement:

```ts
private enterTestEvent(id: string): void {
  if (this.disposed) return;
  if (!isEventTestId(id)) throw new Error(`Unknown event test scene: ${id}`);
  const outgoing = this.detachActivePhase();
  this.exitPointerLock();
  outgoing?.dispose();
  this.resetCamera();
  this.elapsed = 0;
  this.seed = this.createSeed();
  this.activateSurvival(createEventTestResult(), id);
}
```

The existing `activateSurvival` flow applies stored weather, synchronizes the
console state, resizes, starts, and generation-guards the phase.

- [ ] **Step 5: Document the Event Test workflow**

Under the README System Tuning/debug controls, state that Backquote also exposes
an Event Test picker, **ENTER EVENT** starts a fresh lifeboat run with one usable
copy of every recoverable item, and normal survival continues after resolution.

- [ ] **Step 6: Run focused tests**

Run:

```bash
bun run test -- tests/EventTest.test.ts tests/PostProcessingConsole.test.ts tests/GameDirector.test.ts tests/GameLifecycle.test.ts tests/SurvivalPhase.test.ts tests/SurvivalSession.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run complete verification**

Run:

```bash
bun run test
bun run typecheck
bun run build
```

Expected: all tests pass, TypeScript reports no errors, and Vite completes the
production build.

- [ ] **Step 8: Commit**

```bash
git add src/Game.ts src/survival/SurvivalPhase.ts tests/GameLifecycle.test.ts README.md
git commit -m "feat: jump directly into survival events"
```
