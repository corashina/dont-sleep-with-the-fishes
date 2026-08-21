# Baseline and Survival Domain Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a green baseline and separate survival catalog, selection, outcome, journal, and action rules from `SurvivalSession`.

**Architecture:** `SurvivalSession` remains the only mutable gameplay-state owner. Extracted modules are pure and receive immutable inputs. Delete `events.ts` after all consumers use focused modules.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Three.js 0.180, Vite 7

**Spec:** `docs/superpowers/specs/2026-08-21-code-refactor-design.md`

## Global Constraints

- Preserve gameplay, visuals, balance, assets, controls, and player-facing behavior.
- Do not add dependencies.
- Do not add compatibility layers, re-export shims, or obsolete paths.
- Keep `SurvivalSession` as the only owner of mutable gameplay state.
- Domain modules must not import DOM or Three.js modules.
- Keep every completed task type-safe, testable, and buildable.

---

### Task 1: Restore the Flare-Gun Baseline

**Files:**
- Modify: `src/survival/eventItemUseChoreography.ts`
- Modify: `tests/FlareGunItemUseAnimation.test.ts`

**Interfaces:**
- Consumes: `sampleEventItemUse(context, itemId, progress, output)`
- Produces: A raised flare-gun barrel direction with `y` between `0.25` and `0.4`, and `z` below `-0.9`.

- [ ] **Step 1: Strengthen the failing pose test**

Keep the direction assertions. Replace the sign-only lift assertion with magnitude progress:

```ts
expect(Math.abs(starting.roll)).toBe(0);
expect(Math.abs(lifting.roll)).toBeGreaterThan(0);
expect(Math.abs(lifting.roll)).toBeLessThan(Math.abs(raised.roll));
expect(lifting.pitch).toBeLessThan(0);
```

- [ ] **Step 2: Run the focused test and confirm the baseline failure**

Run: `npm test -- tests/FlareGunItemUseAnimation.test.ts`

Expected: one failure at the positive barrel-height assertion.

- [ ] **Step 3: Correct the ready grip constants**

Use one named ready rotation and preserve the recoil offsets:

```ts
const FLARE_GUN_READY_YAW = Math.PI / 2 + 0.22;
const FLARE_GUN_READY_PITCH = -1.25;
const FLARE_GUN_READY_ROLL = -Math.PI / 2;

output.pitch = FLARE_GUN_READY_PITCH * ready + 0.16 * recoil;
output.yaw = FLARE_GUN_READY_YAW * ready - 0.16 * recoil;
output.roll = FLARE_GUN_READY_ROLL * ready - 0.06 * recoil;
```

- [ ] **Step 4: Run flare-gun and item-use tests**

Run: `npm test -- tests/FlareGunItemUseAnimation.test.ts tests/EventItemUseController.test.ts tests/EventItemUseAdapter.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Run the full baseline suite**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 6: Commit the baseline correction**

```bash
git add src/survival/eventItemUseChoreography.ts tests/FlareGunItemUseAnimation.test.ts
git commit -m "fix: restore flare gun firing pose"
```

---

### Task 2: Split the Event Catalog

**Files:**
- Create: `src/survival/eventCatalog.ts`
- Create: `src/survival/eventCatalogValidation.ts`
- Create: `src/survival/eventSelection.ts`
- Delete: `src/survival/events.ts`
- Modify: every TypeScript file returned by `rg -l "from './events'|from '../src/survival/events'|from '../survival/events'" src tests`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/eventResolver.test.ts`

**Interfaces:**
- Produces from `eventCatalog.ts`: `SURVIVAL_EVENT_IDS`, `SurvivalEventId`, drifting-event types and helpers, `SURVIVAL_EVENTS`, `survivalEventById`.
- Produces from `eventCatalogValidation.ts`: `validateSurvivalEventCatalog(events): void`.
- Produces from `eventSelection.ts`: `EventEligibility`, `eligibleEvents`, `drawWeightedEvent`.

- [ ] **Step 1: Add focused import-boundary tests**

Update catalog tests to import the focused modules:

```ts
import {
  SURVIVAL_EVENTS,
  survivalEventById,
} from '../src/survival/eventCatalog';
import { validateSurvivalEventCatalog } from '../src/survival/eventCatalogValidation';
import { eligibleEvents } from '../src/survival/eventSelection';
```

Add a source-boundary assertion:

```ts
expect(existsSync(new URL('../src/survival/events.ts', import.meta.url))).toBe(false);
```

- [ ] **Step 2: Run catalog tests and confirm missing modules**

Run: `npm test -- tests/survivalEvents.test.ts tests/eventResolver.test.ts`

Expected: module-resolution failures for the three new files.

- [ ] **Step 3: Create `eventCatalog.ts`**

Move these declarations without changing their values:

Move `SURVIVAL_EVENT_IDS`, `SurvivalEventId`, `DriftingCargoEventId`,
`DriftingItemEventId`, `SURVIVAL_EVENTS`, and `survivalEventById` without
changing any event identifier, definition, weight, requirement, effect, or
presentation key.

Move `isDriftingCargoEventId`, `isDriftingItemEventId`,
`driftingItemRetrieveKey`, `driftingItemLeaveKey`, and
`driftingCargoKindForEvent` with the catalog.

- [ ] **Step 4: Create `eventCatalogValidation.ts`**

Move validation helpers and expose one entry:

Export `validateSurvivalEventCatalog(
events: readonly SurvivalEventDefinition[]): void`. Move every existing
exact-key, range, mutation, outcome, and uniqueness check without changing
its error message.

The module imports only catalog types, item identifiers, and survival types.

- [ ] **Step 5: Create `eventSelection.ts`**

Move eligibility, fallback, and weighted draw logic:

```ts
export interface EventEligibility {
  readonly day: number;
  readonly phase: 'day' | 'night';
  readonly pressure: number;
  readonly lastSeenDay: ReadonlyMap<string, number>;
  readonly appearanceCounts: ReadonlyMap<string, number>;
  readonly excludedIds?: ReadonlySet<string>;
}

export function eligibleEvents(
  events: readonly SurvivalEventDefinition[],
  eligibility: EventEligibility,
): readonly SurvivalEventDefinition[];

export function drawWeightedEvent(
  random: RandomSource,
  events: readonly SurvivalEventDefinition[],
  eligibility: EventEligibility,
): SurvivalEventDefinition;
```

- [ ] **Step 6: Update all consumers and delete `events.ts`**

Use symbol ownership to choose imports. Do not create a barrel file.

Run: `rg -n "from './events'|from '../src/survival/events'|from '../survival/events'" src tests`

Expected: no matches.

- [ ] **Step 7: Run focused and full tests**

Run: `npm test -- tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/SurvivalSession.test.ts tests/EventPresentationRoutes.test.ts`

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 8: Commit the catalog split**

```bash
git add src/survival tests
git commit -m "refactor: separate survival event catalog"
```

---

### Task 3: Extract Event Outcome Calculations

**Files:**
- Create: `src/survival/eventOutcomeRules.ts`
- Create: `tests/EventOutcomeRules.test.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Produces: `resolveIntegerValue`, `eventResourceDelta`, and `clampSurvivalResources`.
- `SurvivalSession` continues to apply inventory mutations and own all mutable values.

- [ ] **Step 1: Add failing pure-rule tests**

```ts
import {
  clampSurvivalResources,
  eventResourceDelta,
  resolveIntegerValue,
} from '../src/survival/eventOutcomeRules';

it('resolves bounded values through the provided random source', () => {
  expect(resolveIntegerValue({ min: 2, max: 4 }, { next: () => 0 })).toBe(2);
  expect(resolveIntegerValue({ min: 2, max: 4 }, { next: () => 0.999 })).toBe(4);
});

it('converts add, subtract, and set operations to deltas', () => {
  expect(eventResourceDelta(
    { resource: 'energy', operation: 'add', value: 2 }, 1, 'day', 1,
  )).toBe(2);
  expect(eventResourceDelta(
    { resource: 'energy', operation: 'subtract', value: 2 }, 3, 'day', 1,
  )).toBe(-2);
  expect(eventResourceDelta(
    { resource: 'energy', operation: 'set', value: 2 }, 3, 'day', 1,
  )).toBe(-1);
});

it('clamps survival resources to their current limits', () => {
  expect(clampSurvivalResources({ health: 12, hunger: -2, energy: 4, hull: 15 }))
    .toEqual({ health: 10, hunger: 0, energy: 3, hull: 10 });
});
```

- [ ] **Step 2: Run the new test and confirm missing exports**

Run: `npm test -- tests/EventOutcomeRules.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement pure outcome rules**

```ts
export function resolveIntegerValue(value: IntegerValue, random: RandomSource): number {
  if (typeof value === 'number') return value;
  return value.min + Math.floor(random.next() * (value.max - value.min + 1));
}

export function eventResourceDelta(
  effect: ResourceEffect & { readonly value: number },
  current: number,
  phase: SurvivalEventDefinition['phase'],
  day: number,
): number {
  const raw = effect.operation === 'set'
    ? effect.value - current
    : effect.operation === 'add' ? effect.value : -effect.value;
  return phase === 'night'
    && effect.operation === 'subtract'
    && (effect.resource === 'health' || effect.resource === 'hull')
    ? raw * nightDamageMultiplier(day)
    : raw;
}
```

Implement `clampSurvivalResources` with the existing balance limits. Reuse `SURVIVAL_BALANCE` values.

- [ ] **Step 4: Delegate calculations from `SurvivalSession`**

Replace local integer resolution, resource delta calculation, and meter-clamp
math with the new functions. Keep sequential delta application, inventory
writes, chest writes, pending dawn writes, and cache invalidation in
`SurvivalSession`.

- [ ] **Step 5: Run outcome and session tests**

Run: `npm test -- tests/EventOutcomeRules.test.ts tests/SurvivalSession.test.ts tests/eventResolver.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the pure outcome rules**

```bash
git add src/survival/eventOutcomeRules.ts src/survival/SurvivalSession.ts tests/EventOutcomeRules.test.ts tests/SurvivalSession.test.ts
git commit -m "refactor: extract survival outcome rules"
```

---

### Task 4: Extract Journal Calculations

**Files:**
- Create: `src/survival/journalRecords.ts`
- Create: `tests/JournalRecords.test.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/journal.ts`

**Interfaces:**
- Produces: immutable clone and snapshot functions for journal records.
- `journal.ts` keeps display formatting only.

- [ ] **Step 1: Add immutable journal tests**

```ts
import { cloneJournalEntry, journalSnapshot } from '../src/survival/journalRecords';

it('clones nested journal mutations', () => {
  const clone = cloneJournalEntry(entryFixture);
  expect(clone).toEqual(entryFixture);
  expect(clone).not.toBe(entryFixture);
  expect(clone.night).not.toBe(entryFixture.night);
});

it('freezes the returned journal snapshot', () => {
  const snapshot = journalSnapshot([entryFixture]);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot[0])).toBe(true);
});
```

- [ ] **Step 2: Run the test and confirm missing exports**

Run: `npm test -- tests/JournalRecords.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Move record cloning into `journalRecords.ts`**

```ts
export function cloneJournalEntry(entry: JournalEntry): JournalEntry;
export function cloneJournalNight(record: JournalNightRecord): JournalNightRecord;
export function cloneJournalActions(
  actions: readonly JournalDayActionRecord[],
): readonly JournalDayActionRecord[];
export function journalSnapshot(entries: readonly JournalEntry[]): readonly JournalEntry[];
```

Use `Object.freeze` at the same boundaries as the current session snapshots.

- [ ] **Step 4: Delegate from `SurvivalSession`**

Delete session-local clone methods. Import the four pure functions. Keep journal timing and pending-record ownership in the session.

- [ ] **Step 5: Run journal, session, and UI tests**

Run: `npm test -- tests/JournalRecords.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the journal split**

```bash
git add src/survival/journal.ts src/survival/journalRecords.ts src/survival/SurvivalSession.ts tests/JournalRecords.test.ts
git commit -m "refactor: separate survival journal records"
```

---

### Task 5: Extract Day-Action Availability and Resource Effects

**Files:**
- Create: `src/survival/dayActionRules.ts`
- Create: `tests/DayActionRules.test.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Produces: immutable `DayActionRuleState`, `dayActionUnavailableReason`, and `dayActionResourceDelta`.
- `SurvivalSession` builds the state and applies accepted effects.

- [ ] **Step 1: Add table-driven availability tests**

```ts
import { dayActionUnavailableReason } from '../src/survival/dayActionRules';

it.each([
  ['eat', { food: 0 }, 'No food remains.'],
  ['repair', { repairMaterial: 0 }, 'No repair material remains.'],
  ['fish', { energy: 0 }, 'Fishing requires one energy.'],
] as const)('rejects %s when its supply is empty', (action, patch, message) => {
  expect(dayActionUnavailableReason({ ...baseRuleState, ...patch }, action)).toBe(message);
});

it('computes normal action resource effects', () => {
  expect(dayActionResourceDelta(baseRuleState, 'eat')).toEqual({ hunger: -35, food: -1 });
  expect(dayActionResourceDelta(baseRuleState, 'sendMessage')).toEqual({
    energy: -1,
    rescueProgress: 15,
  });
});
```

These values match the current `SURVIVAL_BALANCE` constants.

Copy the current exact rejection messages into the table.

- [ ] **Step 2: Run the test and confirm missing exports**

Run: `npm test -- tests/DayActionRules.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement the immutable rule input**

```ts
export interface DayActionRuleState {
  readonly state: SurvivalState;
  readonly activeFishing: boolean;
  readonly actedToday: boolean;
  readonly weather: WeatherId;
  readonly rescueMessageSent: boolean;
  readonly energy: number;
  readonly hunger: number;
  readonly hull: number;
  readonly food: number;
  readonly bait: number;
  readonly repairMaterial: number;
  readonly chestState: ChestState;
  readonly inventory: SurvivalInventorySnapshot;
  readonly carlitos: Readonly<CarlitosState> | null;
}

export function dayActionUnavailableReason(
  state: DayActionRuleState,
  action: DayActionId,
  option?: DayActionOption,
): string | null;

export function dayActionResourceDelta(
  state: DayActionRuleState,
  action: Exclude<DayActionId, 'fish' | 'dive' | 'openChest'
    | 'repairItem' | 'petCarlitos' | 'feedCarlitos' | 'treatCarlitos' | 'endDay'>,
  option?: DayActionOption,
): Readonly<ResourceDelta>;
```

Move existing availability branches and deterministic resource calculations
unchanged. Keep random dive and chest rewards, inventory mutations, companion
state mutations, and all effect application in `SurvivalSession`.

- [ ] **Step 4: Delegate `availableReason` from the session**

Add one private `dayActionRuleState()` snapshot builder. Replace session-local
availability branches with `dayActionUnavailableReason`. Use
`dayActionResourceDelta` from accepted deterministic action methods before
calling `commit`.

- [ ] **Step 5: Run domain tests and verification**

Run: `npm test -- tests/DayActionRules.test.ts tests/SurvivalSession.test.ts tests/survivalInventory.test.ts tests/FishingSession.test.ts`

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 6: Commit the action rules**

```bash
git add src/survival/dayActionRules.ts src/survival/SurvivalSession.ts tests/DayActionRules.test.ts tests/SurvivalSession.test.ts
git commit -m "refactor: extract survival day action rules"
```

---

### Task 6: Extract Fishing Settlement Rules

**Files:**
- Create: `src/survival/fishingSettlementRules.ts`
- Create: `tests/FishingSettlementRules.test.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Produces: immutable `FishingSettlement` and `fishingSettlement`.
- `SurvivalSession` keeps active attempt ownership and applies the returned item reward.

- [ ] **Step 1: Add pure settlement tests**

```ts
const cod = FISHING_CATCHES.find(({ id }) => id === 'cod');
if (cod === undefined) throw new Error('Missing cod fishing fixture.');
const settlement = fishingSettlement({ kind: 'catch', catch: cod }, true);
expect(settlement).toMatchObject({
  code: 'fish-caught',
  message: 'You caught a cod.',
  deltas: { food: 1, bait: -1 },
  food: 1,
  baitConsumed: true,
  itemReward: null,
});
expect(fishingSettlement({ kind: 'miss' }, false)).toMatchObject({
  code: 'fish-missed',
  message: 'The fish got away.',
  deltas: {},
});
```

- [ ] **Step 2: Run the test and confirm the missing module**

Run: `npm test -- tests/FishingSettlementRules.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement the immutable result**

```ts
export interface FishingSettlement {
  readonly code: 'fish-missed' | 'fish-caught' | 'utility-caught' | 'junk-caught';
  readonly message: string;
  readonly deltas: Readonly<ResourceDelta>;
  readonly food: number;
  readonly baitConsumed: boolean;
  readonly itemReward: Readonly<{ itemId: ItemId; condition: ItemCondition }> | null;
}

export function fishingSettlement(
  result: FishingTerminalResult,
  capturedBait: boolean,
): FishingSettlement;
```

Derive code, message, food, bait use, bait gain, and item reward exactly as
the current `finishFishing` method does. Freeze the result and nested deltas.

- [ ] **Step 4: Delegate settlement from `SurvivalSession`**

Keep attempt identifier and terminal-state validation in the session. Apply
the returned resource deltas through `commit`. Apply a non-null item reward
through the inventory. Build the existing journal action from the returned
food and bait values.

- [ ] **Step 5: Run fishing and session tests**

Run: `npm test -- tests/FishingSettlementRules.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit fishing settlement rules**

```bash
git add src/survival/fishingSettlementRules.ts src/survival/SurvivalSession.ts tests/FishingSettlementRules.test.ts tests/SurvivalSession.test.ts
git commit -m "refactor: extract fishing settlement rules"
```

---

### Task 7: Verify Domain Boundaries

**Files:**
- Create: `tests/SurvivalDomainBoundaries.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the focused domain modules created in Tasks 2 through 5.
- Produces: a source boundary test and updated architecture notes.

- [ ] **Step 1: Add a boundary test**

```ts
const DOMAIN_FILES = [
  'eventCatalog.ts',
  'eventCatalogValidation.ts',
  'eventSelection.ts',
  'eventOutcomeRules.ts',
  'journalRecords.ts',
  'dayActionRules.ts',
  'fishingSettlementRules.ts',
];

it('keeps domain modules independent from DOM and Three.js', () => {
  for (const file of DOMAIN_FILES) {
    const source = readFileSync(new URL(`../src/survival/${file}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]three/);
    expect(source).not.toMatch(/\b(document|window|HTMLElement)\b/);
  }
});
```

- [ ] **Step 2: Run the boundary test**

Run: `npm test -- tests/SurvivalDomainBoundaries.test.ts`

Expected: pass.

- [ ] **Step 3: Update the architecture section**

Document the focused domain files and state that `SurvivalSession` owns mutable survival state.

- [ ] **Step 4: Run final plan verification**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 5: Commit domain verification**

```bash
git add tests/SurvivalDomainBoundaries.test.ts README.md
git commit -m "test: enforce survival domain boundaries"
```
