# Item Animation Lab and Event Selector Test Audit

Date: 2026-08-31. Scope: current working tree, including existing uncommitted changes.

This is a code audit with isolated probes and existing automated tests. No browser playtest was run.
All checkboxes remain blank. They do not represent the user’s test history.

## Coverage baseline

- 36 selector entries: one lab, 31 event entries for 29 events, and four endings.
- 41 lab use entries across 18 item types.
- Scuba Gear has condition controls but no lab use entry.
- The lab also exposes Fishing Rod, Repair Toolbox, Chest, and the Carlitos status card.
- The event catalog defines 117 responses and 194 outcome entries. Some entries share a visual result.
- 846 existing tests passed across 15 files. This does not establish complete visual, audio, or branch coverage.

## Confirmed selector defect

Check the Back Fish and Check the Back Bad pass a requested result into SurvivalEventFlow.
The normal contextual response omits that result when it calls SurvivalSession.resolveEvent.
Only the Midnight Tour visit route reads the stored result.

An isolated flow probe requested each Check the Back result with the same random roll, 0.95.
Both requests resolved to check-the-back.bad. The session received only kind and choiceId.
The two selector names therefore do not guarantee their named result.

Sources: [selector options](../src/app/EventTest.ts), [contextual resolution](../src/survival/SurvivalEventFlow.ts).

## Tests that need more setup or controls

| Gap | Cases missing from easy manual testing |
|---|---|
| Forced outcomes | Each success, failure, damage range, break, and loss branch. Only the two Midnight Tour outcomes are wired correctly. |
| Repeatable scenes | The selector creates a new seed each time. It cannot retain a seed or select event side, target, cargo kind, or cargo distance. |
| Initial resources | Events start on day 1 with 100 Health, 100 Hull, zero Hunger, three Energy, one Food, and one Bait. No state editor exists. |
| Missing and spent inventory | The selector supplies one usable instance of every item. It cannot remove items, spend charges, or carry lab condition changes into another event. |
| Multiple item instances | Normal scavenging has three Food and two Bait instances. The selector creates only one of each. Test stack selection and selected-instance depletion separately. |
| Item outcome animation | The lab plays use and recovery. It does not resolve the event. Break, loss, consumption, rewards, and reactions need the real event. Break/Fix changes condition directly. |
| Event context | Most lab uses stage a scene without its reveal. Handyman is the exception. Test each actual event’s target, framing, timing, effects, and return. |
| Lab-only routes | Some previews have no current event choice. Examples: throwing Medkit or Energy Bar at Flowers, and trading Knife or Radio with Handyman. |
| Audio differences | Lab Bucket Helmet does not route the Shower Night rain cue. Event reveal, reaction, sleep, and dawn sounds also need actual event tests. |
| Normal day actions | Eating, treatment, Energy Bar use, normal scuba diving, paid item repair, and real hull repair are not normal action previews in the lab. Toolbox only plays its animation. |
| Fishing rewards | Day 1 excludes Crab, Tuna, and Squid. Full inventory excludes Wet Duct Tape, Broken Compass, Torn Fishing Net, and Energy Bar. No catch selector exists. |
| Fishing repetition | Fishing spends real Energy. The lab has no refill control. Three completed attempts exhaust starting Energy. Chest opening also spends all three Energy. |
| Chest rewards | A fresh full-inventory lab chest always awards two Food. Item, Bait, and duct tape rewards need a missing item slot. No reward selector exists. |
| Chest state | The lab starts with one closed chest. There is no chest respawn, age, or mimic control. Test delayed mimic conversion and automatic attack in a run. |
| Handyman chest trade | The event selector starts without a chest, so Chest for Anchor is unavailable. The lab chest cannot carry into that fresh event. |
| Trade and wreckage item gains | Full inventory converts duplicate item rewards to Food. Missing or lost reward items are needed to test actual item acquisition. Broken items still occupy their slot. |
| Wreckage outcomes | Search has four results, Carlitos has four, and diving has eight. Injury, collapse, broken scuba, creature, ghost, and each loot result cannot be selected. |
| Drifting Supplies variants | Barrel, lifeboat, and container have different rewards. Side and near/middle/far distance vary by seed. No variant selector exists. |
| Carlitos states | He starts alive, full, healthy, happy, and rested. Care success, exhausted delegation, absence, sickness, misery, starvation, and death require a prepared run. |
| Radio progression | The lab forces a reception preview. It does not test dawn signal chance, missed calls, answering costs, repeated calls, or rescue progress. |
| Event scheduling | Forced entry bypasses day, pressure, cooldown, inventory, companion, chest, and rescue requirements. It cannot prove natural event eligibility or repeat limits. |
| Quiet and chained nights | Quiet Waters and Quiet Night are not selector entries. Guarded Sleep follow-up selection remains random. Test these through normal progression. |
| Gameplay weather | Weather and time overrides change presentation. They do not set session weather or day. They cannot establish weather-dependent dive rules. |
| Fatal transitions | Full starting Health and Hull do not exercise fatal versions of event attacks, diving, or dawn damage. An ending preview skips the triggering action. |
| Ending variants | Previews do not cover starvation, diving, named-event death, named-event sinking, or signal-assisted rescue. Day and pickup totals use synthetic starts. |
| Run records and saves | Lab checkpoints are disabled. Endings start without a played history. Check real journal entries, statistics, save/continue, and restored choices during normal runs. |
| Exact timing | No timeline scrub, frame step, slow motion, or loop control exists. Manual pause cannot guarantee a particular contact or cue frame. |
| Failure recovery | Slow or failed model loads, audio failures, stale callbacks, and cleanup failures need fault injection or automated tests. |
| Visual and input coverage | Unit tests cannot establish clipping, click overlap, sound timing, or performance across browsers, resolutions, zoom levels, and quality settings. |

Sources: [lab flow](../src/survival/ItemAnimationLabFlow.ts), [session setup](../src/survival/SurvivalPhase.ts), [session rules](../src/survival/SurvivalSession.ts), [chest rewards](../src/survival/chest.ts), [fishing catalog](../src/survival/fishingCatalog.ts), [event selection](../src/survival/eventSelection.ts), [ending text](../src/game/ending.ts).

## Checks available now

- [ ] Select each dropdown entry and press ENTER EVENT. Changing the selection alone must not launch it.
- [ ] Re-enter the same scene. Check that old props, sounds, masks, weather, and camera state clear.
- [ ] Switch scenes during loading, reveal, item use, reaction, fishing, and an ending.
- [ ] Check all animation choices below with pointer and keyboard input.
- [ ] Check overlap selection with the wheel and arrow keys. Check focus and disabled-choice feedback.
- [ ] Open and dismiss the lab item popup. Select another item and check the new choices.
- [ ] Break and Fix each supported item. Check that broken items remain selectable and cannot play a use.
- [ ] Drag with the right mouse button. Check pitch limits, release, blur, pause, and scene exit.
- [ ] Turn toward the chest and return. Open it before spending Energy on fishing.
- [ ] Open and dismiss the Carlitos card. Check initial unavailable care reasons.
- [ ] Fish with pointer and keyboard input. Cancel before casting, catch, miss, continue, cast again, and exit.
- [ ] Test each event response below, including Sleep, refusal, Leave, and Return to boat.
- [ ] Leave Plane unanswered for its 10-second window. Check timeout and a last-moment signal separately.
- [ ] Wait through Chest Attack without clicking. Check automatic damage and repeat with a usable Knife.
- [ ] For Check the Back, record the actual result. Do not trust the Fish/Bad selector label.
- [ ] For each Midnight Tour entry, visit the island. Test Sail On separately.
- [ ] Pause and resume. Hide and restore the tab during each presentation stage.
- [ ] Resize during choices, fishing, results, and endings. Check pointer targets and focus.
- [ ] Check each ending screen, restart, and menu return. Test real run statistics separately.

## Existing alternative for longer runs

The browser-playtest startup supports a fixed seed and exactly two missing item instances.
It does not select a starting event, day, resource state, or outcome.
Entering a dropdown scene discards that loadout and creates a fresh seed.
See [browser playtesting](browser-playtesting.md) and [startup parser](../src/app/BrowserPlaytest.ts).

## Lab use checklist

The event and choice shown below are preview inputs. They are not proof that the actual event offers that response.

### FOOD

- [ ] Throw at target (`death-stare` / `food`).
- [ ] Trade handover (`night-trader` / `food`).

### BAIT

- [ ] Throw at target (`swarm-of-sharks` / `bait`).
- [ ] Trade handover (`night-trader` / `bait`).

### DUCT TAPE

- [ ] Stretch tape (`leak` / `ductTape`).
- [ ] Trade handover (`handyman` / `ductTape`).

### COMPASS

- [ ] Search with compass (`man-in-the-fog` / `compass`).

### MAP

- [ ] Read map (`dangerous-waters` / `map`).
- [ ] Patch leak (`leak` / `map`).
- [ ] Trade handover (`night-trader` / `map`).

### MEDKIT

- [ ] Throw at target (`flowers` / `medicalKit`).
- [ ] Trade handover (`handyman` / `medicalKit`).

### BINOCULARS

- [ ] Look through (`school-of-fish` / `spyglass`).
- [ ] Trade handover (`handyman` / `spyglass`).

### FISHING NET

- [ ] Scoop from water (`school-of-fish` / `fishingNet`).
- [ ] Trade handover (`handyman` / `fishingNet`).

### KNIFE

- [ ] Slash knife (`snatcher` / `knife`).
- [ ] Trade handover (`handyman` / `knife`).

### BUCKET

- [ ] Scoop from water (`school-of-fish` / `bucket`).
- [ ] Wear as helmet (`shower-night` / `bucket`).
- [ ] Trade handover (`handyman` / `bucket`).

### FLARE GUN

- [ ] Fire at target (`ghosts` / `flareGun`).
- [ ] Signal sky (`other-people` / `flareGun`).
- [ ] Trade handover (`handyman` / `flareGun`).

### ANCHOR

- [ ] Drop anchor (`tornado` / `anchor`).
- [ ] Trade handover (`handyman` / `anchor`).

### RADIO

- [ ] Receive signal (`item-animation-lab` / `radioSignal`).
- [ ] Trade handover (`handyman` / `radio`).

### UMBRELLA

- [ ] Hold overhead (`shower-night` / `umbrella`).
- [ ] Use as shield (`death-stare` / `umbrella`).
- [ ] Trade handover (`night-trader` / `umbrella`).

### SWIM RING

- [ ] Throw at target (`tornado` / `swimRing`).
- [ ] Trade with Night Trader (`night-trader` / `swimRing`).
- [ ] Trade with Handyman (`handyman` / `swimRing`).

### FLASHLIGHT

- [ ] Aim threat beam (`death-stare` / `flashlight`).
- [ ] Send signal (`plane` / `flashlight`).
- [ ] Trade handover (`handyman` / `flashlight`).

### SHOTGUN

- [ ] Fire shotgun (`snatcher` / `shotgun`).
- [ ] Trade handover (`handyman` / `shotgun`).

### ENERGY BAR

- [ ] Throw at target (`flowers` / `energyBar`).
- [ ] Trade handover (`handyman` / `energyBar`).

### Condition controls

- [ ] COMPASS: Break, unavailable use, and Fix.
- [ ] MAP: Break, unavailable use, and Fix.
- [ ] BINOCULARS: Break, unavailable use, and Fix.
- [ ] FISHING NET: Break, unavailable use, and Fix.
- [ ] KNIFE: Break, unavailable use, and Fix.
- [ ] BUCKET: Break, unavailable use, and Fix.
- [ ] SCUBA GEAR: Break, unavailable use, and Fix.
- [ ] ANCHOR: Break, unavailable use, and Fix.
- [ ] UMBRELLA: Break, unavailable use, and Fix.
- [ ] SWIM RING: Break, unavailable use, and Fix.
- [ ] FLASHLIGHT: Break, unavailable use, and Fix.

## Event response and outcome checklist

Check the response and each outcome separately. A response check alone does not cover its random branches.
Outcome entries use catalog text. Duplicate rewards may instead become Food.
Drifting Supplies filters results by cargo kind before drawing an outcome.

### Dangerous Waters (night)

Selector: Dangerous Waters.

- [ ] **Use Map** (`map`) — needs usable MAP.
  - [ ] `outcome 1`: The map guides the boat through a clear channel.
  - [ ] `outcome 2`: The rocks damage the boat. Effects: subtract hull 5–10; add pressure 1.

- [ ] **Use Compass** (`compass`) — needs usable COMPASS.
  - [ ] `outcome 1`: The compass holds a safe bearing through the rocks.
  - [ ] `outcome 2`: The rocks damage the boat. Effects: subtract hull 5–8; add pressure 1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The rocks damage the boat. Effects: subtract hull 25–45; add pressure 1.

### Leak (night)

Selector: Leak.

- [ ] **Use Duct Tape** (`ductTape`) — needs usable DUCT TAPE.
  - [ ] `outcome 1`: The tape is used. Effects: consume ductTape ×1.

- [ ] **Use Bucket** (`bucket`) — needs usable BUCKET.
  - [ ] `outcome 1`: You keep pace with the rising water until dawn.
  - [ ] `outcome 2`: The boat is damaged. Effects: subtract hull 5–10; break bucket ×1.

- [ ] **Use Map** (`map`) — needs usable MAP.
  - [ ] `outcome 1`: The map slows the leak.
  - [ ] `outcome 2`: The map tears while slowing the leak. Effects: break map ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The leak damages the boat. Effects: subtract hull 15–20; next dawn Energy 2.
  - [ ] `outcome 2`: The leak damages the boat and takes an item. Effects: subtract hull 5–20; loseRandom  ×1.

### School of Fish (night)

Selector: School of Fish.

- [ ] **Use Fishing Net** (`fishingNet`) — needs usable FISHING NET.
  - [ ] `outcome 1`: You gain three food. Effects: add food 3.
  - [ ] `outcome 2`: You gain two food. Effects: add food 2; break fishingNet ×1.

- [ ] **Use Bucket** (`bucket`) — needs usable BUCKET.
  - [ ] `outcome 1`: You gain one food. Effects: add food 1.
  - [ ] `outcome 2`: The school slips beyond the bucket. Effects: break bucket ×1.

- [ ] **Use Binoculars** (`spyglass`) — needs usable BINOCULARS.
  - [ ] `outcome 1`: The school passes beyond reach.
  - [ ] `outcome 2`: You gain one food. Effects: add food 1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The school moves on before dawn.

### Tentacle Attack (night)

Selector: Tentacle Attack.

- [ ] **Use Knife** (`knife`) — needs usable KNIFE.
  - [ ] `outcome 1`: You cut the tentacle. The supply stays aboard.

- [ ] **Use Shotgun** (`shotgun`) — needs usable SHOTGUN.
  - [ ] `outcome 1`: The shot drives the tentacle away. The supply stays aboard. Effects: consume shotgun ×1.

- [ ] **Use Flare Gun** (`flareGun`) — needs usable FLARE GUN.
  - [ ] `outcome 1`: The flare drives the tentacle away. The supply stays aboard. Effects: consume flareGun ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The tentacle steals a supply and wounds you. Effects: subtract health 30; loseEventTarget ×1.

### Death Stare (night)

Selector: Death Stare.

- [ ] **Use Flashlight** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `outcome 1`: The creature sinks below the beam.
  - [ ] `outcome 2`: The flashlight is lost. Effects: lose flashlight ×1; next dawn Energy 1.

- [ ] **Use Umbrella** (`umbrella`) — needs usable UMBRELLA.
  - [ ] `outcome 1`: The umbrella breaks the creature's gaze.
  - [ ] `outcome 2`: The creature attacks. Effects: subtract hull 44–60; subtract health 60; break umbrella ×1.

- [ ] **Use Food** (`cannedFood`) — needs usable FOOD.
  - [ ] `outcome 1`: You lose two food. Effects: subtract food 2.
  - [ ] `outcome 2`: The creature attacks. Effects: subtract food 1; subtract hull 33–55; subtract health 50.

- [ ] **Use Shotgun** (`shotgun`) — needs usable SHOTGUN.
  - [ ] `outcome 1`: The shotgun is fired. Effects: consume shotgun ×1.

- [ ] **Use Fishing Net** (`fishingNet`) — needs usable FISHING NET.
  - [ ] `outcome 1`: The creature attacks. Effects: subtract hull 55–60; subtract health 60; break fishingNet ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The shape loses interest and sinks away.
  - [ ] `outcome 2`: The creature attacks. Effects: subtract hull 44–60; subtract health 60.

### Swarm of Sharks (night)

Selector: Swarm of Sharks.

- [ ] **Use Fishing Net** (`fishingNet`) — needs usable FISHING NET.
  - [ ] `outcome 1`: The net holds the swarm back.
  - [ ] `outcome 2`: The net tears while holding the swarm back. Effects: break fishingNet ×1.

- [ ] **Use Knife** (`knife`) — needs usable KNIFE.
  - [ ] `outcome 1`: You drive the sharks away from the boat.
  - [ ] `outcome 2`: The knife breaks as a shark bites you. Effects: subtract health 20; break knife ×1.

- [ ] **Use Shotgun** (`shotgun`) — needs usable SHOTGUN.
  - [ ] `outcome 1`: You gain two food. Effects: add food 2; consume shotgun ×1.

- [ ] **Use Flashlight** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `outcome 1`: The swarm attacks. Effects: subtract hull 20–40; subtract health 50.

- [ ] **Use Bait** (`baitTin`) — needs usable BAIT.
  - [ ] `outcome 1`: You lose two bait. Effects: subtract bait 2.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The swarm attacks. Effects: subtract hull 20–40; subtract health 50.
  - [ ] `outcome 2`: The fins scatter before reaching the hull.

### Tornado (night)

Selector: Tornado.

- [ ] **Use Anchor** (`anchor`) — needs usable ANCHOR.
  - [ ] `outcome 1`: The anchor holds the boat outside the current.
  - [ ] `outcome 2`: The boat is damaged. Effects: subtract hull 5–10; break anchor ×1.

- [ ] **Use Swim Ring** (`swimRing`) — needs usable SWIM RING.
  - [ ] `outcome 1`: The ring pulls the boat outside the strongest current.
  - [ ] `outcome 2`: The boat is damaged. Effects: subtract hull 20–40; break swimRing ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The boat is damaged. Effects: subtract hull 20–40; next dawn Energy 0.
  - [ ] `outcome 2`: The boat is badly damaged and one item is lost. Effects: subtract hull 50–60; loseRandom  ×1; next dawn Energy 2.

### Shower Night (night)

Selector: Shower Night.

- [ ] **Use Bucket** (`bucket`) — needs usable BUCKET.
  - [ ] `outcome 1`: The bucket keeps the rain under control.
  - [ ] `outcome 2`: The bucket keeps the rain under control. Effects: break bucket ×1.

- [ ] **Use Umbrella** (`umbrella`) — needs usable UMBRELLA.
  - [ ] `outcome 1`: The umbrella shelters you.
  - [ ] `outcome 2`: The umbrella shelters you. Effects: break umbrella ×1.

- [ ] **Use Map** (`map`) — needs usable MAP.
  - [ ] `outcome 1`: The map covers the exposed supplies. Effects: break map ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The rain eases before dawn.
  - [ ] `outcome 2`: You wake with two energy. Effects: next dawn Energy 2.

### Windy Night (night)

Selector: Windy Night.

- [ ] **Use Fishing Net** (`fishingNet`) — needs usable FISHING NET.
  - [ ] `outcome 1`: The net secures the loose supplies.
  - [ ] `outcome 2`: The net tears while securing the loose supplies. Effects: break fishingNet ×1.

- [ ] **Use Map** (`map`) — needs usable MAP.
  - [ ] `outcome 1`: The map is lost, but you find food. Effects: add food 1; lose map ×1.

- [ ] **Use Umbrella** (`umbrella`) — needs usable UMBRELLA.
  - [ ] `outcome 1`: The umbrella shields the loose supplies.
  - [ ] `outcome 2`: The umbrella is lost. Effects: lose umbrella ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The wind batters the boat. Effects: subtract hull 10–30; breakRandom  ×2.
  - [ ] `outcome 2`: The wind batters the boat. Effects: subtract hull 10–30; next dawn Energy 1.

### Bad Sleep (night)

Selector: Bad Sleep.

- [ ] **Use Bucket** (`bucket`) — needs usable BUCKET.
  - [ ] `outcome 1`: The hollow bucket knocks through the night.

- [ ] **Use Flashlight** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `outcome 1`: The beam finds only empty water.

- [ ] **Use Swim Ring** (`swimRing`) — needs usable SWIM RING.
  - [ ] `outcome 1`: The ring drifts against the gunwale.

- [ ] **Use Umbrella** (`umbrella`) — needs usable UMBRELLA.
  - [ ] `outcome 1`: The umbrella shelters a restless sleep.
  - [ ] `outcome 2`: A hard gust folds the umbrella during the night. Effects: break umbrella ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: You wake with two energy. Effects: next dawn Energy 2.

### Thunderstorm (night)

Selector: Thunderstorm.

- [ ] **Use Anchor** (`anchor`) — needs usable ANCHOR.
  - [ ] `outcome 1`: The anchor holds through the storm.
  - [ ] `outcome 2`: You wake with two energy. Effects: next dawn Energy 2.

- [ ] **Use Bucket** (`bucket`) — needs usable BUCKET.
  - [ ] `outcome 1`: The boat is damaged. Effects: subtract hull 15–25; break bucket ×1.
  - [ ] `outcome 2`: The boat is damaged. Effects: subtract hull 20–30.
  - [ ] `outcome 3`: A random item is lost. Effects: loseRandom  ×1.
  - [ ] `outcome 4`: A random item is lost. Effects: loseRandom  ×1; break bucket ×1.

- [ ] **Use Umbrella** (`umbrella`) — needs usable UMBRELLA.
  - [ ] `outcome 1`: The umbrella sheds the worst rain.
  - [ ] `outcome 2`: The boat is damaged. Effects: subtract hull 20–30; break umbrella ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The storm damages the boat and takes an item. Effects: subtract hull 30–48; loseRandom  ×1; next dawn Energy 2.
  - [ ] `outcome 2`: The storm damages the boat. Effects: subtract hull 20–35; next dawn Energy 2.

### Restless Waves (night)

Selector: Restless Waves.

- [ ] **Use Anchor** (`anchor`) — needs usable ANCHOR.
  - [ ] `outcome 1`: The anchor steadies the boat through the waves.

- [ ] **Use Swim Ring** (`swimRing`) — needs usable SWIM RING.
  - [ ] `outcome 1`: The swim ring steadies the boat.
  - [ ] `outcome 2`: The waves damage the boat. Effects: subtract hull 10–20; break swimRing ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The waves damage the boat. Effects: subtract hull 20–30; next dawn Energy 1.
  - [ ] `outcome 2`: The waves damage the boat and take an item. Effects: subtract hull 15–25; loseRandom  ×1.

### Man in the Fog (night)

Selector: Man in the Fog.

- [ ] **Use Compass** (`compass`) — needs usable COMPASS.
  - [ ] `outcome 1`: The compass keeps the boat on a steady bearing. Effects: subtract pressure 1.

- [ ] **Use Binoculars** (`spyglass`) — needs usable BINOCULARS.
  - [ ] `outcome 1`: Danger increases. Effects: add pressure 1.

- [ ] **Use Flashlight** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `outcome 1`: The beam drives the figure back into the fog.
  - [ ] `outcome 2`: The figure attacks. Effects: add pressure 2; subtract health 20; next dawn Energy 1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The boat is damaged. Effects: add pressure 1; subtract hull 10–30.
  - [ ] `outcome 2`: You are injured. Effects: add pressure 1; subtract health 20; next dawn Energy 2.

### Ghosts (night)

Selector: Ghosts.

- [ ] **Use Flare Gun** (`flareGun`) — needs usable FLARE GUN.
  - [ ] `outcome 1`: The flare drives the pale shapes into the dark. Effects: subtract pressure 1; consume flareGun ×1.

- [ ] **Use Flashlight** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `outcome 1`: The beam keeps the pale shapes beyond the gunwale.
  - [ ] `outcome 2`: You wake with one energy. Effects: next dawn Energy 1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: You wake with two energy. Effects: next dawn Energy 2.
  - [ ] `outcome 2`: You wake with one energy. Effects: next dawn Energy 1.

### Eerie Melody (night)

Selector: Eerie Melody.

- [ ] **Use Bucket** (`bucket`) — needs usable BUCKET.
  - [ ] `outcome 1`: You wake with one energy. Effects: break bucket ×1; next dawn Energy 1.

- [ ] **Use Binoculars** (`spyglass`) — needs usable BINOCULARS.
  - [ ] `outcome 1`: The siren attacks. Effects: subtract hull 50–60; subtract health 30.

- [ ] **Use Umbrella** (`umbrella`) — needs usable UMBRELLA.
  - [ ] `outcome 1`: The umbrella muffles the melody until it fades.
  - [ ] `outcome 2`: The boat is damaged. Effects: subtract hull 40–60; break umbrella ×1; next dawn Energy 1.

- [ ] **Use Duct Tape** (`ductTape`) — needs usable DUCT TAPE.
  - [ ] `outcome 1`: The tape blocks the melody until it fades. Effects: subtract pressure 1; consume ductTape ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: You wake exhausted. Effects: next dawn Energy 0.
  - [ ] `outcome 2`: The siren attacks. Effects: subtract hull 50–60; subtract health 30; next dawn Energy 1.

### Face on the Moon (night)

Selector: Face on the Moon.

- [ ] **Use Umbrella** (`umbrella`) — needs usable UMBRELLA.
  - [ ] `outcome 1`: You wake with two energy. Effects: next dawn Energy 2.

- [ ] **Use Binoculars** (`spyglass`) — needs usable BINOCULARS.
  - [ ] `outcome 1`: You wake with one energy. Effects: break spyglass ×1; next dawn Energy 1.
  - [ ] `outcome 2`: Danger increases. Effects: add pressure 1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: You wake exhausted. Effects: next dawn Energy 0.
  - [ ] `outcome 2`: You wake with two energy. Effects: next dawn Energy 2.

### Shadow Figure (night)

Selector: Shadow Figure.

- [ ] **Use Flashlight** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `outcome 1`: The false shape remains beyond the light. Effects: add pressure 1.
  - [ ] `outcome 2`: The false shape claws you before retreating. Effects: subtract health 50.

- [ ] **Use Flare Gun** (`flareGun`) — needs usable FLARE GUN.
  - [ ] `outcome 1`: The flare drives the false shape away. Effects: consume flareGun ×1.

- [ ] **Sleep** (`sleep`).
  - [ ] `outcome 1`: The shadow leaves before dawn.

### Guarded Sleep (night)

Selector: Guarded Sleep.

- [ ] **Let Carlitos Watch** (`watch`).
  - [ ] `outcome 1`: Carlitos keeps the night peaceful.
  - [ ] `outcome 2`: Something slips past his watch. Effects: follow-up night.

- [ ] **Sleep Normally** (`sleep`).
  - [ ] `outcome 1`: The normal night continues. Effects: follow-up night.

### Drifting Supplies (day)

Selector: Drifting Supplies.

- [ ] **Retrieve Supplies** (`retrieve`) — needs 3 energy for barrels and lifeboats, or 2 for containers.
  - [ ] `drifting-supplies-barrel-food`: You recover one food from the barrel. Effects: subtract energy 3; add food 1.
  - [ ] `drifting-supplies-barrel-bait`: You recover one bait from the barrel. Effects: subtract energy 3; add bait 1.
  - [ ] `drifting-supplies-barrel-repair`: You recover one roll of duct tape from the barrel. Effects: subtract energy 3; add repairMaterial 1.
  - [ ] `drifting-supplies-lifeboat-food`: You recover two food from the cooler. Effects: subtract energy 3; add food 2.
  - [ ] `drifting-supplies-lifeboat-bait`: You recover two bait from the cooler. Effects: subtract energy 3; add bait 2.
  - [ ] `drifting-supplies-lifeboat-repair`: You recover two rolls of duct tape from the cooler. Effects: subtract energy 3; add repairMaterial 2.
  - [ ] `drifting-supplies-container-food`: You recover three food from the shipping container. Effects: subtract energy 2; add food 3.
  - [ ] `drifting-supplies-container-bait`: You recover three bait from the shipping container. Effects: subtract energy 2; add bait 3.
  - [ ] `drifting-supplies-container-repair`: You recover three rolls of duct tape from the shipping container. Effects: subtract energy 2; add repairMaterial 3.
  - [ ] `drifting-supplies-container-energy-bar`: You recover an energy bar from the shipping container. Effects: subtract energy 2; gain energyBar ×1.

- [ ] **Send Carlitos** (`delegate-carlitos`) — needs available Carlitos with 3 energy, or 2 for containers.
  - [ ] `drifting-supplies-barrel-food`: Carlitos recovers one food from the barrel. Effects: add food 1.
  - [ ] `drifting-supplies-barrel-bait`: Carlitos recovers one bait from the barrel. Effects: add bait 1.
  - [ ] `drifting-supplies-barrel-repair`: Carlitos recovers one roll of duct tape from the barrel. Effects: add repairMaterial 1.
  - [ ] `drifting-supplies-lifeboat-food`: Carlitos recovers two food from the cooler. Effects: add food 2.
  - [ ] `drifting-supplies-lifeboat-bait`: Carlitos recovers two bait from the cooler. Effects: add bait 2.
  - [ ] `drifting-supplies-lifeboat-repair`: Carlitos recovers two rolls of duct tape from the cooler. Effects: add repairMaterial 2.
  - [ ] `drifting-supplies-container-food`: Carlitos recovers three food from the shipping container. Effects: add food 3.
  - [ ] `drifting-supplies-container-bait`: Carlitos recovers three bait from the shipping container. Effects: add bait 3.
  - [ ] `drifting-supplies-container-repair`: Carlitos recovers three rolls of duct tape from the shipping container. Effects: add repairMaterial 3.
  - [ ] `drifting-supplies-container-energy-bar`: Carlitos recovers an energy bar from the shipping container. Effects: gain energyBar ×1.

- [ ] **Let It Drift** (`sleep`).
  - [ ] `drifting-supplies.drift`: The supplies drift out of reach.

### Drifting Chest (day)

Selector: Drifting Chest.

- [ ] **Retrieve It** (`retrieve`) — needs 3 energy.
  - [ ] `drifting-chest.retrieve`: You recover the closed chest. Effects: subtract energy 3; gainChest  ×1.

- [ ] **Send Carlitos** (`delegate-carlitos`) — needs available Carlitos.
  - [ ] `drifting-chest.retrieve`: Carlitos recovers the closed chest. Effects: gainChest  ×1.

- [ ] **Let It Drift** (`sleep`).
  - [ ] `drifting-chest.drift`: The chest drifts out of reach.

### Wreckage (day)

Selector: Wreckage.

- [ ] **Search Debris** (`search`) — needs 1 energy.
  - [ ] `wreckage-search-repair`: You recover duct tape. Effects: subtract energy 1; add repairMaterial 2.
  - [ ] `wreckage-search-food`: You recover one food. Effects: subtract energy 1; add food 1.
  - [ ] `wreckage-search-bait`: You recover one bait. Effects: subtract energy 1; add bait 1.
  - [ ] `wreckage-search-injury`: Sharp debris cuts you. Effects: subtract energy 1; subtract health 15–25.

- [ ] **Send Carlitos** (`delegate-carlitos`) — needs available Carlitos with 2 energy.
  - [ ] `wreckage-carlitos-repair`: Carlitos recovers duct tape. Effects: add repairMaterial 2.
  - [ ] `wreckage-carlitos-food`: Carlitos recovers one food. Effects: add food 1.
  - [ ] `wreckage-carlitos-bait`: Carlitos recovers one bait. Effects: add bait 1.
  - [ ] `wreckage-carlitos-empty`: Carlitos returns empty.

- [ ] **Search underwater** (`dive`) — needs usable SCUBA GEAR, 3 energy.
  - [ ] `wreckage-dive-medkit`: You recover a medkit. Effects: subtract energy 3; gain medicalKit ×1.
  - [ ] `wreckage-dive-flare-gun`: You recover a flare gun. Effects: subtract energy 3; gain flareGun ×1.
  - [ ] `wreckage-dive-duct-tape`: You recover duct tape. Effects: subtract energy 3; gain ductTape ×1.
  - [ ] `wreckage-dive-energy-bar`: You recover an energy bar. Effects: subtract energy 3; gain energyBar ×1.
  - [ ] `wreckage-dive-collapse`: The wreck collapses around you. Effects: subtract energy 3; subtract health 25–35.
  - [ ] `wreckage-dive-collapse-scuba`: The wreck collapses and damages your gear. Effects: subtract energy 3; subtract health 25–35; break scubaSet ×1.
  - [ ] `wreckage-dive-creature`: A creature attacks inside the wreck. Effects: subtract energy 3; subtract health 30–40.
  - [ ] `wreckage-dive-ghost`: A presence follows you through the wreck. Effects: subtract energy 3; subtract health 20–30; add pressure 1.

- [ ] **Leave** (`leave`).
  - [ ] `wreckage-leave`: You leave the wreckage behind.

### Check the Back (night)

Selector: Check the Back Fish; Check the Back Bad.

- [ ] **Yes** (`check`).
  - [ ] `check-the-back.fish`: A fish has landed aboard. Effects: add food 1.
  - [ ] `check-the-back.bad`: An anglerfish strikes from the stern. Effects: subtract health 25.

- [ ] **No** (`sleep`).
  - [ ] `check-the-back.ignore`: You leave the sound alone.

### Flowers (night)

Selector: Flowers.

- [ ] **Use Fishing Net** (`fishingNet`) — needs usable FISHING NET.
  - [ ] `flowers.collect`: You lift the flowers aboard.

- [ ] **Use Bucket** (`bucket`) — needs usable BUCKET.
  - [ ] `flowers.collect`: You gather the flowers in the bucket.

- [ ] **Let Them Drift** (`sleep`).
  - [ ] `flowers.drift`: The flowers drift into the dark.

### Chest Attack (night)

Selector: Chest Attack.

- [ ] The attack resolves automatically after the reveal.
  - [ ] Without a usable Knife: subtract Health 25 and destroy the Chest.
  - [ ] With a usable Knife: subtract Health 10 and destroy the Chest. Keep the Knife usable.
  - [ ] Show no choice. Mention Knife mitigation only in the journal.

### Midnight Tour (night)

Selector: Midnight Tour Chest; Midnight Tour Monster.

- [ ] **Visit the Island** (`visit`).
  - [ ] `tour-chest`: You find a chest. Effects: add pressure 1; gainChest  ×1; next dawn Energy 2.
  - [ ] `tour-attack`: Something jumps from the palms. Effects: subtract health 25–45.

- [ ] **Sail On** (`sleep`).
  - [ ] `tour-pass`: The island disappears into the dark.

### Night Trader (night)

Selector: Night Trader.

- [ ] **Offer Food** (`food`) — needs usable FOOD.
  - [ ] `trader-reward`: The trader gives you duct tape. Effects: subtract food 1; gain ductTape ×1.

- [ ] **Offer Bait** (`bait`) — needs usable BAIT.
  - [ ] `trader-reward`: The trader gives you an energy bar. Effects: subtract bait 1; gain energyBar ×1.

- [ ] **Offer Map** (`map`) — needs usable MAP.
  - [ ] `trader-reward`: The trader gives you a compass. Effects: lose map ×1; gain compass ×1.

- [ ] **Offer Umbrella** (`umbrella`) — needs usable UMBRELLA.
  - [ ] `trader-reward`: The trader gives you a medkit. Effects: lose umbrella ×1; gain medicalKit ×1.

- [ ] **Offer Swim Ring** (`swimRing`) — needs usable SWIM RING.
  - [ ] `trader-reward`: The trader gives you a radio. Effects: lose swimRing ×1; gain radio ×1.

- [ ] **Refuse** (`sleep`).
  - [ ] `trader-refuse`: The trader rows on into the night.

### Handyman (night)

Selector: Handyman.

- [ ] **Spyglass for Flashlight** (`spyglass`) — needs usable BINOCULARS.
  - [ ] `handyman-reward`: The handyman gives you a flashlight. Effects: lose spyglass ×1; gain flashlight ×1.

- [ ] **Flashlight for Spyglass** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `handyman-reward`: The handyman gives you binoculars. Effects: lose flashlight ×1; gain spyglass ×1.

- [ ] **Flare Gun for Shotgun** (`flareGun`) — needs usable FLARE GUN.
  - [ ] `handyman-reward`: The handyman gives you a shotgun. Effects: consume flareGun ×1; gain shotgun ×1.

- [ ] **Shotgun for Flare Gun** (`shotgun`) — needs usable SHOTGUN.
  - [ ] `handyman-reward`: The handyman gives you a flare gun. Effects: consume shotgun ×1; gain flareGun ×1.

- [ ] **Medkit for Scuba Gear** (`medicalKit`) — needs usable MEDKIT.
  - [ ] `handyman-reward`: The handyman gives you scuba gear. Effects: consume medicalKit ×1; gain scubaSet ×1.

- [ ] **Fishing Net for Bucket** (`fishingNet`) — needs usable FISHING NET.
  - [ ] `handyman-reward`: The handyman gives you a bucket. Effects: lose fishingNet ×1; gain bucket ×1.

- [ ] **Bucket for Fishing Net** (`bucket`) — needs usable BUCKET.
  - [ ] `handyman-reward`: The handyman gives you a fishing net. Effects: lose bucket ×1; gain fishingNet ×1.

- [ ] **Duct Tape for Energy Bar** (`ductTape`) — needs usable DUCT TAPE.
  - [ ] `handyman-reward`: The handyman gives you an energy bar. Effects: consume ductTape ×1; gain energyBar ×1.

- [ ] **Energy Bar for Duct Tape** (`energyBar`) — needs usable ENERGY BAR.
  - [ ] `handyman-reward`: The handyman gives you duct tape. Effects: consume energyBar ×1; gain ductTape ×1.

- [ ] **Swim Ring for Radio** (`swimRing`) — needs usable SWIM RING.
  - [ ] `handyman-reward`: The handyman gives you a radio. Effects: lose swimRing ×1; gain radio ×1.

- [ ] **Anchor for Chest** (`anchor`) — needs usable ANCHOR.
  - [ ] `handyman-reward`: The handyman gives you a chest. Effects: lose anchor ×1; gainChest  ×1.

- [ ] **Chest for Anchor** (`chest`) — needs closed chest.
  - [ ] `handyman-reward`: The handyman gives you an anchor. Effects: gain anchor ×1; chest destroy.

- [ ] **Touch the Hand** (`touch`).
  - [ ] `handyman-touch`: The hand closes around you. Effects: subtract hull 30–60; subtract health 60.

- [ ] **Sleep** (`sleep`).
  - [ ] `handyman-sleep`: The handyman shrugs and drifts away.

### Other People (night)

Selector: Other People.

- [ ] **Use Flare Gun** (`flareGun`) — needs usable FLARE GUN.
  - [ ] `people-signaled`: The distant crew sees your flare. Effects: add rescueLead 6; consume flareGun ×1.

- [ ] **Use Flashlight** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `people-signaled`: The distant crew answers your light. Effects: add rescueLead 4.

- [ ] **Let It Pass** (`sleep`).
  - [ ] `people-pass`: You let the other boat pass.

### Plane (night)

Selector: Plane.

- [ ] **Use Flare Gun** (`flareGun`) — needs usable FLARE GUN.
  - [ ] `plane-signaled`: The plane banks after seeing your flare. Effects: add rescueLead 4; consume flareGun ×1.

- [ ] **Use Flashlight** (`flashlight`) — needs usable FLASHLIGHT.
  - [ ] `plane-signaled`: The plane answers your light with a wing dip. Effects: add rescueLead 2.

- [ ] **Let It Pass** (`sleep`).
  - [ ] `plane-pass`: You let the plane pass into the dark.

## Verification record

Passed command 1:

```powershell
node node_modules/vitest/vitest.mjs run tests/ItemAnimationLabFlow.test.ts tests/ItemAnimationLabIntegration.test.ts tests/ItemAnimationLabFishing.test.ts tests/PostProcessingConsole.test.ts tests/GameLifecycle.test.ts tests/SurvivalPhase.test.ts tests/survivalEvents.test.ts tests/EventOutcomeRules.test.ts tests/eventItemUseChoreography.test.ts tests/FishingSettlementRules.test.ts tests/SurvivalEndingPreview.test.ts
```

Result: 455 tests passed in 11 files.

Passed command 2:

```powershell
node node_modules/vitest/vitest.mjs run tests/SurvivalUI.test.ts tests/SurvivalEventFlow.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts
```

Result: 391 tests passed in four files.

The initial sandbox attempt could not load the Vitest configuration. The approved retry completed.
No gameplay source files were changed.
