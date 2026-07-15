# Scavenging Freighter Layout Simplification

- **Status:** Approved
- **Date:** 2026-07-15
- **Target:** Desktop web browser
- **Scope:** Scavenging-phase room joins, deck access, furniture density, and item placement
- **Supersedes:** The spatial, furniture-placement, item-surface, and layout-validation details in `2026-07-15-scavenging-freighter-layout-material-redesign-design.md`

## 1. Objective

Finish the active freighter-layout rebuild by making the ship simple, readable, and fully traversable. Seal disconnected room corners, keep furniture in its intended room, stop furniture and collectible models from crossing walls, expose the complete bow and stern decks, and remove environmental clutter without changing the fourteen collectible supplies or scavenging rules.

## 2. Approved Decisions

1. Use one unified layout definition instead of patching independent geometry, furniture, and item coordinates.
2. Make both rounded ends reachable outdoor deck areas up to their railings.
3. Keep all fourteen collectible supplies and the existing item randomization.
4. Reduce only furniture, decorative props, and nonessential deck equipment.
5. Restrict furniture by room role:
   - bunks and personal storage belong only in the crew cabin;
   - helm and chart furniture belong only in the wheelhouse;
   - shelves and workbenches belong only in the storage/workroom;
   - the cargo deck contains only a few perimeter crate or equipment groups.
6. Keep room centers, door approaches, the exterior loop, end decks, and the lifeboat route clear.
7. Use the already selected committed Kenney furniture models. Do not add a new asset source or download another pack for this correction.

## 3. Unified Layout Ownership

`ShipLayout.ts` is the single source of truth for:

- room polygons and closed wall outlines;
- door openings and approach rectangles;
- bow, stern, side-path, and lifeboat navigation lanes;
- furniture model transforms and occupied footprints;
- furniture-owned item surfaces and standing points;
- the compact stern machinery footprint;
- rail segments and the lifeboat opening;
- required navigation targets and clearance classes.

`ShipGeometry`, `ShipFurniture`, and `ShipItemPlacement` consume this data. They must not contain a second set of hard-coded room furniture or item coordinates. A layout change therefore moves the visible model, its collider, its item surfaces, and its navigation exclusion together.

The assembly flow is:

```text
ShipLayout data
    -> structural and placement validation
    -> floors, walls, corner joins, rails, and shell colliders
    -> furniture models, furniture colliders, and item surfaces
    -> seeded assignment of fourteen items to valid surfaces
    -> final navigation and intersection assertions
```

## 4. Spatial Layout

### 4.1 Closed Rooms and Connected Corners

Each enclosed room uses one ordered, closed wall outline. Adjacent wall spans share the same corner coordinate. A square structural corner cap covers each shared endpoint from finished floor to wall top, and a matching collision box covers the same footprint. Door subtraction may split a wall span but may not shorten either neighboring corner join.

The crew cabin, wheelhouse, and storage/workroom must have no line-of-sight crack, floor-level gap, or collision gap at a corner. Visual and collision tests sample both faces and the diagonal of every corner.

### 4.2 Fully Reachable Bow

The wheelhouse forward footprint moves aft enough to create a useful exterior apron between its forward wall and the rounded bow rail. The port and starboard side paths connect across this apron. The bow deck floor follows the hull profile to the rail, with navigation targets on its port approach, center apron, and starboard approach.

The route around the wheelhouse keeps at least the 1.4-unit secondary clearance after collider faces. The bow center is reachable without squeezing between decorative equipment.

### 4.3 Fully Reachable Stern

The stern receives a continuous finished deck surface to the rounded rail. The previous broad machinery closure is replaced by one compact central machinery island that contains the existing smokestack bases and necessary scenery. It does not touch a room, rail, or side path.

The port and starboard routes connect behind the island. Navigation targets cover both approaches and the center aft apron. The path around the island keeps at least 2.0 units on the primary loop, and no decorative prop narrows it.

### 4.4 Clear Circulation

- Primary exterior and cargo lanes: at least 2.0 units between collider faces.
- Secondary furniture-access and bow routes: at least 1.4 units.
- Door openings: at least 1.8 units.
- Lifeboat approach and rail opening: at least 3.0 units.
- Room centers: one declared clear rectangle per room, free of furniture, items, and decorative props.
- End-deck targets: reachable from the player start by both port and starboard routes.

Gaps too narrow for the 0.35-unit player radius are closed visibly and physically; they are not left as misleading camera-sized openings.

## 5. Furniture and Clutter Rules

Furniture occupies a shallow perimeter band next to room walls. Its back face sits just inside the finished wall rather than intersecting it. Large fixtures do not occupy room centers or door turning areas.

The approved maximum large-fixture counts are:

| Zone | Large fixtures | Rule |
|---|---:|---|
| Crew cabin | 4 | Two bunks plus at most two wall storage/desk fixtures; beds remain item-free |
| Wheelhouse | 4 | Helm, chart surface, and at most two low cabinets; no bunk or general shelving |
| Storage/workroom | 4 | Two wall work surfaces and at most two shelving/storage fixtures |
| Cargo deck | 4 groups | Small crate/equipment groups against the perimeter; no central islands |
| Bow and stern aprons | 1 island total | Only the compact stern machinery island; bow stays empty |
| Lifeboat station | 0 | No furniture or decorative clutter in the approach volume |

Loose charts, mugs, hand tools, machine parts, duplicate vents, and similar non-gameplay dressing are removed unless they are integrated into a furniture model and do not affect collision. Necessary stacks, alarm equipment, and ship-operational silhouettes remain.

Every placement declares its intended zone. Validation rejects furniture whose model ID is not allowed in that zone, whose footprint crosses the zone safe boundary, or whose footprint overlaps another fixture, a door approach, a clear center, a lane, or the evacuation volume.

## 6. Collectible Item Placement

All fourteen collectible supplies remain. They are placed only on declared surfaces owned by approved perimeter furniture or perimeter cargo groups. Beds, chairs, floors, free-floating plates, room centers, walls, and walkways are never item surfaces.

Each surface stores its transform relative to its furniture owner. The placement system transforms the surface and item bounds into ship-local space and requires:

1. the oriented item bounds fit inside the usable surface footprint;
2. the item bottom rests on the surface within a small vertical tolerance;
3. the item volume does not intersect walls, corner caps, ceilings, other furniture, or another item;
4. the item remains inside the owning zone's safe volume with at least 0.1 units of wall clearance;
5. at least one standing point is reachable and has interaction line of sight;
6. long items lie parallel to the nearby wall when that gives the safest fit.

Fallback capacity is provided by additional slots on ordinary approved furniture, not by visible emergency platforms or coordinates detached from a fixture. Seeded randomization chooses among valid slots without changing item count or gameplay categories.

## 7. Components

### `ShipLayout.ts`

Owns closed room outlines, corner metadata, zones, lanes, clear centers, furniture placements, item surfaces, machinery, rails, and navigation targets. It also exposes validation results with object and zone IDs.

### `ShipGeometry.ts`

Builds one floor surface per zone or deck region, closed wall spans, corner caps, doors, compact machinery, and railings. Structural colliders come from the same spans and footprints.

### `ShipFurniture.ts`

Instantiates only the furniture declared by the layout, applies the model transform, emits one simplified footprint collider per fixture, and transforms furniture-owned item surfaces. Legacy procedural furniture arrays, decorative clutter, and independent anchor-support meshes are removed.

### `ShipItemPlacement.ts`

Validates item-to-surface fit, wall and structure separation, reachability, line of sight, and pairwise item separation before returning seeded placements.

### `Ship.ts`

Runs validation before exposing the assembled ship contract. It combines shell and furniture colliders only after both builders have consumed the same approved layout.

## 8. Validation and Error Handling

Layout validation fails with named objects when it detects:

- an open or disconnected room outline;
- a missing visual or collision corner join;
- a furniture type assigned to the wrong room;
- furniture crossing a wall, clear center, lane, door approach, or evacuation volume;
- overlapping furniture footprints;
- an item surface without a furniture owner;
- an item or surface intersecting structural geometry;
- an unreachable standing point, room, bow target, stern target, or evacuation target;
- a route below its declared clearance;
- a missing or misaligned lifeboat rail opening.

Invalid layouts stop scene creation through the existing loading/error path. The game does not silently hide misplaced furniture, drop items on the floor, or create invisible fallback supports.

## 9. Testing

### Automated

Vitest coverage will prove:

- all room outlines are closed and every visual corner has matching collision coverage;
- all doors remain visibly and physically open across a player-radius sample set;
- room clear centers, door approaches, circulation lanes, and the lifeboat approach contain no furniture;
- furniture types match their intended zones and do not cross walls;
- the fixture-count limits are respected;
- the bow and stern floor regions reach their rounded rail profiles;
- bow and stern navigation targets are reachable by both side routes;
- the compact stern island retains a 2.0-unit route around it;
- all fourteen supplies receive unique, plausible, wall-safe, reachable surfaces across representative seeds;
- no item bounds intersect walls, corner caps, furniture other than their support, or other items;
- no legacy support plates or decorative clutter meshes remain;
- pickup, carrying, throwing, saving, sinking, restart, timer, and survival handoff behavior remain unchanged.

### Required commands

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

### Browser QA

Inspect the title scene and active scavenging at common desktop sizes. Walk both directions around the exterior loop, cross the bow and stern aprons, enter every room through every door, approach every collectible, and reach the lifeboat. Restart several seeds and confirm that all fourteen items rest on furniture without touching walls. Inspect room corners from close range and shallow angles. Check both game phases after the scene changes.

## 10. Acceptance Criteria

1. Every room corner is visually sealed and collision-solid.
2. No bed, shelf, or other fixture appears outside its approved room.
3. No furniture or collectible model intersects a wall or corner join.
4. The complete bow and stern exterior decks are reachable from both side paths.
5. Room centers, end aprons, primary lanes, door approaches, and the lifeboat route remain open.
6. Furniture stays within the approved per-zone limits and against room or cargo-deck perimeters.
7. All fourteen collectible supplies remain present, randomized, reachable, and supported by plausible furniture surfaces.
8. The player can traverse the full route without camera-sized gaps, collision traps, or unreachable areas.
9. Existing scavenging and survival gameplay behavior is unchanged.
10. Model checks, tests, typecheck, build, and browser QA pass.
