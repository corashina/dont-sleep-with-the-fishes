# Sleep with the Fishes — Web MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable web MVP of *Don't Sleep With The Fishes* (lifeboat survival horror) as a 2.5D three.js diorama with scavenge → crewmate → day/night loop → rescue/death.

**Architecture:** State-machine + Scene-manager. Pure game rules live in `content/` + `state/` (unit-tested). three.js rendering lives in `world/` (manually verified). DOM overlay UI in `ui/`. Scenes glue them together.

**Tech Stack:** Vite, TypeScript, three.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-sleep-with-fishes-mvp-design.md`

## Global Constraints

- **Runtime:** Modern Chromium/Firefox, 60fps target on mid-range laptop.
- **Versions:** `three@^0.160`, `typescript@^5.4`, `vite@^5.2`, `vitest@^1.6`, `@types/three@^0.160`.
- **No external art assets** — all visuals procedural from three.js primitives.
- **No backend / no save system** in MVP.
- **UI is DOM overlay**, never in-canvas text/buttons.
- **Naming:** US English copy; item IDs are camelCase; event/phase IDs are lowercase strings.
- **One `requestAnimationFrame` loop**, owned by `Game.ts`.
- Every logic task ends with `npm run test` green and a commit.

---

## File Structure

```
sleep-with-fishes/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── opencode.json                 # already exists
├── src/
│   ├── main.ts                   # entry: bootstraps Game
│   ├── Game.ts                   # orchestrator: renderer, loop, SceneManager, screens
│   ├── state/
│   │   ├── phases.ts             # Phase enum + canTransition
│   │   ├── EventBus.ts           # typed pub/sub
│   │   └── GameState.ts          # central state + rule methods (mutating)
│   ├── content/
│   │   ├── items.ts              # item defs
│   │   ├── crewmates.ts          # 2 crewmate defs + bonuses
│   │   └── nightEvents.ts        # event defs + resolveNight + pickNightEvent
│   ├── world/
│   │   ├── Environment.ts        # sky/fog/lights + day/night blend
│   │   ├── Diorama.ts            # ocean/boat/crewmate/camera + raycast
│   │   └── PropFactory.ts        # item meshes + hotspot helper
│   ├── ui/
│   │   ├── HUD.ts                # resource bars
│   │   ├── ActionBar.ts          # day buttons + night item picker
│   │   └── Dialogs.ts            # narrative text
│   ├── scenes/
│   │   ├── Scene.ts              # Scene interface
│   │   ├── SceneManager.ts       # swap scenes + tick
│   │   ├── ScavengeScene.ts
│   │   ├── CrewSelectScene.ts
│   │   ├── DayScene.ts
│   │   ├── NightScene.ts
│   │   └── EndingScene.ts
│   └── utils/
│       └── rng.ts                # seeded RNG + weighted pick
└── tests/
    ├── phases.test.ts
    ├── EventBus.test.ts
    ├── content.test.ts
    ├── GameState.test.ts
    ├── dayActions.test.ts
    ├── nightEvents.test.ts
    ├── dayCycle.test.ts
    └── rng.test.ts
```

**Responsibilities:**
- `content/*.ts` = pure data + pure functions. No three.js, no DOM.
- `state/GameState.ts` = data + mutating rule methods (testable; no three.js/DOM).
- `world/*.ts` = three.js only; reads state, draws; no game rules.
- `ui/*.ts` = DOM only; reads state via EventBus; no three.js.
- `scenes/*.ts` = wire state + world + ui for one phase each.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.ts`, `.gitignore`
- Keep: `opencode.json`

**Interfaces:**
- Produces: runnable `npm run dev`, `npm run build`, `npm run test`, `npm run typecheck`.

- [ ] **Step 1: Initialize git and package.json**

Run from project root:
```bash
git init
```

Create `package.json`:
```json
{
  "name": "sleep-with-fishes",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "three": "^0.160.0"
  },
  "devDependencies": {
    "@types/three": "^0.160.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create vite.config.ts and vitest.config.ts**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: 'dist' },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', globals: true, include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create index.html and src/main.ts**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sleep with the Fishes</title>
    <style>
      html, body { margin: 0; height: 100%; background: #05070d; overflow: hidden; }
      #app { position: fixed; inset: 0; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
console.log('scaffold ok');
```

`.gitignore`:
```
node_modules
dist
.vite
*.log
```

- [ ] **Step 5: Install and verify**

Run:
```bash
npm install
npm run typecheck
npm run test
npm run build
```
Expected: typecheck clean; `npm run test` reports "No test files found" (exit 0 acceptable) or passes; build emits `dist/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + ts + three + vitest"
```

---

## Task 2: phases.ts (Phase enum + transitions)

**Files:**
- Create: `src/state/phases.ts`, `tests/phases.test.ts`

**Interfaces:**
- Produces: `Phase` enum, `canTransition(from: Phase, to: Phase): boolean`.

- [ ] **Step 1: Write failing test**

`tests/phases.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Phase, canTransition } from '../src/state/phases';

describe('phases', () => {
  it('allows intro -> scavenge', () => {
    expect(canTransition(Phase.Intro, Phase.Scavenge)).toBe(true);
  });
  it('allows scavenge -> crewSelect', () => {
    expect(canTransition(Phase.Scavenge, Phase.CrewSelect)).toBe(true);
  });
  it('allows crewSelect -> day', () => {
    expect(canTransition(Phase.CrewSelect, Phase.Day)).toBe(true);
  });
  it('allows day -> night and night -> day', () => {
    expect(canTransition(Phase.Day, Phase.Night)).toBe(true);
    expect(canTransition(Phase.Night, Phase.Day)).toBe(true);
  });
  it('allows day/night -> ending', () => {
    expect(canTransition(Phase.Day, Phase.Ending)).toBe(true);
    expect(canTransition(Phase.Night, Phase.Ending)).toBe(true);
  });
  it('disallows illegal jumps', () => {
    expect(canTransition(Phase.Intro, Phase.Night)).toBe(false);
    expect(canTransition(Phase.Day, Phase.Scavenge)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- phases`
Expected: FAIL — cannot find module `../src/state/phases`.

- [ ] **Step 3: Implement**

`src/state/phases.ts`:
```ts
export const Phase = {
  Intro: 'intro',
  Scavenge: 'scavenge',
  CrewSelect: 'crewSelect',
  Day: 'day',
  Night: 'night',
  Ending: 'ending',
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

const LEGAL: Record<Phase, Phase[]> = {
  [Phase.Intro]: [Phase.Scavenge],
  [Phase.Scavenge]: [Phase.CrewSelect],
  [Phase.CrewSelect]: [Phase.Day],
  [Phase.Day]: [Phase.Night, Phase.Ending],
  [Phase.Night]: [Phase.Day, Phase.Ending],
  [Phase.Ending]: [],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return LEGAL[from]?.includes(to) ?? false;
}
```

> `Phase` is a const object (value) plus a union type, so both `Phase.Scavenge` and the literal `'scavenge'` typecheck everywhere — including the test helpers in later tasks.

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- phases`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/phases.ts tests/phases.test.ts
git commit -m "feat: phase enum and transition rules"
```

---

## Task 3: EventBus.ts (typed pub/sub)

**Files:**
- Create: `src/state/EventBus.ts`, `tests/EventBus.test.ts`

**Interfaces:**
- Produces: `GameEvent` union, `EventBus` class with `emit(e)` and `on(type, handler) => unsubscribe`.

- [ ] **Step 1: Write failing test**

`tests/EventBus.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/state/EventBus';
import { Phase } from '../src/state/phases';

describe('EventBus', () => {
  it('delivers typed events to handlers', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.on('phaseChange', h);
    bus.emit({ type: 'phaseChange', phase: Phase.Day });
    expect(h).toHaveBeenCalledWith({ type: 'phaseChange', phase: Phase.Day });
  });
  it('unsubscribe stops delivery', () => {
    const bus = new EventBus();
    const h = vi.fn();
    const off = bus.on('resourceChange', h);
    off();
    bus.emit({ type: 'resourceChange', resource: 'hunger' });
    expect(h).not.toHaveBeenCalled();
  });
  it('does not deliver other event types', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.on('message', h);
    bus.emit({ type: 'phaseChange', phase: Phase.Day });
    expect(h).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- EventBus`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`src/state/EventBus.ts`:
```ts
import type { Phase } from './phases';

// Canonical home of ResourceKey to avoid a GameState <-> EventBus import cycle.
export type ResourceKey = 'hunger' | 'hull' | 'health' | 'morale' | 'energy';

export type GameEvent =
  | { type: 'phaseChange'; phase: Phase }
  | { type: 'resourceChange'; resource: ResourceKey }
  | { type: 'inventoryChange' }
  | { type: 'message'; text: string };

export type GameEventType = GameEvent['type'];

type Handler<E extends GameEvent> = (e: E) => void;

export class EventBus {
  private handlers: Map<GameEventType, Set<Handler<any>>> = new Map();

  on<T extends GameEvent>(type: T['type'], handler: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<E extends GameEvent>(e: E): void {
    this.handlers.get(e.type)?.forEach((h) => h(e));
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- EventBus`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/EventBus.ts tests/EventBus.test.ts
git commit -m "feat: typed EventBus pub/sub"
```

---

## Task 4: content data tables (items, crewmates, nightEvents)

**Files:**
- Create: `src/content/items.ts`, `src/content/crewmates.ts`, `src/content/nightEvents.ts`, `tests/content.test.ts`

**Interfaces:**
- Produces: `ItemDef`, `ITEMS`, `ItemKey` (items); `CrewmateDef`, `CrewmateId`, `CREWMATES`, `CREWMATE_LIST` (crewmates); `NightEventDef`, `NIGHT_EVENTS` (events).
- Consumes: `ResourceKey` from `EventBus.ts`.

- [ ] **Step 1: Write failing test**

`tests/content.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ITEMS } from '../src/content/items';
import { CREWMATES, CREWMATE_LIST } from '../src/content/crewmates';
import { NIGHT_EVENTS } from '../src/content/nightEvents';

describe('content tables', () => {
  it('items has the 10 MVP items plus food', () => {
    for (const id of ['anchor', 'flareGun', 'flashlight', 'ductTape', 'bucket', 'bait', 'fishingRod', 'firstAidKit', 'harpoonGun', 'spyglass', 'food']) {
      expect(ITEMS[id], `missing ${id}`).toBeDefined();
    }
  });
  it('crewmates has frederik and row with correct perks', () => {
    expect(CREWMATE_LIST.map((c) => c.id).sort()).toEqual(['frederik', 'row']);
    expect(CREWMATES.frederik.repairBonus).toBe(5);
    expect(CREWMATES.frederik.guaranteesBait).toBe(true);
    expect(CREWMATES.row.monsterDamageMultiplier).toBe(0.5);
    expect(CREWMATES.row.monsterEvents).toContain('giantSquid');
    expect(CREWMATES.row.monsterEvents).toContain('eerieMelody');
  });
  it('night events has 4 MVP events with counters', () => {
    const ids = NIGHT_EVENTS.map((e) => e.id);
    expect(ids.sort()).toEqual(['eerieMelody', 'giantSquid', 'hope', 'leak']);
    const leak = NIGHT_EVENTS.find((e) => e.id === 'leak')!;
    expect(leak.validCounters).toContain('ductTape');
    expect(leak.failureCost.hull).toBeGreaterThan(0);
    const melody = NIGHT_EVENTS.find((e) => e.id === 'eerieMelody')!;
    expect(melody.worseWithItem).toBe('flashlight');
    const hope = NIGHT_EVENTS.find((e) => e.id === 'hope')!;
    expect(hope.validCounters).toContain('flareGun');
    expect(hope.isRescue).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- content`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement items.ts**

`src/content/items.ts`:
```ts
export interface ItemDef {
  id: string;
  name: string;
  mesh: string;
  stackable?: boolean;
  flags?: string[];
}

export const ITEMS: Record<string, ItemDef> = {
  anchor:      { id: 'anchor',      name: 'Anchor',      mesh: 'anchor' },
  flareGun:    { id: 'flareGun',    name: 'Flare Gun',   mesh: 'flare',  flags: ['rescue'] },
  flashlight:  { id: 'flashlight',  name: 'Flashlight',  mesh: 'flashlight' },
  ductTape:    { id: 'ductTape',    name: 'Duct Tape',   mesh: 'tape' },
  bucket:      { id: 'bucket',      name: 'Bucket',      mesh: 'bucket' },
  bait:        { id: 'bait',        name: 'Bait',        mesh: 'bait' },
  fishingRod:  { id: 'fishingRod',  name: 'Fishing Rod', mesh: 'rod' },
  firstAidKit: { id: 'firstAidKit', name: 'First Aid Kit', mesh: 'aid' },
  harpoonGun:  { id: 'harpoonGun',  name: 'Harpoon Gun', mesh: 'harpoon' },
  spyglass:    { id: 'spyglass',    name: 'Spyglass',    mesh: 'spyglass' },
  food:        { id: 'food',        name: 'Food',        mesh: 'food', stackable: true },
};

export const SCAVENGE_POOL: string[] = [
  'anchor', 'flareGun', 'flashlight', 'ductTape', 'bucket',
  'bait', 'fishingRod', 'firstAidKit', 'harpoonGun', 'spyglass',
];
```

- [ ] **Step 4: Implement crewmates.ts**

`src/content/crewmates.ts`:
```ts
export type CrewmateId = 'frederik' | 'row';

export interface CrewmateDef {
  id: CrewmateId;
  name: string;
  perkSummary: string;
  color: number;                       // three.js hex color for figure tint
  repairBonus: number;                 // extra hull per Repair (base 10)
  guaranteesBait: boolean;             // +1 bait each successful fish day
  monsterDamageMultiplier: number;     // applied to listed events (1 = full)
  monsterEvents: string[];             // event ids this multiplier applies to
}

export const CREWMATES: Record<CrewmateId, CrewmateDef> = {
  frederik: {
    id: 'frederik',
    name: 'Frederik',
    perkSummary: 'Better repairs (+15). Guarantees bait when fishing.',
    color: 0xc0a16b,
    repairBonus: 5,           // base 10 + 5 = 15
    guaranteesBait: true,
    monsterDamageMultiplier: 1,
    monsterEvents: [],
  },
  row: {
    id: 'row',
    name: 'Row',
    perkSummary: 'Halves damage from the Squid and the Siren. Cheaper repairs.',
    color: 0x7fa8c9,
    repairBonus: 0,           // base 10 (cheaper is flavor; repair cost not modeled in MVP)
    guaranteesBait: false,
    monsterDamageMultiplier: 0.5,
    monsterEvents: ['giantSquid', 'eerieMelody'],
  },
};

export const CREWMATE_LIST: CrewmateDef[] = [CREWMATES.frederik, CREWMATES.row];
```

- [ ] **Step 5: Implement nightEvents.ts (data only)**

`src/content/nightEvents.ts`:
```ts
import type { ResourceKey } from '../state/EventBus';

export type Cost = Partial<Record<ResourceKey, number>>;

export interface NightEventDef {
  id: string;
  name: string;
  description: string;
  validCounters: string[];     // item ids that resolve safely
  failureCost: Cost;           // applied if wrong/none chosen
  worseWithItem?: string;      // trap item
  worseCost?: Cost;            // applied if trap item chosen
  weight: number;              // base random weight
  isRescue?: boolean;
}

export const NIGHT_EVENTS: NightEventDef[] = [
  {
    id: 'leak',
    name: 'Leak',
    description: 'Water gushes through a cracked plank. Patch it fast.',
    validCounters: ['ductTape'],
    failureCost: { hull: 30 },
    weight: 3,
  },
  {
    id: 'giantSquid',
    name: 'Giant Squid',
    description: 'A massive tentacle coils around the hull.',
    validCounters: ['anchor'],
    failureCost: { hull: 60 },
    weight: 2,
  },
  {
    id: 'eerieMelody',
    name: 'Eerie Melody',
    description: 'A haunting song drifts across the water. Do NOT shine a light.',
    validCounters: ['ductTape'],
    failureCost: { health: 20 },
    worseWithItem: 'flashlight',
    worseCost: { health: 45, morale: 20 },
    weight: 2,
  },
  {
    id: 'hope',
    name: 'Hope',
    description: 'Lights on the horizon — a passing ship! Signal them!',
    validCounters: ['flareGun'],
    failureCost: {},
    weight: 1,
    isRescue: true,
  },
];

export const NIGHT_EVENT_BY_ID: Record<string, NightEventDef> =
  Object.fromEntries(NIGHT_EVENTS.map((e) => [e.id, e]));
```

- [ ] **Step 6: Run test to verify pass**

Run: `npm run test -- content`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/content tests/content.test.ts
git commit -m "feat: content data tables (items, crewmates, night events)"
```

---

## Task 5: GameState core (data + accessors + inventory + resources)

**Files:**
- Create: `src/state/GameState.ts`, `tests/GameState.test.ts`

**Interfaces:**
- Consumes: `Phase`, `canTransition`; `EventBus`, `GameEvent`, `ResourceKey`; `CrewmateId`.
- Produces: `GameState` class with: `setPhase`, `addItem` (returns boolean, respects `maxSlots`, ignores stackable `food`), `hasItem`, `removeItem`, `addFood`, `consumeFood`, `setCrewmate`, `adjustResource` (clamps 0–100), `isDead`, `reset`.

- [ ] **Step 1: Write failing test**

`tests/GameState.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GameState } from '../src/state/GameState';
import { Phase } from '../src/state/phases';

describe('GameState', () => {
  it('starts at intro with full resources and empty inventory', () => {
    const s = new GameState();
    expect(s.phase).toBe(Phase.Intro);
    expect(s.resources.hull).toBe(100);
    expect(s.inventory).toEqual([]);
    expect(s.food).toBe(0);
    expect(s.crewmate).toBeNull();
  });
  it('setPhase enforces legal transitions', () => {
    const s = new GameState();
    expect(() => s.setPhase(Phase.Night)).toThrow();
    s.setPhase(Phase.Scavenge);
    expect(s.phase).toBe(Phase.Scavenge);
  });
  it('addItem respects maxSlots (5) and rejects duplicates', () => {
    const s = new GameState();
    s.setPhase(Phase.Scavenge);
    expect(s.addItem('anchor')).toBe(true);
    expect(s.addItem('anchor')).toBe(false); // duplicate
    s.addItem('flareGun'); s.addItem('flashlight'); s.addItem('ductTape'); s.addItem('bucket');
    expect(s.inventory.length).toBe(5);
    expect(s.addItem('bait')).toBe(false); // full
  });
  it('hasItem / removeItem', () => {
    const s = new GameState();
    s.setPhase(Phase.Scavenge);
    s.addItem('anchor');
    expect(s.hasItem('anchor')).toBe(true);
    s.removeItem('anchor');
    expect(s.hasItem('anchor')).toBe(false);
  });
  it('food is stackable and does not consume slots', () => {
    const s = new GameState();
    s.addFood(3);
    expect(s.food).toBe(3);
    expect(s.inventory).toEqual([]);
    expect(s.consumeFood()).toBe(true);
    expect(s.food).toBe(2);
  });
  it('consumeFood fails when empty', () => {
    const s = new GameState();
    expect(s.consumeFood()).toBe(false);
  });
  it('adjustResource clamps 0..100', () => {
    const s = new GameState();
    s.adjustResource('hull', -30);
    expect(s.resources.hull).toBe(70);
    s.adjustResource('hull', -999);
    expect(s.resources.hull).toBe(0);
    s.adjustResource('hunger', 999);
    expect(s.resources.hunger).toBe(100);
  });
  it('isDead true when hunger/hull/health hit 0', () => {
    const s = new GameState();
    expect(s.isDead()).toBe(false);
    s.adjustResource('hull', -100);
    expect(s.isDead()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- GameState`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`src/state/GameState.ts`:
```ts
import { Phase, canTransition } from './phases';
import { EventBus } from './EventBus';
import type { ResourceKey } from './EventBus';
import type { CrewmateId } from '../content/crewmates';

export const MAX_SLOTS = 5;
export const STARTING_RESOURCES = { hunger: 100, hull: 100, health: 100, morale: 70, energy: 100 };
export const DAILY_HUNGER_TICK = 25;
export const BASE_REPAIR = 10;
export const FISH_FOOD_YIELD = 1;
export const EAT_HUNGER_RESTORE = 25;
export const FIRST_AID_HEAL = 70;
export const HOPE_GUARANTEE_DAY = 5;

export class GameState {
  readonly bus = new EventBus();
  phase: Phase = Phase.Intro;
  day = 1;
  resources = { ...STARTING_RESOURCES };
  inventory: string[] = [];
  food = 0;
  crewmate: CrewmateId | null = null;
  maxSlots = MAX_SLOTS;
  actionsLeftToday = 3;
  hopeAppeared = false;
  rescued = false;

  setPhase(p: Phase): void {
    if (!canTransition(this.phase, p)) {
      throw new Error(`illegal transition ${this.phase} -> ${p}`);
    }
    this.phase = p;
    this.bus.emit({ type: 'phaseChange', phase: p });
  }

  addItem(id: string): boolean {
    if (id === 'food') return false;
    if (this.inventory.includes(id)) return false;
    if (this.inventory.length >= this.maxSlots) return false;
    this.inventory.push(id);
    this.bus.emit({ type: 'inventoryChange' });
    return true;
  }

  hasItem(id: string): boolean {
    return id === 'food' ? this.food > 0 : this.inventory.includes(id);
  }

  removeItem(id: string): void {
    const i = this.inventory.indexOf(id);
    if (i >= 0) {
      this.inventory.splice(i, 1);
      this.bus.emit({ type: 'inventoryChange' });
    }
  }

  addFood(n: number): void {
    this.food += n;
    this.bus.emit({ type: 'inventoryChange' });
  }

  consumeFood(): boolean {
    if (this.food <= 0) return false;
    this.food -= 1;
    this.bus.emit({ type: 'inventoryChange' });
    return true;
  }

  setCrewmate(id: CrewmateId): void {
    this.crewmate = id;
  }

  adjustResource(key: ResourceKey, delta: number): void {
    this.resources[key] = Math.max(0, Math.min(100, this.resources[key] + delta));
    this.bus.emit({ type: 'resourceChange', resource: key });
  }

  isDead(): boolean {
    return this.resources.hunger <= 0 || this.resources.hull <= 0 || this.resources.health <= 0;
  }

  reset(): void {
    this.phase = Phase.Intro;
    this.day = 1;
    this.resources = { ...STARTING_RESOURCES };
    this.inventory = [];
    this.food = 0;
    this.crewmate = null;
    this.actionsLeftToday = 3;
    this.hopeAppeared = false;
    this.rescued = false;
    this.bus.emit({ type: 'inventoryChange' });
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- GameState`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/GameState.ts tests/GameState.test.ts
git commit -m "feat: GameState core (resources, inventory, transitions)"
```

---

## Task 6: rng.ts (seeded RNG + weighted pick)

**Files:**
- Create: `src/utils/rng.ts`, `tests/rng.test.ts`

**Interfaces:**
- Produces: `Rng` class (mulberry32), `weightedPick(rng, items: {weight:number}[], fallbackIndex:number)`.

- [ ] **Step 1: Write failing test**

`tests/rng.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng, weightedPick } from '../src/utils/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42).next();
    const b = new Rng(42).next();
    expect(a).toBe(b);
  });
  it('produces values in [0,1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 100; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('weightedPick returns fallbackIndex when all weights are 0', () => {
    const rng = new Rng(5);
    const items = [{ w: 0 }, { w: 0 }];
    expect(weightedPick(rng, items.map((i) => ({ weight: i.w })), 1)).toBe(1);
  });
  it('weightedPick selects the only weighted item', () => {
    const rng = new Rng(5);
    const idx = weightedPick(rng, [{ weight: 0 }, { weight: 1 }], 0);
    expect(idx).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- rng`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`src/utils/rng.ts`:
```ts
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function weightedPick(
  rng: Rng,
  items: { weight: number }[],
  fallbackIndex: number,
): number {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0) return fallbackIndex;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(0, items[i].weight);
    if (r < w) return i;
    r -= w;
  }
  return fallbackIndex;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- rng`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/rng.ts tests/rng.test.ts
git commit -m "feat: seeded RNG and weighted pick"
```

---

## Task 7: Day actions engine

**Files:**
- Modify: `src/state/GameState.ts` (add day-action methods)
- Create: `tests/dayActions.test.ts`

**Interfaces:**
- Consumes: `CREWMATES`, item requirements.
- Produces on GameState: `canPerformDayAction(a): {ok, reason}`, `performDayAction(a): {ok, reason, message}`, `startNewDay(): void` (resets `actionsLeftToday = 3`).

- [ ] **Step 1: Write failing test**

`tests/dayActions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GameState } from '../src/state/GameState';

function dayState(): GameState {
  const s = new GameState();
  s.setPhase('scavenge');
  s.setPhase('crewSelect');
  s.setPhase('day');
  s.addItem('fishingRod'); s.addItem('bait');
  return s;
}

describe('day actions', () => {
  it('fish requires rod + bait and yields 1 food', () => {
    const s = dayState();
    const r = s.performDayAction('fish');
    expect(r.ok).toBe(true);
    expect(s.food).toBe(1);
    expect(s.actionsLeftToday).toBe(2);
  });
  it('fish fails without rod', () => {
    const s = dayState();
    s.removeItem('fishingRod');
    const r = s.performDayAction('fish');
    expect(r.ok).toBe(false);
    expect(s.food).toBe(0);
    expect(s.actionsLeftToday).toBe(3);
  });
  it('eat consumes 1 food and restores hunger', () => {
    const s = dayState();
    s.addFood(2);
    s.adjustResource('hunger', -40); // 60
    const r = s.performDayAction('eat');
    expect(r.ok).toBe(true);
    expect(s.food).toBe(1);
    expect(s.resources.hunger).toBe(85);
  });
  it('eat fails without food', () => {
    const s = dayState();
    expect(s.performDayAction('eat').ok).toBe(false);
  });
  it('repair restores base 10; frederik adds 5', () => {
    const s = dayState();
    s.setCrewmate('frederik');
    s.adjustResource('hull', -50); // 50
    s.performDayAction('repair');
    expect(s.resources.hull).toBe(65);
  });
  it('row uses base 10', () => {
    const s = dayState();
    s.setCrewmate('row');
    s.adjustResource('hull', -50);
    s.performDayAction('repair');
    expect(s.resources.hull).toBe(60);
  });
  it('chat restores morale', () => {
    const s = dayState();
    s.adjustResource('morale', -30); // 40
    s.performDayAction('chat');
    expect(s.resources.morale).toBeGreaterThan(40);
  });
  it('frederik guarantees bait on a successful fish day', () => {
    const s = dayState();
    s.setCrewmate('frederik');
    s.removeItem('bait');                 // no bait now
    expect(s.performDayAction('fish').ok).toBe(false);
    s.addItem('bait');
    s.performDayAction('fish');           // consumes 1 bait...
    expect(s.hasItem('bait')).toBe(true); // ...but frederik guarantees +1
  });
  it('cannot act when no actions left', () => {
    const s = dayState();
    s.actionsLeftToday = 0;
    expect(s.performDayAction('chat').ok).toBe(false);
  });
  it('startNewDay resets actions to 3', () => {
    const s = dayState();
    s.actionsLeftToday = 0;
    s.startNewDay();
    expect(s.actionsLeftToday).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- dayActions`
Expected: FAIL — `performDayAction` is not a function.

- [ ] **Step 3: Implement (append to GameState.ts)**

Add import at top of `src/state/GameState.ts`:
```ts
import { CREWMATES } from '../content/crewmates';
```

Add methods inside the `GameState` class (before `reset()`):
```ts
  canPerformDayAction(a: DayAction): { ok: boolean; reason?: string } {
    if (this.actionsLeftToday <= 0) return { ok: false, reason: 'No actions left today.' };
    switch (a) {
      case 'fish':
        if (!this.hasItem('fishingRod')) return { ok: false, reason: 'Need a fishing rod.' };
        if (!this.hasItem('bait')) return { ok: false, reason: 'Need bait.' };
        return { ok: true };
      case 'eat':
        if (!this.hasItem('food')) return { ok: false, reason: 'No food to eat.' };
        return { ok: true };
      case 'repair':
      case 'chat':
        return { ok: true };
    }
  }

  performDayAction(a: DayAction): { ok: boolean; reason?: string; message: string } {
    const check = this.canPerformDayAction(a);
    if (!check.ok) return { ok: false, reason: check.reason, message: check.reason ?? 'Cannot.' };

    switch (a) {
      case 'fish': {
        this.removeItem('bait');
        this.addFood(FISH_FOOD_YIELD);
        if (this.crewmate && CREWMATES[this.crewmate].guaranteesBait) this.addItem('bait');
        this.actionsLeftToday--;
        return { ok: true, message: 'You reel in a fish. +1 Food.' };
      }
      case 'eat': {
        this.consumeFood();
        this.adjustResource('hunger', EAT_HUNGER_RESTORE);
        this.actionsLeftToday--;
        return { ok: true, message: 'You eat. Hunger restored.' };
      }
      case 'repair': {
        const bonus = this.crewmate ? CREWMATES[this.crewmate].repairBonus : 0;
        this.adjustResource('hull', BASE_REPAIR + bonus);
        this.actionsLeftToday--;
        return { ok: true, message: 'You patch the hull.' };
      }
      case 'chat': {
        this.adjustResource('morale', 12);
        this.actionsLeftToday--;
        return { ok: true, message: 'You share a quiet word. Morale rises.' };
      }
    }
  }

  startNewDay(): void {
    this.day += 1;
    this.actionsLeftToday = 3;
    this.adjustResource('hunger', -DAILY_HUNGER_TICK);
  }
```

Add the `DayAction` type at the bottom of `src/state/GameState.ts`:
```ts
export type DayAction = 'fish' | 'eat' | 'repair' | 'chat';
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- dayActions`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/GameState.ts tests/dayActions.test.ts
git commit -m "feat: day action economy (fish/eat/repair/chat + crewmate bonuses)"
```

---

## Task 8: Night event resolution

**Files:**
- Modify: `src/content/nightEvents.ts` (add `resolveNight`, `pickNightEvent`)
- Create: `tests/nightEvents.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Rng`, `weightedPick`, `NIGHT_EVENTS`, `HOPE_GUARANTEE_DAY`.
- Produces: `NightResult` type, `resolveNight(state, eventId, itemId)`, `pickNightEvent(rng, day, hopeAppeared)`.

- [ ] **Step 1: Write failing test**

`tests/nightEvents.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GameState } from '../src/state/GameState';
import { Rng } from '../src/utils/rng';
import { resolveNight, pickNightEvent, NIGHT_EVENT_BY_ID } from '../src/content/nightEvents';

function nightState(): GameState {
  const s = new GameState();
  s.setPhase('scavenge'); s.setPhase('crewSelect'); s.setPhase('day'); s.setPhase('night');
  return s;
}

describe('night resolution', () => {
  it('correct counter = safe, no cost', () => {
    const s = nightState();
    s.addItem('ductTape');
    const r = resolveNight(s, 'leak', 'ductTape');
    expect(r.outcome).toBe('safe');
    expect(r.rescued).toBe(false);
    expect(s.resources.hull).toBe(100);
  });
  it('wrong item = failure cost applied', () => {
    const s = nightState();
    s.addItem('bucket'); // not a valid counter for leak
    const r = resolveNight(s, 'leak', 'bucket');
    expect(r.outcome).toBe('failure');
    expect(s.resources.hull).toBe(70); // -30
  });
  it('no item (empty string) = failure cost applied', () => {
    const s = nightState();
    const r = resolveNight(s, 'leak', '');
    expect(r.outcome).toBe('failure');
    expect(s.resources.hull).toBe(70);
  });
  it('eerieMelody + flashlight = worse outcome', () => {
    const s = nightState();
    s.addItem('flashlight');
    const r = resolveNight(s, 'eerieMelody', 'flashlight');
    expect(r.outcome).toBe('worse');
    expect(s.resources.health).toBe(55);  // 100-45
    expect(s.resources.morale).toBe(50);  // 70-20
  });
  it('eerieMelody + ductTape = safe', () => {
    const s = nightState();
    s.addItem('ductTape');
    const r = resolveNight(s, 'eerieMelody', 'ductTape');
    expect(r.outcome).toBe('safe');
  });
  it('hope + flareGun = rescued', () => {
    const s = nightState();
    s.addItem('flareGun');
    const r = resolveNight(s, 'hope', 'flareGun');
    expect(r.outcome).toBe('safe');
    expect(r.rescued).toBe(true);
    expect(s.rescued).toBe(true);
  });
  it('row halves giant squid failure damage', () => {
    const s = nightState();
    s.setCrewmate('row');
    s.addItem('bucket');
    resolveNight(s, 'giantSquid', 'bucket');
    expect(s.resources.hull).toBe(70); // 60 halved -> 30 damage
  });
  it('pickNightEvent forces hope by day 5 if not yet appeared', () => {
    const rng = new Rng(123);
    const id = pickNightEvent(rng, 5, false);
    expect(id).toBe('hope');
  });
  it('pickNightEvent returns a valid event id', () => {
    const rng = new Rng(7);
    const id = pickNightEvent(rng, 1, false);
    expect(NIGHT_EVENT_BY_ID[id]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- nightEvents`
Expected: FAIL — `resolveNight` not exported.

- [ ] **Step 3: Implement (append to nightEvents.ts)**

Append to `src/content/nightEvents.ts`:
```ts
import { Rng, weightedPick } from '../utils/rng';
import { HOPE_GUARANTEE_DAY, type GameState } from '../state/GameState';
import { CREWMATES } from './crewmates';
import { ITEMS } from './items';

export type NightOutcome = 'safe' | 'failure' | 'worse';

export interface NightResult {
  outcome: NightOutcome;
  rescued: boolean;
  message: string;
}

export function resolveNight(
  state: GameState,
  eventId: string,
  itemId: string,
): NightResult {
  const def = NIGHT_EVENT_BY_ID[eventId];
  if (!def) throw new Error(`unknown night event ${eventId}`);

  const crewmate = state.crewmate ? CREWMATES[state.crewmate] : null;
  const applyCost = (cost: Cost) => {
    for (const [key, dmg] of Object.entries(cost)) {
      let amount = dmg as number;
      if (crewmate && crewmate.monsterEvents.includes(eventId)) {
        amount = Math.round(amount * crewmate.monsterDamageMultiplier);
      }
      state.adjustResource(key as ResourceKey, -amount);
    }
  };

  // trap item takes priority
  if (def.worseWithItem && itemId === def.worseWithItem && def.worseCost) {
    applyCost(def.worseCost);
    return { outcome: 'worse', rescued: false, message: `${def.name}: the light made it worse!` };
  }

  if (itemId && def.validCounters.includes(itemId)) {
    if (def.isRescue) {
      state.rescued = true;
      return { outcome: 'safe', rescued: true, message: `${def.name}: you signal the ship — rescued!` };
    }
    return { outcome: 'safe', rescued: false, message: `${def.name}: the ${ITEMS[itemId]?.name ?? itemId} holds.` };
  }

  applyCost(def.failureCost);
  return { outcome: 'failure', rescued: false, message: `${def.name}: you weren't ready.` };
}

export function pickNightEvent(rng: Rng, day: number, hopeAppeared: boolean): string {
  if (!hopeAppeared && day >= HOPE_GUARANTEE_DAY) return 'hope';
  const idx = weightedPick(
    rng,
    NIGHT_EVENTS.map((e) => ({ weight: e.weight })),
    0,
  );
  return NIGHT_EVENTS[idx].id;
}
```

> These are clean top-level imports — `GameState`, `crewmates`, and `items` do not import `nightEvents`, so there is no cycle.

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- nightEvents`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/nightEvents.ts tests/nightEvents.test.ts
git commit -m "feat: night event resolution + weighted picker"
```

---

## Task 9: End-to-end logic cycle test (death + rescue + day loop)

**Files:**
- Create: `tests/dayCycle.test.ts`

**Interfaces:**
- Consumes: all prior logic. No new exports.

- [ ] **Step 1: Write integration test**

`tests/dayCycle.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GameState } from '../src/state/GameState';
import { Rng } from '../src/utils/rng';
import { resolveNight, pickNightEvent } from '../src/content/nightEvents';

function reachDay(): GameState {
  const s = new GameState();
  s.setPhase('scavenge');
  s.addItem('flareGun'); s.addItem('fishingRod'); s.addItem('bait'); s.addItem('ductTape'); s.addItem('anchor');
  s.setPhase('crewSelect');
  s.setCrewmate('frederik');
  s.setPhase('day');
  return s;
}

describe('day cycle integration', () => {
  it('death by hunger after enough days without food', () => {
    const s = reachDay();
    const rng = new Rng(99);
    let days = 0;
    while (!s.isDead() && days < 30) {
      // spend actions without eating
      while (s.actionsLeftToday > 0) s.performDayAction('chat');
      s.setPhase('night');
      const ev = pickNightEvent(rng, s.day, s.hopeAppeared);
      if (ev === 'hope') s.hopeAppeared = true;
      resolveNight(s, ev, '');
      if (s.rescued) break;
      s.setPhase('day');
      s.startNewDay();
      days++;
    }
    expect(s.isDead()).toBe(true);
  });
  it('rescue on hope + flareGun', () => {
    const s = reachDay();
    const rng = new Rng(99);
    s.setPhase('night');
    const ev = pickNightEvent(rng, s.day, s.hopeAppeared);
    if (ev === 'hope') s.hopeAppeared = true;
    const r = resolveNight(s, ev, ev === 'hope' ? 'flareGun' : 'ductTape');
    // force hope path for deterministic rescue
    const r2 = resolveNight(s, 'hope', 'flareGun');
    expect(r2.rescued).toBe(true);
    expect(s.rescued).toBe(true);
  });
  it('day counter advances', () => {
    const s = reachDay();
    const d0 = s.day;
    s.setPhase('night'); resolveNight(s, 'leak', 'ductTape');
    s.setPhase('day'); s.startNewDay();
    expect(s.day).toBe(d0 + 1);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm run test`
Expected: ALL tests pass (full suite green).

- [ ] **Step 3: Commit**

```bash
git add tests/dayCycle.test.ts
git commit -m "test: end-to-end day/night cycle, death and rescue"
```

---

## Task 10: world/Environment.ts (sky, fog, lights, day/night blend)

**Files:**
- Create: `src/world/Environment.ts`

**Interfaces:**
- Produces: `Environment` class: `constructor(scene)`, `setTimeOfDay(t: 'day'|'night', animate=true)`, `update(dt)`.

> No unit test — verified manually in Task 18. Pure three.js.

- [ ] **Step 1: Implement**

`src/world/Environment.ts`:
```ts
import * as THREE from 'three';

interface Palette { fog: number; sky: number; light: number; lightInt: number; ambient: number; }

const DAY: Palette = { fog: 0x9fd6e6, sky: 0x8fc7d8, light: 0xfff2d0, lightInt: 1.1, ambient: 0x5577aa };
const NIGHT: Palette = { fog: 0x05070d, sky: 0x0a1326, light: 0x9fb4d8, lightInt: 0.35, ambient: 0x223355 };

export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly ambient: THREE.HemisphereLight;
  readonly lantern: THREE.PointLight;
  private sky: THREE.Mesh;
  private current: Palette = DAY;

  constructor(private scene: THREE.Scene) {
    scene.fog = new THREE.FogExp2(DAY.fog, 0.012);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(100, 24, 16),
      new THREE.MeshBasicMaterial({ color: DAY.sky, side: THREE.BackSide, fog: false }),
    );
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(DAY.light, DAY.lightInt);
    this.sun.position.set(5, 10, 4);
    scene.add(this.sun);

    this.ambient = new THREE.HemisphereLight(DAY.ambient, 0x202030, 0.6);
    scene.add(this.ambient);

    this.lantern = new THREE.PointLight(0xffb066, 0, 8, 2);
    this.lantern.position.set(0, 1.2, 0);
    scene.add(this.lantern);
  }

  setTimeOfDay(t: 'day' | 'night', animate = true): void {
    const target = t === 'day' ? DAY : NIGHT;
    this.current = target;
    if (!animate) this.apply(target, 1);
  }

  private lerpColor(a: number, b: number, k: number): number {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return ca.lerp(cb, k).getHex();
  }

  private apply(p: Palette, k: number): void {
    (this.scene.fog as THREE.FogExp2).color.setHex(p.fog);
    (this.scene.fog as THREE.FogExp2).density = THREE.MathUtils.lerp(0.012, 0.06, p === DAY ? 1 - k : k);
    (this.sky.material as THREE.MeshBasicMaterial).color.setHex(p.sky);
    this.sun.color.setHex(p.light);
    this.sun.intensity = p.lightInt;
    this.lantern.intensity = p === DAY ? 0 : 1.6;
  }

  update(_dt: number): void {
    this.apply(this.current, 1);
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/world/Environment.ts
git commit -m "feat(world): environment — sky, fog, lights, day/night blend"
```

---

## Task 11: world/PropFactory.ts (item meshes)

**Files:**
- Create: `src/world/PropFactory.ts`

**Interfaces:**
- Produces: `PropFactory.build(itemId): THREE.Group`, `PropFactory.hotspot(): THREE.Mesh`.

- [ ] **Step 1: Implement**

`src/world/PropFactory.ts`:
```ts
import * as THREE from 'three';

const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.1 });

export const PropFactory = {
  build(id: string): THREE.Group {
    const g = new THREE.Group();
    switch (id) {
      case 'anchor': {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 16), mat(0x33383d));
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), mat(0x33383d));
        shank.position.y = -0.2;
        g.add(ring, shank);
        break;
      }
      case 'flareGun': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.08), mat(0xb02b2b));
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), mat(0xcc4444));
        barrel.rotation.z = Math.PI / 2;
        barrel.position.x = 0.18;
        g.add(body, barrel);
        break;
      }
      case 'flashlight': {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), mat(0x222222));
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), mat(0x555555));
        head.position.y = 0.15;
        g.add(handle, head);
        break;
      }
      case 'ductTape': {
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), mat(0xd9d9d9));
        roll.rotation.x = Math.PI / 2;
        g.add(roll);
        break;
      }
      case 'bucket': {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 12), mat(0x3aa0a0));
        g.add(b);
        break;
      }
      case 'bait': {
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0x9999aa));
        fish.scale.set(1.4, 0.7, 0.7);
        g.add(fish);
        break;
      }
      case 'fishingRod': {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.0, 6), mat(0x6b4a2b));
        rod.position.y = 0.5;
        g.add(rod);
        break;
      }
      case 'firstAidKit': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.18), mat(0xeeeeee));
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), mat(0xcc2222));
        g.add(box, cross);
        break;
      }
      case 'harpoonGun': {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), mat(0x444444));
        shaft.rotation.z = Math.PI / 2;
        g.add(shaft);
        break;
      }
      case 'spyglass': {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 10), mat(0xb8862b));
        tube.rotation.z = Math.PI / 2;
        g.add(tube);
        break;
      }
      case 'food': {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xd07a3a));
        g.add(f);
        break;
      }
      default: {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), mat(0x885522)));
      }
    }
    return g;
  },

  hotspot(): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.5 }),
    );
    m.userData.hotspot = true;
    return m;
  },
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/world/PropFactory.ts
git commit -m "feat(world): procedural item meshes + hotspot"
```

---

## Task 12: world/Diorama.ts (ocean, boat, crewmate, camera, raycast)

**Files:**
- Create: `src/world/Diorama.ts`

**Interfaces:**
- Consumes: `CREWMATES`, `PropFactory`, `Environment`.
- Produces: `Diorama` class with `setCrewmate(id)`, `showInventory(ids, food)`, `showHotspots(ids, onClick)`, `clearHotspots()`, `getCamera()`, `update(dt)`, `onPointerDown(e, cb)`, `enableOrbit(enabled)`.

- [ ] **Step 1: Implement**

`src/world/Diorama.ts`:
```ts
import * as THREE from 'three';
import { Environment } from './Environment';
import { PropFactory } from './PropFactory';
import { CREWMATES } from '../content/crewmates';

export class Diorama {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly env: Environment;
  private boat = new THREE.Group();
  private crewmate: THREE.Group | null = null;
  private ocean: THREE.Mesh;
  private hotspotGroup = new THREE.Group();
  private inventoryGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private dragging = false;
  private lastX = 0;
  private azimuth = 0.6;
  private orbitEnabled = true;
  private hotspotClickCb: ((id: string) => void) | null = null;
  private clock = 0;

  constructor(private renderer: THREE.WebGLRenderer, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.positionCamera();

    this.env = new Environment(this.scene);
    this.scene.add(this.boat, this.hotspotGroup, this.inventoryGroup);

    this.ocean = this.buildOcean();
    this.scene.add(this.ocean);

    this.buildBoat();
  }

  private positionCamera(): void {
    const r = 6;
    this.camera.position.set(Math.sin(this.azimuth) * r, 4.2, Math.cos(this.azimuth) * r);
    this.camera.lookAt(0, 0.4, 0);
  }

  private buildOcean(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(120, 120, 40, 40);
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1d6a8c, roughness: 0.4 }));
  }

  private buildBoat(): void {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.7), hullMat);
    hull.position.y = 0;
    this.boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), hullMat);
    mast.position.set(0, 0.6, 0);
    this.boat.add(mast);
    this.boat.position.y = 0.2;
  }

  setCrewmate(id: 'frederik' | 'row'): void {
    if (this.crewmate) this.boat.remove(this.crewmate);
    const def = CREWMATES[id];
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 8), m);
    body.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m);
    head.position.y = 0.62;
    g.add(body, head);
    g.position.set(0.2, 0.2, 0);
    this.crewmate = g;
    this.boat.add(g);
  }

  showInventory(ids: string[], food: number): void {
    this.inventoryGroup.clear();
    const all = [...ids];
    if (food > 0) all.push('food');
    all.forEach((id, i) => {
      const mesh = PropFactory.build(id);
      const row = Math.floor(i / 3);
      const col = i % 3;
      mesh.position.set(-0.5 + col * 0.35, 0.3, -0.5 + row * 0.35);
      this.inventoryGroup.add(mesh);
    });
  }

  showHotspots(ids: string[], onClick: (id: string) => void): void {
    this.clearHotspots();
    this.hotspotClickCb = onClick;
    ids.forEach((id, i) => {
      const hs = PropFactory.hotspot();
      hs.userData.id = id;
      const a = (i / Math.max(1, ids.length)) * Math.PI * 2;
      hs.position.set(Math.cos(a) * 1.6, 0.8, Math.sin(a) * 1.6);
      const icon = PropFactory.build(id);
      icon.position.copy(hs.position);
      this.hotspotGroup.add(hs, icon);
    });
  }

  clearHotspots(): void {
    this.hotspotGroup.clear();
    this.hotspotClickCb = null;
  }

  getCamera(): THREE.PerspectiveCamera { return this.camera; }

  enableOrbit(v: boolean): void { this.orbitEnabled = v; }

  onPointerDown(e: PointerEvent, _fallback?: () => void): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.hotspotGroup.children, true);
    const hit = hits.find((h) => h.object.userData.hotspot || h.object.userData.id);
    if (hit && this.hotspotClickCb) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.id) o = o.parent;
      if (o?.userData.id) this.hotspotClickCb(o.userData.id);
    }
  }

  onDrag(e: PointerEvent, isDown: boolean): void {
    if (!this.orbitEnabled) return;
    if (isDown) { this.dragging = true; this.lastX = e.clientX; }
    else if (e.type === 'pointermove' && this.dragging) {
      this.azimuth += (e.clientX - this.lastX) * 0.005;
      this.lastX = e.clientX;
      this.positionCamera();
    } else if (!isDown && e.type === 'pointerup') this.dragging = false;
  }

  update(dt: number): void {
    this.clock += dt;
    const swell = Math.sin(this.clock * 0.8) * 0.06;
    this.boat.position.y = 0.2 + swell;
    this.boat.rotation.z = Math.sin(this.clock * 0.6) * 0.03;
    this.env.update(dt);
    this.positionCamera();
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/world/Diorama.ts
git commit -m "feat(world): diorama — ocean, boat, crewmate, camera, raycast"
```

---

## Task 13: ui/HUD.ts (resource bars)

**Files:**
- Create: `src/ui/HUD.ts`

**Interfaces:**
- Consumes: `GameState`, `ResourceKey`.
- Produces: `HUD` class: `constructor(root: HTMLElement, state)`, `render()`, `setDayLabel(text)`.

- [ ] **Step 1: Implement**

`src/ui/HUD.ts`:
```ts
import type { GameState } from '../state/GameState';

const ORDER: { key: 'hunger'|'hull'|'health'|'morale'|'energy'; label: string; color: string }[] = [
  { key: 'hunger', label: 'Hunger', color: '#e0a33a' },
  { key: 'hull',   label: 'Hull',   color: '#9a9a9a' },
  { key: 'health', label: 'Health', color: '#c0392b' },
  { key: 'morale', label: 'Morale', color: '#8e44ad' },
  { key: 'energy', label: 'Energy', color: '#27ae60' },
];

export class HUD {
  private bars: Record<string, HTMLDivElement> = {};
  private dayLabel: HTMLDivElement;

  constructor(root: HTMLElement, private state: GameState) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;gap:12px;padding:10px;font:13px system-ui;color:#eef;pointer-events:none;';
    for (const o of ORDER) {
      const col = document.createElement('div');
      col.innerHTML = `<div style="opacity:.8;margin-bottom:3px">${o.label}</div>`;
      const track = document.createElement('div');
      track.style.cssText = `width:90px;height:8px;background:#222;border-radius:4px;overflow:hidden`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:100%;background:${o.color};transition:width .25s`;
      track.appendChild(fill);
      col.appendChild(track);
      wrap.appendChild(col);
      this.bars[o.key] = fill;
    }
    this.dayLabel = document.createElement('div');
    this.dayLabel.style.cssText = 'margin-left:auto;align-self:center;font-weight:bold';
    wrap.appendChild(this.dayLabel);
    root.appendChild(wrap);
  }

  render(): void {
    for (const o of ORDER) {
      this.bars[o.key].style.width = `${this.state.resources[o.key]}%`;
    }
  }

  setDayLabel(text: string): void { this.dayLabel.textContent = text; }
}
```

- [ ] **Step 2: Verify typecheck & commit**

Run: `npm run typecheck`
```bash
git add src/ui/HUD.ts
git commit -m "feat(ui): HUD resource bars"
```

---

## Task 14: ui/Dialogs.ts + ui/ActionBar.ts

**Files:**
- Create: `src/ui/Dialogs.ts`, `src/ui/ActionBar.ts`

**Interfaces:**
- Produces: `Dialogs` (`setText(text)`, `clear()`); `ActionBar` with builders for each phase.

- [ ] **Step 1: Implement Dialogs.ts**

`src/ui/Dialogs.ts`:
```ts
export class Dialogs {
  private box: HTMLDivElement;
  constructor(root: HTMLElement) {
    this.box = document.createElement('div');
    this.box.style.cssText = 'position:absolute;left:50%;bottom:64px;transform:translateX(-50%);width:min(620px,80%);background:rgba(8,12,20,.82);color:#eef;padding:12px 16px;border-radius:8px;font:15px/1.4 system-ui;pointer-events:none';
    root.appendChild(this.box);
  }
  setText(text: string): void { this.box.textContent = text; this.box.style.display = 'block'; }
  clear(): void { this.box.style.display = 'none'; }
}
```

- [ ] **Step 2: Implement ActionBar.ts**

`src/ui/ActionBar.ts`:
```ts
export class ActionBar {
  private root: HTMLDivElement;
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:10px;flex-wrap:wrap;justify-content:center';
    parent.appendChild(this.root);
  }
  clear(): void { this.root.innerHTML = ''; }
  button(label: string, cb: () => void, opts: { disabled?: boolean } = {}): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = !!opts.disabled;
    b.style.cssText = 'padding:10px 14px;border:none;border-radius:6px;background:#2b4a6f;color:#fff;font:14px system-ui;cursor:pointer';
    if (b.disabled) { b.style.background = '#444'; b.style.cursor = 'not-allowed'; }
    b.onclick = cb;
    this.root.appendChild(b);
    return b;
  }
  itemButtons(ids: string[], labels: Record<string, string>, onPick: (id: string) => void): void {
    ids.forEach((id) => this.button(labels[id] ?? id, () => onPick(id)));
    this.button('(do nothing)', () => onPick(''));
  }
}
```

- [ ] **Step 3: Verify typecheck & commit**

Run: `npm run typecheck`
```bash
git add src/ui/Dialogs.ts src/ui/ActionBar.ts
git commit -m "feat(ui): dialogs + action bar"
```

---

## Task 15: scenes/Scene.ts + SceneManager.ts

**Files:**
- Create: `src/scenes/Scene.ts`, `src/scenes/SceneManager.ts`

**Interfaces:**
- Produces: `Scene` interface, `SceneManager` (`enter(scene)`, `update(dt)`).

- [ ] **Step 1: Implement**

`src/scenes/Scene.ts`:
```ts
export interface Scene {
  enter(): void;
  exit(): void;
  update(dt: number): void;
}
```

`src/scenes/SceneManager.ts`:
```ts
import type { Scene } from './Scene';

export class SceneManager {
  private active: Scene | null = null;
  enter(scene: Scene): void {
    this.active?.exit();
    this.active = scene;
    scene.enter();
  }
  update(dt: number): void { this.active?.update(dt); }
  get current(): Scene | null { return this.active; }
}
```

- [ ] **Step 2: Verify typecheck & commit**

Run: `npm run typecheck`
```bash
git add src/scenes/Scene.ts src/scenes/SceneManager.ts
git commit -m "feat(scenes): Scene interface + SceneManager"
```

---

## Task 16: scenes/ScavengeScene.ts + CrewSelectScene.ts

**Files:**
- Create: `src/scenes/ScavengeScene.ts`, `src/scenes/CrewSelectScene.ts`

**Interfaces:**
- Consumes: `GameState`, `Diorama`, `HUD`, `ActionBar`, `Dialogs`, `SCAVENGE_POOL`, `CREWMATE_LIST`, `Scene`, `SceneManager`.

- [ ] **Step 1: Implement ScavengeScene.ts**

`src/scenes/ScavengeScene.ts`:
```ts
import type { Scene } from './Scene';
import type { GameState } from '../state/GameState';
import type { Diorama } from '../world/Diorama';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';
import { SCAVENGE_POOL } from '../content/items';
import { Phase } from '../state/phases';

export class ScavengeScene implements Scene {
  private time = 45;
  private items: string[] = [];
  private onDone: () => void;

  constructor(
    private state: GameState,
    private diorama: Diorama,
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    onDone: () => void,
  ) {
    this.onDone = onDone;
  }

  enter(): void {
    this.time = 45;
    // pick 8 distinct from pool deterministically
    this.items = SCAVENGE_POOL.slice(0, 8);
    this.hud.setDayLabel('Scavenge');
    this.dialogs.setText('The ship is going down! Grab what you can — 5 slots only.');
    this.diorama.showHotspots(this.items, (id) => this.collect(id));
    this.bar.clear();
    this.bar.button('Abandon Ship', () => this.finish());
  }

  private collect(id: string): void {
    const ok = this.state.addItem(id);
    if (ok) {
      this.items = this.items.filter((x) => x !== id);
      this.diorama.showHotspots(this.items, (x) => this.collect(x));
      this.dialogs.setText(`Grabbed ${id}. Slots: ${this.state.inventory.length}/5`);
      if (this.state.inventory.length >= this.state.maxSlots) this.finish();
    } else {
      this.dialogs.setText('No room for that — or already have it.');
    }
  }

  update(dt: number): void {
    this.time -= dt;
    this.hud.setDayLabel(`Scavenge  ${Math.max(0, Math.ceil(this.time))}s`);
    if (this.time <= 0) this.finish();
  }

  private finish(): void {
    if (this.state.phase !== Phase.Scavenge) return;
    this.diorama.clearHotspots();
    this.state.setPhase(Phase.CrewSelect);
    this.onDone();
  }

  exit(): void { this.diorama.clearHotspots(); }
}
```

- [ ] **Step 2: Implement CrewSelectScene.ts**

`src/scenes/CrewSelectScene.ts`:
```ts
import type { Scene } from './Scene';
import type { GameState } from '../state/GameState';
import type { Diorama } from '../world/Diorama';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';
import { CREWMATE_LIST } from '../content/crewmates';
import { Phase } from '../state/phases';

export class CrewSelectScene implements Scene {
  constructor(
    private state: GameState,
    private diorama: Diorama,
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    private onDone: () => void,
  ) {}

  enter(): void {
    this.hud.setDayLabel('Choose a shipmate');
    this.dialogs.setText('One hand to keep you company. Choose wisely.');
    this.bar.clear();
    CREWMATE_LIST.forEach((c) => {
      this.bar.button(`${c.name}\n${c.perkSummary}`, () => this.pick(c.id));
    });
  }

  private pick(id: 'frederik' | 'row'): void {
    this.state.setCrewmate(id);
    this.diorama.setCrewmate(id);
    this.state.setPhase(Phase.Day);
    this.onDone();
  }

  update(): void {}
  exit(): void {}
}
```

- [ ] **Step 3: Verify typecheck & commit**

Run: `npm run typecheck`
```bash
git add src/scenes/ScavengeScene.ts src/scenes/CrewSelectScene.ts
git commit -m "feat(scenes): scavenge + crew select"
```

---

## Task 17: scenes/DayScene.ts + NightScene.ts

**Files:**
- Create: `src/scenes/DayScene.ts`, `src/scenes/NightScene.ts`

**Interfaces:**
- Consumes: all prior. Produces: two scenes that drive the core loop.

- [ ] **Step 1: Implement DayScene.ts**

`src/scenes/DayScene.ts`:
```ts
import type { Scene } from './Scene';
import type { GameState, DayAction } from '../state/GameState';
import type { Diorama } from '../world/Diorama';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';
import { Phase } from '../state/phases';

export class DayScene implements Scene {
  constructor(
    private state: GameState,
    private diorama: Diorama,
    private env: { setTimeOfDay: (t: 'day'|'night') => void },
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    private onPhase: () => void,
  ) {}

  enter(): void {
    this.state.actionsLeftToday = this.state.day === 1 ? 3 : this.state.actionsLeftToday;
    this.env.setTimeOfDay('day');
    this.hud.setDayLabel(`Day ${this.state.day} — ${this.state.actionsLeftToday} actions`);
    this.dialogs.setText('Day breaks. What will you do?');
    this.renderActions();
  }

  private renderActions(): void {
    this.bar.clear();
    const actions: DayAction[] = ['fish', 'eat', 'repair', 'chat'];
    actions.forEach((a) => {
      const check = this.state.canPerformDayAction(a);
      this.bar.button(a, () => this.do(a), { disabled: !check.ok });
    });
    this.diorama.showInventory(this.state.inventory, this.state.food);
    this.hud.render();
    this.hud.setDayLabel(`Day ${this.state.day} — ${this.state.actionsLeftToday} actions`);
  }

  private do(a: DayAction): void {
    const r = this.state.performDayAction(a);
    this.dialogs.setText(r.message);
    this.hud.render();
    this.diorama.showInventory(this.state.inventory, this.state.food);
    if (this.state.actionsLeftToday <= 0) {
      this.state.setPhase(Phase.Night);
      this.onPhase();
    } else {
      this.renderActions();
    }
  }

  update(): void {}
  exit(): void {}
}
```

- [ ] **Step 2: Implement NightScene.ts**

`src/scenes/NightScene.ts`:
```ts
import type { Scene } from './Scene';
import type { GameState } from '../state/GameState';
import type { Diorama } from '../world/Diorama';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';
import { Phase } from '../state/phases';
import { Rng } from '../utils/rng';
import { pickNightEvent, resolveNight, NIGHT_EVENT_BY_ID } from '../content/nightEvents';
import { ITEMS } from '../content/items';

export class NightScene implements Scene {
  private rng = new Rng((Math.random() * 1e9) | 0);
  private currentEventId = '';
  constructor(
    private state: GameState,
    private diorama: Diorama,
    private env: { setTimeOfDay: (t: 'day'|'night') => void },
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    private onPhase: () => void,
  ) {}

  enter(): void {
    this.env.setTimeOfDay('night');
    this.currentEventId = pickNightEvent(this.rng, this.state.day, this.state.hopeAppeared);
    if (this.currentEventId === 'hope') this.state.hopeAppeared = true;
    const def = NIGHT_EVENT_BY_ID[this.currentEventId];
    this.hud.setDayLabel(`Night ${this.state.day}`);
    this.dialogs.setText(`${def.name}: ${def.description}`);
    this.bar.clear();
    this.bar.itemButtons(
      this.state.inventory,
      Object.fromEntries(this.state.inventory.map((id) => [id, ITEMS[id]?.name ?? id])),
      (itemId) => this.resolve(itemId),
    );
  }

  private resolve(itemId: string): void {
    const result = resolveNight(this.state, this.currentEventId, itemId);
    this.dialogs.setText(result.message);
    this.hud.render();
    this.bar.clear();
    if (this.state.rescued) {
      this.state.setPhase(Phase.Ending);
      this.onPhase();
      return;
    }
    if (this.state.isDead()) {
      this.state.setPhase(Phase.Ending);
      this.onPhase();
      return;
    }
    this.bar.button('Sleep till morning', () => {
      this.state.startNewDay();
      if (this.state.isDead()) {
        this.state.setPhase(Phase.Ending);
      } else {
        this.state.setPhase(Phase.Day);
      }
      this.onPhase();
    });
  }

  update(): void {}
  exit(): void {}
}
```

- [ ] **Step 3: Verify typecheck & commit**

Run: `npm run typecheck`
```bash
git add src/scenes/DayScene.ts src/scenes/NightScene.ts
git commit -m "feat(scenes): day + night loop"
```

---

## Task 18: scenes/EndingScene.ts + Game.ts + main.ts + start screen

**Files:**
- Create: `src/scenes/EndingScene.ts`, `src/Game.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything. Produces: a fully runnable game.

- [ ] **Step 1: Implement EndingScene.ts**

`src/scenes/EndingScene.ts`:
```ts
import type { Scene } from './Scene';
import type { GameState } from '../state/GameState';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';

export class EndingScene implements Scene {
  constructor(
    private state: GameState,
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    private onRestart: () => void,
  ) {}

  enter(): void {
    this.bar.clear();
    this.hud.setDayLabel('The End');
    if (this.state.rescued) {
      this.dialogs.setText(`Rescued on Day ${this.state.day}. A ship hauls you aboard. You live.`);
    } else {
      this.dialogs.setText(`Lost at sea on Day ${this.state.day}. You sleep with the fishes.`);
    }
    this.bar.button('New Run', () => this.onRestart());
  }
  update(): void {}
  exit(): void {}
}
```

- [ ] **Step 2: Implement Game.ts**

`src/Game.ts`:
```ts
import * as THREE from 'three';
import { GameState } from './state/GameState';
import { Phase } from './state/phases';
import { Diorama } from './world/Diorama';
import { HUD } from './ui/HUD';
import { ActionBar } from './ui/ActionBar';
import { Dialogs } from './ui/Dialogs';
import { SceneManager } from './scenes/SceneManager';
import { ScavengeScene } from './scenes/ScavengeScene';
import { CrewSelectScene } from './scenes/CrewSelectScene';
import { DayScene } from './scenes/DayScene';
import { NightScene } from './scenes/NightScene';
import { EndingScene } from './scenes/EndingScene';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private diorama: Diorama;
  private state = new GameState();
  private manager = new SceneManager();
  private hud: HUD;
  private bar: ActionBar;
  private dialogs: Dialogs;
  private clock = new THREE.Clock();
  private overlay: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    root.appendChild(this.renderer.domElement);

    this.diorama = new Diorama(this.renderer, root.clientWidth / root.clientHeight);

    this.overlay = document.createElement('div');
    root.appendChild(this.overlay);

    this.hud = new HUD(this.overlay, this.state);
    this.dialogs = new Dialogs(this.overlay);
    this.bar = new ActionBar(this.overlay);

    this.bindInput(root);
    this.showTitle();
  }

  private bindInput(root: HTMLElement): void {
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.diorama.onPointerDown(e);
      this.diorama.onDrag(e, true);
    });
    root.addEventListener('pointermove', (e) => this.diorama.onDrag(e, false));
    root.addEventListener('pointerup', (e) => this.diorama.onDrag(e, false));
    window.addEventListener('resize', () => this.onResize(root));
  }

  private onResize(root: HTMLElement): void {
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    this.diorama.getCamera().aspect = root.clientWidth / root.clientHeight;
    this.diorama.getCamera().updateProjectionMatrix();
  }

  private showTitle(): void {
    this.hud.setDayLabel('Sleep with the Fishes');
    this.dialogs.setText('Your ship is sinking. Grab what you can, pick a shipmate, survive.');
    this.bar.clear();
    this.bar.button('New Run', () => this.startNewRun());
  }

  private startNewRun(): void {
    this.state.reset();
    this.state.setPhase(Phase.Scavenge);
    this.gotoPhase();
  }

  private gotoPhase(): void {
    switch (this.state.phase) {
      case Phase.Scavenge:
        this.manager.enter(new ScavengeScene(this.state, this.diorama, this.hud, this.bar, this.dialogs, () => this.gotoPhase()));
        break;
      case Phase.CrewSelect:
        this.manager.enter(new CrewSelectScene(this.state, this.diorama, this.hud, this.bar, this.dialogs, () => this.gotoPhase()));
        break;
      case Phase.Day:
        this.manager.enter(new DayScene(this.state, this.diorama, this.diorama.env, this.hud, this.bar, this.dialogs, () => this.gotoPhase()));
        break;
      case Phase.Night:
        this.manager.enter(new NightScene(this.state, this.diorama, this.diorama.env, this.hud, this.bar, this.dialogs, () => this.gotoPhase()));
        break;
      case Phase.Ending:
        this.manager.enter(new EndingScene(this.state, this.hud, this.bar, this.dialogs, () => this.startNewRun()));
        break;
    }
  }

  start(): void {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      this.manager.update(dt);
      this.diorama.update(dt);
      this.renderer.render(this.diorama.scene, this.diorama.camera);
    };
    loop();
  }
}
```

- [ ] **Step 3: Update main.ts**

`src/main.ts`:
```ts
import { Game } from './Game';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');
const game = new Game(root);
game.start();
```

- [ ] **Step 4: Verify build, typecheck, tests**

Run:
```bash
npm run typecheck
npm run test
npm run build
npm run dev
```
Expected: typecheck clean; all tests pass; build emits `dist/`; dev server opens the game.

- [ ] **Step 5: Manual QA pass (Definition of Done)**

Walk the 6 manual QA paths from the spec:
1. Full run: scavenge → crewmate → days → Hope → flare → rescue.
2. Death paths: starve (Hunger 0), sink (Hull 0), bleed out (Health 0).
3. Each of the 4 night events resolves correctly with right/wrong item.
4. Day↔Night→Day loop persists resources/inventory across days.
5. Camera orbit drag works; hotspots raycast correctly.
6. Day↔Night mood transition renders.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/EndingScene.ts src/Game.ts src/main.ts
git commit -m "feat: wire end-to-end game (ending, orchestrator, entry)"
```

---

## Task 19: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

`README.md`:
```markdown
# Sleep with the Fishes

Web MVP of a lifeboat survival-horror loop, built with Vite + TypeScript + three.js as a 2.5D procedural diorama.

## Run

npm install
npm run dev      # dev server with HMR
npm run build    # static build to dist/
npm run preview  # serve the build
npm run test     # vitest unit tests (game logic)
npm run typecheck

## How to play

1. **Scavenge** the sinking ship — click item hotspots, but you only have 5 slots.
2. **Pick a shipmate** (Frederik = better repairs + bait; Row = halves monster damage).
3. **Day:** spend 3 actions on Fish / Eat / Repair / Chat.
4. **Night:** a random threat appears — pick the right item to counter it.
   - Leak → Duct Tape
   - Giant Squid → Anchor
   - Eerie Melody → Duct Tape (do NOT use the Flashlight!)
   - Hope → Flare Gun = rescued!
5. Survive until rescue, or lose when Hull / Hunger / Health hits 0.

Drag to orbit the camera.

## Architecture

- `src/content/` — pure data tables (items, crewmates, night events) + rule functions.
- `src/state/` — GameState + EventBus + phases (all game rules, unit-tested).
- `src/world/` — three.js: Environment (sky/fog/lights), Diorama (ocean/boat/crew), PropFactory (item meshes).
- `src/ui/` — DOM overlay: HUD bars, ActionBar, Dialogs.
- `src/scenes/` — one scene per phase; SceneManager swaps them.

Design spec: `docs/superpowers/specs/2026-07-02-sleep-with-fishes-mvp-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with run/play/architecture"
```
