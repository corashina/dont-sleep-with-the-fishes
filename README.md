# Don't Sleep With The Fishes

A desktop-browser survival game built with TypeScript and Three.js. Scavenge a sinking ship under a two-minute deadline, launch with only the supplies you saved, and then manage a lifeboat through changing weather, day and night events, and an uncertain wait for rescue.

The 3D world uses original procedural geometry and shaders. Its shared cloudless atmosphere combines grounded maritime scattering, a locally committed original gibbous-moon texture, weather-aware celestial light, fog, lighting, and synchronized ocean reflections without external sky art.

The scavenging phase takes place on a furnished single-level coastal freighter. A loop connects the crew cabin, wheelhouse, cargo deck, storage/workroom, and lifeboat station, giving each two-minute run two practical search directions.

Collectibles spawn on authored desks, shelves, cabinets, workbenches, racks, and crates. Each item type uses compatible surfaces, so food stays near cabin storage, emergency supplies stay near the wheelhouse, tools stay near work surfaces, and fishing or diving gear stays on large equipment racks. Dorothy contains exactly 19 supply types and 22 physical pickups: Food appears three times, Bait twice, and every other type once.

The ship uses original procedural materials and geometry: varied wooden planks and panels, worn furniture, painted steel, rust details, railings, working-deck fittings, twin smokestacks, and pooled smoke that responds to sinking progress and reduced-motion preference.

## Dorothy supplies

The carry limit is three weight points, not three objects. Weight-one supplies are Food (3), Bait (2), Duct Tape, Compass, Map, Spyglass, Flare Gun, Bottled Paper, Flashlight, and Energy Bar. Weight-two supplies are Medkit, Fishing Net, Bucket, Umbrella, Swim Ring, Harpoon Gun, and Fishing Rod. Scuba Gear and Anchor each weigh three points.

Food, Bait, Duct Tape, Medkit, Flare Gun, Bottled Paper, Harpoon Gun, and Energy Bar are one-use supplies; each recovered Food or Bait instance contributes one unit to its aggregate resource. Compass, Map, Spyglass, Fishing Net, Bucket, Scuba Gear, Anchor, Umbrella, Swim Ring, Flashlight, and Fishing Rod are durable tools used by actions or adapted events. A repairable durable tool can become broken, and a durable tool can be lost; a one-use supply becomes consumed when spent. Broken props remain aboard, while consumed and lost props no longer offer usable interactions. One recovered Duct Tape can repair a selected broken, repairable item.

The Repair Kit is fixed to the lifeboat rather than collected on Dorothy. It uses recovered repair material for ordinary hull work; Duct Tape can instead make an emergency hull patch. Rest never requires an item: it restores two energy once per day. Bottled Paper costs one energy, adds 15 rescue progress, and is consumed. Energy Bar restores energy to the maximum of three and is consumed.

The event catalog adapts the original game's ordinary item responses to this single-survivor rescue loop. Recovered usable items can unlock suitable responses; unavailable, broken, consumed, and lost supplies cannot. Unsupported companion, trade, later-loot, story-branch, and alternate-ending outcomes remain outside this milestone. The wiki informed the committed event data but is not a runtime dependency.

## Run

```bash
bun install
bun run dev
```

Open the local URL printed by Vite and select **Begin Evacuation**. The scavenging phase uses pointer lock; the survival phase releases it for a fixed seated view and mouse-accessible controls.

## Controls

### Scavenging

| Input | Action |
|---|---|
| `WASD` | Move through the ship |
| Mouse | Look |
| `Shift` | Sprint |
| `Space` | Jump |
| Left mouse click | Pick up another supply, drop the newest carried supply, throw it into the lifeboat, or evacuate |
| `Escape` | Pause and release the mouse |

Supplies are repeatable physical instances rather than one slot per item type. The HUD reads `CARRY n / 3`: every instance contributes its listed weight, and pickups are refused when their weight would take the total over three. Dropping returns the newest carried instance to the deck, where it can be picked up again. The rescue-orange lifeboat has unlimited storage, so every supply thrown aboard remains visible and no full-boat state exists.

### Lifeboat survival

| Input | Action |
|---|---|
| Mouse | Hover physical recovered props for details; click a prop to perform its action |
| `Tab` / `Shift+Tab` | Move forward or backward through controls |
| `Enter` | Activate the focused control |
| `Escape` | Close the fishing-choice dialog first; otherwise pause or resume |
| `1`–`7` | Fish, dive, eat, repair, treat, rest, or end the day |
| Top-center journal button | Open completed entries; `NEW` marks unread history |
| Top-center End Day button / `7` | Fade into sleep and advance to an event or quiet night |

Recovered supplies remain as physical props in the survival boat; there is no bottom dock or inventory tray. Hovering or keyboard-focusing any prop reveals its label, condition, and purpose. Props mapped to daytime actions also show their numeric shortcut, cost, effect, risk, and any unavailable reason. Broken durable props stay in place with a damaged treatment; consumed and lost props disappear and stop exposing action anchors. **Fish** exists only when a usable fishing rod was rescued, and **Dive** only when usable Scuba Gear was rescued; without those tools, shortcuts `1` and `2` do nothing. Other unavailable actions remain visible and explain what is missing. Number shortcuts only activate legal actions, and event or outcome dialogs keep keyboard focus until they are resolved.

Accepted daytime actions play through the lifeboat scene, update the condition display, and leave a short non-blocking caption. Rejected actions explain the reason without opening a dialog.

## Game loop

The ship sinks in two minutes. Search the cabin, wheelhouse, cargo deck, and storage room, carry any combination of supplies up to weight three, throw as many as you can reach into the lifeboat, and evacuate before the timer expires. Duplicate instances remain distinct, and only items physically saved in the boat enter the survival inventory and reappear as survival props.

In the lifeboat, each day gives three energy for daytime actions:

- **Fish** requires a rescued fishing rod and attempts to add food. When bait remains, each cast offers a choice to spend one bait for better odds or fish without it.
- **Dive** requires rescued scuba gear and searches for food, bait, repair material, or rescue progress, with weather-dependent risk.
- **Eat** spends one food to reduce hunger.
- **Repair** uses the lifeboat's fixed Repair Kit and recovered material to restore hull; Duct Tape can make a smaller emergency patch.
- **Treat** consumes the recovered Medkit to restore health.
- **Rest** requires no item, restores two energy, and is available once per day.
- **Repair item** consumes Duct Tape to restore one selected broken, repairable supply.
- **Send message** consumes Bottled Paper and one energy to add 15 rescue progress.
- **Eat Energy Bar** consumes the bar and restores energy to three.
- **End day** advances into the day and night event sequence.

Health, Food, Energy, and Hull remain visible as condition meters. Food is the inverse of internal hunger, so it drains toward zero as the survivor becomes hungry. Food, bait, repair material, and rescue progress still exist as separate stores used by actions and outcomes, but they are not persistently tallied in the HUD.

Day and night events present a danger label, narrative prompt, and the recovered items that can be attempted. A suitable item can reduce harm or create an opportunity; an unsuitable recovered item resolves to the event's fallback result without corrupting it, and **Endure** uses no item. A one-use event supply is consumed only when its authored outcome spends it.

End Day fades the survivor to sleep. Most nights open an event decision; some nights pass quietly. Resolving a nighttime event or completing a quiet night advances to dawn. Each completed night adds an unread journal entry, and the player can open the journal later without advancing time.

Each journal page retells that day's daytime and nighttime events as a short first-person entry. The entry mentions supplies only when they were attempted during an event.

Rescue is variable rather than tied to a fixed day. Progress and elapsed days increase the natural chance, while a flare used during the right sighting can secure immediate rescue. Death and sinking each have distinct endings. **Start From the Ship** performs a full restart with a fresh scavenging run.

## Asset policy

Kenney remains the project's default: use Kenney as the default third-party asset store. The Quaternius exception is approved only for the committed `compass`, `flareGun`, and `anchor` runtime models. Downloaded assets must come from an individual free CC0 pack, run through the local reproducible asset pipeline, and ship from the repository rather than a remote URL. All runtime item models are committed locally with recorded provenance. Production never fetches models, textures, artwork, event data, or wiki content. [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) records pack versions, hashes, source entries, modifications, and license details.

## Commands

```bash
bun run dev
bun run test
bun run typecheck
bun run build
bun run preview
```

`bun run build` type-checks the project and writes the static production site to `dist/`. Deploy that directory to any static host.

## Architecture

- `src/app` — top-level game director, phase transitions, restart, and renderer ownership.
- `src/phases` — scavenging phase lifecycle and its handoff into survival.
- `src/game` — scavenging timer, item state, score, and sinking progression.
- `src/survival` — deterministic survival rules, inventory, events, orchestration, and lifeboat world.
- `src/world` and `src/ocean` — procedural ship and boat geometry, shared wave field, ocean shader, weather, and buoyancy.
- `src/world/ShipItemPlacement` — category-compatible item profiles, anchor validation, and randomized assignment to authored surfaces.
- `src/world/ShipMaterials` — deterministic procedural wood families, ship-surface materials, and owned-material disposal.
- `src/world/ShipGeometry` — freighter hull, rooms, decks, railings, stacks, shell colliders, zone centers, and water-exclusion bounds.
- `src/world/ShipFurniture` — furnished room and working-deck layouts, furniture colliders, item anchors, and route-clearance samples.
- `src/world/ShipSmoke` — fixed-pool twin-stack smoke whose density and drift respond to sinking and reduced-motion preference.
- `src/world/Skybox`, `src/world/SkyAssets`, and `src/world/skyPalette` — shared cloudless atmosphere rendering, app-owned moon art, grounded weather and day/night palettes, celestial bodies, and ocean/fog color synchronization.
- `src/player`, `src/input`, and `src/interaction` — pointer-lock movement, collision, raycast prompts, carrying, drops, and throws.
- `src/ui` — scavenging HUD, pause and result screens, plus the accessible survival overlay.

The scavenging ocean mesh and lifeboat sample the same four-wave field. In survival, the ocean and boat remain synchronized while the camera stays fixed to the boat rig; reduced-motion preference removes parallax, lurch, tooltip movement, and nonessential UI transitions.

Water exclusion is rendered in the ocean shader rather than by layering flat patches over the water. Each frame, the ship and lifeboat contribute inverse world-transform matrices and local hull bounds to two fixed shader regions. Ocean fragments transform their world positions into each vessel's local coordinates and are discarded inside those bounds before ocean color output. Because the mask follows complete world transforms, it stays aligned through vessel translation, rotation, listing, parent rigs, and non-uniform scale while high waves remain visible outside the hulls.

## Milestone boundaries

This milestone targets desktop browsers with keyboard and mouse. It does not include saves, touch or mobile controls, crewmate systems, or persistent progression.
