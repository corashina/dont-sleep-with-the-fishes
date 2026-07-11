# Last Boat Out

A desktop-browser survival game built with TypeScript and Three.js. Scavenge a sinking ship under a two-minute deadline, launch with only the supplies you saved, and then manage a lifeboat through changing weather, day and night events, and an uncertain wait for rescue.

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
| `E` | Pick up, drop, throw, or evacuate |
| `Escape` | Pause and release the mouse |

### Lifeboat survival

| Input | Action |
|---|---|
| Mouse | Select actions, hotspots, supplies, and event responses |
| `Tab` / `Shift+Tab` | Move forward or backward through controls |
| `Enter` | Activate the focused control |
| `Escape` | Close the supply tray first; otherwise pause or resume |
| `1`–`7` | Fish, dive, eat, repair, treat, rest, or end the day |

Unavailable actions remain visible and explain what is missing. Number shortcuts only activate legal actions, and event or outcome dialogs keep keyboard focus until they are resolved.

## Game loop

The ship sinks in two minutes. Search the cabin and upper deck, carry supplies one at a time, throw up to five into the lifeboat, and evacuate before the timer expires. Only items physically saved in the boat enter the survival inventory.

In the lifeboat, each day gives four energy for daytime actions:

- **Fish** attempts to add food. A fishing rod is required; bait improves the odds.
- **Dive** searches for food, bait, or repair material, with weather-dependent risk.
- **Eat** spends one food to reduce hunger.
- **Repair** restores hull using recovered material or a duct-tape charge.
- **Treat** spends a medical-kit charge to restore health.
- **Rest** trades time for energy.
- **End day** advances into the day and night event sequence.

Health reaches zero when injury or deprivation becomes fatal. Hunger rises overnight and influences recovery. Energy limits daytime work. Hull at zero sinks the boat. Food, bait, repair material, and rescue progress are separate stores shown beside the condition meters.

Day and night events present a danger label, narrative prompt, and the recovered items that can be attempted. A suitable item can reduce harm or create an opportunity; an unsuitable item resolves to the event's fallback result, and **Endure** uses no item. Consumable charges are finite and exhausted supplies remain visible.

Rescue is variable rather than tied to a fixed day. Progress and elapsed days increase the natural chance, while a flare used during the right sighting can secure immediate rescue. Death and sinking each have distinct endings. **Start From the Ship** performs a full restart with a fresh scavenging run.

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

The scavenging ocean mesh and lifeboat sample the same four-wave field. In survival, the ocean and boat remain synchronized while the camera stays fixed to the boat rig; reduced-motion preference removes parallax, lurch, and nonessential UI motion.

## Milestone boundaries

This milestone targets desktop browsers with keyboard and mouse. It does not include saves, touch or mobile controls, crewmate systems, or persistent progression.
