# Last Boat Out: Large Coastal Freighter Redesign

- **Status:** Approved design; awaiting written-spec review
- **Date:** 2026-07-13
- **Target:** Desktop web browser
- **Scope:** Scavenging ship geometry, furnishing, item placement, materials, and smoke

## 1. Objective

Replace the small block-built scavenging ship with a furnished coastal freighter that supports the existing two-minute evacuation loop. The new ship must look like a working vessel, give each collectible a plausible resting place, and preserve current item counts and gameplay rules.

The redesign uses original procedural geometry and materials. It draws broad visual direction from the furnished wooden interior and fast scavenging layout of *Don't Sleep With The Fishes* without copying its models, textures, or room plan.

## 2. Approved Decisions

The user approved these choices:

1. Build a large single-level boat rather than a two-level vessel.
2. Keep the two-minute scavenging timer.
3. Randomize collectibles among authored, type-compatible surface anchors.
4. Generate stylized wood through procedural geometry and materials. Do not add external wood textures.
5. Model the ship as a weathered coastal freighter with twin smokestacks.
6. Keep the existing fourteen collectible instances and all current carrying, throwing, saving, and survival rules.
7. Use a looped route through the cabin, wheelhouse, exterior deck, and storage room.
8. Add non-collectible furnishings and boat fittings where they help the ship read as a working vessel.

## 3. Scope

### Included

- A new coastal-freighter hull and superstructure.
- A crew cabin, wheelhouse, storage/workroom, cargo deck, and lifeboat station.
- A connected loop with two practical routes between the interior and exterior deck.
- Wooden floors, wall panels, furniture, doors, crates, and deck sections.
- Painted metal, rust, rivets, glass, rope, and machinery details.
- Desks, shelves, cabinets, chairs, bunks, lockers, workbenches, racks, and cargo fittings.
- Tagged placement anchors on surfaces that can hold collectibles.
- Random placement constrained by item category, size, clearance, and surface capacity.
- Two smokestacks with pooled smoke particles.
- Updated collision volumes, water exclusion bounds, player start, evacuation point, and item transforms.
- Automated tests and browser checks for layout, placement, collision, smoke, cleanup, and gameplay regressions.

### Excluded

- Changes to the two-minute timer or the fourteen-item distribution.
- New collectible types, weights, charges, or survival effects.
- A second playable deck, ladders, or stairs.
- Doors that the player must open or unlock.
- Physics-based loose furniture or ship damage.
- A redesign of the survival lifeboat.
- Downloaded ship models or photographic texture maps.

## 4. Ship Scale and Layout

The current ship measures about 8.4 units wide and 24 units long. The replacement targets about 12.5 units wide and 36 units long, a 50 percent increase on both axes. Final dimensions may move within 10 percent during browser tuning if the player cannot complete useful supply runs within two minutes.

The ship uses one gameplay level. Small height changes may define thresholds and machinery bases, but the player does not climb stairs.

### 4.1 Looped Route

The route connects five authored zones:

1. **Crew cabin:** The player starts among bunks, desks, chairs, wall shelves, and lockers. Two exits point toward the wheelhouse and storage room.
2. **Wheelhouse:** A navigation desk, wheel, instrument cabinets, windows, charts, and a forward door lead to the exterior deck.
3. **Cargo deck:** Crates, covered cargo, rope coils, winches, vents, railings, and side passages connect the bow-facing wheelhouse exit to the stern-facing storage entrance.
4. **Storage/workroom:** Shelving, cabinets, hooks, a workbench, and machinery provide the densest tool and equipment search area.
5. **Lifeboat station:** The existing lifeboat sits beside the cargo deck. The player can approach it from either side of the loop.

The crew cabin, wheelhouse, cargo deck, and storage room form a closed circuit. Players can reverse direction or combine interior and exterior searches without retracing the whole ship.

### 4.2 Navigation and Sightlines

Door frames, lamp color, window light, and floor material distinguish each zone. The wheelhouse windows and both cargo-deck passages keep the lifeboat visible from several approach angles. Furniture leaves a player-width corridor plus collision margin through each room. Rails and cargo guide movement without producing dead ends.

The start position faces the first useful cabin surfaces. The evacuation point remains on the ship side of the lifeboat so the existing interaction and end-of-timer rules continue to work.

## 5. Exterior Form

The hull gains a tapered bow, a squared working stern, a raised deck edge, and a clear waterline. The superstructure combines a forward wheelhouse with a lower cabin body. A stern machinery housing supports two smokestacks.

Exterior details include:

- continuous railings with authored openings at the lifeboat station;
- bollards, cleats, vents, pipes, winch drums, rope coils, and cargo tie-downs;
- grouped crates and covered cargo that preserve walking corridors;
- faded hull paint, a dark lower hull, rust streaks, rivet rows, and repair plates;
- wheelhouse window frames and panes that reflect light without blocking the player's view.

The silhouette must read as a coastal freighter from the title screen camera and from the lifeboat side.

## 6. Materials and Procedural Wood

The project will not load external wood images. Code will create board variation through geometry, vertex or material color, and small authored detail meshes.

### 6.1 Wood Families

The ship uses separate reusable material families:

- **Floor planks:** dark brown boards with alternating tone, narrow gaps, grain lines, scratches, and damp patches.
- **Painted wall panels:** pale desaturated boards with exposed seams, worn corners, and occasional bare-wood chips.
- **Furniture wood:** medium warm brown with darker end grain and edge wear.
- **Deck timber:** gray-brown boards with wider seams, salt bleaching, and dark water staining.
- **Crate wood:** rough lighter boards with dark framing slats and stamped markings.

The builders create plank seams and large grain marks as geometry or lightweight generated map data. Material variation uses a stable seed so a reload does not make the vessel flicker between unrelated palettes.

### 6.2 Metal, Glass, and Rope

Painted steel uses moderate roughness and low metalness. Separate rust and repair-plate meshes break broad hull surfaces. Dark fittings use higher roughness than exposed machinery edges. Window glass stays transparent enough to preserve navigation cues. Rope uses a dark fiber material with a matte finish.

All materials support the existing fog, directional light, shadows, and emergency-light pulse.

## 7. Furniture and Decorative Props

Furniture belongs to the ship layout and participates in collision and item placement. Each room builder returns its visible objects, collision boxes, and placement anchors.

The crew cabin contains bunks, desks, chairs, shelves, lockers, a small table, and wall lamps. The wheelhouse contains a helm console, wheel, chart table, instrument cabinets, and emergency storage. The workroom contains a workbench, tall shelving, cabinets, hooks, and machinery. The cargo deck contains crates, racks, rope, vents, and winches.

Decorative objects include charts, mugs, books, dishes, hand tools, rope, and small machine parts. They do not expose interaction metadata. Collectibles retain their current highlight and interaction behavior so players can distinguish supplies from scenery.

## 8. Authored Item Placement

The ship replaces the generic `Vector3[]` floor spawn list with structured surface anchors.

```ts
type ShipItemCategory =
  | 'foodWater'
  | 'medicalEmergency'
  | 'toolsRepair'
  | 'fishingDiving';

interface ShipItemAnchor {
  id: string;
  categories: readonly ShipItemCategory[];
  position: Vector3;
  rotation: Euler;
  scale: number;
  surface: 'shelf' | 'desk' | 'cabinet' | 'workbench' | 'rack' | 'crate';
  footprint: { width: number; depth: number };
  clearanceHeight: number;
}
```

The final implementation may refine names and types, but each anchor must identify its categories, transform, surface, and clearance.

### 8.1 Category Mapping

- Canned food and water jugs use galley shelves, cabin tables, cabinets, and sturdy crate tops.
- Medical kits use a wall cabinet, cabin shelf, or wheelhouse emergency cabinet.
- Duct tape and flashlights use desks, workbenches, shelves, and machinery cabinets.
- Flare guns use the wheelhouse desk or emergency cabinets.
- Fishing rods and scuba sets use deck racks, storage hooks, long work surfaces, or floor-level equipment cradles designed for their size.
- Bait tins use workroom shelves, deck crates, and fishing-gear surfaces.

Large items may use low racks or cradles. The system must not place them upright on narrow shelves.

### 8.2 Assignment Rules

At run start, the placement module shuffles the fourteen existing instances and the eligible anchors. It assigns each instance to one unused compatible anchor. The algorithm enforces these rules:

1. Category compatibility must match.
2. The item's footprint and height must fit the anchor.
3. One anchor accepts one collectible.
4. Sibling anchors on the same small surface cannot overlap.
5. A collectible cannot intersect decorative geometry or a wall.
6. The interaction ray must reach the item from a legal player position.

The authored anchor pool contains more positions than the game needs. Empty anchors create variation across runs.

### 8.3 Validation and Fallbacks

Development-time validation reports duplicate IDs, invalid dimensions, obstructed anchors, missing categories, and insufficient compatible anchors. Runtime placement uses a deterministic fallback order if random assignment cannot place an item. A final emergency anchor exists for each category in a reachable workroom or cabin location. Standard project data must place all fourteen items without using emergency anchors.

## 9. Collision and Traversal

The collision system keeps its current ship-local axis-aligned boxes. The new builders return boxes for floors, walls, furniture, cargo, rails, and machinery. Small visual details such as mugs, rivets, rope, and chair legs do not need separate colliders.

Collision design follows these constraints:

- Each main doorway retains enough width for the player capsule plus lateral error.
- Furniture cannot create a gap that looks passable but blocks the capsule.
- Chairs sit close enough to desks or walls that players do not enter unusable pockets.
- Rail openings align with the lifeboat interaction route.
- The player cannot walk through cabinets, workbenches, bunks, cargo, or the outer hull.
- Item surfaces remain within the current interaction range from at least one legal standing position.

The ship keeps the existing scripted sinking transform. All visual geometry, colliders, anchors, and items remain children of the same ship root so they list and sink together.

## 10. Smokestacks and Smoke

Two smokestacks rise from the stern machinery housing. Each stack uses a dark body, collar, cap, mounting plate, and nearby pipe details.

`ShipSmoke` owns a fixed particle pool. Each smoke puff follows this lifecycle:

1. Spawn at one stack outlet with small seeded variation.
2. Rise while drifting toward the storm wind direction.
3. Expand and lose opacity over its lifetime.
4. Return to the pool instead of allocating a new mesh.

Sinking progress increases spawn rate and darkens smoke within fixed limits. Smoke cannot cover the wheelhouse exit, lifeboat station, or central crosshair for sustained periods. Reduced-motion mode lowers drift, expansion, and spawn rate. It keeps enough smoke to communicate engine distress.

The world update passes time, frame delta, sinking progress, and reduced-motion state to the smoke system. Disposal releases particle geometry and material resources once.

## 11. Code Structure

The implementation divides ship work into focused modules:

```text
src/world/
|-- Ship.ts
|-- ShipGeometry.ts
|-- ShipFurniture.ts
|-- ShipItemPlacement.ts
|-- ShipMaterials.ts
`-- ShipSmoke.ts
```

- `Ship.ts` assembles the vessel and returns the world-facing build contract.
- `ShipGeometry.ts` builds the hull, rooms, doors, deck, rails, stacks, and large fittings.
- `ShipFurniture.ts` builds furniture and returns its colliders and anchors.
- `ShipItemPlacement.ts` validates anchors and assigns item instances to compatible transforms.
- `ShipMaterials.ts` creates reusable materials and generated wood detail resources.
- `ShipSmoke.ts` owns stack smoke creation, updates, reduced-motion behavior, and disposal.

`World` keeps ownership of the ship, collectible objects, sinking transform, environment, lifeboat, and ocean. It uses the placement result instead of calling `selectSpawnPoints` on floor coordinates. The implementation preserves the existing `ShipBuild` information required by `World`, `PlayerController`, and tests, while extending that contract with item anchors and smoke update or disposal access as needed.

The split prevents a new monolithic `Ship.ts` and lets tests exercise placement and smoke without constructing the whole game.

## 12. Runtime Data Flow

World construction follows this order:

1. `ShipMaterials` creates reusable material resources.
2. `ShipGeometry` creates the hull and room shell.
3. `ShipFurniture` adds furniture, colliders, decorative props, and item anchors.
4. `ShipItemPlacement` validates the anchors and assigns all fourteen instances.
5. `World` creates collectible models at the returned transforms.
6. `ShipSmoke` creates its fixed particle pool.
7. `World` creates the lifeboat, ocean, and environment through the existing flow.

Each frame, `World` applies the sinking transform, updates the ocean and lifeboat, updates smoke, updates environmental effects, and refreshes water exclusions. The item state machine remains the sole authority for available, carried, saved, and lost state.

## 13. Performance and Resource Ownership

The redesigned ship targets the current desktop browser baseline. It must preserve a stable frame rate on the same hardware that runs the existing scene.

The implementation will:

- reuse geometries and materials for repeated planks, rails, chair parts, shelves, and crates;
- use instancing where it reduces draw calls without complicating disposal or collision;
- pool smoke particles and cap their count;
- omit colliders from small decorative meshes;
- cap procedural texture resolution if generated maps support the wood materials;
- register each owned geometry, material, and generated texture for one-time disposal.

The existing performance-stat overlay can help browser QA, but this redesign does not change that feature.

## 14. Error Handling and Edge Cases

- Anchor validation fails with a specific error before play if standard project data cannot place all item categories.
- Runtime fallback anchors prevent a blank or unreachable collectible if random assignment finds no candidate.
- Missing decorative geometry does not block ship construction.
- Smoke creation failure leaves the stacks visible and disables smoke updates without blocking play.
- Large frame deltas stay subject to the game's existing update clamp.
- Reduced-motion preference affects smoke and presentation only. It does not change item placement or gameplay timing.
- Saved, dropped, thrown, and lost items continue to detach and attach through the current world methods.
- The enlarged ship updates its ocean water-exclusion half-width and half-length so waves do not render through the hull.

## 15. Testing

### 15.1 Automated Tests

Vitest will cover:

- target ship bounds and the presence of each named zone;
- a connected loop between the cabin, wheelhouse, deck, workroom, and lifeboat station;
- doorway and corridor clearance against the player capsule;
- stable material generation for a fixed seed;
- anchor ID uniqueness, positive dimensions, legal surfaces, and category coverage;
- category-compatible placement for each item type;
- unique assignments for all fourteen standard instances;
- footprint, clearance, and sibling-overlap rejection;
- fallback behavior for an intentionally constrained anchor set;
- furniture collider bounds and clear interaction positions;
- smoke pool limits, puff lifecycle, sinking-based density bounds, and reduced-motion settings;
- disposal of generated maps, materials, geometry, and smoke resources;
- unchanged carrying, throwing, saving, loss, survival handoff, and restart behavior.

### 15.2 Browser QA

Browser verification will inspect the ship at the title screen and during active scavenging. The reviewer will:

1. Walk both directions around the full loop without collision traps.
2. Reach every room and the lifeboat station through clear doorways.
3. Inspect all fourteen collectibles and confirm that each rests on a plausible surface.
4. Restart several runs and confirm that items move among compatible locations.
5. Pick up, drop, throw, save, and lose representative small and large items.
6. Run successful two-minute routes from each branch of the loop.
7. Inspect wood variation, wall panels, furniture, hull paint, rust, railings, stacks, and smoke at common desktop resolutions.
8. Observe smoke early and late in the sinking sequence, with reduced motion enabled and disabled.
9. Confirm that waves do not appear inside the enlarged hull.
10. Check the performance-stat overlay for a material regression from the current baseline.

Type checking, the full Vitest suite, and the production Vite build must pass.

## 16. Acceptance Criteria

The redesign is complete when:

1. The title and gameplay views identify the vessel as a weathered coastal freighter.
2. The ship measures about 50 percent wider and longer than the current version and remains single-level.
3. The cabin, wheelhouse, cargo deck, storage/workroom, and lifeboat station form a readable loop.
4. Floors, walls, furniture, and deck sections show distinct procedural wood construction and wear.
5. The exterior includes a shaped hull, railings, working-deck fittings, and two smoking stacks.
6. Each of the fourteen collectibles appears on a reachable, size-appropriate, category-compatible surface.
7. Several anchors remain empty each run, and repeat runs vary placement without producing implausible locations.
8. Furniture and cargo provide collision without blocking doorways or trapping the player.
9. A player can complete useful supply runs and evacuate within the unchanged two-minute timer.
10. Smoke scales with sinking progress, respects reduced motion, stays out of critical sightlines, and uses a fixed pool.
11. The existing item rules, physical carrying, lifeboat storage, survival handoff, pause, restart, and accessibility behavior continue to work.
12. Water exclusion follows the enlarged hull through the full sinking transform.
13. Automated tests, type checking, the production build, and browser QA pass.

