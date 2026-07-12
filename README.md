# Last Boat Out

A desktop-browser survival game built with TypeScript and Three.js. Scavenge a sinking ship under a two-minute deadline, launch with only the supplies you saved, and then manage a lifeboat through changing weather, ordinary survival events, and an uncertain wait for rescue.

The 3D world uses original procedural geometry and shaders. No external art assets or game framework are required.

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
| `E` | Pick up another supply, drop the newest carried supply, throw it into the lifeboat, or evacuate |
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

Recovered supplies remain as physical props in the survival boat; there is no bottom dock or inventory tray. Hovering or keyboard-focusing any prop reveals its label, remaining uses, condition, and purpose. Props mapped to daytime actions also show their numeric shortcut, cost, effect, risk, and any unavailable reason. Depleted multi-use props stay in place with subdued markers, while consumed cans disappear as their individual instances are spent. **Fish** exists only when a fishing rod was rescued, and **Dive** only when scuba gear was rescued; without those tools, shortcuts `1` and `2` do nothing. Other unavailable actions remain visible and explain what is missing. Number shortcuts only activate legal actions, and event or outcome dialogs keep keyboard focus until they are resolved.

## Game loop

The ship sinks in two minutes. Search the cabin and upper deck, carry any combination of supplies up to weight three, throw as many as you can reach into the lifeboat, and evacuate before the timer expires. Duplicate instances remain distinct, and only items physically saved in the boat enter the survival inventory and reappear as survival props.

In the lifeboat, each day gives four energy for daytime actions:

- **Fish** requires a rescued fishing rod and attempts to add food. When bait remains, each cast offers baited or unbaited fishing. Bait improves the documented roll but is spent only when the result is a fish or Fishlet; junk, worms, and recovered tools do not consume it.
- **Dive** requires rescued scuba gear and searches for food, bait, repair material, or rescue progress, with weather-dependent risk.
- **Eat** spends one food to reduce hunger.
- **Repair** restores hull with the lifeboat's built-in repair kit or recovered repair material. A recovered duct-tape charge instead repairs one selected broken item instance.
- **Treat** spends a medical-kit charge to restore health.
- **Rest** consumes one water charge, restores two energy, and is available once per day.
- **End day** advances into the day and night event sequence.

Health reaches zero when injury or deprivation becomes fatal. Hunger rises overnight and influences recovery. Energy limits daytime work. Hull at zero sinks the boat. Food, bait, repair material, and rescue progress are separate stores shown beside the condition meters.

Ordinary events present their documented choices and relative outcome weights without converting those weights into percentage claims. Choices may require a usable recovered item or resource; unavailable, broken, consumed, and lost choices explain why they cannot be selected. Consumable charges are finite.

Rescue is variable rather than tied to a fixed day. Progress and elapsed days increase the preserved natural chance. Death and sinking each have distinct endings. **Start From the Ship** performs a full restart with a fresh expanded scavenging catalog and no inventory carried over.

## Canonical gameplay snapshot

The checked-in canonical layer is an audit snapshot of the unofficial wiki reviewed on **2026-07-12**. Gameplay reads only local TypeScript records: it does not request wiki pages at runtime, copy wiki art or audio, or require a network connection after the application files have been served. There is no service worker or offline-install guarantee, and progress is not persisted between runs.

Item and balance fields use `Sourced<T>` records with per-field provenance. Item values marked `wiki` reproduce documented data, values marked `preserved` retain the pre-parity game where the source is silent, incomplete, or contradictory, and new ship items without documented physical data use the approved `default` of weight `1` and one spawn. Fishing and event tables are checked-in source-snapshot records with catalog/source metadata and complete contract tests; their individual catch and outcome fields are not wrapped in per-field provenance. Preserved values are deliberate compatibility decisions, not claims about the wiki.

The runtime includes the practical non-story supplies, condition-aware duplicate instances, the built-in Repair Kit, deterministic fishing catches, ordinary selectable events, exact event-caused danger changes, item gains, consumption, breaking, repair, and loss. A saved instance moves independently through `usable`, `broken`, `consumed`, or `lost`: broken items remain visible but unavailable until repaired, depleted consumables remain represented with zero uses, and lost items no longer act as available props.

The parity boundary excludes crewmates, passengers, character needs, dialogue, journals, lore progression, Heart of the Sea progression, endings, rescue-story chains, and story-related events. Bottled Paper, Heart Pieces 1–3, Heart of the Sea, and Yellow Flower therefore never enter runtime item catalogs. White Flower is also absent because the reviewed source documents acquisition but no gameplay use. The preserved Water Jug remains for the existing hunger/rest loop.

Some reviewed records remain intentionally dormant rather than guessed. Opening a recovered **Chest** is unavailable because its utility pool is undocumented; the separate **Mystery Chest** ordinary event remains selectable. **Seagull** and **Chest Attack** are checked in for audit completeness but cannot be selected because their trigger or outcome data is incomplete. **Broken Boat** is different: it is an active automatic event with its documented hull-threshold roll. Danger does not grow passively at dawn because the source provides no rate; it changes only when an included event outcome explicitly says it does.

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
- `src/player`, `src/input`, and `src/interaction` — pointer-lock movement, collision, raycast prompts, carrying, drops, and throws.
- `src/ui` — scavenging HUD, pause and result screens, plus the accessible survival overlay.

The scavenging ocean mesh and lifeboat sample the same four-wave field. In survival, the ocean and boat remain synchronized while the camera stays fixed to the boat rig; reduced-motion preference removes parallax, lurch, tooltip movement, and nonessential UI transitions.

Water exclusion is rendered in the ocean shader rather than by layering flat patches over the water. Each frame, the ship and lifeboat contribute inverse world-transform matrices and local hull bounds to two fixed shader regions. Ocean fragments transform their world positions into each vessel's local coordinates and are discarded inside those bounds before ocean color output. Because the mask follows complete world transforms, it stays aligned through vessel translation, rotation, listing, parent rigs, and non-uniform scale while high waves remain visible outside the hulls.

## Milestone boundaries

This milestone targets desktop browsers with keyboard and mouse. It does not include saves, touch or mobile controls, crewmate systems, or persistent progression.
