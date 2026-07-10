# Last Boat Out

A desktop-browser first-person scavenging demo inspired by the opening pressure of *Don't Sleep With The Fishes*. Built from scratch with TypeScript and Three.js using original procedural geometry and shaders.

## Run

```bash
bun install
bun run dev
```

Open the local URL printed by Vite, click **Begin Evacuation**, and allow pointer lock.

## Controls

| Input | Action |
|---|---|
| `WASD` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `E` | Pick up, drop, throw, or evacuate |
| `Escape` | Pause and release the mouse |

## Objective

The ship sinks in two minutes. Search the cabin and upper deck, carry supplies one at a time, throw up to five into the lifeboat, and reach the evacuation marker before time expires.

## Commands

```bash
bun run dev
bun run test
bun run typecheck
bun run build
bun run preview
```

## Architecture

- `src/game` — timer, legal item states, scoring, and sinking progression.
- `src/ocean` — shared four-wave CPU field, ocean shader, and lifeboat buoyancy.
- `src/world` — procedural ship, props, boat, weather, and scene assembly.
- `src/player` and `src/input` — pointer-lock controls and ship-local collision.
- `src/interaction` — raycast prompts, carrying, drops, and throws.
- `src/ui` — DOM HUD, pause, compatibility, and result layers.

The ocean mesh and lifeboat use the same wave parameters. The shader renders the surface while CPU samples at bow, stern, port, and starboard produce lifeboat heave, pitch, and roll.

## Delivery

`bun run build` creates the static `dist/` directory. Deploy that directory to any static host.

## Roadmap

- Crewmate selection and individual modifiers.
- Daytime lifeboat actions and resources.
- Data-driven night interruptions and item counters.
- Branching survival endings.
- Additional content, audio, accessibility settings, and saves.

Those systems are documented as future milestones and are not present in this demo.
