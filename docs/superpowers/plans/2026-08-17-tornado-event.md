# Tornado Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Whirlpool event with a fixed, spinning, dangerous Tornado event while keeping its gameplay unchanged.

**Architecture:** Rename the event and asset without compatibility aliases. A pure tornado choreography produces reusable animation samples. `TornadoPresentation` owns one loaded model and fixed low-poly wind effects, then applies samples without per-frame allocation.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.

## Global Constraints

- Keep Anchor, Swim Ring, and Sleep choices, probabilities, effects, timing, pressure, and weights unchanged.
- Keep the tornado at X `12.8`, Z `-19` during all phases.
- Remove the ocean vortex, water depression, submerged funnel, and spiral water streams.
- Reuse the existing licensed Tornado model and rename its ID to `tornadoCore`.
- Add no `whirlpool` event or model compatibility alias.
- Add no new package or audio asset.
- Add no reduced-motion behavior.
- Allocate no resources in per-frame update or render paths.
- Preserve unrelated workspace changes in every modified file.

---

### Task 1: Rename the Event Identity

**Files:**
- Modify: `src/survival/events.ts`
- Modify: `src/survival/eventPresentationRoutes.ts`
- Modify: `src/survival/eventBundleManifest.ts`
- Modify: `src/audio/SurvivalAudio.ts`
- Modify: `src/survival/eventItemUseChoreography.ts`
- Modify: `src/survival/ItemAnimationLab.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/eventPresentationOutcome.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Produces: `SurvivalEventId` value `tornado` and dedicated presentation route `tornado`.
- Preserves: all current Whirlpool choice and outcome data under the new ID.

- [ ] **Step 1: Change identity tests to require Tornado**

Replace test inputs and expected IDs from `whirlpool` to `tornado`.
Change the metadata expectation to title `Tornado` and description `A dark wind funnel spins above the sea.`.
Keep current choice, probability, effect, timing, pressure, and weight assertions.

- [ ] **Step 2: Run the identity tests and verify failure**

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts tests/eventPresentationOutcome.test.ts tests/SurvivalPhase.test.ts tests/SurvivalSession.test.ts
```

Expected: failures report that `tornado` is unknown or missing.

- [ ] **Step 3: Rename the event in runtime data**

Use this event header and keep the existing choice bodies unchanged:

```ts
event('tornado', 'night', 'Tornado', 'dangerous', 'impact', 1, 12, 30, [
```

Set the event description:

```ts
tornado: 'A dark wind funnel spins above the sea.',
```

Replace the route, bundle, audio, item choreography, and animation-lab keys with `tornado`.
Do not retain `whirlpool` branches.

- [ ] **Step 4: Run the identity tests**

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts tests/eventPresentationOutcome.test.ts tests/SurvivalPhase.test.ts tests/SurvivalSession.test.ts
```

Expected: all identity tests pass.

- [ ] **Step 5: Commit the identity rename**

Stage only the files listed in Task 1. Commit with:

```powershell
git commit -m "refactor: rename whirlpool event to tornado"
```

---

### Task 2: Rename and Reorient the Tornado Model

**Files:**
- Rename: `src/assets/models/events/whirlpoolCore.glb` to `src/assets/models/events/tornadoCore.glb`
- Modify: `src/survival/eventModelManifest.ts`
- Modify: `src/survival/eventBundleManifest.ts`
- Modify: `src/assets/models/events/event-model-metadata.json`
- Modify: `scripts/event-model-lock.json`
- Modify: `scripts/fetch-event-models.ps1`
- Modify: `scripts/poly-pizza-event-models.mjs`
- Modify: `src/assets/ATTRIBUTION.md`
- Modify: `tests/EventModelLibrary.test.ts`
- Modify: `tests/EventBundleManifest.test.ts`
- Modify: `tests/EventModelAudit.test.ts`

**Interfaces:**
- Produces: dedicated `EventModelId` named `tornadoCore`.
- Produces: `EVENT_MODEL_SPECS.tornadoCore` with upright source rotation.

- [ ] **Step 1: Change model tests to require `tornadoCore`**

Replace `whirlpoolCore` expectations with `tornadoCore`.
Assert the bundle for `tornado` contains `['tornadoCore']`.
Assert the old model ID and old asset path are absent.

- [ ] **Step 2: Run model tests and verify failure**

Run:

```powershell
bunx vitest run tests/EventModelLibrary.test.ts tests/EventBundleManifest.test.ts tests/EventModelAudit.test.ts
```

Expected: failures report missing `tornadoCore`.

- [ ] **Step 3: Rename the binary asset and manifest ID**

Rename the GLB without changing its bytes.
Replace every model registry key and fetch-list value with `tornadoCore`.
Use this presentation transform:

```ts
tornadoCore: {
  targetLongestDimension: 10.5,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
  maxTriangles: 3_000,
},
```

Move the unchanged lock and generated metadata values under the new key.
Rename the attribution ID and filename. Preserve title, author, URL, license, hash, and processing data.

- [ ] **Step 4: Verify model data**

Run:

```powershell
bun run models:check:events
bunx vitest run tests/EventModelLibrary.test.ts tests/EventBundleManifest.test.ts tests/EventModelAudit.test.ts
```

Expected: the model checker and tests pass.

- [ ] **Step 5: Commit the model rename**

Stage only Task 2 files. Commit with:

```powershell
git commit -m "refactor: rename tornado event model"
```

---

### Task 3: Replace Whirlpool Choreography

**Files:**
- Create: `src/survival/events/tornadoChoreography.ts`
- Delete: `src/survival/events/whirlpoolChoreography.ts`
- Create: `tests/TornadoChoreography.test.ts`
- Modify: `tests/EventItemTiming.test.ts`

**Interfaces:**
- Produces: `TORNADO_REVEAL_DURATION`, `TORNADO_ITEM_DURATION`, and `TORNADO_REACTION_DURATION`.
- Produces: `createTornadoSample`, `resetTornadoSample`, `sampleTornadoReveal`, `sampleTornadoItemUse`, and `sampleTornadoReaction`.
- Produces: reusable `TornadoSample` fields `visibility`, `funnelScale`, `spinRate`, `spinPhase`, `sway`, `effectStrength`, `supplyTravel`, item pose values, and `effectKind`.

- [ ] **Step 1: Write focused choreography tests**

Test these exact behaviors:

```ts
expect(TORNADO_REVEAL_DURATION).toBe(3);
expect(TORNADO_ITEM_DURATION).toBe(4);
expect(TORNADO_REACTION_DURATION).toBe(1.4);
```

At reveal progress `0`, expect zero visibility and effect strength.
At reveal progress `1`, expect visibility, scale, spin rate, and effect strength to equal `1`.
For `anchor` and `swimRing`, expect a supported item effect and a held full-strength tornado.
For another choice, expect `sampleTornadoItemUse` to return `false`.
At reaction progress `1`, expect visibility, scale, spin rate, and effect strength to equal `0`.
For two lost items at progress `0.6`, expect positive `supplyTravel`.

- [ ] **Step 2: Run choreography tests and verify failure**

Run:

```powershell
bunx vitest run tests/TornadoChoreography.test.ts tests/EventItemTiming.test.ts
```

Expected: imports from `tornadoChoreography` fail.

- [ ] **Step 3: Implement the pure sample module**

Retain the old item pose and lost-supply curves.
Replace vortex fields with the tornado fields listed in the interface block.
Use `clamp01`, `pulse`, and `smoothstep` only.
Reveal in three beats. Hold full strength during item use. Fade all tornado visual fields to zero by reaction progress `1`.
Do not read scene state or allocate arrays in sampling functions.

- [ ] **Step 4: Run choreography tests**

Run:

```powershell
bunx vitest run tests/TornadoChoreography.test.ts tests/EventItemTiming.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit choreography**

Stage only Task 3 files. Commit with:

```powershell
git commit -m "feat: add tornado choreography"
```

---

### Task 4: Build the Animated Tornado Presentation

**Files:**
- Create: `src/survival/events/TornadoPresentation.ts`
- Delete: `src/survival/events/WhirlpoolPresentation.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/DedicatedEventItemUse.test.ts`
- Modify: `tests/EventItemAimTargets.test.ts`

**Interfaces:**
- Consumes: `eventModels.create('tornadoCore')` and Task 3 choreography exports.
- Produces: `TornadoPresentation implements DedicatedEventPresentation` with `eventId = 'tornado'`.
- Produces scene names `tornado-world`, `tornado-boat`, `tornado-model`, `tornado-item-aim-target`, `tornado-wind-band-N`, and `tornado-sea-spray-N`.

- [ ] **Step 1: Change presentation tests to require Tornado**

Replace the current Whirlpool presentation assertions.
Assert:

```ts
expect(tornado.position.x).toBe(12.8);
expect(tornado.position.z).toBe(-19);
expect(tornado.userData.distanceFromBoat).toBeGreaterThan(22);
expect(tornado.getObjectByName('tornado-model')).toBeDefined();
expect(tornado.getObjectByName('whirlpool-dark-funnel')).toBeUndefined();
expect(environment.vortexWave.strength).toBe(0);
expect(environment.vortexWave.depression).toBe(0);
```

After reveal updates, assert the model is visible, its Y rotation changes, the camera quaternion stays unchanged, and wind bands and sea spray are visible.
During a damaging reaction, assert the world-root X and Z values stay unchanged.
Update item-use, duration, and aim-target factories to construct `TornadoPresentation`.

- [ ] **Step 2: Run presentation tests and verify failure**

Run:

```powershell
bunx vitest run tests/BoatWorld.test.ts tests/DedicatedEventItemUse.test.ts tests/EventItemAimTargets.test.ts
```

Expected: imports, event IDs, or tornado scene assertions fail.

- [ ] **Step 3: Construct fixed presentation resources**

Create one model instance in the constructor:

```ts
this.modelInstance = environment.eventModels.create('tornadoCore');
this.modelRoot = this.modelInstance.root;
this.modelRoot.name = 'tornado-model';
```

Set `worldRoot.position.x` to `12.8` and Z to `-19` once.
Collect model materials once. Make them transparent and update only opacity per frame.
Create three shared-geometry wind-band meshes and six shared-geometry spray meshes.
Use transparent, flat-shaded, cool gray-blue materials.
Attach the item aim target near the funnel center.

- [ ] **Step 4: Apply animation without per-frame allocation**

Reuse one wave sample. Each update samples water height only for X `12.8`, Z `-19`.
Apply water height to world-root Y while leaving X and Z fixed.
Apply sample scale, opacity, spin, and sway to the model.
Animate fixed wind and spray meshes with stored numeric phases.
Reuse lost-item pose objects and retain current release behavior.
Never set `environment.vortexWave`.

- [ ] **Step 5: Implement lifecycle and cleanup**

Keep `stage`, `reveal`, `playItemUse`, `react`, `skip`, `clear`, and `settleForVisibilityChange` behavior.
Hide the model and effects during clear.
Dispose the model instance, shared geometry, and owned materials once.
Restore the stationary camera during clear and dispose.

- [ ] **Step 6: Run focused presentation tests**

Run:

```powershell
bunx vitest run tests/BoatWorld.test.ts tests/DedicatedEventItemUse.test.ts tests/EventItemAimTargets.test.ts tests/TornadoChoreography.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit the presentation**

Stage only Task 4 files. Commit with:

```powershell
git commit -m "feat: replace whirlpool with animated tornado"
```

---

### Task 5: Remove Obsolete Names and Verify the Feature

**Files:**
- Verify: `src/`
- Verify: `tests/`
- Verify: `scripts/`
- Verify: `README.md`

**Interfaces:**
- Consumes: complete Tornado event from Tasks 1 through 4.
- Produces: no runtime or test references to the old event, model, presentation, or choreography names.

- [ ] **Step 1: Scan for obsolete names**

Run:

```powershell
rg -n -i "whirlpool|whirlpoolCore" src tests scripts README.md
```

Expected: no output. Attribution source text may use `Tornado / Poly by Google`, but no obsolete ID or filename remains.

- [ ] **Step 2: Fix every remaining obsolete reference**

Rename each result to its `tornado` or `tornadoCore` form.
Do not add aliases, fallback branches, or migrations.

- [ ] **Step 3: Run full verification**

Run:

```powershell
bun run models:check:events
bun run typecheck
bun run test
bun run build
```

Expected: each command exits with code `0`.

- [ ] **Step 4: Review the final diff**

Run:

```powershell
git diff --check
git status --short
```

Confirm that unrelated pre-existing changes remain present and unchanged.
Confirm that the tornado change contains no generated build output.

- [ ] **Step 5: Commit final cleanup**

Stage only files changed by the obsolete-name scan. If the scan required no edits, do not create an empty commit.
Use this commit message when edits exist:

```powershell
git commit -m "test: verify tornado event replacement"
```
