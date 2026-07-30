# Crucial Performance Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the largest GPU and per-frame CPU costs without changing gameplay or the high visual preset.

**Architecture:** Lower only the low GTAO work budget. Cache immutable session snapshots until accepted state changes. Cache fixed object projection data and skip duplicate anchor layout writes.

**Tech Stack:** TypeScript, Three.js, Vitest, jsdom, Vite.

## Global Constraints

- Apply only the three approved optimizations.
- Keep gameplay rules and anchor update timing unchanged.
- Keep the high GTAO preset unchanged.
- Keep drifting-loot projection dynamic.
- Fall back to live mesh traversal when projection cache creation fails.
- Do not add reduced-motion behavior.
- Do not add dependencies.
- Avoid new allocations in per-frame projection code.

---

### Task 1: Low GTAO Work Budget

**Files:**
- Modify: `src/rendering/ItemAmbientOcclusion.ts`
- Create: `tests/ItemAmbientOcclusion.test.ts`

**Interfaces:**
- Consumes: Existing `AoQuality` values, `low` and `high`.
- Produces: `ITEM_AMBIENT_OCCLUSION_QUALITY`, a read-only preset table.

- [ ] **Step 1: Write the failing preset test**

```ts
import { describe, expect, it } from 'vitest';
import { ITEM_AMBIENT_OCCLUSION_QUALITY } from '../src/rendering/ItemAmbientOcclusion';

describe('item ambient occlusion quality', () => {
  it('uses the approved low-cost desktop preset', () => {
    expect(ITEM_AMBIENT_OCCLUSION_QUALITY.low).toEqual({
      resolutionScale: 0.4,
      gtaoSamples: 6,
      denoiseRings: 1,
      denoiseSamples: 4,
    });
  });

  it('keeps the high preset unchanged', () => {
    expect(ITEM_AMBIENT_OCCLUSION_QUALITY.high).toEqual({
      resolutionScale: 1,
      gtaoSamples: 16,
      denoiseRings: 2,
      denoiseSamples: 16,
    });
  });
});
```

- [ ] **Step 2: Run the preset test**

Run: `npx.cmd vitest run tests/ItemAmbientOcclusion.test.ts`

Expected: FAIL because the exported preset does not exist.

- [ ] **Step 3: Export and update the preset**

```ts
export const ITEM_AMBIENT_OCCLUSION_QUALITY = {
  low: {
    resolutionScale: 0.4,
    gtaoSamples: 6,
    denoiseRings: 1,
    denoiseSamples: 4,
  },
  high: {
    resolutionScale: 1,
    gtaoSamples: 16,
    denoiseRings: 2,
    denoiseSamples: 16,
  },
} as const;
```

Replace all internal `AO_QUALITY` reads with `ITEM_AMBIENT_OCCLUSION_QUALITY`.

- [ ] **Step 4: Run the preset test**

Run: `npx.cmd vitest run tests/ItemAmbientOcclusion.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/rendering/ItemAmbientOcclusion.ts tests/ItemAmbientOcclusion.test.ts
git commit -m "perf: reduce low ambient occlusion cost"
```

---

### Task 2: Immutable Session Snapshot Caches

**Files:**
- Modify: `src/game/ScavengeSession.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/ScavengeSession.test.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: Existing `snapshot()` APIs.
- Produces: Stable snapshot identity until an accepted mutation.
- Produces: A new snapshot identity after each accepted mutation.

- [ ] **Step 1: Write failing Scavenge snapshot identity tests**

```ts
it('reuses a snapshot until state changes', () => {
  const session = new ScavengeSession();
  const initial = session.snapshot();

  expect(session.snapshot()).toBe(initial);
  session.start();
  expect(session.snapshot()).not.toBe(initial);
});

it('keeps snapshot identity after a rejected mutation', () => {
  const session = new ScavengeSession();
  const initial = session.snapshot();

  expect(session.pickUp('cannedFood')).toBe(false);
  expect(session.snapshot()).toBe(initial);
});
```

- [ ] **Step 2: Run the Scavenge tests**

Run: `npx.cmd vitest run tests/ScavengeSession.test.ts`

Expected: FAIL because each `snapshot()` call creates a new object.

- [ ] **Step 3: Add the Scavenge cache**

Add:

```ts
private snapshotRevision = 0;
private cachedSnapshotRevision = -1;
private cachedSnapshot: Readonly<ScavengeSnapshot> | null = null;

private changed(): void {
  this.snapshotRevision += 1;
}
```

Call `changed()` only after a real state change in `start`, `tick`, `penalize`,
`pause`, `resume`, `pickUp`, `saveCarriedBundle`, `lose`, and `finish`.
Call it in `releaseCarried` after the carried item changes.

Return `cachedSnapshot` when revisions match. Freeze the new top-level snapshot:

```ts
if (
  this.cachedSnapshot !== null
  && this.cachedSnapshotRevision === this.snapshotRevision
) return this.cachedSnapshot;

this.cachedSnapshot = Object.freeze({
  status: this.status,
  remainingSeconds: this.remainingSeconds,
  savedCount: this.savedCount,
  carriedWeight: this.carriedWeight,
  carriedItems: Object.freeze(carriedItems),
  items: Object.freeze(items),
  carriedItem,
});
this.cachedSnapshotRevision = this.snapshotRevision;
return this.cachedSnapshot;
```

- [ ] **Step 4: Reuse local snapshots in ScavengePhase**

Change `synchronizeElapsed` to accept the current snapshot:

```ts
private synchronizeElapsed(snapshot: ScavengeSnapshot): void {
  const nextElapsed = SCAVENGE_DURATION_SECONDS - snapshot.remainingSeconds;
  if (nextElapsed !== this.elapsed) this.elapsed = nextElapsed;
}
```

After each mutation, call `snapshot()` once. Reuse that value for status checks,
elapsed time, UI rendering, and ending state.

- [ ] **Step 5: Run the Scavenge tests**

Run: `npx.cmd vitest run tests/ScavengeSession.test.ts tests/ScavengePhase.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing Survival snapshot identity tests**

```ts
it('reuses an immutable snapshot until an action changes state', () => {
  const session = createSession();
  const initial = session.snapshot();

  expect(session.snapshot()).toBe(initial);
  expect(Object.isFrozen(initial)).toBe(true);
  expect(Object.isFrozen(initial.inventory)).toBe(true);

  const outcome = session.perform('dive');
  expect(outcome.accepted).toBe(true);
  expect(session.snapshot()).not.toBe(initial);
});

it('keeps snapshot identity after a rejected action', () => {
  const session = createSession({ initial: { energy: 0 } });
  const initial = session.snapshot();

  expect(session.perform('dive').accepted).toBe(false);
  expect(session.snapshot()).toBe(initial);
});
```

Use the existing local session factory and its current argument shape.

- [ ] **Step 7: Run the Survival session tests**

Run: `npx.cmd vitest run tests/SurvivalSession.test.ts`

Expected: FAIL because `snapshot()` creates a new object.

- [ ] **Step 8: Add the Survival cache**

Add:

```ts
private cachedSnapshot: Readonly<SurvivalSnapshot> | null = null;

private changed(): void {
  this.cachedSnapshot = null;
}
```

Call `changed()` in `commit()` after assigning `lastOutcome`.
Call it in `resolveEventChoice()` after assigning `lastOutcome`.
These two accepted-outcome paths cover all public state transitions.

Build and freeze the snapshot only when the cache is empty:

```ts
if (this.cachedSnapshot !== null) return this.cachedSnapshot;

this.cachedSnapshot = Object.freeze({
  // Existing snapshot fields.
  journalEntries: this.journalSnapshot(),
  inventory: this.inventory.snapshot(),
  lastOutcome,
});
return this.cachedSnapshot;
```

- [ ] **Step 9: Write the failing inventory sync gate test**

In the existing SurvivalPhase test harness, update twice with the same snapshot:

```ts
phase.update(0, 1 / 60);
phase.update(1 / 60, 1 / 60);

expect(world.syncInventory).toHaveBeenCalledTimes(1);
expect(world.projectInteractionAnchors).toHaveBeenCalledTimes(2);
```

- [ ] **Step 10: Gate inventory sync by snapshot identity**

Add:

```ts
private presentedInventorySnapshot: SurvivalSnapshot | null = null;
```

In `syncPresentation`:

```ts
if (snapshot !== this.presentedInventorySnapshot) {
  this.presentedInventorySnapshot = snapshot;
  this.world.syncInventory?.(snapshot);
}
this.ui.setAnchors?.(
  this.world.projectInteractionAnchors?.(this.viewportWidth, this.viewportHeight) ?? [],
);
```

Keep anchor projection at full update rate.

- [ ] **Step 11: Run focused session and phase tests**

Run: `npx.cmd vitest run tests/ScavengeSession.test.ts tests/ScavengePhase.test.ts tests/SurvivalSession.test.ts tests/SurvivalPhase.test.ts`

Expected: PASS.

- [ ] **Step 12: Commit**

```powershell
git add src/game/ScavengeSession.ts src/phases/ScavengePhase.ts src/survival/SurvivalSession.ts src/survival/SurvivalPhase.ts tests/ScavengeSession.test.ts tests/SurvivalSession.test.ts tests/SurvivalPhase.test.ts
git commit -m "perf: cache immutable session snapshots"
```

---

### Task 3: Cached Boat Projection and Filtered Anchor Layout

**Files:**
- Modify: `src/rendering/projectScreenBounds.ts`
- Modify: `src/survival/BoatInteraction.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/BoatInteraction.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: Fixed child geometry and transforms under an anchor root.
- Produces: `createObjectScreenBoundsCache(root): ObjectScreenBoundsCache | null`.
- Produces: `projectCachedObjectScreenBounds(root, cache, camera, width, height)`.
- Produces: Boat-specific wrappers with the same null fallback rule.

- [ ] **Step 1: Write failing cached projection tests**

```ts
it('matches live traversal after the root moves', () => {
  const root = createNestedProjectionFixture();
  const cache = createBoatObjectBoundsCache(root);
  expect(cache).not.toBeNull();

  root.position.set(2, 1, -8);
  root.rotation.y = 0.4;
  root.updateMatrixWorld(true);

  expect(projectCachedBoatObjectBounds(root, cache!, camera, 1280, 720))
    .toEqual(projectBoatObjectBounds(root, camera, 1280, 720));
});

it('falls back when a root has no mesh bounds', () => {
  const root = new Group();
  const cache = createBoatObjectBoundsCache(root);
  expect(cache).toBeNull();
  expect(projectCachedBoatObjectBounds(root, cache, camera, 1280, 720))
    .toEqual(projectBoatObjectBounds(root, camera, 1280, 720));
});
```

Use the existing camera and fixture style in `BoatInteraction.test.ts`.

- [ ] **Step 2: Run projection tests**

Run: `npx.cmd vitest run tests/BoatInteraction.test.ts`

Expected: FAIL because cache APIs do not exist.

- [ ] **Step 3: Add fixed projection cache data**

Add:

```ts
export interface ObjectScreenBoundsCacheEntry {
  readonly bounds: Box3;
  readonly rootFromMesh: Matrix4;
}

export interface ObjectScreenBoundsCache {
  readonly entries: readonly ObjectScreenBoundsCacheEntry[];
}
```

`createObjectScreenBoundsCache()` must:

1. Update root matrices once.
2. Traverse visible meshes once.
3. Compute missing geometry bounding boxes.
4. Store each box clone.
5. Store `inverse(root.matrixWorld) * mesh.matrixWorld`.
6. Return `null` when no valid mesh box exists.

- [ ] **Step 4: Add allocation-free cached projection**

`projectCachedObjectScreenBounds()` must:

1. Use `projectObjectScreenBounds()` when cache is null.
2. Update camera and root matrices.
3. For each cached entry, compute `root.matrixWorld * rootFromMesh`.
4. Project all eight box corners with module-level scratch vectors and matrices.
5. Reuse `boundsFromExtents()` for the result.
6. Return hidden bounds for camera crossings and invalid values.

Do not clone a box, matrix, vector, or array in this function.

- [ ] **Step 5: Add BoatInteraction wrappers**

```ts
export type BoatObjectBoundsCache = ObjectScreenBoundsCache;

export function createBoatObjectBoundsCache(
  root: Object3D,
): BoatObjectBoundsCache | null {
  return createObjectScreenBoundsCache(root);
}

export function projectCachedBoatObjectBounds(
  root: Object3D,
  cache: BoatObjectBoundsCache | null,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): ProjectedBoatBounds {
  return projectCachedObjectScreenBounds(root, cache, camera, width, height);
}
```

- [ ] **Step 6: Run projection tests**

Run: `npx.cmd vitest run tests/BoatInteraction.test.ts`

Expected: PASS.

- [ ] **Step 7: Cache fixed BoatWorld anchor roots**

Add a map for supply roots and fields for the fishing rod, repair tools, and lantern.
Create these caches once after their object trees are complete.

Use `projectCachedBoatObjectBounds()` for:

- Supply display records.
- Fishing rod.
- Repair tools.
- Lantern.

Keep `driftingLootPresentation.projectInteraction()` unchanged.

- [ ] **Step 8: Add the BoatWorld behavior test**

Extend the current anchor projection test. Move the boat root between calls.
Assert the fixed anchor screen positions still change. Assert drifting loot still uses
its dynamic projector.

- [ ] **Step 9: Run BoatWorld tests**

Run: `npx.cmd vitest run tests/BoatWorld.test.ts`

Expected: PASS.

- [ ] **Step 10: Write the failing duplicate layout test**

```ts
it('does not rewrite anchor layout for equal rounded values', async () => {
  ui.setAnchors([anchor]);
  const button = mount.querySelector<HTMLButtonElement>('[data-anchor-id]')!;
  const observer = new MutationObserver(() => undefined);
  observer.observe(button, { attributes: true });

  ui.setAnchors([{ ...anchor, x: anchor.x + 0.1, y: anchor.y + 0.1 }]);
  await Promise.resolve();

  expect(observer.takeRecords()).toEqual([]);
  observer.disconnect();
});
```

Use values that round to the same integer in the existing UI fixture.

- [ ] **Step 11: Run the UI test**

Run: `npx.cmd vitest run tests/SurvivalUI.test.ts`

Expected: FAIL because `setAnchors()` rewrites style and data attributes.

- [ ] **Step 12: Filter duplicate anchor layout writes**

Add:

```ts
private readonly anchorLayoutKeys = new Map<string, string>();
```

Build a key from:

- `visible`
- rounded `x` and `y`
- target kind
- rounded hit width and height
- rounded depth-derived z-index
- `depleted`

Only update `hidden`, transform, target kind, size, margins, z-index,
tooltip placement, and depleted class when the key changes.
Keep tooltip content refresh and command state updates unchanged.
Delete each key when its anchor button is removed.
Clear the map during disposal.

- [ ] **Step 13: Run projection and UI tests**

Run: `npx.cmd vitest run tests/BoatInteraction.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts`

Expected: PASS.

- [ ] **Step 14: Commit**

```powershell
git add src/rendering/projectScreenBounds.ts src/survival/BoatInteraction.ts src/survival/BoatWorld.ts src/ui/SurvivalUI.ts tests/BoatInteraction.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts
git commit -m "perf: cache boat anchor projection work"
```

---

### Task 4: Verification and Performance Check

**Files:**
- Modify only if verification finds a defect in the approved scope.

**Interfaces:**
- Consumes: Tasks 1 through 3.
- Produces: Test, build, and profile evidence.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npx.cmd vitest run tests/ItemAmbientOcclusion.test.ts tests/ScavengeSession.test.ts tests/ScavengePhase.test.ts tests/SurvivalSession.test.ts tests/SurvivalPhase.test.ts tests/BoatInteraction.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all tests**

Run: `npm.cmd test -- --run`

Expected: PASS.

- [ ] **Step 3: Build production assets**

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 4: Check the worktree**

Run: `git status --short`

Expected: Only planned files are changed, or the worktree is clean after commits.

- [ ] **Step 5: Repeat the desktop profile**

Use the existing performance harness and the same 1080p scene.
Record median FPS for low GTAO and GTAO off.
Confirm that low GTAO improves without changing high settings.

- [ ] **Step 6: Review the diff**

Run: `git diff HEAD~3 --check`

Expected: No whitespace errors.

Check:

- No gameplay changes.
- No anchor throttling.
- No dynamic drifting-loot cache.
- No per-frame projection allocations.
- Each accepted session mutation invalidates its cache.

