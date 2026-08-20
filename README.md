# Don't Sleep With The Fishes

A desktop-browser survival game built with TypeScript and Three.js. Scavenge a sinking ship under a one-minute deadline, launch with only the supplies you saved, and then manage a lifeboat through changing weather, day and night events, and an uncertain wait for rescue.

## Visual identity

The game uses an authored illustrated style: darkly comic, melancholic, and
maritime. Stylized models favor recognizable silhouettes, purposeful
irregularity, and constructed detail; sparse scene-integrated UI and tactile
keyed animation keep the physical world dominant. Selective ambient occlusion
and restrained print treatment add cohesion without substituting for geometry,
materials, lighting, or composition.

See the [visual style guide](VISUAL_STYLE_GUIDE.md) for the durable
direction and the [current visual audit](docs/VISUAL_AUDIT.md) for prioritized
recommendations.

The 3D world combines authored procedural geometry with curated, locally
committed models and shaders. Its shared cloudless atmosphere combines grounded
maritime scattering, a locally committed original gibbous-moon texture,
weather-aware celestial light, fog, lighting, and synchronized ocean
reflections without external sky art.

The scavenging phase takes place on a furnished single-level coastal freighter. A loop connects the crew cabin, wheelhouse, cargo deck, storage/workroom, and lifeboat station, giving each one-minute run two practical search directions.

Collectibles spawn on authored desks, shelves, cabinets, workbenches, racks, and crates across all ship regions. Each item type uses fitting surfaces without room categories. Dorothy contains exactly 18 scavenging item types and 21 physical pickups: Food appears three times, Bait twice, and every other item type once.

The ship combines original procedural geometry with locally committed wood maps and flat authored steel materials. Static puddles add tension without changing movement. Each enclosed room has a pulsing caged alarm lamp centered on its ceiling. One synchronized CC0 klaxon feeds those three room positions at half volume, fades naturally through doors, and follows pause and exit lifecycle.

## Dorothy supplies

The carry limit is three weight points, not three objects. Weight-one Dorothy supplies are Food (3), Bait (2), Duct Tape, Compass, Map, Binoculars, Flare Gun, Bottled Paper, and Flashlight. Weight-two supplies are Medkit, Fishing Net, Bucket, Umbrella, Swim Ring, Shotgun, and Carlitos. Scuba Gear and Anchor each weigh three points.

Food, Bait, Duct Tape, Medkit, Flare Gun, Bottled Paper, and Shotgun are one-use Dorothy supplies; each recovered Food or Bait instance contributes one unit to its aggregate resource. Compass, Map, Binoculars, Fishing Net, Bucket, Scuba Gear, Anchor, Umbrella, Swim Ring, and Flashlight are durable items used by actions or events. Carlitos changes from a saved Dorothy item to the living companion when survival starts. He then leaves the item inventory. Generic durable loss, breakage, and consumption rules do not apply to living Carlitos. A repairable durable item can become broken, and a durable item can be lost; a one-use supply becomes consumed when spent. Broken props remain aboard, while consumed and lost props no longer offer usable interactions. One recovered Duct Tape can repair a selected broken, repairable item.

The repair toolbox and starboard-mounted Fishing Rod are permanent lifeboat equipment rather than Dorothy collectibles. The rod is never picked up or recovered. It is available for fishing in every survival run, while the toolbox uses recovered repair material for ordinary hull work; Duct Tape can instead make an emergency hull patch. Rest never requires an item: it restores two energy once per day. Bottled Paper costs one energy, adds 15 rescue progress, and is consumed. Energy Bar restores energy to the maximum of three and is consumed.

The event catalog contains 30 live events. The day pool contains Drifting Barrel,
Drifting Chest, and Drifting Bottle. Event selection relies on the scene and response prompts.
It does not show event titles.

An old chest can become a mimic. Fishing Net binds it shut.

Flowers accepts Fishing Net or Bucket. It records the choice without a large reward.

Run pressure rises on days 8, 15, 25, and 40. Successful supernatural
counters can lower pressure. Night energy results apply at the next dawn.
Night damage doubles from day 50.

## Run

```bash
bun install
bun run dev
```

Open the local URL printed by Vite.

## Audio source policy

Source all new music and sound assets only from [Freesound](https://freesound.org/).
Suggest only sounds from Freesound.
Accept only files with a clear license and source history. Verify the source page before each download.
Record the source page, creator, and license in `src/assets/ATTRIBUTION.md`.

The main menu uses a fixed underwater camera. A skull rests in a small sunken boat in the foreground. The title is painted onto a planted wooden sign on the left. Sand ridges, sparse debris, and a large tilted wreck of Dorothy create the distant depth layers. Sharks, fish, kelp, bubbles, suspended matter, and caustics animate while the camera stays fixed.

Select **START** to fade into the existing scavenging intro. The scavenging
phase uses pointer lock; the survival phase releases it for a fixed seated view
and mouse-accessible controls.

## Controls

### Scavenging

| Input | Action |
|---|---|
| `WASD` | Move through the ship |
| Mouse | Look |
| `Shift` | Sprint |
| `Space` | Jump |
| Left mouse click | Pick up another supply, drop the newest carried supply, throw it into the lifeboat, or evacuate |
| `Escape` | Pause or resume, and release the mouse while paused |

Supplies are repeatable physical instances rather than one slot per item type. The HUD reads `CARRY n / 3`: every instance contributes its listed weight, and pickups are refused when their weight would take the total over three. Dropping returns the newest carried instance to the deck, where it can be picked up again. The weathered wooden lifeboat has unlimited storage, so every supply thrown aboard is retained and no full-boat state exists.

### Lifeboat survival

| Input | Action |
|---|---|
| Mouse | Hover physical recovered props for details; click a prop to perform its action. While fishing, click valid water to cast and click the bubbles to reel |
| Down arrow button | Turn the seated camera 180 degrees; use it again to look forward |
| `Tab` / `Shift+Tab` | Move forward or backward through controls |
| `Enter` / `Space` | Activate the focused control; while fishing, cast at the centered water point or reel during a bite |
| `Escape` | Pause or resume, including during fishing; pausing does not cancel the attempt or refund its energy |
| Top-center journal button | Open completed entries; `NEW` marks unread history |
| Boat lantern | End the day and fade into an event or quiet night |
| Closed chest | Spend three energy to open the chest |
| Carlitos | Select **Check Status** to open his scene-linked care card |

### Carlitos

Carlitos is the only crewmate. Save him on Dorothy to bring him into the lifeboat.

Select **Check Status** beside him to see his Hunger, Happiness, and Health. The card offers **Pet**, **Feed**, and **Treat**.

Pet eases loneliness once each day. Feed uses one Food. Treat uses one Medkit when he is sick.

Living Carlitos gives a small passive fishing-luck bonus. He also enables crewmate events that can harm or kill him.

### Fishing

Fishing can reel in Fish Bones as a rare junk catch. It gives no food.

Fishing can also recover utility salvage at the wiki-documented weights: Bait,
Wet Duct Tape, Broken Compass, Torn Fishing Net, and Energy Bar. Bait stacks;
Wet Duct Tape becomes ordinary usable Duct Tape; Energy Bars are usable;
Compass and Fishing Net arrive broken and require Duct Tape. A usable or broken
unique utility is removed from the catch pool until it is consumed or lost.
Utility catches neither consume bait nor receive bait's fish-weight bonus.

### System tuning

Press <code>`</code> (backquote) in either phase to open **System Tuning**.
Use **Master Volume** and **Mute** to control all audio. The setting persists
between sessions.

The menu also offers **Calm**, **Overcast**, **Squall**, **Rain**, **Wind**,
**Thunderstorm**, **Waves**, and **Fog**. A selection overrides event weather,
carries across the phase handoff, and remains active until the page reloads.

Normal gameplay is **Calm** outside events. Night events can use authored presentation weather while staged and resolved. The event weather includes **Overcast**, **Squall**, **Rain**, **Wind**, **Thunderstorm**, **Waves**, and **Fog**. Calm returns after each event ends.

For testing, the same menu includes an **Event Test** picker. Choose an authored
event and select **Enter Event** to start a fresh lifeboat run at that event with
one usable copy of every recoverable item. After the event resolves, survival
continues normally.

Recovered supplies remain as physical props clustered on the survival boat's forward platform; there is no bottom dock or inventory tray. A resource or item type appears in one stable place, with up to three nearby copies representing larger quantities while the label reports the exact total. Hovering or keyboard-focusing a group reveals its label, condition, purpose, cost, effect, risk, and any unavailable reason. Broken durable props stay in place with a damaged treatment; consumed and lost props disappear and stop exposing action anchors. The fixed starboard rod projects the **Fish - 1 Energy** action in every run. **Dive** still requires usable recovered Scuba Gear. Other unavailable actions remain visible and explain what is missing. Event and outcome dialogs keep keyboard focus until they are resolved.

Accepted daytime actions play through the lifeboat scene, update the condition display, and leave a short non-blocking caption. Rejected actions explain the reason without opening a dialog.

## Game loop

The ship sinks in one minute. Search the cabin, wheelhouse, cargo deck, and storage room, carry any combination of supplies up to weight three, throw as many as you can reach into the lifeboat, and evacuate before the timer expires. Duplicate instances remain distinct, and only items physically saved in the boat enter the survival inventory and reappear as survival props.

In the lifeboat, each day gives three energy for daytime actions:

- **Fish** costs one energy and uses the lifeboat's permanent bow rod. Click valid water to cast, or press `Enter`/`Space` for the centered cast; when bubbles appear, click them or press `Enter`/`Space` within the 1.5-second reel window. Available bait improves the catch automatically and is consumed only when a fish lands, never for junk or a miss. Pausing with `Escape` freezes the attempt but does not cancel it, and an accepted attempt's energy remains spent.
- **Dive** requires rescued scuba gear and searches for food, bait, repair material, or rescue progress, with weather-dependent risk.
- **Eat** spends one food to reduce hunger.
- **Repair** uses the lifeboat's fixed repair toolbox and recovered material to restore hull; Duct Tape can make a smaller emergency patch.
- **Treat** consumes the recovered Medkit to restore health.
- **Rest** requires no item, restores two energy, and is available once per day.
- **Repair item** consumes Duct Tape to restore one selected broken, repairable supply.
- **Send message** consumes Bottled Paper and one energy to add 15 rescue progress.
- **Eat Energy Bar** consumes the bar and restores energy to three.
- **Open chest** costs three energy and recovers a missing tool or useful resource.
- **End day** advances into the day and night event sequence.

Health, Food, Energy, and Hull remain visible as condition meters. Food is the inverse of internal hunger, so it drains toward zero as the survivor becomes hungry. Food, bait, repair material, and rescue progress still exist as separate stores used by actions and outcomes, but they are not persistently tallied in the HUD.

Day and night events fade to black before each reveal.

Event tableaus now include drifting flowers and the chest mimic.

Pressure, flags, chest state, day bounds, cooldowns, and inventory can gate events.

Clicking the physical boat lantern ends the day and uses the same slow cover before sleep. Most nights open an event decision; some nights pass quietly under the black cover before dawn fades back in over 2.5 seconds. Resolving a nighttime event or completing a quiet night advances to dawn. Each completed night adds an unread journal entry, and the player can open the journal later without advancing time.

Each journal page retells that day's fishing, daytime event, and nighttime event as a short first-person entry. Fishing records name catches or misses and note bait consumption; event entries mention supplies only when they were attempted during an event.

Rescue is variable rather than tied to a fixed day. Progress and elapsed days increase the natural chance, while signaling the cargo vessel in **Other People** with a Flare Gun secures immediate rescue and holds the rescue tableau through the ending. Death and sinking each have distinct endings. **Start From the Ship** performs a full restart with a fresh scavenging run.

## Asset sources

[Poly Pizza](https://poly.pizza/) is the default site for finding and importing
item models. Prefer **Poly by Google** models when they suit the object, license,
visual direction, and runtime budget; semantic fit and quality still take
precedence over creator priority. All collectible models, the fixed fishing
rod, Kay Lousberg's lantern, and Quaternius's ceiling light are pinned Poly
Pizza assets. Run `bun run models:fetch:items` to download, hash-check, process,
audit, and atomically publish the complete set.

Source pages, licenses, resource IDs, hashes, and processing records are listed
in [the asset ledger](src/assets/ATTRIBUTION.md).

The ship alarm uses [Klaxon by InfamousLazure](https://freesound.org/people/InfamousLazure/sounds/584001/) from Freesound under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Dorothy's main cargo deck uses [Poly Haven — Dark Wooden Planks](https://polyhaven.com/a/dark_wooden_planks). All room floors use [Poly Haven — Blue Painted Planks](https://polyhaven.com/a/blue_painted_planks), interior and exterior room walls use [ambientCG — Painted Wood 006C](https://ambientcg.com/view?id=PaintedWood006C), and the exterior hull sides and waterline use [ambientCG — Painted Metal 006](https://ambientcg.com/view?id=PaintedMetal006). Windows, roofs, machinery, rails, ropes, safety markings, canvas, and small hardware retain distinct authored materials for readability.

## Commands

```bash
bun run dev
bun run test
bun run typecheck
bun run build
bun run preview
bun run models:fetch:menu
bun run models:check:menu
```

`bun run build` type-checks the project and writes the static production site to `dist/`. Deploy that directory to any static host.

For ambient-occlusion inspection, append `?ao=debug` to show the raw item AO
buffer or `?ao=off` for an unoccluded comparison. Reload after changing modes.
While the game is open, press `O` to cycle composite, raw AO, and AO-off modes.

Scavenging physics is controlled in `src/physics/PhysicsOptions.ts`.
`SCAVENGE_PHYSICS_DEBUG_MESHES` renders the moving ship colliders and seven
dynamic object colliders. Debug meshes stay hidden until Start is clicked.
`SCAVENGE_PHYSICS_ENABLED` is the master switch. Disabling it skips Rapier
loading and keeps the seven obstacle visuals static.

## Architecture

`src/world/ShipDangerEffects` owns room alarms and static puddles.

- `src/app` — top-level game director, phase transitions, restart, and renderer ownership.
- `src/menu` — underwater menu models, composition, animation, particles, and UI.
- `src/menu/MenuSigns` — the owned title and interactive guide sign textures, geometry, and hover state.
- `src/menu/SunkenDorothyWreck` — the simplified static Dorothy silhouette.
- `src/menu/DistantSeabed` — the static ridge, rock, plant, and debris depth layers.
- `src/phases/MainMenuPhase` — menu lifecycle, pointer lock, fade, and scavenging handoff.
- `src/phases` — scavenging phase lifecycle and its handoff into survival.
- `src/game` — scavenging timer, item state, score, and sinking progression.
- `src/survival` — deterministic survival rules, inventory, events, orchestration, and lifeboat world.
- `src/world` and `src/ocean` — procedural ship and boat geometry, shared wave field, ocean shader, weather, and buoyancy.
- `src/world/ShipItemPlacement` — physical-fit item profiles, anchor validation, and randomized assignment to authored surfaces.
- `src/world/ShipAssets` and `src/world/ShipMaterials` — locally committed PBR timber maps, procedural secondary surfaces, ship materials, and explicit texture ownership.
- `src/world/ShipGeometry` — freighter hull, rooms, decks, railings, stacks, shell colliders, zone centers, and water-exclusion bounds.
- `src/world/ShipFurniture` — furnished room and working-deck layouts, furniture colliders, item anchors, and route-clearance samples.
- `src/world/ShipSmoke` — fixed-pool twin-stack smoke whose density and drift respond to sinking and reduced-motion preference.
- `src/world/Skybox`, `src/world/SkyAssets`, and `src/world/skyPalette` — shared cloudless atmosphere rendering, app-owned moon art, grounded weather and day/night palettes, celestial bodies, and ocean/fog color synchronization.
- `src/player`, `src/input`, and `src/interaction` — pointer-lock movement, collision, raycast prompts, carrying, drops, and throws.
- `src/ui` — scavenging HUD, pause and result screens, plus the accessible survival overlay.

The scavenging ocean mesh and lifeboat sample the same four-wave field. In survival, the ocean and boat remain synchronized while the camera stays fixed to the boat rig; reduced-motion preference removes parallax, lurch, tooltip movement, and nonessential UI transitions.

Water exclusion is rendered in the ocean shader rather than by layering flat patches over the water. Each frame, the ship and lifeboat contribute inverse world-transform matrices and local hull bounds to two fixed shader regions. Ocean fragments transform their world positions into each vessel's local coordinates and are discarded inside those bounds before ocean color output. Because the mask follows complete world transforms, it stays aligned through vessel translation, rotation, listing, parent rigs, and non-uniform scale while high waves remain visible outside the hulls.

## Milestone boundaries

This milestone targets desktop browsers with keyboard and mouse. Carlitos is its only crewmate.

It does not include saves, touch controls, mobile controls, other crewmates, or persistent progression.
