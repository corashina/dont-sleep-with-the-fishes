# Physical Inventory and Boat Interaction Design

**Date:** 2026-07-11  
**Status:** Approved design, awaiting written-spec review

## Objective

Improve the scavenging and survival prototype so recovered supplies behave like physical objects throughout the run. The player can carry multiple repeatable item instances up to a weight capacity of three, the lifeboat accepts every item saved before time expires, the same saved items remain visible during survival, and actions move from the bottom menu to tooltips attached to the relevant boat objects. Waves must no longer render through either vessel interior.

## Scope

This milestone includes:

- repeatable scavenging item instances;
- item weights from one to three and a player capacity of three;
- a new weight-three scuba set;
- visible multi-item carrying, dropping, throwing, and saving;
- unlimited lifeboat storage constrained only by time and player capacity;
- persistent physical supplies in the survival lifeboat;
- hover/focus tooltips and object-linked day actions;
- item-gated fishing and diving;
- removal of the bottom action dock and bottom-right inventory tray;
- water exclusion inside the sinking ship and lifeboat;
- unit, integration, accessibility, and browser visual verification.

This milestone does not add rigid-body physics, free-form item stacking, mobile controls, save files, crewmates, or a general-purpose inventory screen.

## Item Definitions and Spawn Distribution

An item definition supplies the shared type, label, weight, spawn count, survival contribution, prop factory key, and optional day action. Each spawned object also receives a stable instance ID so duplicates can be tracked independently.

| Item type | Weight | Spawn count | Survival role |
|---|---:|---:|---|
| Canned food | 1 | 3 | Each instance adds one food and exposes Eat |
| Bait tin | 1 | 2 | Each instance adds bait charges and improves fishing |
| Duct tape | 1 | 2 | Each instance adds repair charges and exposes Repair |
| Flare gun | 1 | 1 | Adds a flare charge for contextual events |
| Flashlight | 1 | 1 | Durable contextual event tool |
| Fishing rod | 2 | 1 | Durable item that unlocks Fish |
| Medical kit | 2 | 1 | Adds treatment charges and exposes Treat |
| Water jug | 2 | 2 | Each instance adds water charges and exposes Rest |
| Scuba set | 3 | 1 | Durable item that unlocks Dive |

Each bait tin contributes three bait charges, each duct-tape roll contributes two repair charges, the flare gun contributes one flare charge, each medical kit contributes two treatment charges, and each water jug contributes three water charges. Fishing rods, flashlights, and scuba sets are durable. A canned-food instance contributes exactly one food so the physical count and survival store remain legible.

## Scavenging State Model

`ItemState` will distinguish `ItemType` from `ItemInstance`. An instance contains a stable ID, type, weight, and status. Status remains one of available, carried, saved, or lost.

`ScavengeSession` will replace its single carried item with an ordered list of carried instance IDs. It will expose derived carried weight and remaining capacity. A pickup succeeds only when the instance is available and its weight fits within the remaining capacity. Rejected pickups leave state unchanged and provide a capacity-specific prompt.

The most recently picked up instance is the active item for dropping or throwing. This preserves the single `E` interaction model without introducing an inventory-selection overlay. At most one active item may be in flight. Other carried instances stay attached to the camera while that flight resolves.

The scavenging result passes the saved item instances, including their stable IDs and types, into survival. It does not collapse duplicates into a unique list.

## Carry Presentation and Feedback

All carried props remain visible near the camera in a compact, staggered bundle. Their transforms are deterministic by carried-list position so the bundle is stable and does not obscure the crosshair.

The scavenging HUD replaces the five lifeboat slots with:

- `CARRY n / 3` weight usage;
- the names and individual weights of carried instances;
- a short confirmation when an item is saved, dropped, lost, or rejected for capacity.

Dropped items land clearly in front of the player on the ship deck, retain their real prop geometry, remain highlightable, and can be picked up again. Thrown items follow the existing deterministic arc. A successful boat hit settles the real prop into the next storage position and triggers `SAVED — <ITEM>` feedback.

## Scavenging Lifeboat

The scavenging lifeboat root will be scaled to 1.15 times its current size, its anchor will move 0.7 world units toward the evacuation rail, and its hull material will change from muted brown-orange `0x9b6848` to rescue orange `0xb8693f`. Targeting it adds a subtle emissive highlight that makes the throw destination unmistakable.

Anonymous slot markers and placeholder silhouettes will be removed. Fourteen base storage transforms accommodate every instance in the approved spawn distribution across the floor and inner sides. Additional instances reuse those transforms in successive vertical layers with a fixed height offset. The boat therefore has no logical item limit and placement never depends on runtime physics.

The acceptance volume will be updated with the visual hull. Throw prompts no longer reference a full boat, and every saved item remains visible until the phase ends.

## Survival Inventory Aggregation

`SurvivalSession` receives saved item instances and aggregates their contributions by type:

- durable types become owned when at least one instance exists;
- consumable charges are multiplied or summed per saved instance;
- canned food contributes one food per saved can;
- fishing requires a saved fishing rod;
- diving requires a saved scuba set.

Missing required items make the associated action unavailable. There is no hand-line fishing or equipment-free diving. Keyboard shortcuts remain registered, but an unavailable shortcut does not execute the action and announces the missing-item reason.

## Survival Boat Presentation

`BoatWorld` rebuilds every saved item instance with `createProp` and arranges it in deterministic supply positions. The new scuba prop is a compact tank, harness, and mask silhouette that remains readable at the seated camera distance.

The boat world synchronizes prop presentation with the survival snapshot:

- one-use items disappear when consumed;
- multi-use supplies remain visible while charges remain;
- depleted multi-use supplies stay in place with a subdued empty/depleted treatment;
- durable tools remain visible;
- duplicate props remain distinct.

The bottom-right inventory tray is removed. The physical boat is the primary inventory presentation. Status meters and loose numeric stores remain at the top because they communicate condition and aggregate resources rather than item selection.

## Object-Linked Actions and Tooltips

`BoatWorld` exposes a projected screen anchor for each interactive prop or thematic hotspot. `SurvivalUI` creates transparent accessible buttons that follow those anchors. An anchor outside the viewport or behind the camera is hidden and noninteractive.

Hovering or focusing an anchor displays a tooltip attached to the matching 3D object. Tooltips contain the item name, action label, shortcut, current cost, expected effect, risk, remaining uses, and an unavailable reason when applicable. Clicking the anchor activates the action.

Day-action mapping:

| Anchor | Action |
|---|---|
| Fishing rod | Fish |
| Scuba set | Dive |
| Canned food | Eat |
| Duct tape or hull patch | Repair |
| Medical kit | Treat |
| Water jug | Rest |
| Horizon hotspot | End day |

When bait is available, activating the fishing rod retains the existing bait-choice dialog. Flare guns, flashlights, and bait tins receive descriptive tooltips and charge information but do not become general day actions. Event dialogs continue to list valid recovered item responses.

The existing number shortcuts, modal focus trap, focus restoration, pause handling, and screen-reader announcements remain supported. Focus reveals the same information as hover.

## Water Exclusion

`OceanRenderer` will support vessel-local interior exclusion regions. Each region provides a world-to-local transform and interior bounds. The vertex shader passes displaced world position to the fragment shader; the fragment shader transforms that position into vessel-local coordinates and discards water fragments inside an active interior footprint.

Scavenging supplies exclusions for the sinking ship and lifeboat. Survival supplies an exclusion for the lifeboat. Transforms update every frame so exclusions follow pitch, roll, sinking motion, buoyancy, and presentation cues.

Bounds sit slightly inside the visible hull. The inner floor and hull sides conceal the cut edge while exterior waves remain continuous against the vessel. Exclusions affect rendering only; wave sampling, buoyancy, item-loss checks, and scoring retain the shared wave field.

## Component Responsibilities

- `ItemState` owns type definitions, weights, spawn counts, and instance creation.
- `ScavengeSession` owns item status, carried order, carry weight, and saved instances.
- `CarryController` owns the visible carried bundle and the one active flight.
- `InteractionSystem` selects item instances or the lifeboat and formats capacity-aware prompts.
- `World` owns scavenging instance meshes, spawn placement, boat packing, save feedback hooks, and ocean exclusion transforms.
- `SurvivalSession` aggregates saved instances and enforces item-gated actions.
- `BoatWorld` owns survival props, depleted presentation, projected anchors, and the survival ocean exclusion.
- `SurvivalUI` owns tooltip buttons, focus/hover behavior, dialogs, and announcements.
- `SurvivalPhase` synchronizes the snapshot, boat-world props, projected anchors, and UI actions.

## Safeguards and Edge Cases

- Over-capacity pickups are rejected without changing item or carry state.
- A flight locks further drop/throw operations until it resolves.
- Saved instance identity and duplicate count survive the phase transition.
- Boat packing is deterministic and has no capacity branch.
- Lost items never enter the survival inventory.
- Off-screen projected anchors cannot receive pointer input.
- Missing or depleted supplies show a reason and cannot execute actions.
- If multiple instances expose the same action, each anchor invokes the same aggregate action without duplicating its effect.
- Water-exclusion uniforms have explicit inactive defaults so scenes without a second vessel render normally.
- Reduced-motion mode removes settling and tooltip motion but preserves state and feedback.

## Verification

Unit and integration tests will cover:

- item-definition weights, counts, and stable instance IDs;
- legal and illegal carry combinations at capacity three;
- duplicate pickup, LIFO drop/throw, loss, save, and repickup behavior;
- unlimited saved counts and deterministic boat placement;
- scavenging result identity and survival aggregation;
- one-food-per-can conversion and duplicated consumable charges;
- fishing-rod and scuba-set action gating;
- missing-item and depleted-item reasons;
- projected anchor visibility and action mapping;
- hover/focus tooltip content and keyboard accessibility;
- absence of the bottom action dock and inventory tray;
- water-exclusion coordinate transforms and inactive defaults;
- phase handoff, restart, pause, and reduced-motion behavior.

Browser verification will inspect both phases at representative wave peaks and vessel tilts, confirm that no water appears inside either hull, confirm visible carried/dropped/saved props, validate that saved supplies persist into survival, and exercise hover, focus, click, shortcuts, bait choice, depletion, and end-day interaction.

## Acceptance Criteria

The change is complete when:

1. Repeatable item instances spawn according to the approved distribution.
2. Carrying is limited by total weight three and clearly displayed.
3. Dropping and throwing have visible, persistent outcomes.
4. The lifeboat is easy to identify and accepts every saved item.
5. Saved item instances are physically visible in both phases.
6. Scuba sets weigh three and are required for diving.
7. Fishing rods are required for fishing.
8. Survival day actions are accessed through object tooltips rather than a bottom action menu.
9. The bottom-right inventory tray is gone.
10. Waves do not render through the ship or lifeboat interiors during normal wave and vessel motion.
11. Existing accessibility, pause, restart, event, and outcome flows continue to work.
12. Automated tests, type checking, production build, and browser visual checks pass.
