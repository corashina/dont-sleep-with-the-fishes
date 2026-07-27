# Opaque Scene Settle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the black cover fully opaque until event and dawn scenes finish changing, render once in their completed state, and remain covered for two browser frames before uncovering.

**Architecture:** `SurvivalUI` owns a cancellable two-frame `settleCoveredScene()` browser-frame barrier. `SurvivalPhase` sequences world animation, explicit scene rendering, the settle barrier, and uncover through one private helper while retaining generation checks after every await.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, jsdom

## Global Constraints

- Keep the existing 2.5-second cover, 2-second event-outcome hold, event rules, and authored world animation durations unchanged.
- Event tableau reveal, resolved-event scene replacement, and quiet-night dawn must finish behind opaque black.
- Render the completed Three.js scene before waiting two animation frames and beginning uncover.
- Only one settle operation may be pending; supersession and disposal settle it exactly once and cancel its scheduled frame.
- Restart or disposal during the settle barrier must not uncover, unlock commands, restore focus, or execute stale callbacks.
- Do not add fixed blackout delays, new per-frame allocations, or renderer dependencies to gameplay rules.

---

### Task 1: Add the Cancellable Two-Frame UI Barrier

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: browser `requestAnimationFrame` and `cancelAnimationFrame`.
- Produces: `SurvivalUI.settleCoveredScene(): Promise<void>`, resolving after two frame callbacks or immediately when superseded/disposed.

- [ ] **Step 1: Write failing real lifecycle tests**

Add a test that stubs the browser frame scheduler, invokes the real UI method,
and proves one frame is insufficient:

```ts
it('keeps a covered scene pending for two browser frames', async () => {
  const callbacks: FrameRequestCallback[] = [];
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const cancelFrame = vi.fn();
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = createUI(mount);
  let settled = false;

  const pending = ui.settleCoveredScene();
  void pending.then(() => { settled = true; });
  expect(requestFrame).toHaveBeenCalledTimes(1);

  callbacks.shift()!(16);
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(requestFrame).toHaveBeenCalledTimes(2);

  callbacks.shift()!(32);
  await pending;
  expect(settled).toBe(true);
  expect(cancelFrame).not.toHaveBeenCalled();
});
```

Add a second test proving supersession and disposal resolve each promise once
and cancel the outstanding handles:

```ts
it('settles superseded and disposed covered-scene waits without stale frames', async () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const handle = nextHandle++;
    callbacks.set(handle, callback);
    return handle;
  });
  const cancelFrame = vi.fn((handle: number) => { callbacks.delete(handle); });
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = createUI(mount);

  const first = ui.settleCoveredScene();
  const second = ui.settleCoveredScene();
  await first;
  expect(cancelFrame).toHaveBeenCalledWith(1);

  ui.dispose();
  await second;
  expect(cancelFrame).toHaveBeenCalledWith(2);
  expect(callbacks.size).toBe(0);
});
```

Extend `afterEach` with `vi.unstubAllGlobals()` so frame stubs cannot leak.

- [ ] **Step 2: Run the UI tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/SurvivalUI.test.ts
```

Expected: TypeScript/runtime failure because `settleCoveredScene` does not yet
exist.

- [ ] **Step 3: Implement the minimal owned frame barrier**

Add a dedicated pending-operation field:

```ts
private pendingCoveredSceneSettle: PendingFade | null = null;
```

Implement:

```ts
settleCoveredScene(): Promise<void> {
  if (this.disposed) return Promise.resolve();
  this.pendingCoveredSceneSettle?.finish();
  return new Promise((resolve) => {
    let settled = false;
    let frame = 0;
    let completedFrames = 0;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (frame !== 0) window.cancelAnimationFrame(frame);
      if (this.pendingCoveredSceneSettle?.finish === finish) {
        this.pendingCoveredSceneSettle = null;
      }
      resolve();
    };
    const advance = (): void => {
      frame = 0;
      completedFrames += 1;
      if (completedFrames >= 2) {
        finish();
        return;
      }
      frame = window.requestAnimationFrame(advance);
    };
    frame = window.requestAnimationFrame(advance);
    this.pendingCoveredSceneSettle = { finish };
  });
}
```

Call `this.pendingCoveredSceneSettle?.finish()` from `dispose()` beside the
other UI-owned pending operations.

- [ ] **Step 4: Run focused UI tests**

Run:

```powershell
npm.cmd test -- tests/SurvivalUI.test.ts
npm.cmd run typecheck
```

Expected: all UI tests and typecheck pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/ui/SurvivalUI.ts tests/SurvivalUI.test.ts
git commit -m "feat: settle completed scenes behind black"
```

### Task 2: Sequence Event and Dawn Scenes Behind the Barrier

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Test: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: `SurvivalUI.settleCoveredScene(): Promise<void>` from Task 1 and the existing `SurvivalPhase.render(): void`.
- Produces: `SurvivalPhase.renderAndSettleCoveredScene(generation: number): Promise<boolean>`, returning `false` when lifecycle supersession prevents continuation.

- [ ] **Step 1: Write failing transition-order tests**

Update the event-entry ordering tests with a deferred tableau reveal and
deferred scene settle. Provide `world.scene: new Scene()` and a
`sceneRenderer.render` spy so the real phase render boundary is observable:

```ts
const tableauReveal = deferred();
const sceneSettle = deferred();
const sceneRenderer: SceneRenderer = {
  render: vi.fn(() => { calls.push('scene-render'); }),
  resize: vi.fn(),
  dispose: vi.fn(),
};
const world: Partial<BoatWorld> = {
  scene: new Scene(),
  revealEvent: vi.fn(() => {
    calls.push('reveal-tableau');
    return tableauReveal.promise;
  }),
  dispose: vi.fn(),
};
const ui: Partial<SurvivalUI> = {
  settleCoveredScene: vi.fn(() => {
    calls.push('settle');
    return sceneSettle.promise;
  }),
  dispose: vi.fn(),
};
```

After cover resolves, expect reveal to start but not uncover. After
`tableauReveal.resolve()`, expect:

```ts
expect(calls.slice(-2)).toEqual(['scene-render', 'settle']);
expect(calls).not.toContain('uncover');
```

Only after `sceneSettle.resolve()` may `uncover` appear.

Update the resolved-night-event test so the dawn cue is deferred and assert:

```ts
expect(calls).not.toContain('uncover');
dawnCue.resolve();
await flushPromises();
expect(calls.slice(-2)).toEqual(['scene-render', 'settle']);
expect(calls).not.toContain('uncover');
sceneSettle.resolve();
await flushPromises();
expect(calls.at(-1)).toBe('uncover');
```

Apply the same settle-before-uncover assertion to resolved day events and
quiet-night dawn. Extend the existing restart/disposal table with a `settle`
pending step using:

```ts
const sceneSettle = deferred();
const settleCoveredScene = vi.fn(() => sceneSettle.promise);
if (teardown === 'dispose') phase.dispose();
else phase.requestRestart();
expect(setSleepCovered).not.toHaveBeenCalledWith(false);
expect(setBusy).not.toHaveBeenLastCalledWith(false);
expect(restoreCommandFocus).not.toHaveBeenCalled();
sceneSettle.resolve();
await flushPromises();
expect(setSleepCovered).not.toHaveBeenCalledWith(false);
expect(setBusy).not.toHaveBeenLastCalledWith(false);
expect(restoreCommandFocus).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run phase tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/SurvivalPhase.test.ts
```

Expected: ordering failures because event reveal still runs concurrently with
uncover and no scene-settle call exists.

- [ ] **Step 3: Implement one guarded render-and-settle helper**

Add:

```ts
private async renderAndSettleCoveredScene(generation: number): Promise<boolean> {
  this.render();
  await (this.ui.settleCoveredScene?.() ?? Promise.resolve());
  return this.isContinuationActive(generation);
}
```

Change event entry from concurrent reveal/uncover to:

```ts
await (this.world.revealEvent?.(event.id) ?? Promise.resolve());
if (!this.isContinuationActive(generation)) return;
if (!await this.renderAndSettleCoveredScene(generation)) return;
await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
```

For quiet-night dawn, resolved night events, and resolved day events, call
`renderAndSettleCoveredScene(generation)` after all hidden mutations,
`runDawn`, and snapshot synchronization complete, but immediately before
`setSleepCovered(false)`.

Keep the existing generation check after uncover. Do not change terminal rescue
handling, event timings, world cue durations, command locks, or focus order.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
npm.cmd test -- tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: focused and full suites pass, typecheck/build succeed, and diff check
prints no errors. The existing Vite chunk-size warning remains non-blocking.

- [ ] **Step 5: Verify the running game**

At `http://127.0.0.1:4173/dont-sleep-with-the-fishes/`, click End Day and
verify:

1. Cover opacity reaches and remains `1`.
2. Tableau reveal or dawn completes entirely while opacity is `1`.
3. The completed scene is rendered and two frame callbacks finish under black.
4. Only then does the 2.5-second uncover begin.
5. No intermediate tableau travel, old-scene flash, or console error is visible.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts
git commit -m "fix: reveal only settled survival scenes"
```
