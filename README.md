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
