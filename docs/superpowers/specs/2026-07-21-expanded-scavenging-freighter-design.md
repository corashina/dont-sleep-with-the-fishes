# Expanded Scavenging Freighter Design

## Goal

Enlarge the scavenging freighter, give each existing area more room, and add enough working-ship detail to make the deck feel used. The player must retain clear routes through the ship and reach all twenty-two scavenging items within the existing two-minute phase.

## Scope

This change covers the scavenging freighter hull, authored layout, room furniture, item surfaces, navigation analysis, collisions, water exclusion, rigging, and deck decoration. It retains the current single-level route and the powered coastal-freighter identity.

The work does not change the timer, movement speed, sprint behavior, interaction distance, carry capacity, item catalog, random-source contract, sinking rules, lifeboat behavior, or survival phase. It adds no stairs, lower hold, mobile controls, save data, or new gameplay mechanics.

## Ship Identity and Dimensions

The enlarged vessel remains an engine-powered coastal freighter. Two compact auxiliary masts and raised fore-and-aft sails add a motor-sailer silhouette without turning the vessel into a traditional sailing ship.

`FREIGHTER_DIMENSIONS` will use these values:

| Dimension | Current | Expanded |
| --- | ---: | ---: |
| Hull width | 12.5 m | 16 m |
| Hull length | 36 m | 44 m |
| Finished deck height | 2.22 m | 2.22 m |

The structural deck will span 15.5 by 42 metres inside the rounded hull. The hull, finished floors, rails, navigation bounds, buoyancy footprint, and water-exclusion profile will derive from the expanded dimensions. The safe player bounds will become `x = -7.65..7.65` and `z = -21.2..21.2`.

## Authored Deck Plan

The ship keeps the current longitudinal sequence. Local positive `z` points toward the bow.

| Zone | Bounds | Purpose |
| --- | --- | --- |
| Crew cabin | `x = -4.6..4.6`, `z = 5.0..12.4` | Player start and provisions |
| Wheelhouse | `x = -4.6..4.6`, `z = 13.4..17.2` | Navigation gear |
| Cargo deck | `x = -7.6..7.6`, `z = -21.6..21.6` with rounded ends | Open circulation and deck gear |
| Storage workroom | `x = -4.7..4.7`, `z = -13.4..-8.0` | Workshop supplies |
| Lifeboat station | `x = 5.0..7.6`, `z = -1.8..1.8` | Drop-off and evacuation |

The cargo polygon will use these plan points before the room and lifeboat exclusions: `[-7.6, -17.4]`, `[-5.37, -20.37]`, `[0, -21.6]`, `[5.37, -20.37]`, `[7.6, -17.4]`, `[7.6, 17.4]`, `[5.37, 20.37]`, `[0, 21.6]`, `[-5.37, 20.37]`, and `[-7.6, 17.4]`.

The machinery closure will occupy `x = -3.2..3.2`, `z = -18.0..-14.4`. The door catalog will use these centres and widths:

| Door | Centre | Width |
| --- | --- | ---: |
| Cabin port | `[-4.6, 7.4]` | 2.4 m |
| Cabin starboard | `[4.6, 7.4]` | 2.4 m |
| Wheelhouse aft | `[0, 13.4]` | 2.4 m |
| Wheelhouse port | `[-4.6, 15.2]` | 2.2 m |
| Workroom port | `[-4.7, -10.6]` | 2.4 m |
| Workroom starboard | `[4.7, -10.6]` | 2.4 m |

The rail inner face will move to `x = 7.575`. The lifeboat station will remain at local `z = 0`. The starboard rail opening will grow to 3.6 metres. The evacuation point will move to `[7.1, 3.72, 0]`, and the lifeboat anchor will move to `[10.75, 0.35, 0]`. The evacuation rectangle, station clear centre, rail opening, acceptance path, and water exclusion must align at the same midpoint.

## Traversal

The route design uses a loop instead of a collection of isolated clear rectangles:

- Port and starboard exterior lanes keep at least 2.5 metres of clear width alongside enclosed rooms.
- Open-deck primary lanes keep at least 2.2 metres of clear width.
- The lifeboat cross-deck lane connects both exterior routes at midship.
- Bow and stern cross lanes close the perimeter loop.
- Room centres, door approaches, and item-standing routes keep at least 1.4 metres of secondary clearance.

The two mast bases sit on the centreline. The foremast stands on the bow deck at `[0, 2.22, 19.1]`; the aft mast stands on the cargo deck at `[0, 2.22, -4.8]`. Each base uses a collider no wider than 0.6 metres. Paired 2.2-metre bypass lanes pass the aft mast on port and starboard. The bow route uses the same split around the foremast.

The player starts in the crew cabin near its centre aisle. Both cabin doors lead into the exterior loop. The layout must connect the start, both sides of each door, both mast bypasses, each item standing point, the bow, the stern, and the evacuation target.

## Rooms and Search Furniture

The crew cabin will place two bunks against perimeter walls. A desk, open bookcase, food cabinet, and side cabinet provide eight provision surfaces while leaving the centre aisle clear. Items will not use beds or chairs as surfaces.

The wheelhouse will place the helm desk at the forward wall, the chart table on the port side, and instrument cabinets along the starboard wall. These fixtures provide seven navigation surfaces. The player can walk behind the helm and circle between the aft door, port door, and cabinets.

The storage workroom will place two benches against separate walls and one open shelf in a corner. The benches provide four top surfaces, and the shelf provides four shelf surfaces. These eight surfaces accept workshop items only.

The cargo deck will use four searchable crates, two low cargo racks, and one rod rack. The crate tops and rack sections provide nine deck-gear surfaces. Barrels, rope coils, beds, rounded fittings, and decorative cargo straps will not accept items.

The layout will contain exactly thirty-two unique physical item slots:

| Category | Slots | Spawned items |
| --- | ---: | ---: |
| Provisions | 8 | 6 |
| Navigation | 7 | 5 |
| Workshop | 8 | 4 |
| Deck gear | 9 | 7 |

Each surface will keep one category. This rule keeps each item group in its assigned room or deck area. `assignShipItems` will retain its injected random stream, compatibility checks, unique-slot rule, and backtracking search.

Each surface must have a reachable standing point, a clear eye-to-item ray, enough clearance for the full-size model, and a natural presentation height. The placement system may scale an item under the existing rules, but production seeds must place all items without fallback surfaces. Long and heavy gear will use low crates or racks. Small objects will use desks, cabinets, and shelves.

## Auxiliary Rigging

The foremast and aft mast will use code-native geometry. The foremast rises 8 metres above the deck and supports a triangular stay sail that extends toward the bow. The aft mast rises 7.2 metres above the deck and supports a compact fore-and-aft sail on a boom. The fore sail will cover no more than 14 square metres, and the aft sail will cover no more than 12 square metres. Weathered tan cloth, standing rigging, a small pulley set, and attachment fittings complete each rig. The exhaust stacks and powered hull will remain the dominant silhouette.

Ropes, stays, pulley lines, and sail cloth will not collide with the player. The mast bases will provide the only rigging colliders. Sail cloth will stay above local `y = 5.2`, clear every room volume, and remain within `x = -2.4..2.4`. The title camera will frame both mast tops without letting either sail cover the wheelhouse or exhaust stacks.

`ShipRigging` will update the sails through preallocated transforms. The motion will use time and fixed phase offsets rather than randomness. `prefers-reduced-motion` will hold the sail meshes at their neutral transforms. Rigging motion will follow the ship root, while the shared wave field will remain the source for freighter buoyancy and vessel motion.

## Deck Details and Obstacles

The enlarged deck will add these code-native details:

- procedural barrels with metal bands;
- rope coils, cleats, and mooring bollards;
- lamps, vents, life rings, and a covered hatch;
- spare timber, cargo straps, folded canvas, and toolboxes;
- patched boards, safety markings, and rust accents.

The authored detail catalog will include six barrels, four rope coils, eight bollards, eight cleats, six lamps, four vents, four life rings, one covered hatch, two spare-timber bundles, three toolboxes, and two folded-canvas bundles. The four searchable cargo crates and two searchable cargo racks count as furniture rather than cosmetic details.

Colliding details will fit inside six reserved pockets: port and starboard bow corners, port and starboard stern corners, and port and starboard cargo-deck edges. Each bow or stern pocket will stay between `|x| = 5.0..6.8`. Each cargo pocket will stay between `|x| = 3.0..4.4` and `z = -6.8..3.8`. The mast bypasses, exterior lanes, and cross-deck lanes remain outside these pockets.

Large details will occupy authored pockets near bow and stern corners, beside work-area walls, and around cargo fixtures. Crates, barrels, mast bases, and large fittings will receive colliders. Rope coils, straps, hanging life rings, lamps, and surface trim will remain non-colliding.

The layout will keep colliding detail footprints out of primary lanes, door approaches, item access rectangles, the machinery closure, the lifeboat station, and the evacuation rectangle. Small non-colliding details may sit on walls, rails, or the floor edge when they do not obscure items or prompts.

The implementation will reuse existing ship materials and committed furniture models. It will create the new barrels, rigging, and fittings from Three.js geometry, so this feature will not add a third-party asset pack or production network dependency.

## Module Ownership

`src/world/ShipLayout.ts` will remain the source of truth for dimensions, zones, doors, lanes, furniture, item surfaces, navigation targets, colliding detail footprints, evacuation geometry, and rigging placement.

`src/world/ShipGeometry.ts` will build the hull, deck, room shells, roofs, rails, machinery, structural weathering, shell colliders, arc colliders, and water-exclusion values.

`src/world/ShipFurniture.ts` will build searchable furniture, furniture colliders, and transformed item surfaces. It will not build sails or cosmetic trim.

`src/world/ShipDeckDetails.ts` will build barrels, bollards, cleats, rope coils, hatches, lamps, straps, spare timber, and their declared colliders. The module will own and dispose its generated geometries. It will use shared ship materials without disposing them.

`src/world/ShipRigging.ts` will build both masts, sails, stays, ropes, pulleys, and mast-base colliders. It will own generated geometries and update sail transforms. It will use shared ship materials without disposing them.

`src/world/Ship.ts` will assemble the structural, furniture, detail, and rigging roots. It will combine their colliders, expose the final item surfaces and navigation bounds, forward effect updates to the rigging and existing ship effects, and dispose each build once.

`src/world/World.ts` will update the freighter buoyancy footprint to match the expanded hull. Its existing `reducedMotion` value will reach the ship effect update. The world will keep the current shared wave sampling and smoothing path.

`src/phases/ScavengePhase.ts` will update the title camera position and target so the 44-metre hull and both mast tops fit inside the current desktop composition. The first-person camera, field of view, look cone, and movement controls will retain their contracts.

The expanded freighter will use a 38-by-13-metre buoyancy footprint. The water exclusion will continue to use the full authored hull dimensions and tapered end profile.

## Layout Validation

The layout validator will reject:

- duplicate zone, door, lane, fixture, detail, mast, surface, or physical-slot IDs;
- non-finite or non-positive dimensions;
- fixtures or obstacles outside their assigned zone or deck polygon;
- furniture, mast bases, and colliding details that overlap a primary lane, door approach, evacuation rectangle, or another obstacle;
- room fixture counts or model kinds that violate zone policy;
- surfaces whose ID prefix does not match their owner;
- surfaces without a reachable standing point, sightline, valid owner, or model clearance;
- rigging references to missing masts or attachment points.

Construction will throw on invalid authored data. The runtime will not move a failed fixture or choose an unvalidated fallback position.

## Testing

Tests will cover these contracts before production changes:

- `ShipLayout` declares the exact 16-by-44-metre dimensions, zone bounds, lifeboat alignment, lanes, mast positions, obstacle pockets, and thirty-two physical item slots.
- Navigation analysis reaches the start, both sides of each door, both sides of each mast, all surface standing points, both deck ends, and the evacuation target.
- Clearance analysis reports at least 2.5 metres on exterior lanes, 2.2 metres on open-deck primary lanes, and 1.4 metres on secondary access routes.
- Furniture, detail, and rigging colliders remain disjoint from reserved routes and from each other.
- Ship geometry produces the expanded hull, deck, rails, safe bounds, water exclusion, and tapered end caps.
- Item assignment places all twenty-two catalog instances on unique compatible slots for at least sixty-four deterministic seeds without fallback surfaces or structure intersections.
- Item surfaces retain natural rotations, full-size fit where required, valid contact height, and visible standing points.
- Rigging uses deterministic motion, freezes under reduced motion, creates no frame-loop objects, and disposes owned resources once.
- Ship construction rollback and normal disposal release detail and rigging resources once while preserving shared materials.
- Existing scavenging timer, carry, interaction, sinking, lifeboat, and survival tests retain their contracts.

Run the full asset and application checks after implementation:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

Browser inspection will cover the title silhouette, both exterior loops, each room, both mast bypasses, item visibility, the lifeboat crossing, sail motion, and reduced-motion mode. The reviewer will traverse the ship with keyboard and mouse and confirm that edge clutter does not catch the player.

## Acceptance Criteria

1. The freighter measures 16 by 44 metres and reads as a larger version of the current powered vessel.
2. Two raised auxiliary sails, rigging, deck fittings, barrels, crates, and small workboat details give the ship a denser silhouette and deck surface.
3. Port and starboard loops, room centres, mast bypasses, doors, item surfaces, and the evacuation path meet their clearance targets.
4. The four existing rooms and deck zones retain their purpose and gain more usable space.
5. All twenty-two items occupy natural, reachable placements across thirty-two category-specific slots.
6. The lifeboat, rail opening, drop-off path, and evacuation trigger remain aligned at midship.
7. Shared-wave buoyancy drives the enlarged hull, and reduced-motion mode stops sail movement.
8. Model audit, tests, typecheck, build, and browser inspection pass.
