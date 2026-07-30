# Drifting Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Implement five accurate survival events with clear, model-led scene presentation.

**Architecture:** Add stable presentation keys to deterministic event results. Load pinned Poly Pizza models through one owned library. Route the five events through small scene controllers. Keep other events in the current generic presentation layer.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite, PowerShell, Node.js.

---

## Task 1: Create the isolated implementation worktree

**Files:**

- Read: `.gitignore`
- Read: `package.json`
- Copy current uncommitted user changes into the worktree.

**Step 1: Read the worktree skill**

Read `superpowers:using-git-worktrees/SKILL.md` in full.

**Step 2: Select a safe worktree path**

Use the repository convention from the skill. Use branch `codex/drifting-events`.

**Step 3: Preserve the current dirty state**

Create the worktree from current `HEAD`. Apply the current binary diff there.
Copy the untracked `docs/EVENT_PROGRESS.md` file there.

**Step 4: Verify the baseline**

Run:

```powershell
npm test -- --run
```

Record any baseline failures. Do not change unrelated user files.

## Task 2: Add deterministic event result identities and exact rules

**Files:**

- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/eventResolver.ts`
- Modify: `src/survival/events.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/journal.ts`
- Test: `tests/eventResolver.test.ts`
- Test: `tests/survivalEvents.test.ts`
- Test: `tests/SurvivalSession.test.ts`
- Test: `tests/survivalJournal.test.ts`

**Step 1: Write failing resolver tests**

Test these cases:

- A result returns its stable `presentationKey`.
- A result with `minimumPriorAppearances: 1` cannot occur first.
- The same result can occur after one prior appearance.
- Random selection remains deterministic.

Use this result type:

```ts
export type EventPresentationKey =
  | "drifting-loot.food"
  | "drifting-loot.bait"
  | "drifting-loot.repair"
  | "drifting-loot.energy-bar"
  | "drifting-loot.drift"
  | "drifting-bottle.retrieve"
  | "drifting-bottle.lost"
  | "check-the-back.fish"
  | "check-the-back.empty"
  | "check-the-back.face"
  | "check-the-back.ignore"
  | "mystery-chest.safe"
  | "mystery-chest.mimic"
  | "mystery-chest.leave"
  | "flowers.collect"
  | "flowers.drift";
```

Add these fields:

```ts
interface WeightedEventOutcome {
  presentationKey: EventPresentationKey;
  minimumPriorAppearances?: number;
}

interface ActionOutcome {
  eventPresentationKey?: EventPresentationKey;
}
```

**Step 2: Run the focused tests**

Run:

```powershell
npx vitest run tests/eventResolver.test.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
```

Expected: Fail because the fields and filters do not exist.

**Step 3: Implement resolver support**

Change the resolver signature:

```ts
export function resolveWeightedOutcome(
  choice: EventChoice,
  random: RandomSource,
  priorAppearanceCount = 0,
): ActionOutcome
```

Filter out results whose `minimumPriorAppearances` exceeds the count.
Copy the selected `presentationKey` into the action outcome.

Pass `appearanceCounts.get(event.id) ?? 0` from `SurvivalSession`.

**Step 4: Correct all five event definitions**

Use these rules:

- Drifting Loot: day event, day 3+, weight 18, three energy.
- Drifting Bottle: day 2+, weight 30, once, absent bottled paper.
- Check the Back: fish 500, empty 50, face 1 after one prior appearance.
- Mystery Chest: safe 80, mimic 30, mimic deals 25 health damage.
- Flowers: days 2 through 13, weight 2, once, no pressure limit.

Set a stable key on every choice outcome.

**Step 5: Record the rare face result**

Store the presentation key in `JournalEventRecord`.
Format `check-the-back.face` as:

```text
I looked at me. And I looked back.
```

**Step 6: Run the focused tests**

Run the focused command from Step 2.

Expected: Pass.

**Step 7: Commit**

```powershell
git add src/survival/survivalTypes.ts src/survival/eventResolver.ts src/survival/events.ts src/survival/SurvivalSession.ts src/survival/journal.ts tests/eventResolver.test.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
git commit -m "feat: correct drifting event outcomes"
```

## Task 3: Add the pinned Poly Pizza event model pipeline

**Files:**

- Create: `scripts/poly-pizza-event-models.mjs`
- Create: `scripts/fetch-event-models.ps1`
- Create: `scripts/check-event-models.mjs`
- Create: `src/assets/models/events/event-model-metadata.json`
- Create: `src/assets/models/events/driftingLootBarrel.glb`
- Create: `src/assets/models/events/driftingLootCrate.glb`
- Create: `src/assets/models/events/driftingBottle.glb`
- Create: `src/assets/models/events/mysteryChest.glb`
- Create: `src/assets/models/events/flowers.glb`
- Modify: `package.json`
- Modify: `src/assets/ATTRIBUTION.md`
- Test: `tests/eventModels.test.ts`

**Step 1: Write the model manifest**

Pin these exact resources:

| ID | Poly Pizza model | Resource ID | SHA-256 | Triangles |
|---|---|---|---|---:|
| `driftingLootBarrel` | Barrel by Don Carson | `2244f3ae-5583-4ea0-b980-6fdd0084cee7` | `89031BAAA180FD8040C8C2A27F56AC479BD6FE8A7C4EC5495D1433D185840EF5` | 282 |
| `driftingLootCrate` | Crate by Quaternius | `720097e2-63ed-4e5f-9b66-eb416942eea0` | `4FB00BA01EEFEA3F1A335A6D3ACC67E8F4E093B9FC227673B82F67E12E098D6E` | 784 |
| `driftingBottle` | Bottle of Wine by Jeremy | `b1a8f402-de55-4e49-b63e-1439e5851c13` | `5C1169A709CF2B897E9037771BC8B33EDE3C546A2CA872F33BF8A9348F112D54` | 304 |
| `mysteryChest` | Chest by Quaternius | `803af4ae-433f-4b05-b1f1-c6a2da02d768` | `07193221A749D5DCF2B0A3D82D4EE9831DA2E2C4CA71B395050A88BB2BABE75B` | 1676 |
| `flowers` | Lily Pad by Poly by Google | `856b7c36-4bd0-48f1-a308-529366b6a7fd` | `CC4BA073B2CC94B4CADA9BB25C15C3832052E2F3A018B3E2EB7F9429E6D2384B` | 728 |

Use the current fishing scripts as the format reference.

**Step 2: Write a failing asset test**

Verify:

- Every event model file exists.
- Every hash matches.
- Every triangle count matches.
- Every attribution entry exists.

**Step 3: Add fetch and check commands**

Add:

```json
"models:fetch:events": "powershell -ExecutionPolicy Bypass -File scripts/fetch-event-models.ps1",
"models:check:events": "node scripts/check-event-models.mjs"
```

Include event checks in the aggregate model check command.

**Step 4: Fetch the models**

Run:

```powershell
npm run models:fetch:events
```

**Step 5: Add license records**

Record:

- Barrel: CC-BY 3.0, Don Carson.
- Crate: CC0 1.0, Quaternius.
- Bottle: CC-BY 3.0, Jeremy.
- Chest: CC0 1.0, Quaternius.
- Lily Pad: CC-BY 3.0, Poly by Google.

Use direct Poly Pizza model links.

**Step 6: Verify the assets**

Run:

```powershell
npm run models:check:events
npx vitest run tests/eventModels.test.ts
```

Expected: Pass.

**Step 7: Commit**

```powershell
git add package.json scripts/poly-pizza-event-models.mjs scripts/fetch-event-models.ps1 scripts/check-event-models.mjs src/assets/models/events src/assets/ATTRIBUTION.md tests/eventModels.test.ts
git commit -m "assets: add low poly event models"
```

## Task 4: Add one owned runtime model library

**Files:**

- Create: `src/survival/eventModelManifest.ts`
- Create: `src/survival/SurvivalEventModelLibrary.ts`
- Modify: `src/app/GamePhase.ts`
- Modify: `src/app/launchGame.ts`
- Modify: `src/Game.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/helpers/createTestEventModels.ts`
- Test: `tests/SurvivalEventModelLibrary.test.ts`
- Test: `tests/launchGame.test.ts`

**Step 1: Write failing ownership tests**

Test:

- `load()` returns templates for all five models and the existing bass model.
- `clone()` returns a new root while sharing geometry and material resources.
- `dispose()` disposes each shared resource once.
- A failed model load uses a local fallback and does not block the phase.

**Step 2: Define the library interface**

```ts
export type SurvivalEventModelId =
  | "driftingLootBarrel"
  | "driftingLootCrate"
  | "driftingBottle"
  | "checkBackFish"
  | "mysteryChest"
  | "flowers";

export interface SurvivalEventModels {
  clone(id: SurvivalEventModelId): Group;
}
```

`checkBackFish` uses `src/assets/models/fishing/bass.glb`.

**Step 3: Implement setup and disposal**

Load each template once.
Normalize models during setup.
Create fallback models during setup.
Do not allocate resources in frame updates.

The library owns all shared model resources.
Controller clones do not dispose shared resources.

**Step 4: Wire the library into phase dependencies**

Create it in the application bootstrap.
Pass it through `GamePhase` and `SurvivalPhase`.
Dispose it once in `Game`.

**Step 5: Run focused tests**

Run:

```powershell
npx vitest run tests/SurvivalEventModelLibrary.test.ts tests/launchGame.test.ts
```

Expected: Pass.

**Step 6: Commit**

```powershell
git add src/survival/eventModelManifest.ts src/survival/SurvivalEventModelLibrary.ts src/app/GamePhase.ts src/app/launchGame.ts src/Game.ts src/survival/SurvivalPhase.ts tests/helpers/createTestEventModels.ts tests/SurvivalEventModelLibrary.test.ts tests/launchGame.test.ts
git commit -m "feat: load survival event models"
```

## Task 5: Build the featured event presentation coordinator

**Files:**

- Create: `src/survival/FeaturedEventPresentations.ts`
- Modify: `src/survival/DriftingLootPresentation.ts`
- Modify: `src/survival/EventPresentationLayer.ts`
- Modify: `src/survival/BoatWorld.ts`
- Test: `tests/FeaturedEventPresentations.test.ts`
- Test: `tests/BoatWorld.test.ts`

**Step 1: Write failing routing tests**

Test:

- The five target event IDs route to the featured coordinator.
- Other event IDs still route to `EventPresentationLayer`.
- Featured roots supply interaction and result anchors.
- Clear removes visible event state.

**Step 2: Define the controller contract**

```ts
export interface FeaturedEventPresentation {
  stage(): void;
  reveal(): Promise<void>;
  react(key: EventPresentationKey): Promise<void>;
  settleForVisibilityChange(): void;
  interactionRoot(): Object3D | null;
  resultRoot(): Object3D | null;
  update(time: number, delta: number): void;
  clear(): void;
  dispose(): void;
}
```

The coordinator maps one controller to each event ID.

**Step 3: Upgrade Drifting Loot**

Replace the ship furniture with the selected barrel and crate.
Keep wave-driven buoyancy and retrieval motion.
Use one distant cold silhouette and one warm recovered silhouette.
Return a stable anchor for the cargo.

**Step 4: Remove only duplicate target tableaus**

Delete target-event construction from `EventPresentationLayer`.
Keep its support for all unrelated events.

**Step 5: Route events in BoatWorld**

Add methods:

```ts
stageEventPresentation(eventId: EventId): void;
revealEventPresentation(eventId: EventId): Promise<void>;
reactToEventOutcome(eventId: EventId, key: EventPresentationKey): Promise<void>;
projectEventInteractionBounds(eventId: EventId): ProjectedBoatBounds | null;
projectEventResultBounds(eventId: EventId): ProjectedBoatBounds | null;
```

**Step 6: Verify coordinator behavior**

Run:

```powershell
npx vitest run tests/FeaturedEventPresentations.test.ts tests/BoatWorld.test.ts
```

Expected: Pass.

**Step 7: Commit**

```powershell
git add src/survival/FeaturedEventPresentations.ts src/survival/DriftingLootPresentation.ts src/survival/EventPresentationLayer.ts src/survival/BoatWorld.ts tests/FeaturedEventPresentations.test.ts tests/BoatWorld.test.ts
git commit -m "feat: route featured event scenes"
```

## Task 6: Implement Drifting Bottle and Check the Back scenes

**Files:**

- Create: `src/survival/DriftingBottlePresentation.ts`
- Create: `src/survival/CheckBackPresentation.ts`
- Modify: `src/survival/FeaturedEventPresentations.ts`
- Modify: `src/survival/BoatWorld.ts`
- Test: `tests/DriftingBottlePresentation.test.ts`
- Test: `tests/CheckBackPresentation.test.ts`

**Step 1: Write failing bottle tests**

Test:

- Stage places the bottle beside the hull.
- Reveal taps it against the hull in visible view.
- Retrieve moves it aboard and exposes the paper.
- Lost makes it drift outside view.
- Clear resets all transforms.

**Step 2: Implement the bottle scene**

Use the selected bottle model.
Add one cork and one rolled paper mesh.
Use short uneven knock motion.
Use the shared wave sample for floating.
Create all geometry and materials in setup.

**Step 3: Write failing Check Back tests**

Test:

- Stage hides the subject behind the boat.
- Reveal turns the camera halfway toward the stern.
- Check finishes the turn.
- Fish flops and settles.
- Empty water shows only a wake.
- Face holds still and looks toward the camera.
- Ignore returns the camera forward.

**Step 4: Implement the stern scene**

Use the existing bass model for fish and face results.
Use a separate featured-event camera rig.
Place that rig between cue camera and normal camera rigs.
Reset the rig during clear and visibility changes.

**Step 5: Run focused tests**

Run:

```powershell
npx vitest run tests/DriftingBottlePresentation.test.ts tests/CheckBackPresentation.test.ts tests/BoatWorld.test.ts
```

Expected: Pass.

**Step 6: Commit**

```powershell
git add src/survival/DriftingBottlePresentation.ts src/survival/CheckBackPresentation.ts src/survival/FeaturedEventPresentations.ts src/survival/BoatWorld.ts tests/DriftingBottlePresentation.test.ts tests/CheckBackPresentation.test.ts tests/BoatWorld.test.ts
git commit -m "feat: show bottle and stern events"
```

## Task 7: Implement Mystery Chest and Flowers scenes

**Files:**

- Create: `src/survival/MysteryChestPresentation.ts`
- Create: `src/survival/FlowersPresentation.ts`
- Modify: `src/survival/ChestDisplay.ts`
- Modify: `src/survival/FeaturedEventPresentations.ts`
- Test: `tests/MysteryChestPresentation.test.ts`
- Test: `tests/FlowersPresentation.test.ts`
- Test: `tests/ChestDisplay.test.ts`

**Step 1: Write failing chest tests**

Test:

- The chest scrapes beside the boat.
- Safe take lifts the lid and moves the chest aboard.
- Mimic opens sharply, shows teeth, snaps, and shakes the camera.
- Leave sinks the chest into shadow.
- Persistent chest display uses the same selected model.

**Step 2: Implement the chest scene**

Use `Chest_Top` as the lid pivot.
Add procedural teeth behind the lid.
Create teeth resources in setup.
Dispose those owned resources once.

Pass a selected chest clone into `ChestDisplay`.
Do not dispose shared model resources there.

**Step 3: Write failing flower tests**

Test:

- Stage creates a small moving line of lily pads.
- Collect moves the nearest flower aboard.
- Drift carries the patch past the hull.
- The patch follows the shared wave field.
- Clear restores the initial transforms.

**Step 4: Implement the flower scene**

Use several clones of the selected Lily Pad.
Use restrained scale, yaw, and tint variation.
Add a pale flower overlay only when the source flower lacks contrast.
Create all variation values during setup.

**Step 5: Run focused tests**

Run:

```powershell
npx vitest run tests/MysteryChestPresentation.test.ts tests/FlowersPresentation.test.ts tests/ChestDisplay.test.ts
```

Expected: Pass.

**Step 6: Commit**

```powershell
git add src/survival/MysteryChestPresentation.ts src/survival/FlowersPresentation.ts src/survival/ChestDisplay.ts src/survival/FeaturedEventPresentations.ts tests/MysteryChestPresentation.test.ts tests/FlowersPresentation.test.ts tests/ChestDisplay.test.ts
git commit -m "feat: show chest and flower events"
```

## Task 8: Make the full event lifecycle visible

**Files:**

- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `src/audio/SurvivalAudio.ts`
- Test: `tests/SurvivalPhase.test.ts`
- Test: `tests/SurvivalPhaseAudio.test.ts`
- Test: `tests/SurvivalUI.test.ts`

**Step 1: Write failing lifecycle tests**

Test this order:

1. Cover the scene.
2. Stage the event.
3. Render and settle one frame.
4. Remove the cover.
5. Run the visible reveal.
6. Show the event title.
7. Unlock choices.
8. Resolve the selected result.
9. Run the physical result.
10. Show a short result caption at the subject.
11. Clear the event.

Also test interrupted sleep, phase exit, and visibility change cleanup.

**Step 2: Add contextual anchors**

Use these anchor IDs:

```ts
"event:drifting-bottle"
"event:check-the-back"
"event:mystery-chest"
"event:flowers"
```

Anchor:

- Bottle sleep.
- Both Check the Back choices.
- Both Mystery Chest choices.
- Flowers drift.

Keep item choices on their physical supply anchors.

**Step 3: Add an anchored result caption**

Add:

```ts
export interface EventResultView {
  caption: string;
  detail: string;
  target: ProjectedBoatBounds | null;
}
```

Add `showEventResult()` and `hideEventResult()` to `SurvivalUI`.
Use one compact, non-modal strip near the subject.
Keep the event scene visible behind it.

Use these short captions:

- Loot: `Recovered`, `Slipped away`.
- Bottle: `Paper inside`, `Lost in the wake`.
- Check: `A fish`, `Only water`, `It was me`, `Left unseen`.
- Chest: `A real chest`, `Teeth`, `Left below`.
- Flowers: `One pale bloom`, `Gone astern`.

**Step 4: Map result keys to audio**

Reuse current short cues:

- Loot and bottle: item handling and wave impact.
- Fish: fish catch.
- Chest: chest cue.
- Mimic: chest cue plus impact.
- Flowers: item handling.

Do not add a new audio file unless the current cue cannot express the action.

**Step 5: Run focused lifecycle tests**

Run:

```powershell
npx vitest run tests/SurvivalPhase.test.ts tests/SurvivalPhaseAudio.test.ts tests/SurvivalUI.test.ts
```

Expected: Pass.

**Step 6: Commit**

```powershell
git add src/survival/SurvivalPhase.ts src/ui/SurvivalUI.ts src/styles/main.css src/audio/SurvivalAudio.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseAudio.test.ts tests/SurvivalUI.test.ts
git commit -m "feat: expose event reveals and results"
```

## Task 9: Update progress records and run full verification

**Files:**

- Modify: `docs/EVENT_PROGRESS.md`
- Modify only failing files that belong to this feature.

**Step 1: Mark the five events complete**

Update each event row with:

- Exact rule status.
- Selected model link.
- Presentation behavior.
- Test status.

**Step 2: Run static and asset checks**

Run:

```powershell
npm run typecheck
npm run models:check
```

Expected: Pass.

**Step 3: Run the full test suite**

Run:

```powershell
npm test -- --run
```

Expected: Pass, apart from recorded baseline failures.

**Step 4: Run the production build**

Run:

```powershell
npm run build
```

Expected: Pass.

**Step 5: Inspect the five events in the browser**

Run the local game.
Force each event through deterministic debug state.
Inspect:

- The event subject reads before choices appear.
- The selected model matches the authored maritime style.
- The result animation matches the selected result.
- The result caption stays near the subject.
- Sleep, resize, visibility change, and phase exit leave no stale scene.

Capture one screenshot per event for the completion record.

**Step 6: Read the completion skill**

Read `superpowers:verification-before-completion/SKILL.md` in full.
Follow its evidence rules before any completion claim.

**Step 7: Commit**

```powershell
git add docs/EVENT_PROGRESS.md
git commit -m "docs: complete drifting event progress"
```

**Step 8: Review the branch**

Run:

```powershell
git status --short
git log --oneline --decorate -10
git diff HEAD^ --stat
```

Confirm that the worktree is clean.
Do not merge or remove the worktree without user approval.
