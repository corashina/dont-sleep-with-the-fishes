# Last Boat Out — First-Person Scavenging Demo Design

- **Status:** Approved design; awaiting written-spec review
- **Date:** 2026-07-10
- **Inspiration:** *Don't Sleep With The Fishes* by DopplerGhost
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest

## 1. Objective

Build a polished, replayable first-person web demo inspired by the opening scavenging sequence of *Don't Sleep With The Fishes*. The player has 120 seconds to search a sinking ship, carry supplies to a nearby lifeboat, and reach the evacuation point before the vessel submerges.

This is a clean implementation from scratch. All geometry, writing, interface design, effects, and branding are original. The working title is **Last Boat Out**.

The demo must prove four things:

1. First-person exploration and object interaction feel responsive in a browser.
2. A short scavenging timer creates understandable pressure and replayable choices.
3. The procedural ocean is visually convincing.
4. The lifeboat responds to the same wave simulation that deforms the ocean.

## 2. Scope

### Implemented in the playable demo

- Desktop first-person controls using keyboard and mouse.
- Pointer-lock mouse look.
- A compact two-zone ship: an enclosed cabin/bridge and an exposed upper deck.
- A scripted ship-sinking progression over a 120-second run.
- Eight distinct collectible supplies.
- One carried item at a time.
- A five-slot lifeboat that visibly receives saved supplies.
- Throwing carried items into the lifeboat.
- A procedural animated ocean.
- Lifeboat heave, pitch, and roll derived from the ocean wave field.
- Sparse HUD, contextual prompts, pause handling, and results screens.
- Success, failure, scoring summary, and immediate replay.
- Automated logic tests and a production web build.

### Explicitly not implemented

- Crewmate selection.
- Daytime lifeboat survival actions.
- Hunger, health, morale, energy, or hull resource management.
- Fishing, eating, repairs, or dialogue systems.
- Night interruptions or item-counter events.
- Multiple narrative endings.
- Save data, difficulty selection, settings, or mobile controls.

These omitted systems appear only in the roadmap in section 12. No placeholder interfaces or partial runtime systems for them will be added to this demo.

## 3. Player Experience

The start screen states the premise, objective, and controls. Starting the game requests pointer lock and begins the run only after pointer lock succeeds.

The player wakes inside a visibly listing cabin while an emergency alarm signals the evacuation. They must move through the bridge, emerge onto the upper deck, locate supplies, and repeatedly carry individual items to the lifeboat. The environment becomes more unstable as the timer decreases: the ship lists further, the deck approaches the sea, rain and spray intensify, and camera vibration increases slightly.

The run succeeds when the player enters the marked evacuation zone beside the lifeboat before the countdown reaches zero. The player may evacuate early through an explicit interaction prompt or remain until the timer is nearly exhausted to save more items.

If the timer expires while the player is outside the evacuation zone, a short sinking sequence plays and the run fails. Both results display the saved supplies, the number of filled lifeboat slots, elapsed time, and a replay action.

### Controls

| Input | Action |
|---|---|
| `W`, `A`, `S`, `D` | Move |
| Mouse | Look |
| `Shift` | Sprint while held |
| `E` | Pick up the targeted item; drop or throw the carried item; evacuate at the lifeboat |
| `Escape` | Release pointer lock and pause |

The meaning of `E` is determined by context and is always stated in the on-screen prompt. When carrying an item and targeting the lifeboat, `E` throws the item toward it. Elsewhere, `E` drops the carried item a short distance in front of the player.

## 4. Collectible Supplies and Scoring

The demo contains exactly eight supply types:

1. Flare gun.
2. Duct tape.
3. Fishing rod.
4. Bait tin.
5. Medical kit.
6. Water jug.
7. Canned food.
8. Flashlight.

Each item is represented by an original low-poly procedural model with a distinct silhouette and restrained color cue. An item name is shown only while it is targeted or carried.

The lifeboat accepts no more than five items. A successful throw changes the item state to `saved`, snaps it into an available boat slot after a short settle animation, updates the HUD, and prevents further interaction with it. A throw that misses remains physically visible until it contacts the ocean, after which the item changes to `lost` and cannot be recovered.

The results screen grades the run by filled slots rather than hidden future utility:

- 0–1 items: **Barely Afloat**
- 2–3 items: **Hard Choices**
- 4 items: **Well Provisioned**
- 5 items: **Every Slot Counted**

The grade is descriptive only. No later survival calculation is implemented.

## 5. World and Visual Direction

The visual style is storm-worn low poly: angular silhouettes, flat-shaded geometry, restrained steel and ocean colors, dithered fog, warm emergency lamps, and a single rust-red alarm accent. The palette avoids pure black, neon glows, and oversaturated colors.

The two-zone layout is compact enough to learn in one run but requires meaningful travel:

- **Cabin/bridge:** starting point, narrow passage, navigation equipment, lockers, and four supply placements.
- **Upper deck:** mast, cargo, damaged railing, the remaining four supply placements, and the lifeboat evacuation area.

Supply positions are selected from authored spawn points at the start of each run so repeated runs preserve navigation clarity while changing the optimal route.

Environmental feedback escalates with the sinking progress:

- Ship list and vertical sink offset increase along a scripted curve.
- Emergency lights pulse faster during the final 30 seconds.
- Fog density, rain, spray, and wave amplitude increase modestly.
- Camera vibration rises but stays below a comfort limit and is disabled when reduced motion is requested.

The environment uses procedural geometry and shaders. No external game art, models, textures, or copied interface assets are required.

## 6. Ocean and Lifeboat Simulation

`WaveField` is the authoritative definition of the water surface. It combines four directional Gerstner-style wave components, each defined by direction, amplitude, wavelength, speed, and steepness.

The wave parameters remain identical for the duration of a run. Time and sinking progress may scale their total amplitude within fixed bounds, but the wave phases and directions remain deterministic.

### Ocean rendering

`OceanRenderer` creates a subdivided plane centered around the play area. A vertex shader evaluates the shared wave parameters to displace vertices. The fragment shader combines depth-independent ocean color, directional highlights, foam bands near wave crests, distance fog, and subtle ordered dithering.

The ocean follows the camera horizontally to hide finite plane edges while preserving world-space wave evaluation. Rendering movement never changes the underlying wave coordinates.

### Lifeboat response

`BoatBuoyancy` evaluates the CPU implementation of the same wave function at four world-space sample points: bow, stern, port, and starboard.

- Average sample height determines the lifeboat's vertical position.
- Bow-to-stern height difference determines pitch.
- Port-to-starboard height difference determines roll.
- A small critically damped smoothing step prevents high-frequency jitter without desynchronizing the visible boat from the water.

The lifeboat is not controlled by a general-purpose rigid-body engine. Its horizontal anchor remains fixed beside the ship, with a small constrained lateral drift derived from the wave tangent. This keeps item throws predictable and prevents simulation instability.

The large ship does not use wave buoyancy. It follows the authored sinking transform so the player route and collision geometry remain reliable.

## 7. Architecture

The project separates rules, simulation, rendering, and interface concerns.

```text
src/
├── main.ts
├── Game.ts
├── game/
│   ├── ScavengeSession.ts
│   ├── ItemState.ts
│   ├── scoring.ts
│   └── sinking.ts
├── input/
│   └── InputController.ts
├── player/
│   ├── PlayerController.ts
│   └── collisions.ts
├── interaction/
│   ├── InteractionSystem.ts
│   └── CarryController.ts
├── ocean/
│   ├── WaveField.ts
│   ├── OceanRenderer.ts
│   └── BoatBuoyancy.ts
├── world/
│   ├── World.ts
│   ├── Ship.ts
│   ├── Lifeboat.ts
│   ├── PropFactory.ts
│   └── Environment.ts
├── ui/
│   └── GameUI.ts
└── styles/
    └── main.css
```

### Responsibilities

- `Game` owns the renderer, camera, clock, animation loop, resize handling, and high-level phase transitions.
- `ScavengeSession` owns countdown time, pause state, item-state transitions, lifeboat capacity, and the final result.
- `InputController` records normalized input state and pointer-lock changes.
- `PlayerController` handles mouse look, movement, sprinting, deck-relative gravity, and collision resolution.
- `InteractionSystem` raycasts from the crosshair and resolves the single highest-priority contextual action.
- `CarryController` positions the carried object, performs drops and throws, and reports boat or water contact.
- `WaveField` provides deterministic wave samples to both CPU and GPU consumers.
- `OceanRenderer` renders the simulated surface but owns no gameplay rules.
- `BoatBuoyancy` converts wave samples into the lifeboat transform.
- `World` assembles and updates the procedural scene.
- `GameUI` renders DOM state and sends explicit start, resume, evacuate, and replay intentions back to `Game`.

## 8. Data Flow and Update Order

The single animation loop clamps frame delta to a maximum of 50 milliseconds and updates in this order:

1. Read normalized input and pointer-lock state.
2. Update pause state and countdown.
3. Update scripted sinking transform.
4. Update player movement and collision relative to the ship.
5. Raycast and resolve interaction state.
6. Update carried or thrown items.
7. Evaluate `WaveField` and update lifeboat buoyancy.
8. Update ocean shader time and environment effects.
9. Render the DOM interface if its observable state changed.
10. Render the Three.js scene.

`ScavengeSession` is the only unit allowed to transition an item between `available`, `carried`, `saved`, and `lost`. Rendering objects mirror those states but do not mutate them directly.

## 9. Movement, Collision, and Interaction

The player uses a vertical capsule represented by a radius and standing height. Movement resolves against a small authored set of axis-aligned or oriented collision boxes attached to the ship root. The collision system transforms movement into ship-local space, resolves penetration, and converts the result back to world space.

This approach supports the scripted ship list without a full rigid-body dependency. The cabin floor, deck, stairs/ramp, walls, furniture, railings, and blocked geometry each have explicit collision volumes.

Interaction uses a center-screen ray with a fixed short range. Eligible objects receive a subtle emissive or outline highlight. Exactly one action prompt is visible at a time. Carried objects are rendered near the lower-right view, use a damped follow transform, and do not collide with the player.

Thrown items use a simple ballistic velocity with gravity. Only collision with the lifeboat acceptance volume, ocean loss plane, and ship deck is required. Item-to-item collision is out of scope.

## 10. Interface and Accessibility

The interface is a DOM overlay above the Three.js canvas.

- Top center: countdown and sinking status.
- Upper left: current objective.
- Upper right: lifeboat slots filled out of five.
- Center: crosshair and contextual action prompt.
- Bottom: carried-item name.
- Full-screen layers: start, pointer-lock pause, result, and WebGL compatibility error.

The interface uses a high-contrast sans-serif and monospaced numerals. It remains readable from 1280×720 upward and reflows for narrower desktop windows without adding mobile controls.

Reduced-motion preference disables camera vibration and reduces rain/spray motion intensity. The game can be started, resumed, and replayed with the keyboard. Pointer lock is never requested before an explicit user action.

## 11. Edge Cases and Error Handling

- Losing pointer lock or hiding the tab pauses the countdown immediately.
- Resuming requires an explicit click or keyboard action before pointer lock is requested again.
- Large frame deltas are clamped to avoid movement, timer, and wave jumps.
- Falling outside the playable ship bounds returns the player to the most recent safe position and deducts five seconds.
- Items that enter the ocean become `lost` and cannot respawn during the run.
- The lifeboat rejects additional items after five slots are filled; the prompt changes to explain that it is full.
- An item-state transition is idempotent, preventing duplicate scoring from repeated collision callbacks.
- Success or failure can be committed only once per run.
- Window resize updates renderer resolution and camera projection while capping device pixel ratio for performance.
- WebGL creation failure produces a compatibility message instead of a blank screen.

## 12. Future Roadmap — Not Implemented

1. **Crewmate selection**
   - Add crew data definitions and a selection scene after scavenging.
   - Give each crewmate explicit survival modifiers and dialogue traits.

2. **Daytime lifeboat loop**
   - Add fishing, eating, repairs, conversation, and limited daily energy.
   - Convert saved demo supplies into meaningful action requirements and bonuses.

3. **Night interruptions**
   - Add data-driven threat definitions, item counters, failure costs, and randomized selection.
   - Preserve rule logic independently of Three.js presentation.

4. **Survival state and endings**
   - Add hunger, health, morale, energy, and hull condition.
   - Add branching rescue, starvation, injury, sinking, and special narrative endings.

5. **Content and persistence**
   - Add randomized item pools, additional crew, events, difficulty settings, audio, accessibility settings, and save support.

Each roadmap milestone requires its own design and implementation plan before work begins.

## 13. Testing and Verification

### Automated tests

Vitest covers pure logic and deterministic simulation:

- Wave height and surface-normal sampling for fixed inputs.
- Matching wave parameters between CPU samples and shader-uniform serialization.
- Lifeboat height, pitch, and roll derived from known samples.
- Countdown start, pause, resume, and expiry.
- Five-slot capacity enforcement.
- Legal and idempotent item-state transitions.
- Saved and lost item behavior.
- Sinking progression bounds and monotonicity.
- Success and failure committing only once.
- Score-grade boundaries.

### Manual browser QA

- Start and resume pointer lock using mouse and keyboard.
- Walk and sprint through the complete route without penetrating geometry.
- Pick up, drop, throw, save, and lose every item type.
- Confirm a sixth item cannot enter a full lifeboat.
- Confirm tab switching pauses the run.
- Confirm falling resets the player and deducts five seconds.
- Complete early evacuation, last-second evacuation, and timeout failure.
- Confirm the lifeboat remains aligned to visible ocean waves throughout the run.
- Resize the browser and test at 1280×720, 1440×900, and 1920×1080.
- Check current Chrome and Firefox.

### Definition of done

- All automated tests pass.
- TypeScript type checking passes without errors.
- The production Vite build succeeds.
- A complete success and failure run pass manual QA.
- The ocean and lifeboat remain visually synchronized.
- The demo maintains smooth interaction on a mid-range desktop at 1280×720.
- README documents setup, controls, objective, architecture, testing, build, and deployment.
