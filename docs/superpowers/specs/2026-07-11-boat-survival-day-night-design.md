# Last Boat Out — Boat Survival Day/Night Design

- **Status:** Approved
- **Date:** 2026-07-11
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest
- **Preceding phase:** First-person ship scavenging

## 1. Objective

Extend the working scavenging prototype into a complete survival run. A successful evacuation moves the player into a locked first-person view inside the lifeboat, carrying exactly the supplies saved during scavenging. The player spends limited daily energy on fishing, diving, eating, treatment, rest, and hull repair; responds to daytime and nighttime events with rescued items; and survives until a variable rescue occurs.

This phase takes broad inspiration from the day-by-day resource pressure described on the official *Don't Sleep With The Fishes* page, but its rules, balance, events, writing, interface, visual presentation, and outcomes are original.

The milestone must prove five things:

1. Scavenging choices materially affect the survival phase.
2. Hunger, energy, health, and hull pressure create understandable trade-offs.
3. Fishing, diving, repairs, and item responses each have distinct strategic value.
4. A data-driven event system supports varied day/night runs without entangling presentation code.
5. The fixed first-person lifeboat view remains atmospheric while the management interface stays legible.

## 2. Scope

### Included

- A shared game director with isolated scavenging and survival phases.
- Seamless handoff of saved item IDs from the current scavenging session.
- A fixed, seated first-person Three.js lifeboat scene with no walking or pointer lock.
- Repeating dawn, daytime, end-day, nighttime-event, and next-dawn states.
- Health, hunger, energy, and hull meters.
- Fishing, diving, eating, repairing, treating wounds, resting/drinking, and ending the day.
- Inventory charges for consumable rescued supplies.
- At least eight daytime events and eight nighttime events.
- Selecting an owned item or enduring an event without an item.
- Seeded event and action randomness with eligibility and cooldown rules.
- Variable rescue beginning after an initial survival period.
- Distinct rescue, death, and sinking endings.
- Full-run restart from scavenging after failure.
- Automated rules, integration, and DOM tests plus production-build verification.

### Excluded

- Crewmates, conversation, morale, or crew-specific modifiers.
- Free movement in the lifeboat.
- Reflex or timing minigames for fishing and diving.
- Crafting trees, boat expansion, or equipment upgrades.
- Save slots, checkpoints, autosave, or boat-phase retry.
- Mobile touch controls.
- Audio production beyond retaining a clean integration point for later work.
- Multiple narrative campaigns or persistent unlocks.

## 3. Full Run and Phase Architecture

A new `GameDirector` owns the shared renderer, camera, resize handling, high-level animation scheduling, and active phase. Each phase implements a small lifecycle contract:

```ts
interface GamePhase {
  start(): void;
  update(deltaSeconds: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
```

`ScavengePhase` is extracted from the current `Game` without changing its playable behavior. On successful evacuation it emits an immutable result containing the saved item IDs and elapsed scavenging time. The director releases pointer lock, disposes the ship phase, copies the result, and creates `SurvivalPhase`.

`SurvivalPhase` owns three collaborators:

- `SurvivalSession`: authoritative pure game rules, seeded randomness, inventory, events, resources, and endings.
- `BoatWorld`: Three.js scene content, fixed camera framing, ocean and lifeboat motion, lighting, weather, action sequences, and event cues.
- `SurvivalUI`: DOM meters, actions, inventory, event choices, outcome text, pause state, and endings.

The survival cycle is:

1. Apply dawn upkeep and check natural rescue.
2. Refill energy according to hunger.
3. Allow daytime actions until the player selects end day or has no useful energy remaining.
4. Trigger one daytime interruption after an eligible action if it has not already occurred.
5. Resolve end-of-day hunger consequences.
6. Draw and resolve one nighttime event.
7. Advance to the next dawn.

The run ends once with `rescued`, `dead`, or `sunk`. Rescue shows a complete-run summary. Death and sinking show their specific cause and offer only a full restart, which recreates the scavenging phase with a new seed.

## 4. Survival State and Daily Economy

The authoritative snapshot contains:

```ts
interface SurvivalSnapshot {
  phase: 'dawn' | 'day' | 'dayEvent' | 'nightEvent' | 'outcome' | 'rescued' | 'dead' | 'sunk';
  day: number;
  health: number;
  hunger: number;
  energy: number;
  hull: number;
  food: number;
  bait: number;
  repairMaterial: number;
  rescueProgress: number;
  inventory: Readonly<Record<ItemId, ItemInventoryState>>;
  pendingEventId: string | null;
  lastOutcome: ActionOutcome | null;
  seed: number;
}
```

All four meters are clamped to 0–100.

- **Health** begins at 100. Zero health commits the `dead` ending.
- **Hunger** begins at 20 and rises at dawn. Higher hunger reduces morning energy recovery. At 100, continued hunger causes health damage.
- **Energy** normally refills to 4 at dawn. Severe hunger reduces the refill to 3 or 2. Energy never carries above its daily maximum.
- **Hull** begins at 75, reflecting a hurried evacuation. Zero hull commits the `sunk` ending.

`food`, `bait`, and `repairMaterial` are ordinary resources obtained through actions and events. They are separate from rescued named items so repeated fishing, diving, and repairs can continue after a consumable ship supply is exhausted.

Initial numerical values are centralized in `survivalBalance.ts`. Balance changes must not require edits to session logic or event definitions. The first playable balance uses these explicit values:

| Rule | Initial value |
|---|---|
| Dawn hunger increase | 18 |
| Morning energy below 70 hunger | 4 |
| Morning energy at 70–89 hunger | 3 |
| Morning energy at 90–100 hunger | 2 |
| Health loss at 100 hunger each dawn | 15 |
| One food portion | Hunger -35 |
| Repair with material | Hull +25 |
| Emergency duct-tape repair | Hull +15 |
| Medical treatment | Health +30 |
| Drink/rest | Energy +2, capped at the daily maximum |

## 5. Rescued Supply Mapping

The survival inventory is derived only from items in the scavenging snapshot whose status is `saved`.

| Rescued item | Survival behavior |
|---|---|
| Flare gun | One shot. Counters selected threats and guarantees rescue during an aircraft or vessel sighting. |
| Duct tape | Two uses. Each can replace repair material in an emergency repair or counter a leaking-hull event. |
| Fishing rod | Durable tool. Unlocks reliable fishing and counters selected fish or bird events. |
| Bait tin | Starts with three bait. Bait may be spent to improve catch chance and yield. |
| Medical kit | Two treatments. Each restores health or counters an injury event. |
| Water jug | Three drinks. A drink restores energy once per day and counters heat or dehydration events. |
| Canned food | Starts with two food portions. |
| Flashlight | Durable tool. Improves diving outcomes and counters darkness or inspection events. |

Durable tools remain usable unless an event explicitly destroys them. Consumable items show their remaining charges. Items not rescued remain visible in the action explanation only when needed to communicate why an option is weak or unavailable; they never appear as owned inventory.

## 6. Daytime Actions

Every action is resolved as one atomic transaction. The session validates the current phase, energy, prerequisites, inventory charges, and terminal state before changing anything. A successful transaction returns a structured outcome for presentation. Invalid requests return a reason and mutate nothing.

### Fish

- Costs 2 energy.
- With the fishing rod: a 70% base chance to gain one food, with a 20% chance that a successful catch yields a second food.
- Without the rod: a low-yield hand-line attempt remains available so a run is not immediately unwinnable.
- A hand-line attempt has a 30% base chance to gain one food and cannot produce a larger catch.
- Spending one bait raises rod success to 90% and the second-food chance to 40%; it raises hand-line success to 55%.
- Weather and selected events may modify the result.

### Dive

- Costs 3 energy.
- May recover food, bait, repair material, or a rare rescue clue.
- Has a 65% base recovery chance and a separate 25% chance of losing 10 health.
- The flashlight raises recovery chance to 80% and lowers injury chance to 10%.
- Overcast weather changes recovery by -5 percentage points and injury by +5; squall weather disables diving.
- Diving is disabled during the most dangerous weather state with an explicit explanation.

### Eat

- Consumes one food.
- Reduces hunger by a fixed amount.
- Costs no energy; consuming food should not punish a player who has already spent the day's action budget.

### Repair

- Costs 2 energy.
- Consumes one repair material and restores hull.
- If no repair material is available, one duct-tape charge may be selected instead for a smaller emergency repair.
- Disabled at full hull.

### Treat wounds

- Consumes one medical-kit charge and restores health.
- Costs no energy.
- Disabled at full health or without a charge.

### Rest and drink

- Consumes one water-jug charge.
- Restores energy and may counter a heat penalty.
- Can be performed only once each day and cannot raise energy above the normal daily maximum.

### End day

- Costs nothing.
- Remains available throughout the daytime.
- After confirmation, advances through end-of-day consequences to the nighttime event.

The interface previews exact energy costs and guaranteed resource changes. Random outcomes are labeled `safe`, `uncertain`, or `dangerous`; exact percentages are intentionally hidden.

## 7. Event System and Item Selection

Events are immutable data definitions. Each includes:

- Stable ID and phase (`day` or `night`).
- Title, prompt, danger label, and result text variants.
- Earliest and optional latest day.
- Selection weight and repeat cooldown.
- Optional weather and resource conditions.
- Accepted item counters and their effects.
- Endure/no-item outcome.
- World presentation cue.

One daytime event interrupts the player after a completed action, never before the player has acted. One nighttime event occurs after ending the day. An event cannot repeat on consecutive eligible draws, and configured cooldowns suppress frequent repetition. If filtering leaves no eligible event, a calm fallback event is used.

Initial daytime themes include heat haze, tangled debris, a sudden squall, circling gulls, a dark shape below, floating wreckage, a hull leak, and a distant aircraft. Initial nighttime themes include hull impacts, violent weather, strange lights, fish activity, distant calls, drifting wreckage, oppressive darkness, and rare calm water.

During an event the player chooses `USE AN ITEM` or `ENDURE`. The item tray shows every owned item and charge count. Item descriptions provide logical clues, but the correct counter is not identified. Selecting an unsuitable item produces an authored consequence. Consumable charges are spent only when the outcome describes actual use; durable tools are retained unless destruction is explicit.

Event resolution returns explicit deltas such as `HULL -12`, `HEALTH -8`, `FOOD +1`, or `RESCUE PROGRESS +10`, plus narrative text and presentation cues.

## 8. Variable Rescue

Natural rescue cannot occur before day five. Beginning at dawn on day five, the session makes one seeded rescue check. The initial base chance is 5% on day five and rises by 8 percentage points per day to a 60% cap. Rescue progress adds one percentage point per point, capped at a +25 percentage-point bonus. A successful clue normally adds 10 rescue progress. These values are centralized in balance constants and may be tuned after playtesting while preserving the rising-chance rule and the 15–25 minute target.

The flare gun is powerful but not mandatory. Natural rescue remains possible without it. If an aircraft or vessel sighting event occurs while the flare is available, firing it commits rescue immediately. Using the flare on a threat trades that certainty for short-term safety.

Rescue checks and sighting resolution are idempotent. Once rescue commits, no further resource, event, or ending changes are accepted.

## 9. First-Person Boat World

The camera is seated low inside the lifeboat and faces over the bow. The boat rim, oar mounts, fishing rod, supplies, damaged planks, and pooled water frame the foreground. The horizon, weather, debris, distant contacts, sky color, and ocean state communicate time and danger.

There is no free walking and no pointer lock. Mouse movement adds small clamped camera parallax. Keyboard and mouse remain available to the UI. Reduced-motion preference disables parallax and reduces camera/boat motion without stopping ocean animation.

`BoatWorld` reuses `WaveField` and `OceanRenderer`. It creates a survival-specific lifeboat interior large enough for the fixed camera and applies a smoothed inverse fraction of sampled boat pitch and roll to the camera rig. Motion stays readable and below a comfort limit.

Three weather states are included:

- Calm: low waves, clear horizon, safer actions.
- Overcast: baseline waves, reduced visibility.
- Squall: stronger waves, rain and spray, dangerous diving, increased event risk.

Short skippable sequences present fishing, diving, repairs, item use, dawn, nightfall, rescue, death, and sinking. Rules resolve exactly once before the sequence begins. Skipping changes only presentation time.

## 10. Interface and Accessibility

The DOM overlay uses the current storm-worn visual language while giving the management phase its own layout.

- Upper left: day, phase, and weather.
- Upper right: labeled health, hunger, energy, and hull meters with numeric values.
- Bottom center: action dock for fish, dive, eat, repair, treat, rest, and end day.
- Lower right: collapsible rescued-item tray with charges and descriptions.
- Center: event card, item-selection panel, and action outcome text.
- World hotspots: fishing rod, supply crate, damaged hull, and water mirror relevant dock actions.

Unavailable actions stay visible and expose a concise reason on hover, focus, and attempted activation. Event outcomes show narrative text and all meter/resource deltas.

Every action is reachable by keyboard. `Tab` navigates controls, `Enter` activates, `Escape` closes trays or pauses, and number keys provide action/item shortcuts when no text input owns focus. Focus returns predictably after overlays close. Meters use labels, fill, icons, and numbers rather than color alone. Status announcements use restrained ARIA live regions.

## 11. Update and Data Flow

The survival frame performs presentation work only:

1. Read current session snapshot.
2. Advance any active world/UI sequence using clamped frame delta.
3. Update ocean, boat pose, weather, lighting, and camera rig.
4. Apply the latest snapshot and outcome to the DOM only when observable state changes.
5. Render the Three.js scene.

Player commands travel in the opposite direction:

1. UI or hotspot emits an action intent.
2. `SurvivalPhase` rejects input while a blocking sequence is active.
3. `SurvivalSession` validates and atomically resolves the intent.
4. Session returns an immutable outcome and new snapshot.
5. World and UI present that result without mutating rules.
6. After presentation, the phase requests any required event or state advance.

Seeded randomness is supplied through a small PRNG abstraction owned by `SurvivalSession`. Tests may inject known sequences without replacing business logic.

## 12. Edge Cases and Failure Handling

- Health, hunger, energy, hull, resources, and charges never leave their legal bounds.
- Rescue, death, and sinking can commit only once.
- Commands after a terminal result return an invalid outcome and change nothing.
- Rapid clicks cannot duplicate catches, repairs, item use, or event resolution.
- Hidden tabs pause sequences and visuals; turn-based state never advances from elapsed wall-clock time.
- Empty event pools use a calm fallback rather than failing or looping.
- An invalid or stale event item selection is rejected without consuming it.
- Zero-charge consumables remain listed as exhausted but cannot be selected.
- Transitioning phases always releases pointer lock and removes old listeners, DOM, world objects, and GPU resources.
- The survival constructor receives a copy of the saved IDs, not the mutable scavenging snapshot.
- WebGL failure continues to use a readable compatibility screen.
- Full restart disposes the survival phase before creating a clean scavenging phase and seed.

## 13. Content and Balance Targets

The first implementation includes:

- At least eight daytime and eight nighttime event definitions.
- At least six normal result variants across fishing and diving.
- Three weather states.
- One rescue ending, one starvation/injury death presentation, and one sinking presentation.
- Distinct outcome text for every named supply used as an event response.

Balance aims for meaningful scarcity rather than guaranteed victory. A player who saved food and one renewable-food tool should have a reasonable first-run chance. Poor scavenging choices must make survival harder but should not cause an automatic day-one loss. Typical successful runs should take 15–25 minutes including scavenging; unusually lucky rescue can be earlier, and difficult runs may continue longer.

## 14. Testing and Verification

### Automated rules tests

- Phase progression through dawn, day, events, and night.
- Action costs, prerequisites, unavailable reasons, and atomicity.
- Meter/resource bounds and hunger-driven energy recovery.
- Fishing and diving outcomes with and without supporting items.
- Repair material and duct-tape alternatives.
- Inventory derivation and consumable charges.
- Event eligibility, weighting boundaries, cooldowns, counters, and fallback.
- Seed reproducibility.
- Natural rescue eligibility and rising-chance boundaries.
- Flare sighting rescue.
- Death, sinking, and rescue idempotence.

### Integration and DOM tests

- Scavenging result handoff copies only saved items.
- Director disposes one phase before starting the next.
- Meters, actions, inventory, charge counts, events, deltas, and endings render from snapshots.
- Unavailable actions expose reasons.
- Item selection and event resolution emit one intent.
- Keyboard navigation, focus restoration, and pause behavior.
- Full restart creates a fresh scavenging phase.

### Manual browser QA

- Complete scavenging and observe an uninterrupted survival transition.
- Enter survival with several different rescued-item combinations.
- Exercise every action and rescued supply.
- Complete multi-day runs ending in rescue, death, and sinking.
- Verify day/night lighting, all weather, events, and short action sequences.
- Attempt rapid clicks, tab hiding, resizing, and repeated restart.
- Check reduced motion and keyboard-only play.
- Test at 1280×720, 1440×900, and 1920×1080 in current Chrome and Firefox.

### Definition of done

- The complete scavenging-to-variable-rescue loop is playable.
- All required actions, meters, events, item choices, repair, and health mechanics are present.
- Saved supplies influence survival exactly as documented.
- Automated tests, type checking, and production build pass.
- A manual rescue run and both failure types pass browser QA.
- README documents both phases, controls, rules, architecture, and commands.

## 15. Reference

- [Official *Don't Sleep With The Fishes* page](https://dopplerghost.itch.io/dont-sleep-with-the-fishes) — reference for the broad scavenging-to-day/night survival rhythm only.
