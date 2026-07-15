# Scavenging Freighter Layout and Material Redesign

- **Status:** Approved design; awaiting written-spec review
- **Date:** 2026-07-15
- **Target:** Desktop web browser
- **Scope:** Scavenging-phase freighter layout, furniture, surfaces, item placement, collision, and railings

## 1. Objective

Rebuild the playable parts of the scavenging freighter so players can read and traverse the ship without collision traps. Keep the current hull, five zones, lifeboat position, item rules, sinking sequence, and two-minute timer.

The rebuild will use Kenney furniture models, original ship surfaces, and a data-driven layout. It will remove the overlapping procedural furniture, floating item supports, layered floor-detail meshes, narrow doors, and eye-level railings.

## 2. Confirmed Problems

Code and runtime inspection found these defects:

- A bunk blocks the port cabin exit after the collision system expands obstacles by the player's 0.35-unit radius.
- Both bunks overlap wall-shelf colliders. The starboard bunk also overlaps a locker.
- Two cargo crates overlap winch colliders.
- The wheelhouse door measures 1.25 units. The player radius leaves 0.55 units for the center of the player to pass through.
- The exterior railing rises 1.8 units above the deck and reaches above the first-person camera.
- The floor builder stacks a base deck, thin plank boxes, and thinner grain strips. Shallow viewing angles expose seams and shimmer.
- Item anchors create independent visible support plates instead of attaching to furniture surfaces. Several plates float or conflict with nearby furniture.
- Existing tests check isolated doorway points. They do not prove that a player-sized circle can travel through the complete route.

## 3. Approved Decisions

The user approved these choices:

1. Use a hybrid rebuild. Keep the custom freighter hull and replace the playable interior layout.
2. Preserve the five zones, lifeboat location, two-minute timer, fourteen supplies, and survival handoff.
3. Make the route spacious.
4. Use mixed materials by zone.
5. Replace procedural beds, desks, shelves, lockers, chairs, and tables with selected models from Kenney's Furniture Kit.
6. Keep authored item randomization and restrict it to validated surfaces on real furniture.
7. Lower the exterior railing to waist height, between 1.0 and 1.1 units above the deck.
8. Keep the redesign text-only during planning.

## 4. Scope

### Included

- Room boundaries, doors, exterior paths, and furniture positions.
- Floor and wall construction for each playable zone.
- Selected Kenney Furniture Kit models and their processing pipeline.
- Simplified furniture colliders.
- Real furniture surfaces and item anchors.
- Player-radius route validation.
- The starboard rail opening and the remaining exterior railing.
- Tests, asset records, resource disposal, and browser inspection.

### Excluded

- Hull dimensions and hull silhouette.
- A second deck, stairs, ladders, or moving doors.
- The scavenging timer, item counts, carrying rules, scoring, sinking, or survival rules.
- The survival-phase lifeboat's visual design.
- Physics-driven furniture or loose-object simulation.
- A broad replacement of the ship with a Kenney pirate or factory scene.

## 5. Spatial Plan

`ShipLayout.ts` will define the room envelopes, doors, circulation lanes, furniture transforms, rail openings, and required navigation targets. Geometry and collision builders will consume the same layout values.

The freighter keeps its current coordinate system: positive Z points toward the bow, and the lifeboat sits on the starboard side near Z = -6.5.

### 5.1 Zones

| Zone | Position and role | Circulation | Furniture rule |
|---|---|---|---|
| Crew cabin | Forward-middle start zone | Port and starboard exits feed the exterior loop | Bunks, lockers, desks, and shelves stay against walls; the center remains open |
| Wheelhouse | Bow zone | A wide aft entrance and a side entrance provide two approaches | Helm, chart table, and cabinets line the perimeter |
| Cargo deck | Open middle-aft zone | A 2.0-unit longitudinal lane and two cross-aisles connect both sides | Crates and fittings form edge clusters or islands with paths on both sides |
| Storage/workroom | Aft work zone | Port and starboard doors connect to the exterior loop | Workbenches, lockers, and shelves leave a wide center aisle |
| Lifeboat station | Starboard side near Z = -6.5 | A direct lane reaches a rail opening at least 3.0 units wide | No furniture enters the approach lane or evacuation volume |

The machinery and smokestack base remain scenery near the stern. Their colliders will close areas that the player cannot enter, so the scene will not suggest a route through machinery.

### 5.2 Clearance Contract

- Primary circulation lanes keep at least 2.0 units between collider faces.
- Furniture-access aisles keep at least 1.4 units between collider faces.
- Door openings keep between 1.8 and 2.2 units of clear width.
- The lifeboat approach and rail opening keep at least 3.0 units of clear width.
- Furniture stays outside door approach rectangles and turning areas.
- Gaps that cannot accept the 0.35-unit player radius receive a wall return, trim panel, crate backing, or another visual closure.

The player starts in open cabin floor space and can leave in either direction. Each playable zone has two route directions. Furniture cannot create a pocket that accepts the camera but traps the player collider.

### 5.3 Railings

The exterior rail top will sit between 1.0 and 1.1 units above the finished deck. Posts and rail colliders will use the same height. The starboard opening will align with the evacuation point and lifeboat acceptance route.

Curved bow and stern rails will retain the hull profile. Collision tests will verify that players cannot leave through any section except the lifeboat opening and the game's existing fall boundaries.

## 6. Materials and Surfaces

The floor builder will create one visible floor surface per zone. It will remove plank boxes and grain-strip meshes from playable floors.

`ShipMaterials` will build small deterministic `DataTexture` maps for color, roughness, and bump detail. The texture generator will create maps once per ship material set, share them across matching surfaces, and dispose them once. Materials will use consistent world-scale repeats and the renderer's supported anisotropy.

| Zone | Floor | Walls |
|---|---|---|
| Crew cabin | Warm weathered wood | Pale painted panels with restrained seams |
| Wheelhouse | Warm weathered wood | Pale painted panels and glass frames |
| Cargo deck | Weathered maritime deck with anti-slip areas | Painted steel structures and hull edges |
| Storage/workroom | Dark industrial floor | Painted steel with wear near work surfaces |
| Lifeboat station | Exterior maritime deck | Hull, posts, and waist-height steel rail |

The maps will carry plank seams, broad color variation, wear, and surface grain without adding coplanar geometry. The material palette will match the Furniture Kit models. The design will not use Kenney's generic Pattern Pack as a wood substitute.

## 7. Furniture Assets

The implementation will download the individual free CC0 Kenney Furniture Kit pack. It will not use the All-in-1 bundle.

A processing script will extract selected source models, normalize their scale and orientation, prune unused nodes and materials, embed runtime dependencies, and write stable GLB files under `src/assets/models/ship/`. Runtime code will not fetch assets from Kenney.

`THIRD_PARTY_ASSETS.md` will record the asset page, pack version, archive SHA-256, source entry, processing steps, source and committed triangle counts, license, and download date for each committed model.

A `ShipFurnitureLibrary` will preload the processed models with the item models. It will clone model scenes for placement and share immutable geometry and materials when Three.js permits it. Missing required furniture will trigger the existing asset-loading failure UI.

Each furniture placement will define one simplified collision box for the occupied footprint. Chair legs, bed posts, handles, and shelf boards will not create separate colliders. The layout validator will reject intersecting furniture footprints.

## 8. Item Surfaces and Randomization

The rebuild will delete visible `anchor-support-*` plates. Furniture placements will expose surface definitions in model-local coordinates:

```ts
interface ShipItemSurface {
  id: string;
  furnitureId: string;
  categories: readonly ShipItemCategory[];
  localPosition: Vector3;
  localRotation: Euler;
  footprint: { width: number; depth: number };
  clearanceHeight: number;
  standingPoints: readonly Vector3[];
}
```

The final type names may change, but each surface must identify its furniture owner, semantic categories, local transform, usable footprint, clearance, and reachable standing points.

The placement system will:

1. Transform each surface from furniture-local space into ship-local space.
2. Filter surfaces by category, oriented item bounds, clearance, and standing-point reachability.
3. Shuffle eligible surfaces with the run's seeded random source.
4. Assign one item to one surface without overlap.
5. Use approved fallback surfaces on ordinary furniture if regular capacity cannot place an item.

Beds, chairs, walkways, walls, and decorative plates cannot hold supplies. Large items use low racks or broad work surfaces. Small food, medical, and tool items use shelves, desks, cabinets, crate tops, and workbenches that match their purpose.

Fallback surfaces remain part of ordinary furniture. They do not add red platforms or other visible emergency geometry.

## 9. Module Boundaries and Data Flow

The redesign will use these focused modules:

```text
src/world/
|-- Ship.ts
|-- ShipLayout.ts
|-- ShipGeometry.ts
|-- ShipFurniture.ts
|-- ShipFurnitureLibrary.ts
|-- ShipItemPlacement.ts
|-- ShipMaterials.ts
`-- ShipSmoke.ts
```

- `ShipLayout.ts` owns spatial data and clearance metadata.
- `ShipGeometry.ts` builds the hull interior, floors, walls, doors, rails, and machinery closures.
- `ShipFurnitureLibrary.ts` preloads and owns processed Kenney model resources.
- `ShipFurniture.ts` places furniture, colliders, and usable item surfaces.
- `ShipItemPlacement.ts` validates surfaces and assigns items.
- `ShipMaterials.ts` owns ship materials and generated texture maps.
- `Ship.ts` assembles the ship contract for `World`.

App startup will preload item and furniture model libraries before creating the title world. `World` will receive both libraries and will keep gameplay state separate from rendering data. Furniture transforms, colliders, and item surfaces will remain children or ship-local data under the same sinking transform.

## 10. Validation and Error Handling

The layout validator will inflate each active obstacle by the 0.35-unit player radius, rasterize or graph the walkable area, and prove connectivity from the start to every required navigation target. Targets will include both sides of each door, each item standing point, both route directions, and the evacuation point.

Validation will report the zone and object IDs for:

- intersecting furniture colliders;
- a blocked door approach;
- a route narrower than its declared clearance class;
- an unreachable zone, surface, or evacuation point;
- duplicate surface IDs;
- unsupported item categories;
- invalid item footprint or height;
- a rail opening that misses the evacuation lane.

Asset preload errors will name the missing model and stop scene creation through the existing error UI. The game will not substitute invisible furniture or floor-level items.

## 11. Testing

### 11.1 Automated Tests

Vitest will cover:

- the five zone envelopes and two route directions;
- declared clearances after player-radius inflation;
- graph connectivity from the start to all doors, zones, standing points, and the lifeboat;
- rejection of the current blocked-exit and overlapping-furniture arrangements;
- zero furniture collider overlaps in the approved layout;
- rail height and lifeboat opening alignment;
- one visible floor layer per zone;
- stable material maps for a fixed seed, correct repeats, and one-time disposal;
- Furniture Kit model normalization and resource ownership;
- surface ownership, category compatibility, size fit, clearance, standing-point access, and interaction line of sight;
- unique placement of all fourteen items across a representative set of seeded runs;
- approved fallback behavior when regular surface capacity is constrained;
- unchanged pickup, carrying, throwing, saving, sinking, restart, and survival handoff behavior.

### 11.2 Required Commands

After asset or scene changes, run:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

### 11.3 Browser QA

Browser inspection will cover the title view and active scavenging at common desktop resolutions. The reviewer will walk the full loop in both directions, enter each room through each door, approach each furniture group, and reach the lifeboat without collision traps.

The reviewer will restart several seeded runs and inspect all fourteen supplies. Each item must rest on a plausible surface and remain reachable. The reviewer will check floor stability at shallow angles, wall scale, furniture scale, rail height, the rail opening, shadows, and both game phases.

## 12. Performance and Resource Ownership

Processed furniture models will keep a bounded triangle count and reuse shared resources. Repeated surface materials will share geometry, materials, and generated maps. The redesign will reduce floor draw calls by replacing plank and grain meshes with one surface per zone.

Each owner will dispose its resources once:

- `ShipFurnitureLibrary` owns loaded model resources.
- `ShipMaterials` owns ship materials and generated maps.
- `ShipGeometry` owns generated geometry.
- `ShipSmoke` retains its current pooled particle ownership.

The implementation will preserve the current desktop performance target and performance-stat overlay.

## 13. Acceptance Criteria

The redesign passes when:

1. The player can traverse the primary loop in both directions and reach each zone, item standing point, and the lifeboat.
2. Primary lanes measure at least 2.0 units, secondary aisles at least 1.4 units, and doors at least 1.8 units between collider faces.
3. Furniture colliders do not overlap or block door approaches.
4. Bunks and other large furniture stay against walls and outside central routes.
5. Each zone uses its approved floor and wall family.
6. Floors show no shimmer, exposed coplanar seams, or grain-strip aliasing during browser inspection.
7. Selected Furniture Kit models load from committed GLB files and match the ship's scale and palette.
8. All fourteen supplies occupy unique, plausible, reachable furniture surfaces across the tested seeds.
9. The scene contains no visible emergency support plates.
10. Exterior rails sit between 1.0 and 1.1 units above the deck and block the player outside the lifeboat opening.
11. The lifeboat opening measures at least 3.0 units and aligns with the evacuation route.
12. Carrying, throwing, saving, sinking, restart, timer, and survival handoff behavior remain unchanged.
13. Asset records satisfy `THIRD_PARTY_ASSETS.md` requirements.
14. `models:check`, tests, typecheck, build, and browser QA pass.
