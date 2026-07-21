# Instant Bundle Boat Deposit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scavenging lifeboat throws with one-click deposits that save the full carried bundle from either the lifeboat or adjacent station deck and show a short smoke confirmation.

**Architecture:** Keep item status transitions in `ScavengeSession`, camera-attached object ownership in `CarryController`, and Three.js target, storage, and smoke ownership in `World`. `ScavengePhase` coordinates a session-first transaction: save the full bundle, release the carried visuals, store every item, and trigger one confirmation effect. Ordinary drops keep their existing short flight path.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7, Bun

## Global Constraints

- Keep gameplay rules deterministic and testable without a renderer. Isolate randomness behind an injectable source.
- Give each Three.js geometry, material, listener, and phase a clear owner that disposes it exactly once.
- Avoid allocations and repeated setup in per-frame update and render paths.
- Honor `prefers-reduced-motion` for the smoke confirmation.
- Keep the three-unit carry capacity, pickup order, ordinary drops, evacuation rules, boat storage transforms, survival handoff, and two-minute timer.
- The deck target uses the authored `lifeboatStation` bounds: local `x = 3.8..6`, `z = -1.6..1.6`.
- One accepted deposit saves the full carried bundle and starts one smoke confirmation.
- Preserve the user's unrelated `.gitignore` change.

---

## File Structure

- Create `src/world/BoatDepositSmoke.ts`: deterministic pooled confirmation particles, reduced-motion update, snapshot, and disposal.
- Create `tests/BoatDepositSmoke.test.ts`: effect trigger, motion, restart, reduced motion, and exact-once cleanup.
- Modify `src/game/ScavengeSession.ts`: add an atomic full-bundle save operation.
- Modify `tests/ScavengeSession.test.ts`: cover accepted and rejected full-bundle saves.
- Modify `src/interaction/CarryController.ts`: release all carried visuals without starting a flight; keep flight private to ordinary drops.
- Modify `src/interaction/InteractionSystem.ts`: replace the throw action with a deposit action and recognize the station mesh.
- Modify `tests/interaction.test.ts`: cover bundle release, deposit prompts, both targets, item precedence, and unchanged drops.
- Modify `src/world/World.ts`: own the raycast-only station target and smoke effect, store bundles, update the effect, and dispose both resources.
- Modify `tests/world.test.ts`: cover station target bounds, bundle storage, smoke integration, and cleanup.
- Modify `src/phases/ScavengePhase.ts`: coordinate the session-first bundle deposit and remove the lifeboat throw call.
- Create `src/phases/scavengeDeposit.ts`: pure session-first deposit coordinator.
- Create `tests/scavengeDeposit.test.ts`: accepted and rejected transaction coverage.

---

### Task 1: Atomic Session Save and Carry Release

**Files:**
- Modify: `tests/ScavengeSession.test.ts`
- Modify: `src/game/ScavengeSession.ts`
- Modify: `tests/interaction.test.ts`
- Modify: `src/interaction/CarryController.ts`

**Interfaces:**
- Produces: `ScavengeSession.saveCarriedBundle(): readonly Readonly<ItemInstance>[] | null`
- Produces: `CarryController.releaseAll(): readonly ItemInstance[]`
- Preserves: `CarryController.drop(): ItemInstanceId | null`

- [ ] **Step 1: Write the failing session tests**

Add tests that save three carried instances in pickup order and reject the same operation without mutation while paused:

```ts
it('saves the full carried bundle atomically in pickup order', () => {
  const session = new ScavengeSession();
  session.start();
  session.pickUp('cannedFood-1');
  session.pickUp('ductTape-1');
  session.pickUp('flashlight-1');

  expect(session.saveCarriedBundle()).toEqual([
    { instanceId: 'cannedFood-1', type: 'cannedFood' },
    { instanceId: 'ductTape-1', type: 'ductTape' },
    { instanceId: 'flashlight-1', type: 'flashlight' },
  ]);
  expect(session.snapshot()).toMatchObject({
    carriedItems: [],
    carriedWeight: 0,
    savedCount: 3,
  });
});

it('rejects a bundle save without mutation outside running state', () => {
  const session = new ScavengeSession();
  session.start();
  session.pickUp('flareGun-1');
  session.pause();
  const before = session.snapshot();

  expect(session.saveCarriedBundle()).toBeNull();
  expect(session.snapshot()).toEqual(before);
});
```

- [ ] **Step 2: Run the session tests and verify RED**

Run: `bun run test -- tests/ScavengeSession.test.ts`

Expected: FAIL because `saveCarriedBundle` does not exist.

- [ ] **Step 3: Implement the atomic session transition**

Add this public method beside `saveCarried`:

```ts
saveCarriedBundle(): readonly Readonly<ItemInstance>[] | null {
  if (this.status !== 'running' || this.carriedIds.length === 0) return null;
  const instanceIds = this.carriedIds.splice(0);
  instanceIds.forEach((instanceId) => {
    this.items[instanceId]!.status = 'saved';
  });
  this.savedCount += instanceIds.length;
  return Object.freeze(instanceIds.map((instanceId) => this.cloneInstance(instanceId)));
}
```

Add `saveCarriedBundle` to the blocked mutation table so paused, success, and failure states keep the same no-mutation contract.

- [ ] **Step 4: Run the session tests and verify GREEN**

Run: `bun run test -- tests/ScavengeSession.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing carry release test**

Add a test under `CarryController`:

```ts
it('releases the full carried bundle without starting a flight', () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.add(camera);
  const objects = [new Group(), new Group(), new Group()];
  objects.forEach((object) => scene.add(object));
  const carry = new CarryController(scene, camera);
  const instances = [
    item('cannedFood-1', 'cannedFood'),
    item('ductTape-1', 'ductTape'),
    item('flashlight-1', 'flashlight'),
  ];
  instances.forEach((instance, index) => carry.pickUp(instance, objects[index]!));

  expect(carry.releaseAll()).toEqual(instances);
  expect(carry.activeInstance).toBeNull();
  expect(carry.busy).toBe(false);
  expect(carry.flightActive).toBe(false);
  expect(objects.every(({ parent }) => parent === camera)).toBe(true);
});
```

- [ ] **Step 6: Run the interaction tests and verify RED**

Run: `bun run test -- tests/interaction.test.ts`

Expected: FAIL because `releaseAll` does not exist.

- [ ] **Step 7: Implement carry release and restrict launch to drops**

Add:

```ts
releaseAll(): readonly ItemInstance[] {
  if (this.flight !== null || this.carried.length === 0) return [];
  const released = this.carried.splice(0).map(({ instance }) => instance);
  return Object.freeze(released);
}
```

Rename public `throw(speed = 7.5)` to private `launch(speed: number)`. Keep `drop()` public and call `this.launch(1.2)`. Remove tests that assert the old normal-speed lifeboat throw. Update reset coverage to create a flight through `drop()`.

- [ ] **Step 8: Run focused tests and commit**

Run: `bun run test -- tests/ScavengeSession.test.ts tests/interaction.test.ts`

Expected: PASS.

```bash
git add src/game/ScavengeSession.ts src/interaction/CarryController.ts tests/ScavengeSession.test.ts tests/interaction.test.ts
git commit -m "feat: save scavenging carry bundles atomically"
```

---

### Task 2: Lifeboat and Station Deposit Targets

**Files:**
- Modify: `tests/interaction.test.ts`
- Modify: `src/interaction/InteractionSystem.ts`
- Modify: `tests/world.test.ts`
- Modify: `src/world/World.ts`

**Interfaces:**
- Produces: `RayTarget = 'none' | 'item' | 'deposit'`
- Produces: `ContextAction` variant `{ type: 'depositBundle'; prompt: string }`
- Produces: `World.boatDepositTarget: Mesh`
- Changes: `InteractionSystem.update(items, lifeboat, depositTarget, instances)`

- [ ] **Step 1: Write failing context and raycast tests**

Replace throw expectations with:

```ts
it('offers a bundle deposit while carrying at a deposit target', () => {
  expect(chooseContextAction({
    target: 'deposit',
    targetItem: null,
    carriedItem: item('ductTape-1', 'ductTape'),
    remainingCapacity: 2,
    nearEvacuation: false,
  })).toEqual({
    type: 'depositBundle',
    prompt: 'LEFT CLICK — STORE CARRIED SUPPLIES',
  });
});
```

Add raycast tests where the camera resolves the lifeboat and a separate mesh tagged with `userData.boatDepositTarget = true` to `{ target: 'deposit', targetItem: null }`. Add an overlapping item test that expects the item hit before the deck mesh.

- [ ] **Step 2: Run interaction tests and verify RED**

Run: `bun run test -- tests/interaction.test.ts`

Expected: FAIL because the deposit target and action do not exist.

- [ ] **Step 3: Implement deposit action and target recognition**

Update the target and action unions:

```ts
export type RayTarget = 'none' | 'item' | 'deposit';

export type ContextAction =
  | { type: 'none'; prompt: '' }
  | { type: 'pickUp'; item: ItemInstance; prompt: string }
  | { type: 'drop'; item: ItemInstance; prompt: string }
  | { type: 'depositBundle'; prompt: string }
  | { type: 'capacityFull'; prompt: string }
  | { type: 'evacuate'; prompt: string };
```

Treat `lifeboat` and ancestors with `userData.boatDepositTarget === true` as `deposit`. Pass the deck target into `update`, include it in the raycast list after items and the lifeboat, and keep the current nearest-hit ordering.

- [ ] **Step 4: Run interaction tests and verify GREEN**

Run: `bun run test -- tests/interaction.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing world target test**

Add a world test that expects a raycast-only target under the ship:

```ts
const target = world.boatDepositTarget;
expect(target.name).toBe('lifeboat-deposit-target');
expect(target.parent).toBe(world.ship);
expect(target.userData.boatDepositTarget).toBe(true);
expect(target.position.x).toBeCloseTo(4.9);
expect(target.position.z).toBeCloseTo(0);
expect(new Box3().setFromObject(target).getSize(new Vector3()).toArray()).toEqual([
  2.2,
  0.08,
  3.2,
]);
```

Also observe target geometry and material disposal and assert that repeated `world.dispose()` emits one disposal event for each.

- [ ] **Step 6: Run the world test and verify RED**

Run: `bun run test -- tests/world.test.ts`

Expected: FAIL because `boatDepositTarget` does not exist.

- [ ] **Step 7: Create and own the station target in World**

Read the station bounds from `SHIP_LAYOUT.zones`. Create one shallow `BoxGeometry` mesh with:

```ts
new MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  transparent: true,
  opacity: 0,
});
```

Set its name, tag, position, and size from the layout bounds; attach it to `this.ship`. Expose it as `readonly boatDepositTarget: Mesh`. Add its geometry and material to World-owned resource sets so constructor rollback and `dispose()` clean them once.

- [ ] **Step 8: Run focused tests and commit**

Run: `bun run test -- tests/interaction.test.ts tests/world.test.ts`

Expected: PASS.

```bash
git add src/interaction/InteractionSystem.ts src/world/World.ts tests/interaction.test.ts tests/world.test.ts
git commit -m "feat: target scavenging boat deposit surfaces"
```

---

### Task 3: Deterministic Boat Deposit Smoke

**Files:**
- Create: `tests/BoatDepositSmoke.test.ts`
- Create: `src/world/BoatDepositSmoke.ts`
- Modify: `tests/world.test.ts`
- Modify: `src/world/World.ts`

**Interfaces:**
- Produces: `BoatDepositSmoke.trigger(): void`
- Produces: `BoatDepositSmoke.update(delta: number, reducedMotion: boolean): void`
- Produces: `BoatDepositSmoke.snapshotForTest(): BoatDepositSmokeSnapshot`
- Produces: `BoatDepositSmoke.dispose(): void`
- Produces: `World.saveItems(instances: readonly ItemInstance[]): void`

- [ ] **Step 1: Write failing smoke behavior tests**

Create `tests/BoatDepositSmoke.test.ts` with tests for inactive construction, one trigger, upward motion, expiry within one second, trigger restart, stationary reduced-motion particles, reused buffer attributes, and exact-once disposal. Use snapshots such as:

```ts
expect(smoke.snapshotForTest()).toMatchObject({ active: false, age: 0 });
smoke.trigger();
expect(smoke.snapshotForTest()).toMatchObject({ active: true, age: 0 });
smoke.update(0.25, false);
expect(smoke.snapshotForTest().maximumRise).toBeGreaterThan(0);
for (let step = 0; step < 10; step += 1) smoke.update(0.1, false);
expect(smoke.snapshotForTest()).toMatchObject({ active: false, opacity: 0 });
```

- [ ] **Step 2: Run smoke tests and verify RED**

Run: `bun run test -- tests/BoatDepositSmoke.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the smoke pool**

Create a fixed particle count, fixed local offsets, velocity arrays, one `BufferGeometry`, and one transparent `PointsMaterial`. The class must:

- allocate typed arrays only in the constructor;
- reset the same arrays in `trigger()`;
- clamp delta to `0..0.1` and accumulate age;
- apply rise and spread from fixed velocities during standard motion;
- keep positions at fixed offsets during reduced motion;
- update material opacity and point size from normalized age;
- hide points at one second;
- mark the existing position attribute dirty without replacing it;
- dispose geometry and material once.

- [ ] **Step 4: Run smoke tests and verify GREEN**

Run: `bun run test -- tests/BoatDepositSmoke.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing World smoke and bundle-storage tests**

Add tests that call `world.saveItems([first, second, third])`, assert all three parents equal `lifeboat-storage`, and assert `lifeboat-deposit-smoke` becomes visible once. Update World with normal and reduced motion and compare the smoke snapshot or position attribute changes. Observe smoke geometry and material disposal across two `world.dispose()` calls.

- [ ] **Step 6: Run world tests and verify RED**

Run: `bun run test -- tests/world.test.ts`

Expected: FAIL because `saveItems` and smoke integration do not exist.

- [ ] **Step 7: Integrate smoke and bundle storage in World**

Construct `BoatDepositSmoke`, name its points `lifeboat-deposit-smoke`, position it above the storage area, and attach it under the lifeboat storage root. Call `update(delta, reducedMotion)` from `World.update`.

Add:

```ts
saveItems(instances: readonly ItemInstance[]): void {
  let stored = 0;
  instances.forEach((instance) => {
    if (this.storeItem(instance)) stored += 1;
  });
  if (stored > 0) this.boatDepositSmoke.trigger();
}
```

Move the current `saveItem` body into private `storeItem(instance): boolean`. Keep `saveItem` as a compatibility wrapper without smoke for existing focused storage tests. Add smoke disposal to World cleanup and constructor rollback.

- [ ] **Step 8: Run focused tests and commit**

Run: `bun run test -- tests/BoatDepositSmoke.test.ts tests/world.test.ts`

Expected: PASS.

```bash
git add src/world/BoatDepositSmoke.ts src/world/World.ts tests/BoatDepositSmoke.test.ts tests/world.test.ts
git commit -m "feat: confirm boat deposits with smoke"
```

---

### Task 4: Scavenging Phase Transaction and Regression Verification

**Files:**
- Create: `tests/scavengeDeposit.test.ts`
- Create: `src/phases/scavengeDeposit.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `tests/GameLifecycle.test.ts` only if the changed World surface requires fake-world updates
- Modify: `tests/interaction.test.ts` to remove obsolete throw coverage

**Interfaces:**
- Consumes: `ScavengeSession.saveCarriedBundle()`
- Consumes: `CarryController.releaseAll()`
- Consumes: `World.saveItems()` and `World.boatDepositTarget`
- Produces: `commitBoatDeposit(session, carry, world): boolean`

- [ ] **Step 1: Write the failing deposit coordinator tests**

Create `tests/scavengeDeposit.test.ts`. Use a real `ScavengeSession`, `CarryController`, scene, camera, and carried objects. Pass a small object with a `saveItems` spy as `Pick<World, 'saveItems'>`. Cover an accepted running-state deposit and a rejected paused-state deposit:

```ts
it('commits the full session bundle before releasing and storing its visuals', () => {
  const session = new ScavengeSession();
  session.start();
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.add(camera);
  const carry = new CarryController(scene, camera);
  const instances = [
    { instanceId: 'cannedFood-1', type: 'cannedFood' },
    { instanceId: 'ductTape-1', type: 'ductTape' },
  ] as const;
  instances.forEach((instance) => {
    const object = new Group();
    scene.add(object);
    session.pickUp(instance.instanceId);
    carry.pickUp(instance, object);
  });
  const saveItems = vi.fn();

  expect(commitBoatDeposit(session, carry, { saveItems })).toBe(true);
  expect(saveItems).toHaveBeenCalledWith(instances);
  expect(carry.busy).toBe(false);
  expect(session.snapshot()).toMatchObject({ carriedWeight: 0, savedCount: 2 });
});

it('keeps carried state and visuals when the session rejects the deposit', () => {
  const session = new ScavengeSession();
  session.start();
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.add(camera);
  const carry = new CarryController(scene, camera);
  const instance = { instanceId: 'flareGun-1', type: 'flareGun' } as const;
  const object = new Group();
  scene.add(object);
  session.pickUp(instance.instanceId);
  carry.pickUp(instance, object);
  session.pause();
  const before = session.snapshot();
  const saveItems = vi.fn();

  expect(commitBoatDeposit(session, carry, { saveItems })).toBe(false);
  expect(saveItems).not.toHaveBeenCalled();
  expect(session.snapshot()).toEqual(before);
  expect(carry.activeInstance).toEqual(instance);
  expect(carry.flightActive).toBe(false);
  expect(object.parent).toBe(camera);
});
```

- [ ] **Step 2: Run the phase regression and verify RED**

Run: `bun run test -- tests/scavengeDeposit.test.ts`

Expected: FAIL because `commitBoatDeposit` does not exist.

- [ ] **Step 3: Implement and wire the deposit transaction**

Create `src/phases/scavengeDeposit.ts`:

```ts
import type { ScavengeSession } from '../game/ScavengeSession';
import type { CarryController } from '../interaction/CarryController';
import type { World } from '../world/World';

export function commitBoatDeposit(
  session: ScavengeSession,
  carry: CarryController,
  world: Pick<World, 'saveItems'>,
): boolean {
  const saved = session.saveCarriedBundle();
  if (saved === null) return false;
  carry.releaseAll();
  world.saveItems(saved);
  return true;
}
```

Pass `this.world.boatDepositTarget` into `InteractionSystem.update`. Replace the `throwToBoat` branch with:

```ts
} else if (action.type === 'depositBundle') {
  commitBoatDeposit(this.session, this.carry, this.world);
}
```

Keep the flight update for ordinary drops and their landed, lost, or incidental lifeboat-hit outcomes.

- [ ] **Step 4: Run focused scavenging tests and verify GREEN**

Run: `bun run test -- tests/ScavengeSession.test.ts tests/interaction.test.ts tests/BoatDepositSmoke.test.ts tests/world.test.ts tests/scavengeDeposit.test.ts tests/GameLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 5: Run repository verification**

Run:

```bash
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected: all commands exit 0 with no TypeScript errors, failing tests, model-policy failures, or Vite build errors.

- [ ] **Step 6: Inspect the feature in the browser**

Run the Vite development server and inspect both game phases. In scavenging:

1. Pick up three weight-one items.
2. Aim at several points on the lifeboat-station deck and confirm the storage prompt appears.
3. Click once and confirm all three items appear in their boat slots with one smoke puff.
4. Repeat by aiming at the lifeboat.
5. Drop an item away from both targets and confirm the short drop flight remains.
6. Enable reduced motion and confirm the puff fades without rising.
7. Evacuate and confirm survival receives the full saved bundle.

- [ ] **Step 7: Commit phase integration**

```bash
git add src/phases/ScavengePhase.ts src/phases/scavengeDeposit.ts tests/scavengeDeposit.test.ts tests/GameLifecycle.test.ts tests/interaction.test.ts
git commit -m "feat: deposit scavenging bundles in one click"
```

- [ ] **Step 8: Review the final diff**

Run:

```bash
git diff --check HEAD~4..HEAD
git status --short
git log -5 --oneline
```

Expected: no whitespace errors; only the user's pre-existing `.gitignore` change remains unstaged; implementation commits describe the session, targets, smoke, and phase wiring.
