# Boat World Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `BoatWorld` a scene composition root by extracting its independent camera, fishing, moon, dive, delegation, and projection state.

**Architecture:** Each extracted controller owns one visual workflow and its scratch objects. `BoatWorld` keeps scene construction, top-level resource ownership, public facade methods, and one frame update entry.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Three.js 0.180

**Spec:** `docs/superpowers/specs/2026-08-21-code-refactor-design.md`

## Global Constraints

- Complete the domain and event presentation plans first.
- Preserve camera poses, timing, lighting, waves, models, and event choreography.
- Read `VISUAL_STYLE_GUIDE.md` before changing any player-facing value.
- Do not change player-facing values during this plan.
- Reuse scratch vectors, quaternions, matrices, rays, planes, and samples.
- Give each Three.js resource one owner and idempotent cleanup.
- Keep `BoatWorld` public behavior covered by integration tests.

---

### Task 1: Extract Boat Camera Control

**Files:**
- Create: `src/survival/BoatCameraController.ts`
- Create: `tests/BoatCameraController.test.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: the survival camera, camera rig, and authored camera poses.
- Produces: rear-view turns, base pose restore, fixed event poses, and drifting-item camera transitions.

- [ ] **Step 1: Move camera characterizations into a focused test**

Cover instant and animated rear turns, event camera restore, drifting-item enter and return, and visibility settling.

```ts
controller.setRearView(true, true);
controller.update(0);
expect(camera.quaternion.angleTo(rearQuaternion)).toBeLessThan(0.0001);
controller.restoreBasePose();
expect(camera.position.toArray()).toEqual(basePosition.toArray());
```

- [ ] **Step 2: Run the focused test and confirm the missing class**

Run: `npm test -- tests/BoatCameraController.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement the controller contract**

```ts
export class BoatCameraController {
  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly cameraRig: Group,
    baseLookTarget: Readonly<Vector3>,
  );

  setRearView(rear: boolean, instant?: boolean): void;
  beginDriftingItemView(target: Object3D): Promise<void>;
  endDriftingItemView(): Promise<void>;
  restoreBasePose(): void;
  settleForVisibilityChange(): void;
  update(delta: number): void;
  dispose(): void;
}
```

Move current rear-camera and drifting-camera fields and methods without changing constants. Allocate all scratch values as fields.

- [ ] **Step 4: Delegate existing facade methods**

`BoatWorld.setRearCameraView`, `enterDriftingItemView`, `exitDriftingItemView`, camera restore, visibility settling, update, and disposal call the controller.

- [ ] **Step 5: Run camera and world tests**

Run: `npm test -- tests/BoatCameraController.test.ts tests/BoatWorld.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the camera extraction**

```bash
git add src/survival/BoatCameraController.ts src/survival/BoatWorld.ts tests/BoatCameraController.test.ts tests/BoatWorld.test.ts
git commit -m "refactor: extract boat camera control"
```

---

### Task 2: Extract Fishing Presentation

**Files:**
- Create: `src/survival/FishingPresentation.ts`
- Create: `tests/FishingPresentation.test.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: rod objects, catch library, bite particles, camera control, wave sampling, boat roots, and current time.
- Produces: fishing view lifecycle, cast projection, bite target, catch result, and frame updates.

- [ ] **Step 1: Move fishing visual tests into a focused suite**

Cover view entry, bounded casts, centered cast, waiting, bite projection, reel, catch projection, miss, return, visibility cleanup, and disposal.

```ts
await presentation.enterView();
const point = presentation.castPointFromScreen(width / 2, height / 2, width, height);
expect(point).toEqual(presentation.centeredCast());
await presentation.playCast(point);
expect(presentation.phaseForTest()).toBe('waiting');
```

- [ ] **Step 2: Run the focused test and confirm the missing class**

Run: `npm test -- tests/FishingPresentation.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement the presentation API**

```ts
export class FishingPresentation {
  enterView(): Promise<void>;
  castPointFromScreen(x: number, y: number, width: number, height: number): FishingCastPoint;
  centeredCast(): FishingCastPoint;
  playCast(point: FishingCastPoint): Promise<void>;
  showWaiting(point: FishingCastPoint): void;
  showBite(point: FishingCastPoint): void;
  projectBite(width: number, height: number): ProjectedBoatBounds;
  playReel(catchId: FishingCatchId): Promise<void>;
  projectCatch(width: number, height: number): ProjectedBoatBounds | null;
  playMiss(): Promise<void>;
  exitView(): Promise<void>;
  clear(): void;
  settleForVisibilityChange(): void;
  update(time: number, delta: number): void;
  dispose(): void;
}
```

Move fishing constants, phase state, animation state, raycasting, line updates, particles, catch placement, and scratch values.

- [ ] **Step 4: Delegate `BoatWorld` fishing methods**

Keep existing method names used by `SurvivalPhase`. Each method forwards to the owned `FishingPresentation`.

- [ ] **Step 5: Verify no fishing state remains in `BoatWorld`**

Run: `rg -n "fishingPhase|activeFishingAnimation|fishingRaycaster|fishingLineOriginWorld|fishingBiteParticle" src/survival/BoatWorld.ts`

Expected: no matches.

- [ ] **Step 6: Run fishing and world tests**

Run: `npm test -- tests/FishingPresentation.test.ts tests/FishingSession.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit the fishing extraction**

```bash
git add src/survival/FishingPresentation.ts src/survival/BoatWorld.ts tests/FishingPresentation.test.ts tests/BoatWorld.test.ts
git commit -m "refactor: extract fishing presentation"
```

---

### Task 3: Extract Moon Event Presentation

**Files:**
- Create: `src/survival/MoonEventPresentation.ts`
- Create: `tests/MoonEventPresentation.test.ts`
- Modify: `src/survival/eventPresentationAdapters.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Implements the normalized moon route lifecycle.
- Consumes: skybox, camera, base camera pose, physical response hooks, and the moon aim target.

- [ ] **Step 1: Move moon visual characterizations**

Cover reveal, hold, grin, pressure result, energy result, aim target, pause update, visibility settling, clear, replacement, and disposal.

```ts
presentation.stage(context);
const reveal = presentation.reveal();
presentation.update(0, revealDuration);
await reveal;
expect(sky.moonFace.reveal).toBe(1);
presentation.clear();
expect(sky.moonFace.reveal).toBe(0);
```

- [ ] **Step 2: Run the focused test and confirm the missing class**

Run: `npm test -- tests/MoonEventPresentation.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement the focused presenter**

```ts
export class MoonEventPresentation {
  readonly itemAimTarget: Object3D;
  stage(context: EventPresentationContext): void;
  reveal(): Promise<void>;
  react(result: EventOutcomePresentation, outcome: ActionOutcome): Promise<void>;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}
```

Move all moon constants, animation state, scratch pose, and camera lowering from `BoatWorld`.

- [ ] **Step 4: Use the class from the moon route adapter**

The adapter delegates to `MoonEventPresentation`. Remove moon callbacks from adapter dependencies.

- [ ] **Step 5: Verify no moon animation state remains in `BoatWorld`**

Run: `rg -n "activeMoonAnimation|moonFaceDisplay|moonPulseElapsed|moonEventStaged|reactMoonEvent|clearMoonEvent" src/survival/BoatWorld.ts`

Expected: no matches.

- [ ] **Step 6: Run moon, registry, and world tests**

Run: `npm test -- tests/MoonEventPresentation.test.ts tests/EventPresentationRegistry.test.ts tests/BoatWorld.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit the moon extraction**

```bash
git add src/survival/MoonEventPresentation.ts src/survival/eventPresentationAdapters.ts src/survival/BoatWorld.ts tests/MoonEventPresentation.test.ts tests/BoatWorld.test.ts
git commit -m "refactor: extract moon event presentation"
```

---

### Task 4: Extract Interaction Projection

**Files:**
- Create: `src/survival/BoatInteractionProjector.ts`
- Create: `tests/BoatInteractionProjector.test.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatInteraction.test.ts`
- Modify: `tests/EventItemAimTargets.test.ts`

**Interfaces:**
- Consumes: camera, scene, boat object roots, supply display roots, and event presentation host.
- Produces: boat anchors, event bounds, event result bounds, fishing bounds, and aim targets.

- [ ] **Step 1: Add projection tests with fixed roots**

```ts
const projector = new BoatInteractionProjector(scene, camera, roots, eventHost);
const anchors = projector.projectAnchors(1280, 720);
expect(anchors.map(({ id }) => id)).toContain('end-day-lantern');
expect(projector.projectAnchors(0, 720)).toEqual([]);
```

Test hidden objects, offscreen objects, minimum hit bounds, event interaction roots, and result roots.

- [ ] **Step 2: Run the test and confirm the missing class**

Run: `npm test -- tests/BoatInteractionProjector.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement projection without frame allocations**

```ts
export class BoatInteractionProjector {
  projectAnchors(width: number, height: number): readonly BoatInteractionAnchor[];
  projectEventInteraction(eventId: string, width: number, height: number): ProjectedBoatBounds | null;
  projectEventResult(eventId: string, width: number, height: number): ProjectedBoatBounds | null;
  eventItemAimTarget(eventId: string): Object3D | null;
  dispose(): void;
}
```

Keep bounds caches and scratch projection objects as fields. Reuse the output anchor array when its membership does not change.

- [ ] **Step 4: Delegate projection from `BoatWorld`**

Keep public methods used by `SurvivalPhase`. Replace their bodies with projector calls.

- [ ] **Step 5: Run projection and integration tests**

Run: `npm test -- tests/BoatInteractionProjector.test.ts tests/BoatInteraction.test.ts tests/EventItemAimTargets.test.ts tests/BoatWorld.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the projector**

```bash
git add src/survival/BoatInteractionProjector.ts src/survival/BoatWorld.ts tests/BoatInteractionProjector.test.ts tests/BoatInteraction.test.ts tests/EventItemAimTargets.test.ts
git commit -m "refactor: extract boat interaction projection"
```

---

### Task 5: Extract Dive and Carlitos Delegation Controllers

**Files:**
- Create: `src/survival/DivePresentationController.ts`
- Create: `src/survival/CarlitosDelegationPresentation.ts`
- Create: `tests/DivePresentationController.test.ts`
- Create: `tests/CarlitosDelegationPresentation.test.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/DivePresentation.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Dive controller owns the active item, elapsed time, wave sample, camera pose, and `DivePresentation`.
- Delegation presentation owns Carlitos base pose, side override, active animation, and completion promise.

- [ ] **Step 1: Add focused lifecycle tests**

```ts
await dive.play(instanceId, onImpact);
dive.update(time, delta);
dive.clear();
expect(supplies.setPresentationItemHidden).toHaveBeenLastCalledWith(instanceId, false);

carlitos.setEventSide(eventSide);
const delegated = carlitos.delegate(retrieve);
carlitos.update(0.75);
await delegated;
expect(retrieve).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run focused tests and confirm missing classes**

Run: `npm test -- tests/DivePresentationController.test.ts tests/CarlitosDelegationPresentation.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Implement dive ownership**

```ts
export class DivePresentationController {
  play(instanceId: ItemInstanceId, onWaterImpact: () => void): Promise<void>;
  clear(): void;
  settleForVisibilityChange(): void;
  update(time: number, delta: number): void;
  dispose(): void;
}
```

- [ ] **Step 4: Implement delegation ownership**

```ts
export class CarlitosDelegationPresentation {
  setAmbientSide(side: EventSide): void;
  setEventSide(side: EventSide | null): void;
  delegate(retrieve: () => Promise<void>): Promise<void>;
  update(delta: number): void;
  finish(): void;
  dispose(): void;
}
```

Move current offsets and durations unchanged.

- [ ] **Step 5: Delegate from `BoatWorld` and run tests**

Run: `npm test -- tests/DivePresentationController.test.ts tests/CarlitosDelegationPresentation.test.ts tests/DivePresentation.test.ts tests/CarlitosPresentation.test.ts tests/BoatWorld.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit both focused controllers**

```bash
git add src/survival/DivePresentationController.ts src/survival/CarlitosDelegationPresentation.ts src/survival/BoatWorld.ts tests/DivePresentationController.test.ts tests/CarlitosDelegationPresentation.test.ts tests/BoatWorld.test.ts
git commit -m "refactor: extract boat dive and delegation visuals"
```

---

### Task 6: Reduce `BoatWorld` to Composition and Frame Coordination

**Files:**
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `README.md`

**Interfaces:**
- `BoatWorld` keeps scene construction, facade calls, atmosphere, buoyancy, frame order, and top-level disposal.

- [ ] **Step 1: Add frame-order and cleanup assertions**

```ts
world.update(4, 1 / 60);
expect(order).toEqual([
  'camera', 'buoyancy', 'fishing', 'event', 'dive', 'carlitos', 'atmosphere',
]);
world.dispose();
world.dispose();
expect(resourceDisposals).toHaveLength(uniqueResourceCount);
```

- [ ] **Step 2: Remove extracted fields and private methods**

Use these checks:

Run: `rg -n "activeFishingAnimation|activeMoonAnimation|activeCarlitosDelegation|activeDriftingItemCameraAnimation|fishingRaycaster" src/survival/BoatWorld.ts`

Expected: no matches.

- [ ] **Step 3: Keep one explicit update order**

Call each owned controller once from `updateScene`. Do not create arrays or closures inside the frame method.

- [ ] **Step 4: Update architecture documentation**

List the extracted controllers and state that `BoatWorld` owns scene composition and frame coordination.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 6: Commit the composition root cleanup**

```bash
git add src/survival/BoatWorld.ts tests/BoatWorld.test.ts README.md
git commit -m "refactor: reduce boat world to scene coordination"
```
