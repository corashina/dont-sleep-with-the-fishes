# Captain Whiskers Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rescued Captain Whiskers the only crewmate, with needs, care actions, events, scene-linked status, and passive fishing luck.

**Architecture:** `SurvivalSession` owns one optional companion state and removes Whiskers from item inventory. Focused rule, presentation, and UI units expose typed contracts. Existing fishing and event systems receive the smallest required companion extensions.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, JSDOM, deterministic Rapier compatibility runtime.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-03-captain-whiskers-companion-design.md`.
- Follow `docs/VISUAL_STYLE_GUIDE.md` for all player-facing work.
- Captain Whiskers is the only crewmate. Do not add human crew.
- Pet replaces Talk. Do not add spoken or lore dialogue.
- Keep the fishing support passive. Do not add an active support action.
- Keep all rule randomness behind the injected `RandomSource`.
- Keep gameplay rules testable without Three.js or the DOM.
- Do not allocate in per-frame update paths.
- Give every Three.js resource one owner and one disposal path.
- Do not add reduced-motion or `prefers-reduced-motion` behavior.
- Preserve all unrelated working-tree and index changes.
- Before each commit, inspect `git diff` and `git diff --cached` for every listed file.
- If a listed file had prior changes, do not commit that file without the owner's approval.

---

## File map

Create these focused units:

- `src/survival/CaptainWhiskersState.ts`: pure need rules, labels, wellness, death, and dawn processing.
- `src/survival/captainWhiskersMotion.ts`: allocation-free keyed pose sampling.
- `src/survival/CaptainWhiskersPresentation.ts`: model, pet hand, pose state, action playback, and disposal.
- `src/survival/events/CaptainWhiskersEventPresentation.ts`: Sick Companion, Shadow Figure, Sea Watcher, and Guarded Sleep visuals.
- `tests/CaptainWhiskersState.test.ts`: pure companion rule coverage.
- `tests/CaptainWhiskersPresentation.test.ts`: model, pose, action, anchor, and disposal coverage.
- `tests/CaptainWhiskersEventPresentation.test.ts`: crewmate event visual coverage.

Modify these existing units:

- `src/survival/survivalTypes.ts`: companion snapshots, actions, event requirements, event effects, and ending reason.
- `src/survival/SurvivalSession.ts`: rescue handoff, actions, dawn rules, events, and fishing multiplier.
- `src/survival/fishingCatalog.ts`: fish-only weight multiplier.
- `src/survival/FishingSession.ts`: multiplier input.
- `src/survival/events.ts`: companion event definitions, validation, and eligibility.
- `src/survival/eventPresentationTypes.ts`: new dedicated event IDs and companion presentation access.
- `src/survival/BoatInteraction.ts`: companion interaction anchor data.
- `src/survival/BoatSupplyDisplay.ts`: exclude Whiskers from normal supply-copy pools.
- `src/survival/BoatWorld.ts`: companion presentation ownership, sync, anchor projection, and event registration.
- `src/survival/SurvivalPhase.ts`: action choreography, sync, ending reason, and event presentation flow.
- `src/ui/SurvivalUI.ts`: anchored status card, status actions, focus, and ending copy.
- `src/styles/main.css`: companion card and status state treatment.
- Existing matching tests in `tests/`.

---

### Task 1: Pure companion rules

**Files:**
- Create: `src/survival/CaptainWhiskersState.ts`
- Create: `tests/CaptainWhiskersState.test.ts`

**Interfaces:**
- Consumes: `RandomSource.next(): number` from `src/survival/survivalTypes.ts`.
- Produces: `CaptainWhiskersSnapshot`, `CaptainWhiskersDeathCause`, `CaptainWhiskersStatus`, `createCaptainWhiskersState`, `captainWhiskersStatus`, `captainWhiskersWellness`, `petCaptainWhiskers`, `feedCaptainWhiskers`, `treatCaptainWhiskers`, `killCaptainWhiskers`, and `advanceCaptainWhiskersDawn`.

- [ ] **Step 1: Write failing threshold and action tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  advanceCaptainWhiskersDawn,
  captainWhiskersStatus,
  captainWhiskersWellness,
  createCaptainWhiskersState,
  petCaptainWhiskers,
} from '../src/survival/CaptainWhiskersState';

it('maps every approved status boundary', () => {
  expect(captainWhiskersStatus({
    ...createCaptainWhiskersState(), hunger: 4, sickness: 3, unhappiness: 7,
  })).toEqual({ hunger: 'Peckish', health: 'Sick', happiness: 'Depressed' });
});

it('pets once and removes four unhappiness', () => {
  const state = { ...createCaptainWhiskersState(), unhappiness: 6 };
  expect(petCaptainWhiskers(state)).toBe(true);
  expect(state).toMatchObject({ unhappiness: 2, pettedToday: true });
  expect(petCaptainWhiskers(state)).toBe(false);
});

it('uses the approved wellness penalty', () => {
  expect(captainWhiskersWellness({
    ...createCaptainWhiskersState(), hunger: 5, sickness: 1, unhappiness: 4,
  })).toBe(3);
});
```

- [ ] **Step 2: Run the new tests and confirm the missing-module failure**

Run: `bun run test -- tests/CaptainWhiskersState.test.ts`

Expected: FAIL because `CaptainWhiskersState.ts` does not exist.

- [ ] **Step 3: Implement the state contract and label tables**

```ts
export type CaptainWhiskersDeathCause =
  | 'starvation' | 'sickness' | 'misery' | 'sea-watcher';

export interface CaptainWhiskersState {
  alive: boolean;
  hunger: number;
  sickness: number;
  unhappiness: number;
  pettedToday: boolean;
  deathCause: CaptainWhiskersDeathCause | null;
}

export type CaptainWhiskersSnapshot = Readonly<CaptainWhiskersState>;

export interface CaptainWhiskersStatus {
  readonly hunger: 'Satiated' | 'Peckish' | 'Hungry' | 'Starving';
  readonly health: 'Healthy' | 'Unwell' | 'Sick' | 'Dying';
  readonly happiness: 'Happy' | 'Bored' | 'Lonely' | 'Depressed' | 'Miserable';
}

export function createCaptainWhiskersState(
  initial: Partial<CaptainWhiskersSnapshot> = {},
): CaptainWhiskersState {
  return {
    alive: true, hunger: 5, sickness: 0, unhappiness: 0,
    pettedToday: false, deathCause: null, ...initial,
  };
}
```

Use exact label ranges from the design. Mutating helpers must clamp hunger and sickness to `0..5`. They must clamp unhappiness at zero only.

- [ ] **Step 4: Add exact dawn-order and random-boundary tests**

Test these rolls in order: hunger `0.499999`, sickness decline, sickness recovery, happiness death. Confirm hunger `0.5` does not fall. Confirm sickness five kills. Confirm unhappiness eleven uses a `0.45` exclusive boundary. Confirm `pettedToday` resets after dawn.

```ts
const sequence = (...values: number[]) => ({ next: () => values.shift()! });
const state = { ...createCaptainWhiskersState(), hunger: 1 };
const result = advanceCaptainWhiskersDawn(state, sequence(0.49));
expect(result.deathCause).toBe('starvation');
expect(state.alive).toBe(false);
```

- [ ] **Step 5: Implement dawn processing and wellness**

Process hunger, sickness decline, sickness recovery, happiness, and pet reset in that order. Stop on death. Use decline chance `(sickness + 1) / 100`, recovery chance `((5 - sickness) * 3) / 100`, and misery death chance `0.45`.

- [ ] **Step 6: Run the focused tests**

Run: `bun run test -- tests/CaptainWhiskersState.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the isolated rule unit when safe**

```powershell
git add -- src/survival/CaptainWhiskersState.ts tests/CaptainWhiskersState.test.ts
git commit -m "feat: add Captain Whiskers need rules"
```

Skip this commit if either path contains prior work.

---

### Task 2: Survival handoff and care actions

**Files:**
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/journal.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/survivalInventory.test.ts`

**Interfaces:**
- Consumes: Task 1 rule helpers.
- Produces: `CompanionActionId`, `SurvivalSnapshot.captainWhiskers`, `SurvivalSessionOptions.initialCaptainWhiskers`, and Pet, Feed, Treat action outcomes.

- [ ] **Step 1: Write failing rescue-handoff tests**

```ts
const session = new SurvivalSession([
  saved('captainWhiskers'), saved('cannedFood'), saved('medicalKit'),
], { seed: 7 });
const snapshot = session.snapshot();
expect(snapshot.captainWhiskers).toMatchObject({ alive: true, hunger: 5 });
expect(snapshot.inventory['captainWhiskers-1']).toBeUndefined();
expect(snapshot.savedItems.some(({ type }) => type === 'captainWhiskers')).toBe(false);
```

Add an absent-companion test. Add an immutable snapshot test.

- [ ] **Step 2: Run the handoff tests and confirm type failures**

Run: `bun run test -- tests/SurvivalSession.test.ts tests/survivalInventory.test.ts`

Expected: FAIL because the snapshot has no companion field and Whiskers remains an item.

- [ ] **Step 3: Add typed snapshot and action contracts**

```ts
export type CompanionActionId =
  | 'petWhiskers' | 'feedWhiskers' | 'treatWhiskers' | 'delegateWhiskers';

export type DayActionId =
  | 'fish' | 'dive' | 'eat' | 'repair' | 'repairItem'
  | 'treat' | 'sendMessage' | 'useEnergyBar' | 'openChest' | 'endDay'
  | 'petWhiskers' | 'feedWhiskers' | 'treatWhiskers';

export interface SurvivalSnapshot {
  // Keep existing fields.
  readonly captainWhiskers: Readonly<CaptainWhiskersSnapshot> | null;
}
```

Add `initialCaptainWhiskers?: Partial<CaptainWhiskersSnapshot>` to `SurvivalSessionOptions` for tests.

- [ ] **Step 4: Implement item-to-companion conversion**

Copy the input list once. Detect `captainWhiskers`. Filter it from the list passed to `SurvivalInventoryState` and from `snapshot.savedItems`. Create companion state only when the saved item exists.

```ts
const hasCaptainWhiskers = savedItems.some(({ type }) => type === 'captainWhiskers');
this.savedItems = Object.freeze(savedItems
  .filter(({ type }) => type !== 'captainWhiskers')
  .map((item) => Object.freeze({ ...item })));
this.captainWhiskers = hasCaptainWhiskers
  ? createCaptainWhiskersState(options.initialCaptainWhiskers)
  : null;
```

- [ ] **Step 5: Write failing care-action tests**

Cover accepted Pet, Feed, and Treat. Cover once-per-day Pet, full hunger, missing Food, healthy state, missing Medkit, dead companion, absent companion, night state, and fishing-in-progress.

```ts
expect(session.perform('feedWhiskers')).toMatchObject({
  accepted: true, code: 'whiskers-fed', deltas: { food: -1 },
});
expect(session.snapshot().captainWhiskers?.hunger).toBe(5);
```

- [ ] **Step 6: Implement action availability and outcomes**

Use exact rejection codes and messages:

- `no-captain-whiskers`: `Captain Whiskers is not aboard.`
- `captain-whiskers-dead`: `Captain Whiskers cannot respond.`
- `already-petted`: `Captain Whiskers has already been petted today.`
- `whiskers-not-hungry`: `Captain Whiskers is already satiated.`
- `no-food`: `No food remains.`
- `whiskers-healthy`: `Captain Whiskers needs no treatment.`
- `no-medical-kit`: `No medical kit remains.`

Consume one Food for Feed. Consume one usable `medicalKit` for Treat. Use no Energy. Return `cue: 'none'`.

- [ ] **Step 7: Integrate companion dawn processing and journal records**

Call `advanceCaptainWhiskersDawn` inside `beginDawn` after item breaks and before rescue selection. Invalidate the cached snapshot after every companion change. Record accepted actions and dawn status or death in the journal with short cat-specific text.

- [ ] **Step 8: Run session and journal tests**

Run: `bun run test -- tests/CaptainWhiskersState.test.ts tests/SurvivalSession.test.ts tests/survivalInventory.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit safe files**

```powershell
git add -- src/survival/survivalTypes.ts src/survival/SurvivalSession.ts src/survival/journal.ts tests/SurvivalSession.test.ts tests/survivalInventory.test.ts
git commit -m "feat: integrate Captain Whiskers care"
```

Skip paths with prior edits. Do not include unrelated staged content.

---

### Task 3: Passive fishing luck

**Files:**
- Modify: `src/survival/fishingCatalog.ts`
- Modify: `src/survival/FishingSession.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/FishingCatalog.test.ts`
- Modify: `tests/FishingSession.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Consumes: `SurvivalSnapshot.captainWhiskers.alive` from Task 2.
- Produces: `FishingSessionOptions.fishWeightMultiplier?: number` and optional multiplier arguments on catch weighting and selection.

- [ ] **Step 1: Write failing fish-only multiplier tests**

```ts
const weighted = eligibleFishingCatches(3, false, new Set(), 1.01);
expect(weighted.find(({ catch }) => catch.id === 'cod')?.weight).toBeCloseTo(20.2);
expect(weighted.find(({ catch }) => catch.id === 'seaweed')?.weight).toBe(82);
```

Also confirm bait applies first: a baited cod has weight `40.4`. Reject non-finite or non-positive multipliers.

- [ ] **Step 2: Run focused fishing tests and confirm signature failures**

Run: `bun run test -- tests/FishingCatalog.test.ts tests/FishingSession.test.ts`

Expected: FAIL because the multiplier input does not exist.

- [ ] **Step 3: Implement fish-only weighting**

```ts
function catchWeight(
  definition: FishingCatchDefinition,
  capturedBait: boolean,
  fishWeightMultiplier: number,
): number {
  const baited = baitWeight(definition, capturedBait);
  return definition.kind === 'fish' ? baited * fishWeightMultiplier : baited;
}
```

Add the multiplier as the last argument to `eligibleFishingCatches` and `selectFishingCatch`. Default it to `1`.

- [ ] **Step 4: Pass the live companion multiplier into fishing**

Add `fishWeightMultiplier?: number` to `FishingSessionOptions`. Pass it to `selectFishingCatch`. In `SurvivalSession.beginFishing`, pass `1.01` only when Whiskers exists and is alive.

- [ ] **Step 5: Add absent and dead integration tests**

Use identical deterministic rolls for sessions with living, dead, and absent Whiskers. Assert only the living session sends `1.01` to catch selection.

- [ ] **Step 6: Run fishing and session tests**

Run: `bun run test -- tests/FishingCatalog.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit safe fishing files**

```powershell
git add -- src/survival/fishingCatalog.ts src/survival/FishingSession.ts src/survival/SurvivalSession.ts tests/FishingCatalog.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: add Whiskers fishing luck"
```

Skip paths with prior edits.

---

### Task 4: Crewmate event rules

**Files:**
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/events.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Consumes: companion state and wellness from Tasks 1 and 2.
- Produces: `requiresLivingCompanion`, typed companion event effects, `nextDawnEnergy`, `followUpNight`, and `SurvivalEndingReason`.

- [ ] **Step 1: Write failing eligibility and catalog tests**

Test these exact catalog values:

```ts
expect(survivalEventById('sick-companion')).toMatchObject({
  earliestDay: 5, weight: 6, cooldownDays: 26, requiresLivingCompanion: true,
});
expect(survivalEventById('shadow-figure')).toMatchObject({
  earliestDay: 20, minimumPressure: 3, weight: 4, cooldownDays: 30,
});
expect(survivalEventById('sea-watcher')).toMatchObject({
  earliestDay: 20, minimumPressure: 2, weight: 9, cooldownDays: 40,
});
expect(survivalEventById('guarded-sleep')).toMatchObject({
  earliestDay: 7, weight: 50, cooldownDays: 0,
});
```

Confirm these events and `swarm-of-anglerfish` are ineligible without living Whiskers.

- [ ] **Step 2: Run event tests and confirm missing-event failures**

Run: `bun run test -- tests/survivalEvents.test.ts`

Expected: FAIL because the new event IDs and requirement do not exist.

- [ ] **Step 3: Add strict event contracts and validators**

```ts
export type CompanionEventEffect =
  | { readonly kind: 'sickness'; readonly operation: 'add' | 'set'; readonly value: number }
  | { readonly kind: 'kill'; readonly cause: 'sea-watcher' };

export type SurvivalEndingReason = 'standard' | 'kidnapped';

export interface EventEffects {
  // Keep existing fields.
  readonly companion?: readonly CompanionEventEffect[];
  readonly nextDawnEnergy?: 0;
  readonly followUpNight?: true;
  readonly endingReason?: 'kidnapped';
}

export interface SurvivalEventDefinition {
  // Keep existing fields.
  readonly requiresLivingCompanion?: boolean;
}

export interface EventChoiceDefinition {
  // Keep existing fields.
  readonly companionAction?: 'delegateWhiskers';
}

export interface EventEligibility {
  // Keep existing fields.
  readonly hasLivingCompanion?: boolean;
}

export interface SurvivalSnapshot {
  // Keep existing fields.
  readonly endingReason: SurvivalEndingReason;
}
```

Reject unknown keys, invalid operations, non-integer sickness values, invalid death causes, and non-boolean requirements.

- [ ] **Step 4: Add exact event choices and outcomes**

Use the approved spec values. Use item IDs `medicalKit`, `energyBar`, `ductTape`, `spyglass`, `flashlight`, and `flareGun`.

- Sick Companion: Medkit is consumed and cures; Energy Bar is consumed with no need change; Duct Tape is consumed and uses weights `80` for sickness `+1` and `10` for no change; Sleep adds `2` sickness.
- Shadow Figure: Spyglass adds one pressure; Flashlight weights `50/50` between pressure `+1` and kidnapped death; Flare Gun is consumed and causes kidnapped death; Sleep changes no rule.
- Sea Watcher: Stay Awake sets next dawn Energy to zero; Sleep weights `90/10` between Whiskers death and no change.
- Guarded Sleep: Watch weights `85/15` between peaceful completion and follow-up night selection; Sleep Normally always requests follow-up night selection.

Add `requiresLivingCompanion: true` to `swarm-of-anglerfish`.

- [ ] **Step 5: Implement event application and follow-up selection**

Apply companion effects through `killCaptainWhiskers`, sickness clamping, and snapshot invalidation. Store a one-use `nextDawnEnergyOverride`. Set and expose `endingReason` when kidnapped. Select a follow-up night event with `guarded-sleep` excluded.

For Drifting Loot, add a `delegate-whiskers` contextual choice. Give it the same reward weights as `retrieve`, without the Energy subtraction. Mark the choice with typed companion action `delegateWhiskers`. Reject it when wellness is below four and return a label-based reason.

- [ ] **Step 6: Write deterministic outcome tests**

Cover every event choice. Cover the `0.85`, `0.90`, and `0.50` boundaries. Confirm Guarded Sleep cannot select itself as the follow-up. Confirm Sea Watcher does not end the player's run. Confirm kidnapped outcomes set player state `dead` and reason `kidnapped`.

- [ ] **Step 7: Run event and session tests**

Run: `bun run test -- tests/survivalEvents.test.ts tests/SurvivalSession.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit safe event-rule files**

```powershell
git add -- src/survival/survivalTypes.ts src/survival/events.ts src/survival/SurvivalSession.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: add Captain Whiskers crewmate events"
```

Skip paths with prior edits.

---

### Task 5: Companion model and keyed motion

**Files:**
- Create: `src/survival/captainWhiskersMotion.ts`
- Create: `src/survival/CaptainWhiskersPresentation.ts`
- Create: `tests/CaptainWhiskersPresentation.test.ts`
- Modify: `src/survival/BoatInteraction.ts`
- Modify: `src/survival/BoatSupplyDisplay.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: `CaptainWhiskersSnapshot`, `PropModelLibrary.createPresentation`, and `boatStorageTransform`.
- Produces: `CaptainWhiskersPresentation.sync`, `play`, `update`, `interactionRoot`, and `dispose`; `BoatInteractionAnchor.companionId`.

- [ ] **Step 1: Write failing pure motion tests**

```ts
const pose = createCaptainWhiskersPose();
sampleCaptainWhiskersPoseInto(pose, {
  status: 'hungry', action: 'pet', elapsed: 0.25, duration: 0.8,
});
expect(pose.headPitch).toBeLessThan(0);
expect(pose.actionLean).toBeGreaterThan(0);
```

Test state priority: sick, starving, unhappy, healthy. Test base restoration at action completion. Reuse one mutable pose object.

- [ ] **Step 2: Run presentation tests and confirm missing modules**

Run: `bun run test -- tests/CaptainWhiskersPresentation.test.ts`

Expected: FAIL because the motion and presentation modules do not exist.

- [ ] **Step 3: Implement allocation-free pose sampling**

Use a `MutableCaptainWhiskersPose` with numeric fields. Sample anticipation, decisive travel, short hold, and settle. Do not create vectors, arrays, or objects inside `sampleCaptainWhiskersPoseInto`.

- [ ] **Step 4: Build the owned companion presentation**

Create the Whiskers model with:

```ts
propModels.createPresentation({
  instanceId: 'captainWhiskers-1' as ItemInstanceId,
  type: 'captainWhiskers',
});
```

Place it with `boatStorageTransform`. Create a small low-poly petting hand with a palm, thumb, three joined finger forms, and one sleeve cuff. Keep it hidden outside Pet playback. Use a small food prop during Feed.

Collect the hand and food geometry and materials. Dispose them once. Call the model presentation's `dispose()` once.

- [ ] **Step 5: Add sync, action, and death tests**

Confirm living state shows the model. Confirm dead and absent state hide it and remove interaction. Confirm Pet and Feed play, settle, and restore. Confirm repeated `dispose()` is safe.

- [ ] **Step 6: Integrate the presentation into BoatWorld**

Construct one hidden `CaptainWhiskersPresentation`. Add its root to the boat. Call `sync(snapshot.captainWhiskers)` in `syncInventory`. Call `update(delta)` in the existing update path. Dispose it in constructor rollback and normal disposal.

Pass `this.session.snapshot().savedItems` into `BoatWorld`, not the unfiltered constructor argument. In `BoatSupplyDisplay`, use a zero-size copy pool for `captainWhiskers`. This prevents a second hidden cat model from remaining in the normal item display.

Add this anchor field:

```ts
readonly companionId?: 'captainWhiskers';
```

Project a `captain-whiskers` anchor from `interactionRoot`. Use label `CAPTAIN WHISKERS` and description `Check his hunger, happiness, and health.` Show it only while alive.

- [ ] **Step 7: Run model and world tests**

Run: `bun run test -- tests/CaptainWhiskersPresentation.test.ts tests/BoatWorld.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit safe presentation files**

```powershell
git add -- src/survival/captainWhiskersMotion.ts src/survival/CaptainWhiskersPresentation.ts src/survival/BoatInteraction.ts src/survival/BoatSupplyDisplay.ts src/survival/BoatWorld.ts tests/CaptainWhiskersPresentation.test.ts tests/BoatWorld.test.ts
git commit -m "feat: present Captain Whiskers as crewmate"
```

Skip paths with prior edits.

---

### Task 6: Scene-linked status card

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: companion snapshot, status labels, action reasons, and companion anchor from earlier tasks.
- Produces: anchored status card, focus flow, action dispatch, and Whiskers action presentation calls.

- [ ] **Step 1: Write failing status-card DOM tests**

Open the card through the companion anchor. Assert these visible values:

```ts
expect(card.querySelector('[data-whiskers-hunger-label]')?.textContent).toBe('PECKISH');
expect(card.querySelectorAll('[data-whiskers-hunger-step][data-filled="true"]')).toHaveLength(4);
expect(card.querySelector('[data-whiskers-happiness]')?.textContent).toBe('LONELY');
expect(card.querySelector('[data-whiskers-health]')?.textContent).toBe('SICK');
expect(card.textContent).toContain("SHIP'S CAT: Slightly improves fishing luck");
```

Test Enter and Space opening, Escape closing, outside-click closing, Close, focus restoration, and exact unavailable reasons.

- [ ] **Step 2: Run UI tests and confirm missing-card failures**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: FAIL because the companion anchor does not open a status card.

- [ ] **Step 3: Add the compact anchored card markup**

Add a non-modal `<section data-whiskers-card>` inside the survival UI root. Include three status rows, five hunger marks, Pet, Feed, Treat, Close, and passive text. Keep the card out of `modalLayers`.

Use `data-action="petWhiskers"`, `feedWhiskers`, and `treatWhiskers` on care controls. Reuse `onAction` dispatch and exact `availableReason` results.

- [ ] **Step 4: Position and manage the card**

When `setAnchors` receives `companionId: 'captainWhiskers'`, position the card beside that anchor. Clamp it to viewport gutters. Close it if the anchor disappears, an event opens, pause opens, or Whiskers dies.

Store the anchor button as the focus-return target. Move focus to Pet when opening. Restore focus on close when the anchor remains.

- [ ] **Step 5: Add authored card styling**

Use one compact ink-backed weathered-paper metaphor. Keep the center clear. Use stable hunger marks, strong text labels, visible focus, and shape plus text for danger. Add a short paper snap and imperfect settle. Do not add constant motion.

- [ ] **Step 6: Connect action presentation in SurvivalPhase**

After accepted `petWhiskers` or `feedWhiskers`, call `world.playCaptainWhiskersAction(action)`. Sync the new snapshot before UI render. Keep rejected actions in the existing feedback path.

- [ ] **Step 7: Pass kidnapped ending copy**

Extend `showEnding` with `endingReason`. Use title `Taken in the dark.` and body `The false shape carries you beyond the lantern light.` for `kidnapped`.

- [ ] **Step 8: Run UI and phase tests**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit safe UI files**

```powershell
git add -- src/ui/SurvivalUI.ts src/styles/main.css src/survival/SurvivalPhase.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: add Captain Whiskers status card"
```

Skip paths with prior edits.

---

### Task 7: Crewmate event presentation

**Files:**
- Create: `src/survival/events/CaptainWhiskersEventPresentation.ts`
- Create: `tests/CaptainWhiskersEventPresentation.test.ts`
- Modify: `src/survival/eventPresentationTypes.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: `CaptainWhiskersPresentation`, dedicated event contracts, current camera, boat roots, and owned model clone rules.
- Produces: dedicated presentation support for `sick-companion`, `shadow-figure`, `sea-watcher`, and `guarded-sleep`.

- [ ] **Step 1: Write failing event-presentation tests**

Test one visible authored state per event:

- Sick Companion turns the camera toward the sick Whiskers pose.
- Shadow Figure shows a separate dark false-cat silhouette.
- Sea Watcher shows restrained eye forms around the boat.
- Guarded Sleep holds an alert Whiskers pose.

Confirm every `clear`, visibility-settle, and `dispose` path restores the base companion state.

- [ ] **Step 2: Run the new tests and confirm missing-module failures**

Run: `bun run test -- tests/CaptainWhiskersEventPresentation.test.ts`

Expected: FAIL because the presenter does not exist.

- [ ] **Step 3: Add dedicated event IDs and environment access**

Add the four event IDs to `DEDICATED_EVENT_IDS`. Extend `DedicatedEventEnvironment` with:

```ts
readonly captainWhiskers: CaptainWhiskersPresentation;
```

Pass the presentation from `BoatWorld` into `createDedicatedEventCoordinator`.

- [ ] **Step 4: Implement the four event visual modes**

Use one presenter class parameterized by event ID. Reuse the real companion root for Sick Companion and Guarded Sleep. Use one owned Whiskers clone with dark value treatment for Shadow Figure. Build Sea Watcher eyes from a small pooled geometry and material set. Do not allocate during `update`.

Use keyed anticipation, decisive reveal, short hold, and clean restoration. Keep normal ocean and boat motion on the shared wave field.

- [ ] **Step 5: Register and route the presenters**

Instantiate four presenters in `createDedicatedEventCoordinator`. Route reveal, choice, result, clear, skip, visibility settle, update, and dispose through the existing `EventPresentationCoordinator`.

- [ ] **Step 6: Add Drifting Loot delegation choreography**

On accepted `delegate-whiskers`, animate Whiskers toward the gunwale, pull the barrel or crate inward, return Whiskers to his base pose, and show the existing reward result. Keep the rule outcome in `SurvivalSession`.

- [ ] **Step 7: Run event, world, and phase tests**

Run: `bun run test -- tests/CaptainWhiskersEventPresentation.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit safe event-presentation files**

```powershell
git add -- src/survival/events/CaptainWhiskersEventPresentation.ts src/survival/eventPresentationTypes.ts src/survival/BoatWorld.ts src/survival/SurvivalPhase.ts tests/CaptainWhiskersEventPresentation.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: stage Captain Whiskers events"
```

Skip paths with prior edits.

---

### Task 8: Full integration and verification

**Files:**
- Modify: `README.md`
- Modify: `tests/launchGame.test.ts`
- Modify: any feature test from Tasks 1 through 7 only when verification finds a feature defect.

**Interfaces:**
- Consumes: all prior task deliverables.
- Produces: one verified player flow and current feature documentation.

- [ ] **Step 1: Add an end-to-end lifecycle test**

Create a launch flow with saved Captain Whiskers, Food, and Medkit. Confirm the survival session creates the companion, world exposes the anchor, UI opens the card, Feed changes state, dawn changes needs deterministically, fishing receives the bonus, and disposal completes once.

- [ ] **Step 2: Update README scope and controls**

Replace the statement that excludes crewmate systems. Document Captain Whiskers as the only crewmate. Document Check Status, Pet, Feed, Treat, passive fishing luck, and crewmate event risk.

- [ ] **Step 3: Run all focused feature tests**

Run:

```powershell
bun run test -- tests/CaptainWhiskersState.test.ts tests/CaptainWhiskersPresentation.test.ts tests/CaptainWhiskersEventPresentation.test.ts tests/FishingCatalog.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/launchGame.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run static checks and the full suite**

Run: `bun run typecheck`

Expected: PASS.

Run: `bun run test`

Expected: PASS.

Run: `bun run build`

Expected: PASS.

- [ ] **Step 5: Inspect the running game**

Run: `bun run dev`

Verify these states at normal play distance:

- Satiated, hungry, unhappy, and sick poses remain readable.
- The status card stays beside Whiskers and keeps the center clear.
- Pointer and keyboard flows both work.
- Pet, Feed, Treat, delegation, and death restore base state cleanly.
- Event staging does not hide required choices or status text.

- [ ] **Step 6: Inspect the final diff**

Run: `git diff --check`

Run: `git status --short`

Confirm no unrelated file entered the feature diff. Confirm every created Three.js resource has one disposal call.

- [ ] **Step 7: Commit safe final files**

```powershell
git add -- README.md tests/launchGame.test.ts
git commit -m "docs: describe Captain Whiskers companion"
```

Skip paths with prior edits. Do not stage unrelated changes.
