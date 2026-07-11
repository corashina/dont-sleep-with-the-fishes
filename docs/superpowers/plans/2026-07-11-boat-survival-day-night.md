# Boat Survival Day/Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the scavenging prototype into a complete fixed-view lifeboat survival loop with resources, daytime actions, item-driven day/night events, hull repair, health consequences, and variable rescue.

**Architecture:** A shared `Game` director owns the renderer, camera, frame loop, resize handling, and active phase. `ScavengePhase` and `SurvivalPhase` own isolated scene/UI/input lifecycles; pure `SurvivalSession` rules communicate with `BoatWorld` and `SurvivalUI` through immutable snapshots and outcomes.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3.2, jsdom, DOM/CSS.

## Global Constraints

- Desktop browser only; no mobile touch controls.
- Preserve current scavenging behavior and all existing tests unless a test explicitly moves to the new phase boundary.
- The survival view is seated, fixed first-person with clamped optional parallax and no pointer lock.
- Reuse `WaveField` and `OceanRenderer`; add no runtime dependencies.
- Saved supplies are copied from the successful scavenging snapshot; missing supplies are never granted.
- Four meters are clamped to 0–100: health 100, hunger 20, energy 4, hull 75.
- Hunger rises 18 per dawn; energy refills to 4 below 70 hunger, 3 at 70–89, and 2 at 90–100; 100 hunger costs 15 health per dawn.
- Natural rescue begins on day five at 5%, rises by 8 percentage points per day to 60%, and accepts up to +25 percentage points from rescue progress.
- The first content set contains at least eight daytime events, eight nighttime events, three weather states, and distinct rescued/dead/sunk outcomes.
- Rules randomness must be seeded and reproducible.
- A failed survival run restarts the entire game from scavenging; no save or boat-phase retry.
- All code changes use test-driven development, focused files, and frequent commits.

---

## File Structure

### Create

- `src/app/GamePhase.ts` — shared phase context, lifecycle, and completion contracts.
- `src/phases/ScavengePhase.ts` — current scavenging orchestration extracted from `Game`.
- `src/survival/survivalTypes.ts` — snapshots, outcomes, action IDs, inventory, weather, and event types.
- `src/survival/survivalBalance.ts` — all initial tuning constants.
- `src/survival/random.ts` — seeded random source and deterministic test source.
- `src/survival/inventory.ts` — saved-item-to-survival-inventory mapping.
- `src/survival/events.ts` — event catalog, filtering, cooldown, and weighted draw.
- `src/survival/SurvivalSession.ts` — authoritative turn-based rules.
- `src/survival/BoatWorld.ts` — fixed first-person boat scene and short presentation sequences.
- `src/survival/SurvivalPhase.ts` — session/world/UI command and sequence orchestration.
- `src/ui/SurvivalUI.ts` — survival HUD, action dock, inventory, events, and endings.
- `tests/survivalInventory.test.ts` — balance, RNG, and inventory contracts.
- `tests/SurvivalSession.test.ts` — resources and daytime actions.
- `tests/survivalEvents.test.ts` — event eligibility, counters, and rescue.
- `tests/BoatWorld.test.ts` — pure camera/lighting/weather presentation helpers.
- `tests/SurvivalUI.test.ts` — DOM rendering, commands, focus, and endings.
- `tests/SurvivalPhase.test.ts` — atomic orchestration and sequence blocking.
- `tests/GameDirector.test.ts` — phase transition, disposal, handoff, and restart.

### Modify

- `src/Game.ts` — replace the monolithic scavenging controller with the shared phase director.
- `src/game/ScavengeSession.ts` — expose immutable successful-run result data.
- `src/ui/GameUI.ts` — send successful evacuation to the director instead of showing the old terminal success result.
- `src/world/Lifeboat.ts` — export/reuse procedural materials or helper geometry needed by the survival boat.
- `src/styles/main.css` — survival layout, meters, actions, event panels, responsive behavior, and reduced motion.
- `src/main.ts` — keep startup behavior while targeting the director-backed `Game`.
- `tests/ScavengeSession.test.ts` — successful-run result contract.
- `tests/GameLifecycle.test.ts` — move scavenging-specific lifecycle assertions to `ScavengePhase`.
- `tests/GameUI.test.ts` — retain scavenging UI contracts after success routing changes.
- `tests/smoke.test.ts` — cross-phase content-count contracts.
- `README.md` — both phases, controls, rules, architecture, and verification.

---

### Task 1: Survival Domain Foundations

**Files:**
- Create: `src/survival/survivalTypes.ts`
- Create: `src/survival/survivalBalance.ts`
- Create: `src/survival/random.ts`
- Create: `src/survival/inventory.ts`
- Test: `tests/survivalInventory.test.ts`

**Interfaces:**
- Consumes: `ItemId` from `src/game/ItemState.ts`.
- Produces: `RandomSource`, `mulberry32(seed)`, `sequenceRandom(values)`, `createSurvivalInventory(savedItems)`, `SURVIVAL_BALANCE`, `SurvivalSnapshot`, `ActionOutcome`, and shared survival/event types.

- [ ] **Step 1: Write failing foundation tests**

```ts
import { describe, expect, it } from 'vitest';
import { createSurvivalInventory } from '../src/survival/inventory';
import { mulberry32, sequenceRandom } from '../src/survival/random';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';

describe('survival foundations', () => {
  it('maps only saved items to their documented charges', () => {
    const inventory = createSurvivalInventory(['flareGun', 'baitTin', 'medicalKit', 'flashlight']);
    expect(inventory.flareGun).toEqual({ owned: true, charges: 1, durable: false });
    expect(inventory.baitTin).toEqual({ owned: true, charges: 3, durable: false });
    expect(inventory.medicalKit).toEqual({ owned: true, charges: 2, durable: false });
    expect(inventory.flashlight).toEqual({ owned: true, charges: null, durable: true });
    expect(inventory.fishingRod.owned).toBe(false);
    expect(inventory.cannedFood.charges).toBe(0);
  });

  it('deduplicates copied saved item IDs', () => {
    const inventory = createSurvivalInventory(['waterJug', 'waterJug']);
    expect(inventory.waterJug.charges).toBe(3);
  });

  it('produces repeatable seeded values and clamped test sequences', () => {
    const first = mulberry32(421);
    const second = mulberry32(421);
    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(), second.next(), second.next(),
    ]);
    const fixed = sequenceRandom([-1, 0.4, 2]);
    expect([fixed.next(), fixed.next(), fixed.next(), fixed.next()]).toEqual([0, 0.4, 0.999999, 0]);
  });

  it('exposes the approved starting balance', () => {
    expect(SURVIVAL_BALANCE.start).toEqual({ health: 100, hunger: 20, energy: 4, hull: 75 });
    expect(SURVIVAL_BALANCE.dawn.hungerIncrease).toBe(18);
    expect(SURVIVAL_BALANCE.rescue.firstDay).toBe(5);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `bun run test -- tests/survivalInventory.test.ts`

Expected: FAIL because `src/survival/inventory.ts`, `random.ts`, and `survivalBalance.ts` do not exist.

- [ ] **Step 3: Add complete shared types and approved balance constants**

```ts
// src/survival/survivalTypes.ts
import type { ItemId } from '../game/ItemState';

export type SurvivalState = 'day' | 'dayEvent' | 'nightEvent' | 'rescued' | 'dead' | 'sunk';
export type WeatherId = 'calm' | 'overcast' | 'squall';
export type DayActionId = 'fish' | 'dive' | 'eat' | 'repair' | 'treat' | 'rest' | 'endDay';
export type RiskLabel = 'safe' | 'uncertain' | 'dangerous';
export type PresentationCue =
  | 'none' | 'fish' | 'dive' | 'repair' | 'treat' | 'rest'
  | 'storm' | 'impact' | 'darkness' | 'sighting' | 'rescue' | 'death' | 'sinking';

export interface ItemInventoryState {
  owned: boolean;
  charges: number | null;
  durable: boolean;
}

export type SurvivalInventory = Record<ItemId, ItemInventoryState>;

export interface ResourceDelta {
  health?: number;
  hunger?: number;
  energy?: number;
  hull?: number;
  food?: number;
  bait?: number;
  repairMaterial?: number;
  rescueProgress?: number;
}

export interface ActionOutcome {
  accepted: boolean;
  code: string;
  message: string;
  deltas: Readonly<ResourceDelta>;
  cue: PresentationCue;
}

export interface SurvivalSnapshot {
  state: SurvivalState;
  day: number;
  health: number;
  hunger: number;
  energy: number;
  hull: number;
  food: number;
  bait: number;
  repairMaterial: number;
  rescueProgress: number;
  weather: WeatherId;
  restedToday: boolean;
  actedToday: boolean;
  inventory: Readonly<SurvivalInventory>;
  pendingEventId: string | null;
  lastOutcome: ActionOutcome | null;
  seed: number;
}

export interface RandomSource { next(): number; }
```

```ts
// src/survival/survivalBalance.ts
export const SURVIVAL_BALANCE = {
  start: { health: 100, hunger: 20, energy: 4, hull: 75 },
  dawn: { hungerIncrease: 18, starvationDamage: 15, normalEnergy: 4, hungryEnergy: 3, starvingEnergy: 2 },
  thresholds: { hungry: 70, starving: 90, maximum: 100 },
  actions: {
    fishEnergy: 2, diveEnergy: 3, repairEnergy: 2,
    foodHunger: -35, repairHull: 25, tapeHull: 15, treatmentHealth: 30, restEnergy: 2,
  },
  fishing: {
    rodSuccess: 0.70, rodDouble: 0.20, rodBaitSuccess: 0.90,
    rodBaitDouble: 0.40, handSuccess: 0.30, handBaitSuccess: 0.55,
  },
  diving: {
    success: 0.65, injury: 0.25, flashlightSuccess: 0.80,
    flashlightInjury: 0.10, injuryDamage: 10, overcastSuccessDelta: -0.05,
    overcastInjuryDelta: 0.05,
  },
  rescue: { firstDay: 5, initialChance: 0.05, dailyIncrease: 0.08, chanceCap: 0.60, progressCap: 25 },
} as const;
```

- [ ] **Step 4: Implement deterministic random sources and inventory mapping**

```ts
// src/survival/random.ts
import type { RandomSource } from './survivalTypes';

export function mulberry32(seed: number): RandomSource {
  let value = seed >>> 0;
  return {
    next(): number {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function sequenceRandom(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    next(): number {
      const raw = values.length === 0 ? 0 : values[index++ % values.length]!;
      return Math.min(0.999999, Math.max(0, raw));
    },
  };
}
```

```ts
// src/survival/inventory.ts
import { ITEM_IDS, type ItemId } from '../game/ItemState';
import type { SurvivalInventory } from './survivalTypes';

const DEFINITIONS: Readonly<Record<ItemId, { charges: number | null; durable: boolean }>> = {
  flareGun: { charges: 1, durable: false },
  ductTape: { charges: 2, durable: false },
  fishingRod: { charges: null, durable: true },
  baitTin: { charges: 3, durable: false },
  medicalKit: { charges: 2, durable: false },
  waterJug: { charges: 3, durable: false },
  cannedFood: { charges: 2, durable: false },
  flashlight: { charges: null, durable: true },
};

export function createSurvivalInventory(savedItems: readonly ItemId[]): SurvivalInventory {
  const saved = new Set(savedItems);
  return Object.fromEntries(ITEM_IDS.map((id) => {
    const definition = DEFINITIONS[id];
    return [id, {
      owned: saved.has(id),
      charges: saved.has(id) ? definition.charges : 0,
      durable: definition.durable,
    }];
  })) as SurvivalInventory;
}
```

- [ ] **Step 5: Run the focused test and all existing tests**

Run: `bun run test -- tests/survivalInventory.test.ts`

Expected: 4 passing tests.

Run: `bun run test`

Expected: all existing and new tests pass.

- [ ] **Step 6: Commit the domain foundations**

```powershell
git add src/survival/survivalTypes.ts src/survival/survivalBalance.ts src/survival/random.ts src/survival/inventory.ts tests/survivalInventory.test.ts
git commit -m "feat: add survival domain foundations"
```

---

### Task 2: Daytime Survival Session

**Files:**
- Create: `src/survival/SurvivalSession.ts`
- Test: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Consumes: `RandomSource`, `SurvivalSnapshot`, `DayActionId`, `ActionOutcome`, `SURVIVAL_BALANCE`, and `createSurvivalInventory` from Task 1.
- Produces: `new SurvivalSession(savedItems, { seed, random? })`, `snapshot()`, `availableReason(action)`, `perform(action, option?)`, and `beginDawn()`.

- [ ] **Step 1: Write failing tests for initialization, actions, prerequisites, and bounds**

```ts
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';

describe('SurvivalSession daytime actions', () => {
  it('starts day one with copied supplies and canned food', () => {
    const saved: ItemId[] = ['cannedFood', 'waterJug'];
    const session = new SurvivalSession(saved, { seed: 9, random: sequenceRandom([0]) });
    saved.length = 0;
    const state = session.snapshot();
    expect(state).toMatchObject({ state: 'day', day: 1, health: 100, hunger: 20, energy: 4, hull: 75, food: 2 });
    expect(state.inventory.waterJug.charges).toBe(3);
  });

  it('fishes deterministically with rod and bait', () => {
    const session = new SurvivalSession(['fishingRod', 'baitTin'], {
      seed: 1,
      random: sequenceRandom([0.1, 0.1]),
    });
    expect(session.perform('fish', 'useBait')).toMatchObject({ accepted: true, deltas: { energy: -2, food: 2, bait: -1 } });
    expect(session.snapshot()).toMatchObject({ energy: 2, food: 2, bait: 2, actedToday: true });
  });

  it('keeps hand-line fishing possible but rejects insufficient energy', () => {
    const session = new SurvivalSession([], { seed: 1, random: sequenceRandom([0.2, 0.8]) });
    expect(session.perform('fish')).toMatchObject({ accepted: true, deltas: { energy: -2, food: 1 } });
    expect(session.perform('fish')).toMatchObject({ accepted: true, deltas: { energy: -2, food: 0 } });
    expect(session.perform('fish')).toMatchObject({ accepted: false, code: 'not-enough-energy' });
  });

  it('applies diving risk and blocks diving in a squall', () => {
    const injured = new SurvivalSession([], { seed: 1, random: sequenceRandom([0.9, 0.1]) });
    expect(injured.perform('dive')).toMatchObject({ accepted: true, deltas: { energy: -3, health: -10 } });
    const storm = new SurvivalSession([], { seed: 1, random: sequenceRandom([0]), weather: 'squall' });
    expect(storm.perform('dive')).toMatchObject({ accepted: false, code: 'weather-blocked' });
  });

  it('eats, repairs, treats, and rests using the documented resources', () => {
    const session = new SurvivalSession(['cannedFood', 'ductTape', 'medicalKit', 'waterJug'], {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { hunger: 80, health: 60, hull: 40, energy: 2 },
    });
    expect(session.perform('eat')).toMatchObject({ deltas: { hunger: -35, food: -1 } });
    expect(session.perform('repair', 'ductTape')).toMatchObject({ deltas: { energy: -2, hull: 15 } });
    expect(session.perform('treat')).toMatchObject({ deltas: { health: 30 } });
    expect(session.perform('rest')).toMatchObject({ deltas: { energy: 2 } });
    expect(session.perform('rest').code).toBe('already-rested');
  });

  it('applies dawn hunger, energy tiers, starvation, and terminal states once', () => {
    const session = new SurvivalSession([], {
      seed: 1,
      random: sequenceRandom([0.99]),
      initial: { hunger: 95, health: 20, hull: 5, energy: 0 },
    });
    session.beginDawn();
    expect(session.snapshot()).toMatchObject({ day: 2, hunger: 100, energy: 2, health: 5 });
    session.beginDawn();
    expect(session.snapshot().state).toBe('dead');
    const terminal = session.snapshot();
    expect(session.perform('fish').accepted).toBe(false);
    expect(session.snapshot()).toEqual(terminal);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-class failure**

Run: `bun run test -- tests/SurvivalSession.test.ts`

Expected: FAIL because `SurvivalSession` is not implemented.

- [ ] **Step 3: Implement session construction, immutable snapshots, validation, and clamping**

Implement the class with these exact public signatures:

```ts
export interface SurvivalSessionOptions {
  seed: number;
  random?: RandomSource;
  weather?: WeatherId;
  initial?: Partial<Pick<SurvivalSnapshot, 'health' | 'hunger' | 'energy' | 'hull' | 'day' | 'rescueProgress'>>;
  initialEventId?: string;
}

export type DayActionOption = 'useBait' | 'repairMaterial' | 'ductTape';

export class SurvivalSession {
  constructor(savedItems: readonly ItemId[], options: SurvivalSessionOptions);
  snapshot(): SurvivalSnapshot;
  availableReason(action: DayActionId, option?: DayActionOption): string | null;
  perform(action: DayActionId, option?: DayActionOption): ActionOutcome;
  beginDawn(): ActionOutcome;
}
```

Use private helpers with these responsibilities:

```ts
private reject(code: string, message: string): ActionOutcome;
private commit(code: string, message: string, deltas: ResourceDelta, cue: PresentationCue): ActionOutcome;
private applyDeltas(deltas: ResourceDelta): void;
private consumeCharge(id: ItemId): boolean;
private resolveTerminal(): void;
private clampMeters(): void;
```

`snapshot()` must clone the inventory entries and last outcome. `applyDeltas()` must clamp meters to 0–100 and resources to zero or greater. `resolveTerminal()` checks health before hull and never replaces an existing terminal state.

During construction, transfer the bait tin's three charges into the authoritative `bait` counter and canned food's two charges into the authoritative `food` counter, then set those two inventory charge fields to zero while retaining `owned: true`. All later caught/found food and bait use only the resource counters, preventing duplicated consumable state. Water, duct tape, medical kit, and flare charges remain in inventory.

- [ ] **Step 4: Implement each daytime action with the approved values**

Use one `switch` in `perform()` and dedicated private resolvers:

```ts
switch (action) {
  case 'fish': return this.fish(option === 'useBait');
  case 'dive': return this.dive();
  case 'eat': return this.eat();
  case 'repair': return this.repair(option);
  case 'treat': return this.treat();
  case 'rest': return this.rest();
  case 'endDay': return this.reject('events-not-ready', 'Night events are added in the next task.');
}
```

Fishing consumes the success roll first and the double-catch roll only after success. Diving consumes a recovery roll and then an independent injury roll. Successful diving chooses rewards from the next roll using four equal bands: food, bait, repair material, rescue progress +10. Eating and treatment cost no energy. Repair selects material by default and duct tape only for the explicit `ductTape` option. Every accepted non-consumption action sets `actedToday = true`.

- [ ] **Step 5: Run focused tests, typecheck, and the full suite**

Run: `bun run test -- tests/SurvivalSession.test.ts`

Expected: all daytime session tests pass.

Run: `bun run typecheck`

Expected: exit 0 with no TypeScript diagnostics.

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 6: Commit daytime rules**

```powershell
git add src/survival/SurvivalSession.ts tests/SurvivalSession.test.ts
git commit -m "feat: add daytime survival actions"
```

---

### Task 3: Data-Driven Events, Night Cycle, and Rescue

**Files:**
- Create: `src/survival/events.ts`
- Create: `tests/survivalEvents.test.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: `RandomSource`, `SurvivalSnapshot`, `SurvivalInventory`, `ResourceDelta`, and `ActionOutcome` from Tasks 1–2.
- Produces: `SURVIVAL_EVENTS`, `eligibleEvents`, `drawWeightedEvent`, `requestDayEvent()`, `endDay()`, `resolveEvent(itemId)`, and rescue-aware `beginDawn()`.

- [ ] **Step 1: Add event types and write failing catalog/selection tests**

Add to `survivalTypes.ts`:

```ts
export interface EventResponse {
  itemId: ItemId;
  message: string;
  deltas: Readonly<ResourceDelta>;
  cue: PresentationCue;
  consume: boolean;
  rescue?: boolean;
}

export interface SurvivalEventDefinition {
  id: string;
  phase: 'day' | 'night';
  title: string;
  prompt: string;
  danger: RiskLabel;
  earliestDay: number;
  latestDay?: number;
  weight: number;
  cooldownDays: number;
  weather?: readonly WeatherId[];
  responses: readonly EventResponse[];
  unsuitable: Omit<EventResponse, 'itemId' | 'consume'>;
  endure: Omit<EventResponse, 'itemId' | 'consume'>;
  cue: PresentationCue;
}
```

Create tests:

```ts
import { describe, expect, it } from 'vitest';
import { SURVIVAL_EVENTS, drawWeightedEvent, eligibleEvents } from '../src/survival/events';
import { sequenceRandom } from '../src/survival/random';

describe('survival events', () => {
  it('ships at least eight original events for each phase', () => {
    expect(SURVIVAL_EVENTS.filter((event) => event.phase === 'day').length).toBeGreaterThanOrEqual(8);
    expect(SURVIVAL_EVENTS.filter((event) => event.phase === 'night').length).toBeGreaterThanOrEqual(8);
    expect(new Set(SURVIVAL_EVENTS.map((event) => event.id)).size).toBe(SURVIVAL_EVENTS.length);
  });

  it('filters by phase, day, weather, immediate repeat, and cooldown', () => {
    const events = eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'day', day: 2, weather: 'calm', lastEventId: 'day-heat-haze',
      lastSeenDay: new Map([['day-hull-leak', 1]]),
    });
    expect(events.every((event) => event.phase === 'day' && event.earliestDay <= 2)).toBe(true);
    expect(events.map((event) => event.id)).not.toContain('day-heat-haze');
    expect(events.map((event) => event.id)).not.toContain('day-hull-leak');
  });

  it('draws by stable weighted boundaries and returns calm fallback for an empty pool', () => {
    const pool = SURVIVAL_EVENTS.filter((event) => event.phase === 'day').slice(0, 2);
    expect(drawWeightedEvent(pool, sequenceRandom([0])).id).toBe(pool[0]!.id);
    expect(drawWeightedEvent([], sequenceRandom([0]), 'day').id).toBe('day-calm-fallback');
  });
});
```

- [ ] **Step 2: Run the catalog tests and verify they fail**

Run: `bun run test -- tests/survivalEvents.test.ts`

Expected: FAIL because `events.ts` does not exist.

- [ ] **Step 3: Implement catalog selection and all sixteen initial event definitions**

Implement these exact helpers:

```ts
export interface EventEligibility {
  phase: 'day' | 'night';
  day: number;
  weather: WeatherId;
  lastEventId: string | null;
  lastSeenDay: ReadonlyMap<string, number>;
}

export function eligibleEvents(
  catalog: readonly SurvivalEventDefinition[],
  criteria: EventEligibility,
): SurvivalEventDefinition[];

export function drawWeightedEvent(
  pool: readonly SurvivalEventDefinition[],
  random: RandomSource,
  fallbackPhase?: 'day' | 'night',
): SurvivalEventDefinition;
```

Encode this complete initial content table in `SURVIVAL_EVENTS`; each effect is a `ResourceDelta`, each counter has authored result text, and every non-listed item uses the event's unsuitable-item result:

| ID | Phase | Earliest | Danger | Counter | Counter effect | Endure effect |
|---|---|---:|---|---|---|---|
| `day-heat-haze` | day | 1 | uncertain | water jug | energy +1 | health -8 |
| `day-tangled-debris` | day | 1 | uncertain | flashlight | repair material +1 | health -6, repair material +1 |
| `day-sudden-squall` | day | 2 | dangerous | duct tape | hull -3 | hull -15 |
| `day-circling-gulls` | day | 1 | uncertain | fishing rod | food +1 | food -1, floor 0 |
| `day-dark-shape` | day | 3 | dangerous | flare gun | no damage | hull -12 |
| `day-floating-wreckage` | day | 2 | uncertain | flashlight | food +1, bait +1 | health -5, bait +1 |
| `day-hull-leak` | day | 2 | dangerous | duct tape | hull +5 | hull -18 |
| `day-distant-aircraft` | day | 5 | safe | flare gun | immediate rescue | rescue progress +10 |
| `night-hull-impact` | night | 1 | dangerous | flashlight | hull -2 | hull -12 |
| `night-violent-weather` | night | 2 | dangerous | duct tape | hull -5 | hull -20 |
| `night-strange-lights` | night | 3 | uncertain | flashlight | rescue progress +10 | health -5 |
| `night-fish-activity` | night | 1 | safe | fishing rod | food +1 | no change |
| `night-distant-calls` | night | 4 | uncertain | flare gun | rescue progress +15 | health -8 |
| `night-drifting-wreckage` | night | 2 | uncertain | flashlight | repair material +1 | hull -8, repair material +1 |
| `night-oppressive-darkness` | night | 1 | uncertain | flashlight | no change | health -6 |
| `night-calm-water` | night | 1 | safe | water jug | hunger -5 | no change |

Use weight 10 and cooldown 3 unless the table needs rarity: aircraft weight 3/cooldown 8, dark shape weight 5/cooldown 5, calm water weight 6/cooldown 2. Fallback events have no effects and are not included in the sixteen-count catalog.

- [ ] **Step 4: Write failing session tests for day/night events and rescue**

```ts
it('opens one day event only after an action and resolves a valid item once', () => {
  const session = new SurvivalSession(['waterJug'], { seed: 2, random: sequenceRandom([0]) });
  expect(session.requestDayEvent().code).toBe('act-first');
  session.perform('fish');
  expect(session.requestDayEvent()).toMatchObject({ accepted: true, code: 'event-opened' });
  expect(session.snapshot().state).toBe('dayEvent');
  const first = session.resolveEvent('waterJug');
  expect(first.accepted).toBe(true);
  const charges = session.snapshot().inventory.waterJug.charges;
  expect(session.resolveEvent('waterJug').accepted).toBe(false);
  expect(session.snapshot().inventory.waterJug.charges).toBe(charges);
});

it('draws a night event, advances dawn, and applies increasing rescue chance', () => {
  const session = new SurvivalSession([], { seed: 2, random: sequenceRandom([0, 0.99, 0.99, 0.99, 0]) });
  session.perform('endDay');
  expect(session.snapshot().state).toBe('nightEvent');
  session.resolveEvent(null);
  expect(session.snapshot().state).toBe('day');
  expect(session.snapshot().day).toBe(2);
});

it('guarantees rescue when the flare counters a sighting and stays terminal', () => {
  const session = new SurvivalSession(['flareGun'], {
    seed: 3,
    random: sequenceRandom([0]),
    initial: { day: 5 },
    initialEventId: 'day-distant-aircraft',
  });
  expect(session.resolveEvent('flareGun')).toMatchObject({ accepted: true, cue: 'rescue' });
  expect(session.snapshot().state).toBe('rescued');
  const rescued = session.snapshot();
  expect(session.beginDawn().accepted).toBe(false);
  expect(session.snapshot()).toEqual(rescued);
});
```

Validate `initialEventId` against `SURVIVAL_EVENTS` in the constructor, set the matching event phase, and throw for an unknown ID. Production constructors omit this test seam.

- [ ] **Step 5: Integrate event history, event resolution, night/dawn progression, weather, and rescue**

Add these public methods:

```ts
requestDayEvent(): ActionOutcome;
endDay(): ActionOutcome;
resolveEvent(itemId: ItemId | null): ActionOutcome;
```

Behavior:

- `requestDayEvent()` requires `state === 'day'`, `actedToday === true`, and no previous day event.
- `perform('endDay')` delegates to `endDay()` and draws a night event immediately.
- `resolveEvent()` finds the pending definition, selects its matching response or unsuitable/endure response, conditionally consumes a charge, applies deltas, records history, and prevents a second resolution.
- Resolving a day event returns to `day`; resolving a night event calls `beginDawn()` exactly once.
- `beginDawn()` increments day, applies hunger/energy/starvation, chooses seeded weather, performs the rescue roll when eligible, clears daily flags, and returns to `day` unless terminal.
- Rescue chance is `min(0.85, min(0.60, 0.05 + (day - 5) * 0.08) + min(25, rescueProgress) / 100)`.
- Every accepted mutation calls `resolveTerminal()` and terminal state blocks later commands.

- [ ] **Step 6: Run event/session tests and full verification**

Run: `bun run test -- tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/smoke.test.ts`

Expected: all event, session, and content-count tests pass.

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 7: Commit the complete rules loop**

```powershell
git add src/survival/survivalTypes.ts src/survival/events.ts src/survival/SurvivalSession.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/smoke.test.ts
git commit -m "feat: add survival events and rescue loop"
```

---

### Task 4: Cinematic Lifeboat World

**Files:**
- Create: `src/survival/BoatWorld.ts`
- Create: `tests/BoatWorld.test.ts`
- Modify: `src/world/Lifeboat.ts`

**Interfaces:**
- Consumes: shared `PerspectiveCamera`, `Scene`, `WaveField`, `OceanRenderer`, `WeatherId`, `PresentationCue`, and reduced-motion flag.
- Produces: `BoatWorld`, `clampParallax`, `survivalLighting`, `play(cue)`, `update()`, `skipSequence()`, and `dispose()`.

- [ ] **Step 1: Write failing pure presentation tests**

```ts
import { describe, expect, it } from 'vitest';
import { clampParallax, survivalLighting } from '../src/survival/BoatWorld';

describe('BoatWorld helpers', () => {
  it('clamps mouse parallax and disables it for reduced motion', () => {
    expect(clampParallax(2, -2, false)).toEqual({ yaw: 0.045, pitch: -0.025 });
    expect(clampParallax(0.4, -0.4, true)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('provides distinct bounded day, night, and squall lighting', () => {
    expect(survivalLighting('calm', 'day')).toMatchObject({ ambient: 1.1, fogDensity: 0.012 });
    expect(survivalLighting('overcast', 'night').ambient).toBeLessThan(0.5);
    expect(survivalLighting('squall', 'day').fogDensity).toBeGreaterThan(0.02);
  });
});
```

- [ ] **Step 2: Run tests and verify missing exports**

Run: `bun run test -- tests/BoatWorld.test.ts`

Expected: FAIL because `BoatWorld.ts` does not exist.

- [ ] **Step 3: Implement pure helpers and a focused world lifecycle**

```ts
export function clampParallax(x: number, y: number, reducedMotion: boolean): { yaw: number; pitch: number } {
  if (reducedMotion) return { yaw: 0, pitch: 0 };
  return {
    yaw: Math.min(0.045, Math.max(-0.045, x * 0.045)),
    pitch: Math.min(0.025, Math.max(-0.025, y * 0.025)),
  };
}

export function survivalLighting(weather: WeatherId, phase: 'day' | 'night') {
  if (phase === 'night') return { ambient: weather === 'squall' ? 0.18 : 0.28, key: 0.22, fogDensity: weather === 'squall' ? 0.032 : 0.022 };
  if (weather === 'calm') return { ambient: 1.1, key: 2.2, fogDensity: 0.012 };
  if (weather === 'squall') return { ambient: 0.48, key: 0.7, fogDensity: 0.028 };
  return { ambient: 0.72, key: 1.15, fogDensity: 0.018 };
}
```

Implement this exact class surface:

```ts
export class BoatWorld {
  readonly scene: Scene;
  constructor(camera: PerspectiveCamera, reducedMotion: MediaQueryList);
  setPointer(normalizedX: number, normalizedY: number): void;
  setPhase(phase: 'day' | 'night'): void;
  setWeather(weather: WeatherId): void;
  play(cue: PresentationCue): Promise<void>;
  skipSequence(): void;
  update(time: number, delta: number): void;
  dispose(): void;
}
```

Construction requirements:

- Reuse `OceanRenderer` around the camera and `DEFAULT_WAVES` for sampled boat pose.
- Build a survival boat group with hull sides, bow, floor, oar mounts, damaged-plank patch, supply crate, rod, line, and five supply silhouettes using procedural Three.js geometry.
- Frame the camera at approximately `(0, 0.65, 1.55)` looking toward negative Z over the bow.
- Apply smoothed boat pitch/roll to a parent camera rig and clamped parallax to the camera itself.
- Use ambient and directional lights plus fog from `survivalLighting`.
- Keep a single cancellable presentation sequence; `play()` resolves after 0.8–1.5 seconds depending on cue, and `skipSequence()` resolves it immediately.
- `dispose()` is idempotent and releases every owned geometry/material plus ocean resources.
- Sequence time advances only inside `update(time, delta)`; do not use `setTimeout`. When the phase is paused or the document is hidden, it skips the world update so an in-progress sequence cannot complete in the background.

- [ ] **Step 4: Add weather and sequence presentation without changing rules**

Map cues to visible transforms:

```ts
const CUE_DURATION: Readonly<Record<PresentationCue, number>> = {
  none: 0, fish: 1.2, dive: 1.4, repair: 0.9, treat: 0.8, rest: 0.8,
  storm: 1.2, impact: 0.8, darkness: 1, sighting: 1.2,
  rescue: 1.5, death: 1.5, sinking: 1.5,
};
```

Fishing rotates the rod and reveals the line/catch mesh. Diving lowers the camera rig through a blue fog transition before restoring it. Repair focuses the camera toward the patch. Storm/impact add bounded transient boat motion. Rescue reveals a distant vessel silhouette; death/sinking darken or lower the rig. Reduced motion keeps opacity/light changes but removes camera lurch.

- [ ] **Step 5: Run focused tests, typecheck, and build**

Run: `bun run test -- tests/BoatWorld.test.ts`

Expected: all helper tests pass.

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run build`

Expected: TypeScript and Vite production build succeed.

- [ ] **Step 6: Commit the boat world**

```powershell
git add src/survival/BoatWorld.ts src/world/Lifeboat.ts tests/BoatWorld.test.ts
git commit -m "feat: add cinematic lifeboat world"
```

---

### Task 5: Survival HUD, Actions, Inventory, and Events

**Files:**
- Create: `src/ui/SurvivalUI.ts`
- Create: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: immutable `SurvivalSnapshot`, `ActionOutcome`, `DayActionId`, and `ItemId`.
- Produces: callbacks `onAction`, `onEventItem`, `onEndure`, `onContinue`, `onRestart`, `onPointer`, `onSkip`; methods `render`, `showOutcome`, `setBusy`, `showEnding`, and `dispose`.

- [ ] **Step 1: Write failing jsdom tests for rendering and commands**

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalUI } from '../src/ui/SurvivalUI';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';

afterEach(() => { document.body.innerHTML = ''; });

function snapshot() {
  return new SurvivalSession(['fishingRod', 'waterJug'], {
    seed: 7,
    random: sequenceRandom([0.5]),
  }).snapshot();
}

describe('SurvivalUI', () => {
  it('renders labeled meters, actions, weather, and item charges', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    ui.render(snapshot(), () => null);
    expect(mount.querySelector('[data-day]')?.textContent).toContain('DAY 1');
    expect(mount.querySelector('[data-meter="health"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(mount.querySelector('[data-meter="hunger"]')?.getAttribute('aria-valuenow')).toBe('20');
    expect(mount.querySelector('[data-item="waterJug"]')?.textContent).toContain('3');
    expect(mount.querySelectorAll('[data-action]')).toHaveLength(7);
  });

  it('emits one action and blocks controls while busy', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), () => null);
    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    expect(action).toHaveBeenCalledWith('fish', undefined);
    ui.setBusy(true);
    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    expect(action).toHaveBeenCalledOnce();
  });

  it('shows unavailable reasons and event item selection accessibly', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    ui.render(snapshot(), (action) => action === 'repair' ? 'No repair material or duct tape.' : null);
    expect(mount.querySelector('[data-action="repair"]')?.getAttribute('aria-description')).toContain('No repair material');
    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves below.', danger: 'dangerous' }, snapshot());
    expect(mount.querySelector('[data-event]')?.classList).toContain('is-visible');
    expect(mount.querySelector('[data-event-items] [data-item="fishingRod"]')).not.toBeNull();
  });

  it('shows distinct terminal copy and emits full restart once', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    const restart = vi.fn();
    ui.onRestart = restart;
    ui.showEnding('sunk', 8, 1234, 37);
    expect(mount.querySelector('[data-ending-title]')?.textContent).toContain('Boat is gone');
    mount.querySelector<HTMLButtonElement>('[data-restart]')!.click();
    expect(restart).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests and verify the missing-class failure**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: FAIL because `SurvivalUI.ts` does not exist.

- [ ] **Step 3: Build the complete DOM structure and callback surface**

Use these callbacks and methods exactly:

```ts
export class SurvivalUI {
  onAction: (action: DayActionId, option?: DayActionOption) => void = () => undefined;
  onEventItem: (itemId: ItemId) => void = () => undefined;
  onEndure: () => void = () => undefined;
  onContinue: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onPointer: (x: number, y: number) => void = () => undefined;
  onSkip: () => void = () => undefined;
  onPauseChange: (paused: boolean) => void = () => undefined;

  constructor(mount: HTMLElement);
  render(snapshot: SurvivalSnapshot, unavailable: (action: DayActionId) => string | null): void;
  showEvent(event: Pick<SurvivalEventDefinition, 'id' | 'title' | 'prompt' | 'danger'>, snapshot: SurvivalSnapshot): void;
  showOutcome(outcome: ActionOutcome): void;
  hideOutcome(): void;
  setBusy(busy: boolean): void;
  setPaused(paused: boolean): void;
  showEnding(state: 'rescued' | 'dead' | 'sunk', day: number, seed: number, scavengeElapsedSeconds: number): void;
  dispose(): void;
}
```

The constructor creates one `.survival-ui` root containing:

- `[data-day]`, `[data-weather]`, and `[data-phase]`.
- Four `role="meter"` elements with `aria-valuemin="0"`, `aria-valuemax="100"`, numeric value labels, and fill spans.
- Seven buttons with `data-action` and shortcuts `1` through `7`.
- Four transparent but focusable diegetic hotspot buttons with `data-hotspot="fish|dive|repair|inventory"`, positioned over the rod, water, hull patch, and supply crate; they emit the same callbacks as the action dock.
- Inventory toggle/tray and all eight item rows.
- Event overlay, event item buttons, and `ENDURE`.
- Outcome panel with delta list and `CONTINUE`.
- Ending panel showing ending type, days survived, scavenging time, and seed, with `[data-restart]` labeled `START FROM THE SHIP`.
- Pause panel with `RESUME`; Escape closes the inventory first, otherwise toggles this panel through `onPauseChange`.

Escape closes the inventory or pauses; number keys activate enabled action buttons when overlays are closed. `dispose()` removes every document/window listener, clears callbacks, removes the root, and is idempotent.

- [ ] **Step 4: Implement differential render and focus restoration**

Store last rendered primitive values so unchanged meter/action nodes are not replaced. Update meter attributes and CSS custom property `--meter-value` in place. When an event opens, focus its heading; when it closes, return focus to the action that preceded it. `setBusy(true)` disables action/event buttons and adds `aria-busy="true"` without hiding them.

- [ ] **Step 5: Run UI tests, typecheck, and full suite**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: all SurvivalUI tests pass.

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 6: Commit the survival UI**

```powershell
git add src/ui/SurvivalUI.ts tests/SurvivalUI.test.ts
git commit -m "feat: add survival management interface"
```

---

### Task 6: Survival Phase Orchestration

**Files:**
- Create: `src/app/GamePhase.ts`
- Create: `src/survival/SurvivalPhase.ts`
- Create: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: shared renderer/camera/mount context, `SurvivalSession`, `BoatWorld`, and `SurvivalUI`.
- Produces: `GamePhase`, `PhaseContext`, `SurvivalPhase`, `onRestart`, and a single-command presentation queue.

- [ ] **Step 1: Define the phase contract and write failing orchestration tests with fakes**

```ts
// src/app/GamePhase.ts
import type { PerspectiveCamera, WebGLRenderer } from 'three';

export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  reducedMotion: MediaQueryList;
}

export interface GamePhase {
  start(): void;
  update(time: number, deltaSeconds: number): void;
  resize(width: number, height: number): void;
  render(): void;
  dispose(): void;
}
```

```ts
import { describe, expect, it, vi } from 'vitest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';

it('resolves one command, blocks another during presentation, and renders the new snapshot', async () => {
  let finishSequence!: () => void;
  const play = vi.fn(() => new Promise<void>((resolve) => { finishSequence = resolve; }));
  const perform = vi.fn().mockReturnValue({ accepted: true, code: 'fish-caught', message: 'Caught one.', deltas: { energy: -2, food: 1 }, cue: 'fish' });
  const render = vi.fn();
  const phase = SurvivalPhase.forTest({
    session: { perform, snapshot: vi.fn(() => ({ state: 'day', day: 1 })) },
    world: { play, update: vi.fn(), dispose: vi.fn(), setPointer: vi.fn(), skipSequence: vi.fn() },
    ui: { render, showOutcome: vi.fn(), setBusy: vi.fn(), dispose: vi.fn() },
  });
  phase.handleAction('fish');
  phase.handleAction('fish');
  expect(perform).toHaveBeenCalledOnce();
  finishSequence();
  await Promise.resolve();
  phase.handleContinue();
  expect(render).toHaveBeenCalled();
});

it('shows an ending once and restarts only through its callback', () => {
  const restart = vi.fn();
  const showEnding = vi.fn();
  const phase = SurvivalPhase.forTest({
    session: { snapshot: vi.fn(() => ({ state: 'sunk', day: 6, seed: 8 })) },
    world: { update: vi.fn(), dispose: vi.fn() },
    ui: { render: vi.fn(), showEnding, dispose: vi.fn() },
    onRestart: restart,
  });
  phase.update(1, 0.016);
  phase.update(2, 0.016);
  expect(showEnding).toHaveBeenCalledOnce();
  phase.requestRestart();
  expect(restart).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run tests and verify missing phase failure**

Run: `bun run test -- tests/SurvivalPhase.test.ts`

Expected: FAIL because `SurvivalPhase.ts` does not exist.

- [ ] **Step 3: Implement command routing and the presentation lock**

Implement these exact methods:

```ts
export interface SurvivalPhaseTestDependencies {
  session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  world: Partial<BoatWorld>;
  ui: Partial<SurvivalUI>;
  onRestart?: () => void;
}

export class SurvivalPhase implements GamePhase {
  constructor(
    context: PhaseContext,
    savedItems: readonly ItemId[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
  );
  static forTest(dependencies: SurvivalPhaseTestDependencies): SurvivalPhase;
  start(): void;
  update(time: number, deltaSeconds: number): void;
  resize(width: number, height: number): void;
  render(): void;
  handleAction(action: DayActionId, option?: DayActionOption): void;
  handleEventItem(itemId: ItemId): void;
  handleEndure(): void;
  handleContinue(): void;
  setPaused(paused: boolean): void;
  requestRestart(): void;
  dispose(): void;
}
```

Route every accepted outcome through one `present(outcome)` function:

```ts
private present(outcome: ActionOutcome): void {
  this.ui.showOutcome(outcome);
  if (!outcome.accepted) return;
  this.busy = true;
  this.ui.setBusy(true);
  void this.world.play(outcome.cue).finally(() => {
    if (this.disposed) return;
    this.busy = false;
    this.ui.setBusy(false);
    this.awaitingContinue = true;
  });
}
```

`handleContinue()` requires `awaitingContinue`, clears it, hides the outcome, renders the snapshot, and opens any pending event. After the first accepted energy-spending action, call `requestDayEvent()` after Continue. End day opens a night event. Resolving a night event may advance dawn and immediately show an ending. Render each terminal ending once using a stored `presentedTerminalState`. Fish opens a small choice panel only when bait is available and passes `useBait` when selected. Repair passes `repairMaterial` when material exists and otherwise offers `ductTape` when a charge exists.

- [ ] **Step 4: Wire UI callbacks, pointer parallax, skipping, resize, and disposal**

`start()` performs the initial state render, sets world weather/phase, and installs a visibility listener. `setPaused()` stores presentation-only pause state and updates the UI. Hiding the document pauses immediately; resuming requires the UI action. `update()` skips sequence/world advancement while paused or hidden, otherwise updates world presentation and terminal detection. `render()` calls `context.renderer.render(world.scene, context.camera)`. `resize()` updates camera aspect/projection and does not resize the shared renderer. `dispose()` removes the visibility listener, is idempotent, invalidates pending promise completions, and disposes only phase-owned UI/world resources.

- [ ] **Step 5: Run phase tests and verification**

Run: `bun run test -- tests/SurvivalPhase.test.ts`

Expected: all orchestration tests pass.

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 6: Commit the survival phase**

```powershell
git add src/app/GamePhase.ts src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts
git commit -m "feat: orchestrate the survival phase"
```

---

### Task 7: Shared Director and Scavenging Handoff

**Files:**
- Create: `src/phases/ScavengePhase.ts`
- Create: `tests/GameDirector.test.ts`
- Modify: `src/Game.ts`
- Modify: `src/game/ScavengeSession.ts`
- Modify: `src/ui/GameUI.ts`
- Modify: `tests/ScavengeSession.test.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/GameUI.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `GamePhase`, `PhaseContext`, `SurvivalPhase`, existing scavenging systems, and saved `ItemId[]`.
- Produces: director-backed `Game`, `ScavengeResult`, `ScavengePhase`, clean success handoff, and full restart.

- [ ] **Step 1: Add a successful scavenging result test**

```ts
it('returns an immutable result containing only saved item IDs', () => {
  const session = new ScavengeSession();
  session.start();
  session.pickUp('flareGun');
  session.saveCarried();
  session.pickUp('waterJug');
  session.dropCarried();
  session.tick(12);
  session.evacuate();
  expect(session.result()).toEqual({ savedItems: ['flareGun'], elapsedSeconds: 12 });
  const result = session.result()!;
  expect(() => (result.savedItems as ItemId[]).push('waterJug')).toThrow();
});
```

Implement:

```ts
export interface ScavengeResult {
  savedItems: readonly ItemId[];
  elapsedSeconds: number;
}

result(): Readonly<ScavengeResult> | null {
  if (this.status !== 'success') return null;
  return Object.freeze({
    savedItems: Object.freeze(ITEM_IDS.filter((id) => this.items[id] === 'saved')),
    elapsedSeconds: RUN_SECONDS - this.remainingSeconds,
  });
}
```

- [ ] **Step 2: Write failing director transition tests using injected phase factories**

```ts
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game';

it('disposes scavenging before starting survival with a copied result', () => {
  const calls: string[] = [];
  let complete!: (result: { savedItems: readonly ['flareGun']; elapsedSeconds: number }) => void;
  const scavenge = { start: vi.fn(), update: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn(() => calls.push('dispose-scavenge')) };
  const survival = { start: vi.fn(() => calls.push('start-survival')), update: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
  const game = Game.forTest({
    createScavenge: (_context, onComplete) => { complete = onComplete; return scavenge; },
    createSurvival: (_context, result) => { expect(result.savedItems).toEqual(['flareGun']); return survival; },
  });
  game.start();
  complete({ savedItems: ['flareGun'], elapsedSeconds: 8 });
  expect(calls).toEqual(['dispose-scavenge', 'start-survival']);
});

it('full restart disposes survival and creates fresh scavenging', () => {
  const phase = { start: vi.fn(), update: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
  const createScavenge = vi.fn(() => phase);
  const game = Game.forTest({
    createScavenge,
    createSurvival: vi.fn(() => phase),
  });
  game.restart();
  expect(createScavenge).toHaveBeenCalled();
});
```

- [ ] **Step 3: Extract the current controller into `ScavengePhase` without gameplay changes**

Move the current `Game` fields and frame body into a class implementing `GamePhase`. Required changes:

```ts
export class ScavengePhase implements GamePhase {
  constructor(
    private readonly context: PhaseContext,
    private readonly onComplete: (result: Readonly<ScavengeResult>) => void,
    private readonly onRestart: () => void,
  );
  start(): void;
  update(time: number, deltaSeconds: number): void;
  resize(width: number, height: number): void;
  render(): void;
  dispose(): void;
}
```

- Use `context.renderer`, `context.camera`, and a phase-owned `Scene`.
- Remove renderer/canvas construction, RAF scheduling, global resize, and renderer disposal from this class.
- Keep pointer-lock and visibility listeners phase-owned.
- On terminal success, call `session.result()` and `onComplete(result)` once instead of `GameUI.showResult`.
- On terminal scavenging failure, retain the failure sequence and result screen; its replay callback calls `onRestart` instead of `window.location.reload()`.
- Update lifecycle tests to assert only phase-owned resources are disposed.

- [ ] **Step 4: Replace `Game.ts` with the shared director**

The public production constructor remains `new Game(mount)`. Implement this surface:

```ts
export interface GameFactories {
  createScavenge(
    context: PhaseContext,
    onComplete: (result: Readonly<ScavengeResult>) => void,
    onRestart: () => void,
  ): GamePhase;
  createSurvival(
    context: PhaseContext,
    result: Readonly<ScavengeResult>,
    seed: number,
    onRestart: () => void,
  ): GamePhase;
}

export class Game {
  constructor(mount: HTMLElement);
  static forTest(factories: GameFactories): Game;
  start(): void;
  restart(): void;
  dispose(): void;
}
```

Production behavior:

- Create one `WebGLRenderer`, `PerspectiveCamera`, `Clock`, and reduced-motion query.
- Prepend one canvas and retain it across phases.
- Create `ScavengePhase` first.
- Own one RAF callback that clamps delta to 0.05, forwards elapsed time/delta to the active phase, and then calls the active phase's `render()` method.
- On successful scavenging: exit pointer lock if needed, dispose the old phase, reset the shared camera transform, freeze a copied result containing `savedItems: [...result.savedItems]` and `elapsedSeconds`, then create/start `SurvivalPhase` with both values.
- On restart: dispose the current phase, create a fresh seed using `crypto.getRandomValues` with a timestamp fallback, and create/start a new `ScavengePhase`.
- Own resize listeners and renderer sizing; forward dimensions to the active phase.
- `dispose()` cancels RAF, removes listeners, disposes the active phase and renderer, and removes the canvas exactly once.

`ScavengePhase.render()` calls `context.renderer.render(this.scene, context.camera)`. Both phases expose the same render boundary and the director never inspects their scene implementations.

- [ ] **Step 5: Update UI callbacks and main entry without changing startup error behavior**

Keep `main.ts`'s `try/catch` and compatibility HTML unchanged. `GameUI` retains failure result rendering and changes replay to a callback supplied by `ScavengePhase`. Remove only the successful scavenging result path now replaced by handoff.

- [ ] **Step 6: Run transition, lifecycle, UI, and full tests**

Run: `bun run test -- tests/GameDirector.test.ts tests/GameLifecycle.test.ts tests/ScavengeSession.test.ts tests/GameUI.test.ts`

Expected: all director and migrated scavenging tests pass.

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 7: Commit the complete phase handoff**

```powershell
git add src/Game.ts src/main.ts src/app/GamePhase.ts src/phases/ScavengePhase.ts src/game/ScavengeSession.ts src/ui/GameUI.ts tests/GameDirector.test.ts tests/GameLifecycle.test.ts tests/ScavengeSession.test.ts tests/GameUI.test.ts
git commit -m "feat: connect scavenging to boat survival"
```

---

### Task 8: Visual Polish, Accessibility, Documentation, and Final Verification

**Files:**
- Modify: `src/styles/main.css`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/smoke.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the complete two-phase game.
- Produces: responsive survival styling, keyboard/reduced-motion completion, documented controls/rules, and verified production output.

- [ ] **Step 1: Add failing accessibility and content smoke assertions**

```ts
it('labels every survival action and meter without relying on color', () => {
  const mount = document.createElement('main');
  const ui = new SurvivalUI(mount);
  ui.render(snapshot(), () => null);
  [...mount.querySelectorAll('[role="meter"]')].forEach((meter) => {
    expect(meter.getAttribute('aria-label')).toBeTruthy();
    expect(meter.querySelector('[data-meter-value]')?.textContent).toMatch(/^\d+$/);
  });
  [...mount.querySelectorAll<HTMLButtonElement>('[data-action]')].forEach((button) => {
    expect(button.textContent?.trim()).not.toBe('');
    expect(button.getAttribute('aria-keyshortcuts')).toMatch(/^[1-7]$/);
  });
});
```

Add smoke assertions that event IDs are unique, there are exactly three weather IDs, and all eight scavenged items have survival definitions.

- [ ] **Step 2: Run focused tests and verify any missing labels/shortcuts fail**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/smoke.test.ts`

Expected: FAIL on missing accessibility metadata until the UI is completed.

- [ ] **Step 3: Add survival CSS with a restrained first-person overlay**

Add focused selectors for:

```css
.survival-ui { position: fixed; inset: 0; pointer-events: none; font-family: ui-monospace, "Cascadia Mono", monospace; }
.survival-status { position: absolute; inset: 20px 24px auto; display: flex; justify-content: space-between; }
.survival-meters { display: grid; width: min(360px, 42vw); gap: 8px; }
.survival-meter { --meter-value: 0; display: grid; grid-template-columns: 7rem 1fr 3rem; align-items: center; gap: 10px; }
.survival-meter__track { height: 8px; border: 1px solid #b9b5a766; background: #172227cc; }
.survival-meter__fill { width: calc(var(--meter-value) * 1%); height: 100%; background: #b08968; transition: width 220ms ease; }
.survival-actions { position: absolute; left: 50%; bottom: 24px; display: flex; gap: 6px; transform: translateX(-50%); pointer-events: auto; }
.survival-action, .survival-item { border: 1px solid #b9b5a766; background: #172227e8; color: #ece8dc; cursor: pointer; }
.survival-action:disabled, .survival-item:disabled { cursor: not-allowed; opacity: 0.46; }
.survival-event, .survival-outcome, .survival-ending { position: absolute; inset: 0; display: grid; place-content: center; pointer-events: auto; background: #10191dcc; }
```

Complete the design with distinct meter accent classes, danger states, inventory tray, event card, delta chips, focus-visible outlines, 1280×720-safe spacing, and a narrow-window reflow. Do not add gradients to panels. Under `prefers-reduced-motion`, reduce all survival transitions to 1ms and let `BoatWorld` remove parallax/lurch.

- [ ] **Step 4: Finish keyboard, focus, busy, and reduced-motion behavior**

Verify:

- Number keys 1–7 activate only legal actions.
- `Escape` closes the item tray first and otherwise opens the pause state.
- `Enter` activates focused controls.
- Event and outcome overlays trap focus until resolved.
- Closing an overlay restores the preceding action's focus.
- `aria-live="polite"` announces outcome text once; terminal headings use `role="alert"` only once.
- Busy controls remain visible and cannot emit duplicate commands.

- [ ] **Step 5: Update README with the complete game loop**

Document:

- Scavenging controls (`WASD`, mouse, Shift, E, Escape).
- Survival controls (mouse, Tab, Enter, Escape, 1–7).
- Resource meanings and daytime actions.
- Day/night events, item selection, variable rescue, and full restart on failure.
- Updated architecture directories: `app`, `phases`, `survival`, `world/ocean`, `ui`.
- Existing `bun run dev`, `test`, `typecheck`, `build`, and `preview` commands.
- No saves/mobile controls in this milestone.

- [ ] **Step 6: Run complete automated verification**

Run: `bun run typecheck`

Expected: exit 0 with no diagnostics.

Run: `bun run test`

Expected: every test file passes with zero failures.

Run: `bun run build`

Expected: Vite production build succeeds and writes `dist/`.

- [ ] **Step 7: Perform manual browser QA**

Run: `bun run dev`

Verify at 1280×720, 1440×900, and 1920×1080:

1. Start scavenging, save a known subset, and evacuate.
2. Confirm pointer lock releases and the survival view contains exactly that subset.
3. Exercise fish, dive, eat, repair with material, repair with tape, treat, rest, and end day.
4. Resolve one day and one night event with a correct item, unsuitable item, and endure choice.
5. Confirm meter deltas, charge consumption, disabled reasons, seeded result copy, and no double activation.
6. Complete rescue with a sighting/flare and by natural chance.
7. Reach both health death and hull sinking; confirm restart returns to fresh scavenging.
8. Hide the tab during a sequence, resize, use keyboard-only navigation, and enable reduced motion.
9. Confirm ocean/boat motion stays synchronized and comfortable.

- [ ] **Step 8: Commit the polished and verified feature**

```powershell
git add src/styles/main.css src/ui/SurvivalUI.ts src/survival/BoatWorld.ts tests/SurvivalUI.test.ts tests/smoke.test.ts README.md
git commit -m "feat: polish and document boat survival loop"
```

---

## Final Review Checklist

- [ ] Compare every design-spec section to Tasks 1–8 and confirm coverage.
- [ ] Confirm no placeholder markers or undefined future interfaces remain in this plan.
- [ ] Confirm public signatures match between producing and consuming tasks.
- [ ] Run `git status --short` and preserve any unrelated user changes.
- [ ] Run `bun run typecheck`, `bun run test`, and `bun run build` once more after all commits.
- [ ] Use `superpowers:requesting-code-review` before declaring implementation complete.
- [ ] Use `superpowers:verification-before-completion` before the final handoff.
