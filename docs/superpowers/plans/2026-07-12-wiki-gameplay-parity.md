# Wiki Gameplay Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered survival constants with an auditable, checked-in wiki snapshot and implement the documented non-story items, fishing results, ordinary events, inventory conditions, and exact weighted/ranged outcomes.

**Architecture:** A typed `src/canonical` layer stores sourced values, item records, fishing records, ordinary events, and the inclusion audit. Small resolvers validate and convert those records into runtime values consumed by scavenging and a condition-aware `SurvivalSession`; UI and procedural props read the same runtime state.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.3, Bun

## Global Constraints

- Canonical source: `https://unoffdontsleepwiththefishes.fandom.com/` as reviewed on 2026-07-12.
- The shipped game remains offline and performs no runtime wiki requests.
- Exclude crewmates, passengers, character needs, dialogue, journals, lore progression, Heart of the Sea progression, endings, rescue-story chains, and events classified as story-related.
- Preserve existing behavior where the wiki is silent, incomplete, or contradictory.
- New ship items without documented weight or spawn count use weight `1` and spawn count `1` with `default` provenance.
- Ranges are inclusive integers and weighted values are relative weights, not percentages.
- Passive danger growth stays absent with `preserved` provenance because the wiki gives no rate; exact danger changes caused by included events are implemented.
- All randomness flows through `RandomSource`; tests never depend on `Math.random()`.
- Keep desktop keyboard and mouse access, focus trapping, reduced motion, and original procedural visuals.
- Do not copy wiki images, audio, or game assets.

---

## File Map

### Canonical source and validation

- Create `src/canonical/types.ts`: provenance, sourced values, integer ranges, weighted values, and canonical validation errors.
- Create `src/canonical/sources.ts`: source IDs, URLs, and snapshot date.
- Create `src/canonical/resolve.ts`: source-value and inclusive-range resolvers.
- Create `src/canonical/validate.ts`: reusable catalog validation.
- Create `src/canonical/items.ts`: item catalog plus runtime item adapter.
- Create `src/canonical/fishing.ts`: exact fish, junk, and tool catch tables.
- Create `src/canonical/events.ts`: included ordinary events and runtime adapter.
- Create `src/canonical/balance.ts`: wiki-sourced starting health/hull and preserved hunger/energy/action values.
- Create `src/canonical/parityAudit.ts`: classification of every reviewed wiki item/event.

### Runtime mechanics

- Modify `src/game/ItemState.ts`: consume canonical item records and expand `ItemId`.
- Modify `src/game/ScavengeSession.ts`: read weights from the canonical adapter.
- Modify `src/survival/survivalTypes.ts`: condition-aware inventory, danger, route, generic event choices, item mutations, ranges, and weighted outcomes.
- Modify `src/survival/inventory.ts`: create and mutate per-instance survival state.
- Create `src/survival/outcomeResolver.ts`: deterministic range, weight, delta, and item-mutation resolution.
- Modify `src/survival/SurvivalSession.ts`: canonical fishing, item actions, event eligibility/history, event choices, danger, route, day-50 damage multiplier, and broken-boat roll.
- Replace `src/survival/events.ts` with eligibility and selection helpers over canonical events.
- Modify `src/survival/survivalBalance.ts`: retain only explicitly preserved values not owned by canonical tables.

### Presentation and integration

- Modify `src/world/PropFactory.ts`: original props for new items plus a tested generic fallback.
- Modify `src/survival/BoatWorld.ts`: synchronize per-instance condition and new props.
- Modify `src/survival/BoatInteraction.ts`: map item-driven daytime actions from canonical metadata.
- Modify `src/ui/SurvivalUI.ts`: generic event-choice buttons and condition text.
- Modify `src/survival/SurvivalPhase.ts`: route generic event choices.
- Modify `README.md`: describe canonical data, included mechanics, and exclusions.

---

### Task 1: Canonical provenance and validation primitives

**Files:**
- Create: `src/canonical/types.ts`
- Create: `src/canonical/sources.ts`
- Create: `src/canonical/resolve.ts`
- Create: `src/canonical/validate.ts`
- Test: `tests/canonicalValidation.test.ts`

**Interfaces:**
- Produces: `Provenance`, `Sourced<T>`, `IntegerRange`, `Weighted<T>`, `source()`, `resolved()`, `resolveInteger()`, `drawWeighted()`, `validateRange()`, and `validateWeights()`.

- [ ] **Step 1: Write failing primitive tests**

```ts
import { describe, expect, it } from 'vitest';
import { drawWeighted, resolveInteger, resolved } from '../src/canonical/resolve';
import { validateRange, validateWeights } from '../src/canonical/validate';

describe('canonical primitives', () => {
  it('resolves provenance without losing it', () => {
    expect(resolved({ value: 35, provenance: 'wiki', source: 'events' }))
      .toEqual({ value: 35, provenance: 'wiki', source: 'events' });
  });

  it('samples inclusive integer boundaries', () => {
    expect(resolveInteger({ min: 5, max: 10 }, { next: () => 0 })).toBe(5);
    expect(resolveInteger({ min: 5, max: 10 }, { next: () => 0.999999 })).toBe(10);
  });

  it('treats weights as relative values', () => {
    const values = [{ weight: 80, value: 'safe' }, { weight: 20, value: 'hurt' }] as const;
    expect(drawWeighted(values, { next: () => 0.799999 })).toBe('safe');
    expect(drawWeighted(values, { next: () => 0.8 })).toBe('hurt');
  });

  it('rejects reversed ranges and empty or negative weight groups', () => {
    expect(() => validateRange({ min: 10, max: 5 }, 'damage')).toThrow(/damage.*range/i);
    expect(() => validateWeights([], 'outcomes')).toThrow(/outcomes.*empty/i);
    expect(() => validateWeights([{ weight: -1 }], 'outcomes')).toThrow(/negative/i);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test -- tests/canonicalValidation.test.ts`

Expected: FAIL because `src/canonical/resolve.ts` and `src/canonical/validate.ts` do not exist.

- [ ] **Step 3: Implement the canonical primitives**

```ts
// src/canonical/types.ts
import type { RandomSource } from '../survival/survivalTypes';

export type Provenance = 'wiki' | 'preserved' | 'default';
export interface Sourced<T> { value: T; provenance: Provenance; source: string; note?: string }
export interface IntegerRange { min: number; max: number }
export interface Weighted<T> { weight: number; value: T }
export type IntegerValue = number | IntegerRange;
export type RandomReader = Pick<RandomSource, 'next'>;

export const source = <T>(value: T, provenance: Provenance, sourceId: string, note?: string): Sourced<T> =>
  ({ value, provenance, source: sourceId, note });
```

```ts
// src/canonical/sources.ts
export const WIKI_SOURCES = {
  home: { url: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Don%27t_Sleep_With_The_Fishes_%28Unofficial%29_Wiki', snapshot: '2026-07-12' },
  items: { url: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Items', snapshot: '2026-07-12' },
  fishing: { url: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Fishing', snapshot: '2026-07-12' },
  events: { url: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Events', snapshot: '2026-07-12' },
} as const;
export type WikiSourceId = keyof typeof WIKI_SOURCES;
```

```ts
// src/canonical/resolve.ts
import type { IntegerValue, RandomReader, Sourced, Weighted } from './types';

export const resolved = <T>(entry: Sourced<T>): Sourced<T> => ({ ...entry });
export const resolveInteger = (value: IntegerValue, random: RandomReader): number =>
  typeof value === 'number' ? value : value.min + Math.floor(random.next() * (value.max - value.min + 1));
export function drawWeighted<T>(entries: readonly Weighted<T>[], random: RandomReader): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random.next() * total;
  for (const entry of entries) {
    if (roll < entry.weight) return entry.value;
    roll -= entry.weight;
  }
  return entries[entries.length - 1]!.value;
}
```

```ts
// src/canonical/validate.ts
import type { IntegerRange } from './types';

export function validateRange(range: IntegerRange, path: string): void {
  if (!Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min > range.max) {
    throw new Error(`${path} has an invalid integer range`);
  }
}
export function validateWeights(entries: readonly { weight: number }[], path: string): void {
  if (entries.length === 0) throw new Error(`${path} is empty`);
  if (entries.some(({ weight }) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error(`${path} contains a negative or invalid weight`);
  }
  if (entries.every(({ weight }) => weight === 0)) throw new Error(`${path} has no selectable weight`);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test -- tests/canonicalValidation.test.ts`

Expected: 4 tests pass.

- [ ] **Step 5: Commit the foundation**

```powershell
git add src/canonical/types.ts src/canonical/sources.ts src/canonical/resolve.ts src/canonical/validate.ts tests/canonicalValidation.test.ts
git commit -m "feat: add canonical data primitives"
```

---

### Task 2: Canonical item catalog and complete parity audit

**Files:**
- Create: `src/canonical/items.ts`
- Create: `src/canonical/parityAudit.ts`
- Modify: `src/game/ItemState.ts`
- Modify: `src/survival/itemDescriptions.ts`
- Test: `tests/canonicalItems.test.ts`
- Modify: `tests/ItemState.test.ts`

**Interfaces:**
- Consumes: `Sourced<T>` and `source()` from Task 1.
- Produces: `CANONICAL_ITEMS`, `RUNTIME_ITEM_IDS`, `runtimeItemDefinition(id)`, `PARITY_AUDIT`, and the expanded `ItemId` union.

- [ ] **Step 1: Write failing catalog and audit tests**

```ts
import { describe, expect, it } from 'vitest';
import { CANONICAL_ITEMS, RUNTIME_ITEM_IDS } from '../src/canonical/items';
import { PARITY_AUDIT } from '../src/canonical/parityAudit';

describe('wiki item catalog', () => {
  it('includes every practical non-story item', () => {
    expect(RUNTIME_ITEM_IDS).toEqual(expect.arrayContaining([
      'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'medicalKit', 'telescope',
      'fishingNet', 'bucket', 'flareGun', 'scubaSet', 'anchor', 'umbrella', 'swimRing',
      'flashlight', 'harpoonGun', 'energyBar', 'repairKit', 'fishingRod', 'chest', 'waterJug',
    ]));
  });

  it('uses approved defaults only for undocumented new ship items', () => {
    for (const id of ['compass', 'map', 'telescope', 'fishingNet', 'bucket', 'anchor', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar', 'chest'] as const) {
      expect(CANONICAL_ITEMS[id].weight).toMatchObject({ value: 1, provenance: 'default' });
      expect(CANONICAL_ITEMS[id].spawnCount).toMatchObject({ value: 1, provenance: 'default' });
    }
    expect(CANONICAL_ITEMS.repairKit.builtIn).toBe(true);
    expect(CANONICAL_ITEMS.repairKit.spawnCount.value).toBe(0);
  });

  it('classifies every reviewed item without silent omissions', () => {
    const itemAudit = PARITY_AUDIT.filter(({ kind }) => kind === 'item');
    expect(itemAudit.map(({ wikiName }) => wikiName)).toEqual(expect.arrayContaining([
      'Food', 'Bait', 'Duct Tape', 'Compass', 'Map', 'Medkit', 'Spyglass', 'Fishing Net',
      'Bucket', 'Flare Gun', 'Scuba Gear', 'Anchor', 'Bottled Paper', 'Umbrella', 'Swim Ring',
      'Flashlight', 'Harpoon Gun', 'Energy Bar', 'Repair Kit', 'Fishing Rod', 'Heart Piece 1',
      'Heart Piece 2', 'Heart Piece 3', 'Heart of the Sea', 'Chest', 'Yellow Flower', 'White Flower',
    ]));
    expect(itemAudit.every(({ reason }) => reason.length > 0)).toBe(true);
  });

  it('has unique IDs, labels, sources, and provenance for every resolved field', () => {
    expect(new Set(RUNTIME_ITEM_IDS).size).toBe(RUNTIME_ITEM_IDS.length);
    for (const id of RUNTIME_ITEM_IDS) {
      const item = CANONICAL_ITEMS[id];
      expect(item.label.value.length).toBeGreaterThan(0);
      for (const field of [item.label, item.weight, item.spawnCount, item.charges, item.durable]) {
        expect(['wiki', 'preserved', 'default']).toContain(field.provenance);
        expect(field.source.length).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run item tests and verify RED**

Run: `bun run test -- tests/canonicalItems.test.ts tests/ItemState.test.ts`

Expected: FAIL because the canonical item catalog is missing and the old catalog still has nine item types.

- [ ] **Step 3: Implement the catalog and adapter**

Define `CanonicalItemDefinition` with sourced `label`, `weight`, `spawnCount`, `charges`, and `durable`, plus `builtIn`, `dayAction`, and `description`. Preserve current values for the nine existing item types. Map wiki `Food`, `Bait`, `Medkit`, `Spyglass`, and `Scuba Gear` to stable internal IDs `cannedFood`, `baitTin`, `medicalKit`, `telescope`, and `scubaSet`.

Use this exact runtime set and classification:

```ts
export const RUNTIME_ITEM_IDS = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit', 'waterJug',
  'cannedFood', 'flashlight', 'scubaSet', 'compass', 'map', 'telescope',
  'fishingNet', 'bucket', 'anchor', 'umbrella', 'swimRing', 'harpoonGun',
  'energyBar', 'repairKit', 'chest',
] as const;
```

- `included`: Food, Bait, Duct Tape, Compass, Map, Medkit, Spyglass, Fishing Net, Bucket, Flare Gun, Scuba Gear, Anchor, Umbrella, Swim Ring, Flashlight, Harpoon Gun, Energy Bar, Repair Kit, Fishing Rod, Chest.
- `story-excluded`: Bottled Paper, Heart Piece 1, Heart Piece 2, Heart Piece 3, Heart of the Sea, Yellow Flower.
- `unsupported-undocumented`: White Flower because the wiki documents acquisition but no gameplay use.
- `preserved`: Water Jug because it already supports the current hunger/rest loop and the wiki supplies no equivalent numeric water rule.

`repairKit` is built into the lifeboat, has `spawnCount: 0`, and is never created as a ship instance. Newly added ship items use the approved `weight: 1` and `spawnCount: 1` defaults. Keep existing charge counts when the wiki does not state counts. One-time wiki items use one charge.

Refactor `src/game/ItemState.ts` to derive `ITEM_IDS`, `ITEM_DEFINITIONS`, `ITEM_LABELS`, and `createItemInstances()` from `RUNTIME_ITEM_IDS` and `runtimeItemDefinition()` without changing their public signatures.

Add `validateCanonicalItems()` and run it at module initialization in development/test builds. It rejects duplicate IDs, blank labels, missing source/provenance, invalid weights/counts/charges, built-in items with ship spawns, and runtime IDs without catalog records.

- [ ] **Step 4: Run item tests and verify GREEN**

Run: `bun run test -- tests/canonicalItems.test.ts tests/ItemState.test.ts tests/ScavengeSession.test.ts`

Expected: all focused tests pass; update old exact-length assertions to use the expanded catalog and expected generated count.

- [ ] **Step 5: Commit the item catalog**

```powershell
git add src/canonical/items.ts src/canonical/parityAudit.ts src/game/ItemState.ts src/survival/itemDescriptions.ts tests/canonicalItems.test.ts tests/ItemState.test.ts
git commit -m "feat: add wiki item catalog"
```

---

### Task 3: Condition-aware per-instance survival inventory

**Files:**
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/inventory.ts`
- Test: `tests/survivalInventory.test.ts`

**Interfaces:**
- Consumes: expanded `ItemId` and `ItemInstance` from Task 2.
- Produces: `ItemCondition`, `SurvivalItemInstance`, `InventoryMutation`, `createSurvivalInventory()`, `usableInstances()`, and `applyInventoryMutation()`.

- [ ] **Step 1: Write failing inventory-condition tests**

```ts
const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  type,
  instanceId: `${type}-${index + 1}` as ItemInstance['instanceId'],
}));

it('tracks duplicate instances independently through break, repair, loss, and consumption', () => {
  const inventory = createSurvivalInventory(saved('fishingNet', 'fishingNet', 'ductTape'));
  const [first, second] = usableInstances(inventory, 'fishingNet');
  applyInventoryMutation(inventory, { kind: 'break', itemId: 'fishingNet', instanceId: first!.instanceId, quantity: 1 });
  expect(usableInstances(inventory, 'fishingNet').map(({ instanceId }) => instanceId)).toEqual([second!.instanceId]);
  applyInventoryMutation(inventory, { kind: 'repair', itemId: 'fishingNet', instanceId: first!.instanceId, quantity: 1 });
  expect(usableInstances(inventory, 'fishingNet')).toHaveLength(2);
  applyInventoryMutation(inventory, { kind: 'lose', itemId: 'fishingNet', instanceId: second!.instanceId, quantity: 1 });
  applyInventoryMutation(inventory, { kind: 'consume', itemId: 'ductTape', quantity: 1 });
  expect(inventory.fishingNet.instances.map(({ condition }) => condition)).toEqual(['usable', 'lost']);
  expect(inventory.ductTape.instances[0]!.condition).toBe('consumed');
});
```

- [ ] **Step 2: Run the focused inventory test and verify RED**

Run: `bun run test -- tests/survivalInventory.test.ts`

Expected: FAIL because inventory entries do not expose instances or conditions.

- [ ] **Step 3: Implement condition-aware inventory**

```ts
export type ItemCondition = 'usable' | 'broken' | 'consumed' | 'lost';
export interface SurvivalItemInstance extends ItemInstance {
  condition: ItemCondition;
  charges: number | null;
}
export interface ItemInventoryState {
  owned: boolean;
  charges: number | null;
  durable: boolean;
  instances: SurvivalItemInstance[];
}
export type InventoryMutation = {
  kind: 'consume' | 'break' | 'repair' | 'lose' | 'gain';
  itemId: ItemId;
  quantity: number;
  instanceId?: ItemInstanceId;
};
```

Mutations select the explicitly named instance first, otherwise the oldest usable instance. `repair` selects the oldest broken instance. `gain` creates a stable survival-only ID using the next numeric suffix. Recompute `owned` and aggregate `charges` after every mutation. Return a frozen snapshot clone while keeping the session's private inventory mutable.

- [ ] **Step 4: Run inventory and existing session tests**

Run: `bun run test -- tests/survivalInventory.test.ts tests/SurvivalSession.test.ts`

Expected: all focused tests pass with legacy `owned`, `charges`, and `durable` assertions retained.

- [ ] **Step 5: Commit inventory conditions**

```powershell
git add src/survival/survivalTypes.ts src/survival/inventory.ts tests/survivalInventory.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: track survival item condition"
```

---

### Task 4: Exact fishing catalog and deterministic resolver

**Files:**
- Create: `src/canonical/fishing.ts`
- Create: `src/survival/fishing.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Test: `tests/fishingParity.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Consumes: `drawWeighted()`, `RandomSource`, and `applyInventoryMutation()`.
- Produces: `FISHING_CATCHES`, `eligibleCatches(day)`, and `resolveFishing(day, useBait, random)` returning `{ id, label, food, itemGain?, itemCondition?, consumesBait }`.

- [ ] **Step 1: Write failing data-contract tests for every documented catch**

```ts
expect(FISHING_CATCHES.map(({ id, weight, minDay, food }) => [id, weight, minDay, food])).toEqual([
  ['cod', 20, 0, 1], ['flounder', 15, 0, 1], ['salmon', 24, 0, 1],
  ['tuna', 5, 3, 2], ['crab', 14, 2, 1], ['squid', 7, 3, 2],
  ['sardine', 45, 0, 1], ['bass', 30, 0, 1], ['herring', 20, 0, 1],
  ['redSnapper', 20, 0, 1], ['mackerel', 15, 0, 1], ['clownfish', 1, 0, 1],
  ['swordfish', 1, 0, 3], ['seaweed', 82, 0, 0], ['boot', 72, 0, 0],
  ['plasticBottle', 60, 0, 0], ['fishlet', 12, 2, 0], ['worms', 5, 0, 0],
  ['wetDuctTape', 5, 3, 0], ['brokenCompass', 5, 0, 0],
  ['tornFishingNet', 3, 0, 0], ['energyBar', 8, 0, 0],
]);
```

Also assert that lore catches and Heart Piece 3 are absent. Assert `fishlet.consumesBait === true`, ordinary junk/tool catches use `false`, and every food-producing catch consumes bait on success.

- [ ] **Step 2: Run fishing tests and verify RED**

Run: `bun run test -- tests/fishingParity.test.ts tests/SurvivalSession.test.ts`

Expected: FAIL because the exact catch catalog and resolver do not exist.

- [ ] **Step 3: Implement the catalog and resolver**

Use the exact table above. Map tool catches as follows:

- `worms` gains one `baitTin` resource use;
- `wetDuctTape` gains a usable `ductTape`;
- `brokenCompass` gains a broken `compass`;
- `tornFishingNet` gains a broken `fishingNet`;
- `energyBar` gains a usable `energyBar`.

The wiki leaves the overall bait/no-bait success formula pending, so retain the current sourced rod success roll. After a successful rod roll, select one entry from the day-eligible exact catch table. Consume bait only when the selected result has `consumesBait: true`; this fixes the current unconditional bait consumption.

- [ ] **Step 4: Run fishing and session tests and verify GREEN**

Run: `bun run test -- tests/fishingParity.test.ts tests/SurvivalSession.test.ts`

Expected: exact table, minimum-day filtering, weighted boundaries, tool conditions, and conditional bait consumption pass.

- [ ] **Step 5: Commit fishing parity**

```powershell
git add src/canonical/fishing.ts src/survival/fishing.ts src/survival/SurvivalSession.ts tests/fishingParity.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: match wiki fishing outcomes"
```

---

### Task 5: Generic weighted event model and resolver

**Files:**
- Modify: `src/survival/survivalTypes.ts`
- Create: `src/survival/outcomeResolver.ts`
- Replace: `src/survival/events.ts`
- Test: `tests/eventResolver.test.ts`
- Modify: `tests/survivalEvents.test.ts`

**Interfaces:**
- Produces: `CanonicalEventDefinition`, `EventChoiceDefinition`, `WeightedEventOutcome`, `EventHistory`, `eligibleEvents()`, `drawWeightedEvent()`, and `resolveEventOutcome()`.

- [ ] **Step 1: Write failing resolver tests**

Cover relative weights `80:35`, inclusive damage `44–66`, generic `sleep` and `yes/no` choices, item consume/break/lose/gain mutations, resource deltas, `minDay`, first-occurrence `maxDay`, cooldown after a first in-window appearance, `maxAppearances`, inventory prerequisites, danger minimum, and route-specific weight bonuses.

```ts
const definition: CanonicalEventDefinition = {
  id: 'test', phase: 'night', title: 'Test', prompt: 'Choose.', cue: 'impact',
  weight: 10, minDay: 2, maxDay: 5, cooldownDays: 20, maxAppearances: 1, dangerMin: 1,
  choices: [{ id: 'sleep', label: 'Sleep', outcomes: [
    { weight: 80, message: 'Hit.', effects: { resources: [
      { resource: 'hull', operation: 'subtract', value: { min: 44, max: 66 } },
    ] } },
    { weight: 35, message: 'Safe.', effects: {} },
  ] }],
};
```

- [ ] **Step 2: Run event resolver tests and verify RED**

Run: `bun run test -- tests/eventResolver.test.ts tests/survivalEvents.test.ts`

Expected: FAIL because the existing event schema supports only one outcome per item.

- [ ] **Step 3: Implement the generic schema and resolver**

Use positive ranges in canonical data and an explicit delta direction to avoid reversed negative ranges:

```ts
export interface ResourceEffect {
  resource: 'health' | 'hull' | 'energy' | 'food' | 'bait' | 'danger';
  operation: 'add' | 'subtract' | 'set';
  value: IntegerValue;
}
export interface WeightedEventOutcome {
  weight: number;
  message: string;
  effects: { resources?: readonly ResourceEffect[]; items?: readonly InventoryMutation[]; route?: 'left' | 'right' };
}
export interface EventChoiceDefinition {
  id: string;
  label: string;
  itemId?: ItemId | 'any';
  outcomes: readonly WeightedEventOutcome[];
}
export interface EventHistory { appearances: number; firstDay: number; lastDay: number }
```

For a never-seen event, enforce `minDay <= day <= maxDay`. After it appears, a positive cooldown permits another occurrence once that cooldown elapses, even beyond `maxDay`, matching the wiki's examples. With no cooldown, positive `maxAppearances` caps the event permanently; `maxAppearances: 0` means unlimited. Apply route weight bonuses before weighted event selection. Keep the calm fallback outside the canonical catalog. Permit an `automatic: true` event such as Broken Boat to omit choices; all ordinary events must have at least one choice.

- [ ] **Step 4: Run resolver tests and verify GREEN**

Run: `bun run test -- tests/eventResolver.test.ts tests/survivalEvents.test.ts`

Expected: all schema, eligibility, range, weight, and mutation tests pass.

- [ ] **Step 5: Commit the event engine**

```powershell
git add src/survival/survivalTypes.ts src/survival/outcomeResolver.ts src/survival/events.ts tests/eventResolver.test.ts tests/survivalEvents.test.ts
git commit -m "feat: add weighted survival event engine"
```

---

### Task 6: Canonical ordinary-event catalog and classification

**Files:**
- Create: `src/canonical/events.ts`
- Modify: `src/canonical/parityAudit.ts`
- Test: `tests/eventCatalogParity.test.ts`

**Interfaces:**
- Consumes: event types from Task 5 and item IDs from Task 2.
- Produces: `CANONICAL_EVENTS` and validated runtime `SURVIVAL_EVENTS`.

- [ ] **Step 1: Write failing event catalog contract tests**

Assert the exact included IDs:

```ts
expect(CANONICAL_EVENTS.map(({ id }) => id)).toEqual([
  'peaceful-night', 'shower-night', 'windy-night', 'bad-sleep', 'thunderstorm',
  'check-the-back', 'dangerous-waters', 'needs-direction', 'restless-waves', 'leak',
  'man-in-the-fog', 'mystery-chest', 'seagull', 'midnight-tour', 'ghosts',
  'school-of-fish', 'snatcher', 'chest-attack', 'death-stare', 'swarm-of-anglerfish',
  'whirlpool', 'eerie-melody', 'shark-men', 'face-on-the-moon', 'broken-boat',
  'the-handyman',
]);
```

For every event, assert source ID, base weight, minimum/maximum day, cooldown, danger minimum, route bonus, item choice IDs, outcome weights, integer ranges, resource changes, and item mutations against the 2026-07-12 Events page. Add explicit boundary assertions for these high-risk documented values:

- Peaceful Night base weight `75`.
- Check the Back outcomes `500`, `50`, `1` and food gain `1`.
- Dangerous Waters weight `15`, day range `2–30`, one appearance, map outcomes `80/20`, compass `50/50`, sleep hull damage `25–45`.
- Mystery Chest weight `45`, day `6`, cooldown `33`, danger `1`, outcomes `80` gain chest and `30` take `25` health damage.
- Death Stare weight `160`, day `9`, cooldown `32`, danger `1`, including its `80/35`, `40/50`, `66/33`, `5/85`, `44–66`, `33–55`, `55–66`, `50`, `60`, and `70` values.
- School of Fish weight `66`, day `8`, cooldown `39`, danger `1`, with net `60/40`, bucket `50/50`, telescope `50/50`, and food gains `3/2/1`.
- Whirlpool day `12`, cooldown `30`, danger `1`, anchor `90/10`, swim ring `50/50`, sleep `80/30`, hull ranges `5–10`, `20–40`, `60–80`, and random item loss `2`.
- Eerie Melody weight `19`, day `13`, cooldown `30`, danger `2`, sleep `60/40`, hull ranges `40–60` and `50–90`.
- Shark Men weight `15`, day `15`, cooldown `30`, danger `2`, and the exact `85/35`, `70/36`, `80/20`, `50–70`, `20–30`, `50`, `80`, and food `4` values.
- Face on the Moon weight `5`, day `17`, cooldown `50`, danger `3`, telescope `60/40`, sleep `100/20`, energy set values `0/1/2`.
- Broken Boat triggers only at hull `<= 10` with chance `(100 - hull)%`.
- Handyman weight `12`, day `20`, cooldown `50`, danger `2`; exact pairs telescope/flashlight, flareGun/harpoonGun, scubaSet/medicalKit, fishingNet/bucket, ductTape/energyBar, chest/anchor; invalid trade returns food.
- Night-event health and hull damage doubles from day `50`; daytime scuba damage does not.

- [ ] **Step 2: Run event catalog tests and verify RED**

Run: `bun run test -- tests/eventCatalogParity.test.ts`

Expected: FAIL because no canonical event catalog exists.

- [ ] **Step 3: Add the full included catalog and audit exclusions**

Transcribe every included event's fields and choices from the canonical Events page into typed records. Omit journal flags and ending triggers from mixed events while retaining ordinary weighted resource outcomes. For Check the Back's rare journal branch, retain weight `1` as a no-resource unsettling outcome without journal state so the documented weight remains stable.

Classify these entries explicitly:

- `story-excluded`: Sinking Ship journal content, Drifting Bottle, Flowers, Distant Ship/Airplane/Hope, Helicopter, Red, Ghost Ship, Mirror, Kraken/The One, Found Land.
- `story-excluded`: Sick Companion, Guarded Sleep, Shadow Figure, Sea Watcher because they require crewmates.
- `unsupported-undocumented`: Drifting Loot contents/chance, Night Trader's complete trade table, and Sleep Killer's cross-playthrough requirement.
- `included`: the exact 26 IDs asserted above.

Run `validateCanonicalEvents()` at module initialization in development/test builds. Validation must reject unknown item IDs and ordinary events whose choice arrays are empty; an `automatic: true` event must have no choices and an explicit terminal outcome.

- [ ] **Step 4: Run event catalog tests and verify GREEN**

Run: `bun run test -- tests/eventCatalogParity.test.ts tests/canonicalValidation.test.ts`

Expected: every exact contract and every audit classification passes.

- [ ] **Step 5: Commit the catalog**

```powershell
git add src/canonical/events.ts src/canonical/parityAudit.ts tests/eventCatalogParity.test.ts
git commit -m "feat: add canonical ordinary events"
```

---

### Task 7: Integrate canonical events, danger, route, and day-50 damage

**Files:**
- Create: `src/canonical/balance.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/survivalBalance.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Test: `tests/SurvivalSession.test.ts`
- Test: `tests/wikiEventIntegration.test.ts`

**Interfaces:**
- Consumes: `SURVIVAL_EVENTS`, `resolveEventOutcome()`, inventory mutations, and event history.
- Produces: `resolveEventChoice(choiceId: string)`, plus `danger`, `route`, `pendingChoices`, and event-history data in snapshots needed by UI.

- [ ] **Step 1: Write failing session integration tests**

Test an initial Danger `0`, no passive danger increase at dawn, exact event danger increments, danger-gated eligibility, route-specific weights, max-day first occurrence, cooldown recurrence, item break/loss, next-day energy `set`, day-49 normal damage, day-50 doubled health/hull damage, and the broken-boat formula at hull `10`, `5`, and `0`.

Also replace the preserved starting hull `75` with the wiki's exact player health `100` and boat health `100`; hunger and energy remain preserved because the wiki pages do not supply exact starting values.

```ts
const session = new SurvivalSession(saved('map'), {
  seed: 1,
  random: sequenceRandom([0.99]),
  initial: { day: 2, danger: 0 },
  initialEventId: 'dangerous-waters',
});
session.resolveEventChoice('map');
expect(session.snapshot()).toMatchObject({ danger: 1, hull: 95 });
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `bun run test -- tests/wikiEventIntegration.test.ts tests/SurvivalSession.test.ts`

Expected: FAIL because snapshots lack danger/route and sessions accept only an item ID or endure.

- [ ] **Step 3: Integrate the event engine**

Replace `resolveEvent(itemId)` internally with `resolveEventChoice(choiceId)` and keep a temporary deprecated wrapper that maps `null` to `sleep` and an item ID to the matching choice. Store `Map<string, EventHistory>`, `danger`, and `route`. Apply item mutations before resource deltas, then terminal-state checks. Multiply only negative night-event health/hull deltas by two when `day >= 50`.

Update `SURVIVAL_BALANCE.start` to `{ health: 100, hunger: 20, energy: 4, hull: 100 }`; mark health and hull as wiki-sourced in the canonical balance metadata and hunger/energy as preserved.

Before ordinary night selection, execute Broken Boat's special roll when hull is `<= 10`; chance is `(100 - hull) / 100`. Broken Boat has no choices and moves immediately to `sunk` with its canonical outcome.

- [ ] **Step 4: Run all survival-domain tests and verify GREEN**

Run: `bun run test -- tests/wikiEventIntegration.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/survivalInventory.test.ts`

Expected: canonical events resolve deterministically and preserved daytime behavior remains green.

- [ ] **Step 5: Commit session integration**

```powershell
git add src/canonical/balance.ts src/survival/SurvivalSession.ts src/survival/survivalBalance.ts src/survival/survivalTypes.ts src/survival/SurvivalPhase.ts tests/SurvivalSession.test.ts tests/wikiEventIntegration.test.ts
git commit -m "feat: integrate canonical survival events"
```

---

### Task 8: Wiki item actions, repair, chest, and energy bar

**Files:**
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/BoatInteraction.ts`
- Test: `tests/wikiItemActions.test.ts`
- Modify: `tests/BoatInteraction.test.ts`

**Interfaces:**
- Produces: generic `useItem(itemId, targetInstanceId?)` and availability reasons for Energy Bar, Duct Tape repair, Medkit, Repair Kit, Chest, Fishing Rod, and Scuba Gear.

- [ ] **Step 1: Write failing action tests**

Cover these exact documented rules:

- Energy Bar sets energy to `4` when energy is above `0` and refills from `0` to the preserved maximum `4`, then consumes the bar.
- Duct Tape consumes one charge and repairs one selected broken item.
- Chest costs `3` energy to open and returns one utility item through a preserved deterministic utility pool because the wiki gives no item weights.
- Repair Kit is built into the lifeboat and performs the preserved boat repair action.
- Fishing Rod exposes fishing; Scuba Gear exposes diving.
- Medkit uses the preserved current healing amount because the wiki provides no number.

- [ ] **Step 2: Run action tests and verify RED**

Run: `bun run test -- tests/wikiItemActions.test.ts tests/BoatInteraction.test.ts`

Expected: FAIL because generic item use and the new item actions are absent.

- [ ] **Step 3: Implement item-driven actions**

Add `useItem()` as the single mutation boundary for direct prop use. Keep numbered day-action wrappers for existing controls, but delegate treat, repair, fishing, and diving to the matching canonical item metadata. When opening a chest, use `RandomSource` to select from usable utility IDs and mark the chest consumed. Do not add mimic timing here; Chest Attack owns that transition.

- [ ] **Step 4: Run item action and regression tests**

Run: `bun run test -- tests/wikiItemActions.test.ts tests/BoatInteraction.test.ts tests/SurvivalSession.test.ts`

Expected: all exact and preserved item actions pass.

- [ ] **Step 5: Commit item actions**

```powershell
git add src/survival/SurvivalSession.ts src/survival/survivalTypes.ts src/survival/BoatInteraction.ts tests/wikiItemActions.test.ts tests/BoatInteraction.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: add wiki item actions"
```

---

### Task 9: Procedural props and condition synchronization

**Files:**
- Modify: `src/world/PropFactory.ts`
- Modify: `src/survival/BoatWorld.ts`
- Test: `tests/PropFactory.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: expanded item IDs and per-instance conditions.
- Produces: a renderable prop for every runtime item and visual state for usable, broken, consumed, and lost instances.

- [ ] **Step 1: Write failing prop coverage tests**

Iterate `ITEM_IDS`, call `createProp({ instanceId: `${id}-1`, type: id })`, and assert a named non-empty group for every item. Assert unknown test input uses `generic-supply`, broken items remain visible and subdued, and consumed/lost items are removed from interaction anchors.

- [ ] **Step 2: Run world tests and verify RED**

Run: `bun run test -- tests/PropFactory.test.ts tests/BoatWorld.test.ts`

Expected: new items fall through the old flashlight shape and condition synchronization is missing.

- [ ] **Step 3: Add original procedural props and fallback**

Create simple combinations of boxes, cylinders, toruses, and flat-shaded materials for compass, map, telescope, fishing net, bucket, anchor, umbrella, swim ring, harpoon gun, energy bar, repair kit, and chest. Name fallback groups `generic-supply`. In `BoatWorld.syncInventory()`, find condition by instance ID; apply broken opacity/tint, retain consumed props only when current accessibility behavior requires a depleted marker, and remove lost props and anchors.

- [ ] **Step 4: Run world tests and verify GREEN**

Run: `bun run test -- tests/PropFactory.test.ts tests/BoatWorld.test.ts tests/BoatInteraction.test.ts`

Expected: every runtime item renders and condition transitions stay synchronized.

- [ ] **Step 5: Commit presentation props**

```powershell
git add src/world/PropFactory.ts src/survival/BoatWorld.ts tests/PropFactory.test.ts tests/BoatWorld.test.ts
git commit -m "feat: render canonical survival items"
```

---

### Task 10: Generic accessible event choices and item condition UI

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/styles/main.css`
- Test: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: snapshot `pendingChoices`, per-instance condition, and `resolveEventChoice(choiceId)`.
- Produces: `onEventChoice(choiceId: string)` and accessible choice buttons for item, yes/no, sleep, trade, touch, and generic actions.

- [ ] **Step 1: Write failing UI tests**

Assert that event choices use canonical labels; unavailable item choices remain visible with an explanation; broken/lost/consumed items cannot activate; yes/no and sleep work without fake item IDs; relative outcome risk is not shown as a fabricated percentage; condition text is announced; modal focus remains trapped; Escape keeps existing pause behavior; and repeated outcomes create fresh live-region mutations.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts`

Expected: FAIL because the UI only renders usable item IDs plus Endure.

- [ ] **Step 3: Implement generic event-choice rendering**

Change `showEvent()` to receive resolved choice view models:

```ts
export interface EventChoiceView {
  id: string;
  label: string;
  itemId?: ItemId;
  unavailableReason: string | null;
}
```

Render one button per choice with `data-event-choice`. Preserve the existing modal layering and focus-return methods. Tooltips show `USABLE`, `BROKEN`, `CONSUMED`, or `LOST`, remaining charges, canonical description, and any action unavailable reason. Do not display wiki chance weights as percentages.

- [ ] **Step 4: Run UI, phase, and interaction tests**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/BoatInteraction.test.ts`

Expected: all generic-choice and existing accessibility tests pass.

- [ ] **Step 5: Commit UI integration**

```powershell
git add src/ui/SurvivalUI.ts src/survival/SurvivalPhase.ts src/styles/main.css tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: present canonical event choices"
```

---

### Task 11: End-to-end parity audit, documentation, and verification

**Files:**
- Create: `tests/wikiParityIntegration.test.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/smoke.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all prior runtime and canonical interfaces.
- Produces: regression proof for the full scavenging-to-survival flow and user-facing documentation.

- [ ] **Step 1: Write the failing end-to-end parity test**

Build the expanded ship inventory, save representative old and new items, create the survival session, verify per-instance state, fish a deterministic catch, break and repair a tool, resolve an ordinary event, advance dawn, and restart into a fresh expanded catalog. Assert no story-excluded audit ID is present in runtime item/event catalogs.

- [ ] **Step 2: Run the integration test and verify RED if any seam remains**

Run: `bun run test -- tests/wikiParityIntegration.test.ts tests/GameLifecycle.test.ts tests/smoke.test.ts`

Expected: FAIL only at unresolved cross-system seams; if it passes immediately, retain it as new regression coverage and continue.

- [ ] **Step 3: Fix only integration seams and update documentation**

Update `README.md` to describe the canonical snapshot date, exact-vs-preserved provenance policy, included ordinary mechanics, story exclusions, conditional bait consumption, broken/lost items, and offline behavior. Do not claim passive danger growth or unsupported events.

- [ ] **Step 4: Run complete automated verification**

Run: `bun run typecheck`

Expected: exit code `0` with no TypeScript errors.

Run: `bun run test`

Expected: all test files pass with no unhandled errors.

Run: `bun run build`

Expected: Vite produces `dist/` successfully.

- [ ] **Step 5: Perform browser verification**

Start the existing Vite development server. In a desktop browser:

1. Begin evacuation and verify old and new props appear with correct labels and weights.
2. Save a fishing rod, bait, duct tape, and at least one breakable tool.
3. Enter survival and verify all saved physical props and keyboard-focus anchors.
4. Fish with bait and verify bait is spent only on a fish/Fishlet outcome.
5. Trigger a deterministic ordinary event through the test seam and resolve a multi-outcome item choice.
6. Break and repair an item, confirming both visuals and availability.
7. Verify yes/no/sleep choices, focus trapping, Escape pause, reduced motion, and restart.

Expected: no console errors, inaccessible controls, missing props, stale tooltips, or story-only choices.

- [ ] **Step 6: Commit the verified integration**

```powershell
git add tests/wikiParityIntegration.test.ts tests/GameLifecycle.test.ts tests/smoke.test.ts README.md
git commit -m "test: verify wiki gameplay parity"
```
