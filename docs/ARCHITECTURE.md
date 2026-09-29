# Architecture

[Game overview](../README.md) · [Gameplay](GAMEPLAY.md) · [Development](DEVELOPMENT.md)

The game runs in the browser. TypeScript supplies game rules, Three.js renders the world, and Rapier handles scavenging physics.
Vite builds a static site. Browser storage holds preferences and the optional survival checkpoint.

## Entry and phase flow

```text
main.ts → startApplication → launchGame → createBrowserGame → Game
                                                           │
                  MainMenuPhase → ScavengePhase → SurvivalPhase
                                                           ↑
                             Continue / Event Test / playtest
```

[main.ts](../src/main.ts) imports styles and initializes language.
[startApplication](../src/app/startApplication.ts) checks device support before loading the game.
[launchGame](../src/app/launchGame.ts) prepares startup dependencies.
[createBrowserGame](../src/app/createBrowserGame.ts) creates the renderer, camera, preferences, and phase factories.

[Game](../src/Game.ts) owns the frame loop, active phase, transitions, restart, and save store.
[GamePhase](../src/app/GamePhase.ts) defines phase contracts and shared context.
The scavenging result carries saved pickup instances into survival.
Continue and inspection entry points can start survival without constructing the ship phase.

## Code map

| Directory | Responsibility |
| --- | --- |
| [`src/app`](../src/app) | Startup, dependency wiring, phase contracts, resource leases, and inspection entry points. |
| [`src/phases`](../src/phases) | Main menu and scavenging lifecycles. |
| [`src/game`](../src/game) | Scavenging rules, item definitions, endings, and run statistics. |
| [`src/survival`](../src/survival) | Survival state, rule helpers, flows, boat scene, and event presentations. |
| [`src/menu`](../src/menu) | Underwater menu scene, guide, and menu controls. |
| [`src/world`](../src/world) | Ship geometry, asset libraries, props, atmosphere, and shared scene components. |
| [`src/ocean`](../src/ocean) | Wave sampling, buoyancy, water geometry, shaders, and captures. |
| [`src/rendering`](../src/rendering) | Renderer pipeline, quality settings, post-processing, outlines, and preparation. |
| [`src/physics`](../src/physics) | Rapier runtime, fixed steps, scavenging bodies, debug view, and preferences. |
| [`src/player`](../src/player), [`src/input`](../src/input), [`src/interaction`](../src/interaction) | Movement, pointer lock, collisions, targeting, carrying, and deposits. |
| [`src/ui`](../src/ui) | DOM views, projected controls, focus, settings, journals, and results. |
| [`src/audio`](../src/audio) | Audio backend, manifest, phase scopes, and gameplay sound coordination. |
| [`src/i18n`](../src/i18n) | Language state and translated messages. |
| [`src/browser`](../src/browser) | Storage, device checks, saves, and analytics. |
| [`scripts`](../scripts), [`tests`](../tests) | Asset tools, simulations, playtest server, and Vitest coverage. |

## Survival state and commands

[SurvivalSession](../src/survival/SurvivalSession.ts) owns mutable run state and applies game rules.
It tracks inventory, resources, event history, seeded randomness, Carlitos, heart pieces, and endings.
Use its snapshots and outcomes to update presentation. Keep rendering details out of rule helpers.

```text
Player input → SurvivalUI → phase flow → SurvivalSession
                                            │
                         snapshot + outcome ─┘
                                ↓
                   UI updates + boat animation + audio
```

[SurvivalPhase](../src/survival/SurvivalPhase.ts) wires the session, scene, UI, and flows.
It owns pause, restart, visibility, rendering, and phase errors.

| Owner | Work |
| --- | --- |
| [SurvivalDayActionFlow](../src/survival/SurvivalDayActionFlow.ts) | Day actions, repairs, chests, dives, sleep, and dawn requests. |
| [SurvivalFishingFlow](../src/survival/SurvivalFishingFlow.ts) | Fishing attempts, timing, presentation, settlement, and return state. |
| [SurvivalEventFlow](../src/survival/SurvivalEventFlow.ts) | Event loading, reveal, responses, outcomes, dawn, and cleanup. |
| [ItemAnimationLabFlow](../src/survival/ItemAnimationLabFlow.ts) | Item inspection and animation previews. |
| [BoatWorld](../src/survival/BoatWorld.ts) | Boat scene, frame updates, atmosphere, buoyancy, and scene cleanup. |
| [BoatCameraController](../src/survival/BoatCameraController.ts) | Rear view, event view, and camera transitions. |
| [BoatInteractionProjector](../src/survival/BoatInteractionProjector.ts) | Projection of scene targets into screen controls. |

Use [dayActionRules](../src/survival/dayActionRules.ts) for action availability and [survivalBalance](../src/survival/survivalBalance.ts) for shared values.
Use [inventory](../src/survival/inventory.ts) for item instances and [fishingSettlementRules](../src/survival/fishingSettlementRules.ts) for catch rewards.
See [Events](EVENTS.md) for the event path.

## Resource ownership

[PhaseResources](../src/app/PhaseResources.ts) shares pending loads and holds assets through reference-counted leases.
The menu loads its models, sand, font, and audio.
The ship acquires gameplay props, furniture, sky, ship textures, physics, lifeboat assets, survival content, and audio.
Survival acquires its shared gameplay resources without ship furniture or ship physics.

Game disposes an outgoing phase before releasing its lease.
Shared assets remain available while another lease holds them.
Failed or stale transitions release their acquired resources instead of replacing the current phase.

[EventBundleManager](../src/survival/EventBundleManager.ts) handles event resources inside survival.
See [Assets](ASSETS.md) for manifests and import tools.
Dispose listeners, scene objects, and owned GPU resources through the component that created them.
Use [SceneResources](../src/world/SceneResources.ts) cleanup helpers where the surrounding component uses them.
Avoid temporary allocations and repeated setup in frame updates.

## World, rendering, and physics

The ship builder separates layout data, navigation, validation, hull geometry, rooms, exterior parts, and furniture.
Start with [ShipGeometry](../src/world/ShipGeometry.ts), [shipLayoutData](../src/world/shipLayoutData.ts), and [ShipItemPlacement](../src/world/ShipItemPlacement.ts).
[ScavengePhysics](../src/physics/ScavengePhysics.ts) coordinates moving ship colliders and dynamic objects through [FixedStepClock](../src/physics/FixedStepClock.ts).

[Skybox](../src/world/Skybox.ts) combines celestial light, clouds, weather colors, and fog.
Ocean rendering and boat buoyancy share [WaveField](../src/ocean/WaveField.ts).
Read [Water rendering](WATER_RENDERING.md) before changing water geometry, capture resources, or shaders.
Read the [visual style guide](../VISUAL_STYLE_GUIDE.md) before player-facing visual changes.

## UI, language, and persistence

[SurvivalUI](../src/ui/SurvivalUI.ts) composes HUD, boat, event, fishing, journal, cover, and modal views.
[BoatAnchorView](../src/ui/BoatAnchorView.ts) places actions beside physical props.
[ModalFocusManager](../src/ui/ModalFocusManager.ts) owns modal priority, focus traps, background inert state, and focus restoration.

Add translated text in [src/i18n](../src/i18n) and use the existing message helpers.
The supported language IDs are `en`, `pl`, and `es-AR`.
Journal records retain structured results so readers can view entries in the selected language.

[SurvivalCheckpoint](../src/survival/SurvivalCheckpoint.ts) defines checkpoint data.
[SurvivalSaveData](../src/survival/SurvivalSaveData.ts) validates versioned saves, including seed and random state.
[SurvivalSaveStore](../src/browser/SurvivalSaveStore.ts) owns browser storage and opt-in state.
The current parser rejects unsupported versions; it does not migrate old saves.

## Find the change point

| Change | Start here | Check alongside it |
| --- | --- | --- |
| Supply weight or spawn count | `src/game/itemCatalog.ts` | Scavenging placement, item tests, Gameplay guide. |
| Action cost or reward | `src/survival/survivalBalance.ts`, `dayActionRules.ts` | Session, tooltips, simulations. |
| Event or response | [Events guide](EVENTS.md) | Catalog, presentation, translations, journal, saves. |
| Phase loading | `src/app/PhaseResources.ts`, `src/Game.ts` | Loading failures, stale transitions, disposal. |
| Save state | Checkpoint and save modules above | Parser validation, restore behavior, save tests. |
| Art or audio | [Assets guide](ASSETS.md) | Runtime manifest, ownership, attribution. |

Keep each rule in its owning module. Update its guide when behavior changes.
