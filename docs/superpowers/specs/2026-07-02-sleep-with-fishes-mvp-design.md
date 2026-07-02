# Sleep with the Fishes — Web MVP Design

- **Status:** Approved (brainstorming complete)
- **Date:** 2026-07-02
- **Source game:** *Don't Sleep With The Fishes* by DopplerGhost (Steam app `4834070`)
- **Target:** Web recreation, Vite + TypeScript + three.js

## 1. Overview

A web-based **2.5D diorama** recreation of *Don't Sleep With The Fishes* — a point-and-click survival horror about scavenging a sinking ship, grabbing one crewmate, and surviving day-by-day in a lifeboat while countering randomized night threats with the right item. This MVP is a **vertical slice** that proves the core loop is fun in 3D and leaves clean seams to expand toward the full game.

### Core loop
Ship sinking → frantically scavenge items (limited slots) → pick one crewmate → abandon ship into a lifeboat → survive day-by-day (fish / eat / repair / chat) → counter a random night event with the correct item → repeat until rescue or death.

## 2. Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Source game | *Don't Sleep With The Fishes* (DopplerGhost) |
| Visual treatment | 2.5D / diorama (original is 2D point-and-click) |
| Art source | Low-poly procedural (built from three.js primitives) |
| Tech stack | Vite + TypeScript + three.js |
| Architecture | State-machine + Scene-manager |
| Scope | MVP vertical slice |

## 3. MVP Scope

**In scope (exactly these):**
- **Scavenge phase:** timed click-to-collect on a sinking ship; 5 inventory slots force prioritization.
- **Crewmate pick:** choose 1 of **2** crewmates (Frederik = repair/bait; Row = monster defense).
- **Day phase:** 3 action slots/day from {Fish, Eat, Repair, Chat}.
- **Night phase:** **4 core events** each with a correct item counter:
  - `Leak` → Duct Tape
  - `Giant Squid` → Anchor
  - `Eerie Melody (Siren)` → Duct Tape (Flashlight makes it worse)
  - `Hope (lights in distance)` → Flare Gun = rescue trigger
- **Resources:** Hunger, Hull, Health, Morale, Energy.
- **Items (~10):** Anchor, Flare Gun, Flashlight, Duct Tape, Bucket, Bait, Fishing Rod, First Aid Kit, Harpoon Gun, Spyglass.
  - **Functionally used in MVP:** Anchor (Squid), Duct Tape (Leak/Melody), Flare Gun (Hope/rescue), Flashlight (Melody trap), Fishing Rod + Bait (Fish action), First Aid Kit (heal).
  - **Collectible flavor only in MVP** (usable in the full game, reserved for future events): Bucket, Harpoon Gun, Spyglass. Kept so scavenging tradeoffs still feel real.
  - **Food** is also an inventory item produced by the Fish action (see §5 Day phase).
- **Endings (1):** Rescue (Flare Gun on Hope). Death = any critical resource hits 0 / hull destroyed.

**Out of scope for v1:** crewmates 3-4, other endings, hidden routes, the 25+ extra items, island delegation, save system, audio, settings menus.

## 4. Architecture

Layered structure; game logic never tangles with three.js.

```
src/
├── main.ts                  # Entry: bootstraps Game
├── Game.ts                  # Orchestrator: owns renderer, loop, SceneManager
├── state/
│   ├── GameState.ts         # Plain TS data: phase, day, resources, inventory, crewmate
│   ├── phases.ts            # Phase enum + legal transitions
│   └── EventBus.ts          # Typed pub/sub (state → scenes/UI)
├── scenes/
│   ├── SceneManager.ts      # Swaps active Scene, calls enter()/exit()/update()
│   ├── Scene.ts             # Base interface: enter, exit, update, onPointer
│   ├── ScavengeScene.ts     # Phase 1: sinking ship, collect items
│   ├── CrewSelectScene.ts   # Pick crewmate
│   ├── DayScene.ts          # Lifeboat day: fish/eat/repair/chat
│   ├── NightScene.ts        # Night event: pick counter item
│   └── EndingScene.ts       # Rescue or death
├── world/                   # Pure three.js (no game logic)
│   ├── Diorama.ts           # Procedural scene builder: ocean, boat, sky, fog, lighting
│   ├── PropFactory.ts       # Low-poly meshes for items (anchor, rod, flare…)
│   └── Environment.ts       # Sky/fog/sun-moon/day-night color grading
├── content/                 # Data-driven definitions (no code logic)
│   ├── items.ts             # Item defs: id, name, mesh key, flags
│   ├── crewmates.ts         # 2 crewmate defs + bonuses
│   └── nightEvents.ts       # Event defs: id, valid counters, failure cost
├── ui/                      # HTML/CSS overlay (DOM)
│   ├── HUD.ts               # Resource bars from state
│   ├── ActionBar.ts         # Day buttons; night item-picker
│   └── dialogs.ts           # Crewmate chat, event text, endings
└── utils/                   # Math, rng, etc.
```

### Data flow (one direction)
```
User input (DOM clicks / canvas pointer)
  → Scene handler mutates GameState
    → GameState emits events on EventBus
      → HUD/ActionBar re-render (DOM)
      → World/Diorama updates visuals (3D)
SceneManager reads GameState.phase to transition scenes.
```

### Key rules
- `content/*.ts` files are **pure data** — adding a night event or item = editing a table, not scene code.
- `world/` knows nothing about game rules; it only draws what it's told.
- `ui/` is a DOM overlay; the canvas renders the diorama + clickable hotspots only.
- `Game.ts` owns the single `requestAnimationFrame` loop and ticks the active scene + world each frame.

## 5. Game Systems

### Phase state machine (legal transitions only)
```
Intro → Scavenge → CrewSelect → Day ⇄ Night → Ending(rescue|death)
                                  ↑____(next day)____↓
```
Day↔Night loops until rescue or death. Each full Day+Night = 1 in-game day.

### Resources
| Resource | Range | Changes by |
|---|---|---|
| Hunger | 0–100 | −25 each morning; restored by Eat |
| Hull | 0–100 | − by night events; + by Repair action |
| Health | 0–100 | − by failed/injuring events; First Aid +70 |
| Morale | 0–100 | + by Chat; low morale = −fishing/repair yield |
| Energy | 0–100 | Drained by the "stay awake" Eyes event in the full game. **Reserved in MVP** — shown on the HUD for parity but no MVP event drains it. |

Any of Hunger/Hull/Health hitting 0 ends the run (death). Morale at 0 only debuffs. Energy cannot cause death in MVP.

### Scavenge phase
Timer (~45s, visual "ship sinking"). The 3D ship shows ~8 clickable item hotspots. Player has **5 inventory slots** — can't grab everything, must prioritize. When the timer ends or the player clicks "Abandon Ship", → CrewSelect with whatever was grabbed.

### Crewmates (MVP = 2)
- **Frederik** — Repair restores +15 (vs +10); each successful fishing day guarantees +1 Bait.
- **Row** — `Giant Squid` and `Eerie Melody` deal half damage; cheaper repairs.

### Day phase — 3 action slots/day
Pick any 3 (repeats allowed up to resource limits):
- **Fish** — requires Fishing Rod + Bait → adds a **Food** inventory item (stackable; fishing yields 1 Food each). Fails gracefully if items missing.
- **Repair** — +Hull (Frederik bonus).
- **Chat** — +Morale; occasionally surfaces lore.
- **Eat** — consumes 1 Food from inventory → +25 Hunger. Cannot Eat without Food.

`Food` is an inventory item (not a resource bar): produced by Fish, consumed by Eat.

After 3 actions → Night. Morning of each new day: Hunger −25.

### Night phase — event resolution
1. Random event fires from `nightEvents.ts` (weighted). `Hope` is guaranteed to appear at least once by day 5 as the rescue gate (so a patient player always gets a win path).
2. Event threat shown (DOM dialog). Player picks **one item** from inventory as the counter.
3. Validation against the event's `validCounters`:
   - **Correct item** → safe (small or no cost).
   - **Wrong item** → `failureCost` applied (hull damage, injury, etc.).
   - **Special:** `Eerie Melody` + Flashlight = **worse** outcome (anti-pattern trap from original).
4. → next Day, or Ending if dead.

### Items as data
```ts
{ id:'anchor',    name:'Anchor',    mesh:'anchor' }
{ id:'flareGun',  name:'Flare Gun', mesh:'flare', flags:['rescue'] }
{ id:'ductTape',  name:'Duct Tape', mesh:'tape' }
```
Night events reference item IDs, so adding events/items later = data edits only.

### Endings (MVP)
- **Rescue:** `Hope` event + use `Flare Gun` → EndingScene (win).
- **Death:** Hull=0 (sink), Hunger=0 (starve), Health=0 (injury) → EndingScene (lose).

## 6. 3D / Visual Design (Diorama)

### Camera & framing
Near-isometric angled camera (~45° elevation) framing the lifeboat as centerpiece, like a snow-globe/board-game diorama. Subtle auto-orbit drift for life; player can drag to rotate. Fixed distance; no zoom in MVP.

### Diorama scenes (all procedural primitives)
- **Ocean:** large plane with animated sine-wave vertex displacement for gentle swells. Warm teal by day, inky blue-black at night. Foam via a second translucent plane.
- **Sky:** gradient sky dome/shader. Day = warm gradient; night = deep blue + moon + low-poly star points.
- **Fog:** `FogExp2` — light by day, dense/dark at night (sells isolation, hides world edges). Primary mood-setter.
- **Lifeboat:** low-poly hull (boxes/curved geometry), flat color + edge highlights, tiny mast, oars. Bobs on swell (sin-wave Y + slight rotation).
- **Crewmate:** stylized figure (capsule body + sphere head + box limbs), tinted per character. Idle sway.
- **Props (items):** `PropFactory` builds each from 2-5 primitives (Anchor = torus + cone; Flare Gun = box + cylinder; Fishing Rod = thin cylinder + line). Shown in-boat when owned; glowing hotspots on the ship during scavenge.

### Lighting (cheap, mood-critical)
- One directional light = sun (day) / moon (night).
- One hemisphere/ambient fill (low intensity, cool tone).
- Night: warm point light at a "lantern" on the boat — small radius for cozy-vs-creepy contrast.
- Flashlight event: temporary forward spotlight cone from the crewmate.

### Day↔Night transition
Short (~2s) lerp of fog density, light color/intensity, sky colors, ocean tint — uniforms animating, no new assets. Phase change = visible mood flip.

### In-3D interaction
Raycasting on pointer down. Clickable item hotspots (scavenge) and boat/props pulse with subtle emissive glow + outline so they read as interactive in a low-poly world.

### Post-processing (stretch, not required for MVP)
Light vignette + film-grain pass to reinforce the atmospheric indie tone.

## 7. UI / UX

UI is a **DOM overlay** (HTML/CSS) on top of the canvas — not rendered in three.js. Canvas = diorama + clickable hotspots only.

### Layout
```
┌─────────────────────────────────────────┐
│  [HUD: resource bars]              day 3 │  ← top bar
│                                         │
│         (3D diorama canvas)             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Dialog / event text box         │    │  ← bottom: narrative
│  └─────────────────────────────────┘    │
│  [Action Bar / Item Picker]             │  ← bottom: buttons
└─────────────────────────────────────────┘
```

- **HUD (top):** horizontal bars for Hunger, Hull, Health, Morale, Energy — color-coded green→amber→red. Day counter + phase label. Updates reactively from EventBus.
- **Dialog box (bottom, narrative):** event descriptions, crewmate chat, scavenged-item confirmations, ending text. Typewriter effect = stretch.
- **Action Bar (bottom, interactive) — changes per phase:**
  - **Scavenge:** "Abandon Ship" button + remaining time + 5 inventory pips.
  - **CrewSelect:** two crewmate choice buttons (name + perk summary).
  - **Day:** Fish / Eat / Repair / Chat + "actions left: 3". Disabled when items missing.
  - **Night:** item-picker grid; click one item to counter the event.

### Controls
- **Mouse:** click buttons (DOM), click hotspots (canvas raycast), drag to orbit.
- **Keyboard (stretch):** number keys for actions/items, `F` fast-forward.

### Feedback
Every action → immediate visual (resource bar tween, prop pop-in/out, short toast). Wrong night counter → screen shake/red flash + damage bars drop. Correct counter → calm confirmation. (Audio = stretch.)

### Screens
Start screen (title + "New Run"). Ending screen (win/lose text + "Play Again"). No menus/settings/save in MVP.

## 8. Testing & Delivery

### Testing strategy — logic separate from rendering
Game rules live in `content/` + `GameState` (pure data/logic); rendering lives in `world/`. We test the **rules**, not pixels.

- **Framework:** Vitest.
- **Unit tests (pure logic):**
  - `nightEvents` resolution — correct item safe; wrong item correct cost; `Eerie Melody` + Flashlight worse.
  - Resource tick math — Hunger −25/day; death thresholds (Hull/Hunger/Health = 0).
  - Scavenge inventory slot limits (5 max).
  - Crewmate bonuses (Frederik repair +15 + guaranteed bait; Row half-damage on squid/siren).
  - Phase transitions — only legal transitions; rescue gate (Hope by day 5).
  - Day action economy — exactly 3 actions; disabled-when-missing-items.
- **Not unit tested:** three.js rendering, visuals, shaders — verified manually.

### Manual QA checklist (per milestone)
1. Full run: scavenge → crewmate → survive days → Hope → flare → rescue.
2. Death paths: starve, sink, bleed out.
3. Each of the 4 night events resolves correctly with right/wrong item.
4. Day↔Night→Day loop persists resources/inventory across days.
5. Camera orbit drag works; hotspots raycast correctly.
6. Day↔Night mood transition renders.

### Delivery
- `npm run dev` → Vite dev server (HMR).
- `npm run build` → static `dist/`, deployable to GitHub Pages / Netlify.
- `npm run test` → Vitest; `npm run typecheck` → `tsc --noEmit`.
- README with run/build/deploy instructions + manual QA checklist.

### Definition of done (MVP)
- All 6 manual QA paths pass.
- All logic unit tests pass.
- `typecheck` clean.
- Runs in Chrome/Firefox at 60fps on a mid-range laptop.
