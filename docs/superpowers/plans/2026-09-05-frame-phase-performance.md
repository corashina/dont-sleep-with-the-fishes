# Frame and phase performance implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Reduce repeated frame work and defer assets until their phase needs them.

**Architecture:** Keep the current game phases and event bundles. Split frame caches by what changes. Replace eager startup ownership with explicit phase resource acquisition and generation-guarded transitions.

**Tech Stack:** TypeScript, Three.js, Rapier, Web Audio, Vitest, glTF Transform.

**Spec:** docs/superpowers/specs/2026-09-05-frame-phase-performance.md

## Global Constraints

- Do not alter gameplay rules or timing.
- Do not implement reduced-motion variants.
- Do not add dependencies.
- Do not introduce compatibility layers or obsolete fallback paths.
- Preserve the visual style guide.
- Do not change the original checkout, merge, push, or publish.

## Task 1: Remove repeated frame work

**Files:** src/game/ScavengeSession.ts, src/interaction/InteractionSystem.ts, src/ui/BoatAnchorView.ts, src/ui/SurvivalUI.ts, src/survival/BoatInteractionProjector.ts, src/survival/BoatWorld.ts; matching existing tests.

**Interfaces:** Preserve public session, interaction, and view behavior. Add explicit resize or content invalidation methods only where required. Keep the projector output buffers reusable.

- [ ] Add a timer-only snapshot test:

```ts
const session = new ScavengeSession();
session.start();
const before = session.snapshot();
session.tick(1 / 60);
const after = session.snapshot();
expect(after.remainingSeconds).toBeLessThan(before.remainingSeconds);
expect(after.items).toBe(before.items);
expect(after.carriedItems).toBe(before.carriedItems);
```

- [ ] Add item mutation tests proving pickup/drop/save/loss invalidate the correct cached records.
- [ ] Add an anchor test that mutates the same projected object between calls. Position must change without rebuilding tooltip content. Quantity, language, event eligibility, and action state must refresh content.
- [ ] Add viewport-read coverage: call setAnchors for several moving anchors and assert no per-anchor getBoundingClientRect call. Refresh the cached viewport at construction and resize.
- [ ] Add raycast coverage for selection across two frames with different targets, to catch retained hits.
- [ ] Run the new tests before implementation. Record failures.
- [ ] Cache item state independently from timer state. Build immutable records only when inventory changes.
- [ ] Keep one reusable raycast target list and hit list. Clear list lengths before filling.
- [ ] Cache primitive tooltip content inputs independently from projected position. Keep layout records mutable and reuse seen-ID storage.
- [ ] Remove duplicate full-scene matrix preparation. Preserve standalone projector correctness with local matrix updates when needed.
- [ ] Run ScavengeSession, interaction, BoatInteractionProjector, BoatWorld, SurvivalUI, and language tests, plus typecheck and lint. Commit only task files.

## Task 2: Acquire assets and audio by phase

**Files:** src/app/launchGame.ts, src/Game.ts, src/app/GamePhase.ts, new focused phase resource owner under src/app, src/audio/AudioSystem.ts, src/audio/audioManifest.ts, phase constructors, model libraries where subset loading is required; launch, director, lifecycle, audio, and model tests.

**Interfaces:** Split common renderer/settings context from menu, ship, and survival asset contexts. Each acquisition returns assets plus an idempotent dispose operation. Audio acquisition uses the existing backend reference counts. A phase becomes active only after its required assets resolve.

- [ ] Add startup coverage using deferred ship/physics promises. The menu must start while those promises remain unrequested. Count loader calls directly.
- [ ] Add transition tests: START requests ship assets once; survival handoff requests survival resources; Continue and event test request survival without ship assets.
- [ ] Add cancellation/failure coverage: dispose during load, replace a pending transition, failed asset group, failed phase constructor. Each acquired resource must release once and stale phases must never start.
- [ ] Add audio tests: menu acquires menu/interface sounds only; ship and survival lease their own sets; shared buffers survive overlapping owners; outgoing-only buffers release.
- [ ] Run new tests before implementation. Record failures.
- [ ] Introduce the smallest typed resource owner that handles the three asset sets and shared dependencies. Keep ownership explicit in the returned leases.
- [ ] Make menu startup depend only on menu resources. Remove eager gameplay acquisition.
- [ ] Move acquisition to the existing transition entry points. Use one generation check for activation and failure handling. Show loading UI while awaiting resources.
- [ ] Preserve pointer lock: do not assume a new asynchronous load retains a user gesture. Reuse or explicitly request lock through the existing input flow.
- [ ] Move audio preload responsibility from the global SHARED_SOUND_IDS load to phase leases. Retain event audio leases.
- [ ] Remove obsolete eager constructors and update production/test callers. Keep test fixtures outside new production resource ownership.
- [ ] Run launch, GameDirector, GameLifecycle, GameConstruction, MainMenuPhase, SurvivalPhase, AudioSystem, and relevant model tests. Run full typecheck and lint. Commit task files.

## Task 3: Reduce oversized embedded textures

**Files:** existing model processing scripts and specifications, src/assets/models/menu/starfish.glb, src/assets/models/items/map.glb, corresponding model metadata, src/assets/ATTRIBUTION.md, asset checks.

**Interfaces:** Existing loader formats and model IDs stay unchanged. Processed assets remain standard local GLB files.

- [ ] Inspect texture dimensions and channels with the current glTF tooling. Record baseline file sizes and image previews.
- [ ] Set a maximum texture dimension of 512 pixels for these two models. Preserve alpha where used. Use WebP quality 85 for color and packed maps where supported by the existing pipeline; keep normal-map quality high and verify channel semantics.
- [ ] Produce processed assets using existing scripts. If scripts lack these settings, add an explicit per-model texture processing profile.
- [ ] Update processed hashes and metadata. Preserve original source/license history.
- [ ] Add deterministic checks for texture dimensions and file ceilings: starfish below 1 MB; map below 500 kB.
- [ ] Verify geometry counts, texture assignments, alpha, and normal maps remain valid. Inspect before/after images and representative renders.
- [ ] Run item/menu model checks, full asset checks, typecheck, lint, and build. Commit task files.

## Task 4: Integration validation and documentation

**Files:** README.md and concise performance result notes under docs.

**Interfaces:** Document the final implemented behavior, ownership, measured byte changes, and validation commands.

- [ ] Run the complete test suite, typecheck, lint, production build, and all committed asset checks.
- [ ] Run a browser smoke check if available. Confirm menu, START, survival, Continue/event entry, restart, and menu return.
- [ ] Record startup loader counts and asset-byte reductions. Do not infer FPS changes from these measurements.
- [ ] Update startup and architecture documentation. Run a final whole-branch review against baseline dc94533c.
- [ ] Leave the branch and worktree available for review. Do not merge or push.
