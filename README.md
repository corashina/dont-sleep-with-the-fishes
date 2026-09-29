# Don't Sleep With The Fishes

You have one minute to escape the sinking Dorothy. Search her rooms, carry supplies to the lifeboat, and reach the evacuation area before time runs out.

At sea, spend your energy on fishing, diving, and repairs. Keep yourself fed, protect your equipment, and face whatever comes alongside after dark.

## About the game

A single-player survival game for desktop browsers, with an illustrated sea world, dark comedy, and strange encounters.

- **Choose your supplies.** Carry up to three weight points per trip. Your lifeboat starts with what you save.
- **Live from the sea.** Catch fish with a rod or net. Dive for supplies, collect drifting loot, and trade.
- **Keep the boat afloat.** Divide your daily energy between food, repairs, and opportunities. Damaged tools need care too.
- **Bring Carlitos.** Save the cat from Dorothy. Feed him, pet him, and ask him to retrieve supplies or keep watch.
- **Face the night.** Storms, sharks, ghosts, and other visitors call for different responses. Use the equipment you kept.
- **Find a way home.** Signal for rescue or uncover the Heart of the Sea. Read your journal as the run unfolds.

## Play requirements

Use a desktop browser with WebGL, a keyboard, and a mouse. Phones and tablets show a desktop-only notice.

Languages: English, Polish, and Argentinian Spanish. Optional auto-save keeps one local survival checkpoint.

## Run locally

Install Bun and Node.js, then run:

```sh
bun install
bun run dev
```

Open the URL printed by Vite. See [Development](docs/DEVELOPMENT.md) for checks and deployment.

## Documentation

| Guide | Contents |
| --- | --- |
| [Gameplay](docs/GAMEPLAY.md) | Controls, supplies, survival rules, Carlitos, saves, and endings. Contains spoilers. |
| [Architecture](docs/ARCHITECTURE.md) | Code map, state flow, phase transitions, and resource ownership. |
| [Events](docs/EVENTS.md) | Selection rules, outcomes, presentation, and event authoring. Contains spoilers. |
| [Development](docs/DEVELOPMENT.md) | Setup, checks, simulations, debugging, deployment, and analytics. |
| [Assets](docs/ASSETS.md) | Sources, licenses, import tools, and asset checks. |
| [Water rendering](docs/WATER_RENDERING.md) | Ocean geometry, shading, captures, and quality settings. |

Built with TypeScript, Three.js, and Rapier. Read [AGENTS.md](AGENTS.md) before making changes.
