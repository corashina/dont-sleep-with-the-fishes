# Scavenging Level and Placement Redesign

**Date:** 2026-08-01
**Status:** Approved design, pending written-spec review

## Goal

Make scavenging denser, less predictable, and harder to master within the
existing 60-second limit.

A typical player should save 15 to 17 of the 21 scavenging items. Every
generated layout must include a feasible route that saves all items and reaches
the lifeboat within 60 seconds. The accepted expert route should take 54 to 58
seconds.

## Visual interpretation

The redesigned ship remains darkly comic and melancholic. Clutter should show
human use through crooked bunks, repaired benches, stacked cargo, and worn
work surfaces. It must not read as random obstacle spam.

The work applies the visual guide through:

- authored furniture groups with clear use and purposeful asymmetry;
- item prompts that remain attached to readable world objects;
- physical carry weight that changes movement without new screen panels;
- restrained materials and wear that support the existing print treatment.

The world remains dominant. This work does not add persistent UI.

## Scope

This work includes:

- fixed loop layouts for the crew cabin, wheelhouse, and storage workroom;
- denser, believable clutter on the central cargo deck;
- raised item surfaces at the bow and stern;
- at least 50 valid placement spots across the ship;
- removal of room-category item placement rules;
- regional spread, branch use, weight-distance limits, and route validation;
- carry-based walking and sprinting speed changes;
- deterministic layout, placement, route, movement, and collision tests.

This work does not change the timer, item count, item weight, carry capacity,
deposit rules, room bounds, ladders, lifeboat position, evacuation rules, or
shared wave-field behavior. It does not add the crow's nest to scavenging.

## Fixed ship layout

The ship uses one authored layout. Furniture does not move between runs. Item
selection changes between the authored spots.

Required navigation clearances are:

- 2.2 metres for exterior travel, deposit access, and evacuation routes;
- 1.4 metres for room loops, cross-routes, and item standing access;
- the existing door widths and ladder approach clearances.

Every room must have two connected route choices around its main furniture
islands. A short branch can end at a wall fixture or item surface. No room can
become one forced corridor.

### Crew cabin

Stagger the bunks and desks into two linked loops. Keep cabinets, the bookcase,
and the night stand against plausible walls. Use the central bunks as offset
islands instead of one straight barrier.

The two side doors must connect through both loop directions. Short branches
may end beside the forward bookcase and the aft desk.

### Wheelhouse

Offset the chart tables instead of aligning them. Their placement must create
two routes between the aft and port doors. Keep the crew table and a wall bench
near the starboard side.

The forward corners can form short branches. The helm view, doors, and room
loop must remain clear.

### Storage workroom

Use shelves, work benches, pallets, and crate islands to form linked loops.
Stagger the two central crate groups so they create cross-routes instead of a
solid wall.

Both side doors must reach both loop directions. Short branches may end at a
shelf, work bench, or stacked crate.

### Central cargo deck

Replace the long empty center with functional clutter. Add timber benches
against outer room bulkheads where crew could use them. Add staggered cargo
islands made from crates, barrels, boxes, pallets, and low racks.

Keep two full-length routes and several cross-routes. Preserve direct 2.2-metre
access to the lifeboat, evacuation point, room doors, ladders, deck hatch, mast,
and both end decks.

The new bench uses a constructed timber form with planks, braces, fasteners,
and slight asymmetry. `ShipFurniture` owns its geometry and materials and
disposes them once.

### Bow and stern

Add crates, barrels, and boxes against side rails or outer bulkhead faces.
Every end-deck item must rest on one of these raised props. No item can lie on
the open deck without a reason.

Keep the rounded ends, rail clearance, and primary approach lanes readable.
The crow's nest remains outside the placement pool.

## Placement spot pool

Provide at least 50 unique physical spots:

- at least 10 in the crew cabin;
- at least 8 in the wheelhouse;
- at least 10 in the storage workroom;
- at least 14 across the central cargo deck;
- at least 4 at the bow;
- at least 4 at the stern.

Each spot has one furniture owner, a reachable standing point, a footprint,
clearance height, rotation, and region. Each spot remains collision-free for
every item model it accepts.

Remove the provisions, navigation, workshop, deck-gear, and comfort locks from
assignment. An item can use any spot that fits its measured model bounds. Size,
reach, spread, and weight-distance limits remain valid physical constraints.

Occupied spots must stay at least 1.25 metres apart in the horizontal plane.
This prevents a generated run from clustering several items on one prop.

## Regional spread

Every 21-item run uses these regional counts:

| Region | Item count |
| --- | ---: |
| Crew cabin | 3 to 4 |
| Wheelhouse | 2 to 3 |
| Central cargo deck | 6 to 7 |
| Storage workroom | 3 to 4 |
| Bow | 2 to 3 |
| Stern | 2 to 3 |

The generator selects counts that total exactly 21. It must use four to six
short-branch spots. All other items use main-loop or cross-route spots.

## Carry speed and heavy-item distance

Planar walking and sprinting speed depend on total filled carry circles:

| Carried weight | Speed multiplier |
| ---: | ---: |
| 0 or 1 | 1.00 |
| 2 | 0.92 |
| 3 | 0.84 |

The base walk speed remains 3.8 metres per second. The base sprint speed
remains 6.2 metres per second. Depositing or dropping weight updates speed on
the next movement step.

The multiplier affects planar walking and sprinting only. It does not change
jump, ladder, camera, sinking, or physics rules.

Use shortest navigable route distance from a spot's standing point to the
lifeboat deposit area:

- weight-three items require a route of 14 metres or less;
- weight-two items require a route of 22 metres or less;
- weight-one items have no separate distance limit.

These rules keep the anchor, scuba gear, and other heavy items away from remote
end-deck spots. They do not restore room-category assignment.

## Deterministic generation

`ShipItemPlacement` receives an injected random source. It performs these
steps once during scavenging construction:

1. Select regional counts that total 21.
2. Select four to six branch spots.
3. Build fitting candidates without category locks.
4. Apply item spread and weight-distance limits.
5. Assign every item to a unique physical spot.
6. Build a feasible expert collection route.
7. Accept only layouts with a 54-to-58-second expert route.

Generation tries at most 64 candidates. The same random sequence must produce
the same accepted layout. If no candidate passes, use one checked fallback
layout stored with the placement rules.

## Route model

Add a pure route model that does not depend on Three.js or renderer state. It
uses the authored navigation graph, spot standing points, player speeds, carry
capacity, item weight, deposit position, and evacuation position.

The expert planner returns a concrete route. It accounts for:

- shortest navigable travel between stops;
- the active speed multiplier on each segment;
- carry capacity of three;
- item pickup and bundle deposit actions;
- the final deposit and evacuation movement.

An accepted route must save all 21 items and enter evacuation within 60
seconds. Its estimated completion time must be from 54 through 58 seconds.
This constructive route proves that the layout is technically possible.

A separate deterministic baseline policy follows visible main loops, uses
nearby branches, deposits when full, and avoids long backtracking. It should
save 15 to 17 items within 60 seconds. Manual playtests confirm that this range
matches normal play.

## Architecture and ownership

- `ShipLayout` owns static zones, furniture, loops, regions, and spot data.
- `ShipItemPlacement` owns fitting, spread, weight bands, and seeded selection.
- The pure route model owns travel and timing calculations.
- `ScavengeSession` remains the source of carried weight and item status.
- `ScavengePhase` passes current carried weight into player movement.
- `PlayerController` applies the pure speed multiplier.
- `ShipFurniture` owns the new bench resources.
- `World` constructs item objects from accepted placement transforms.

Gameplay rules remain testable without a renderer. Placement and route work
occur only during phase construction. Per-frame update paths do not create new
arrays, maps, vectors, geometry, materials, or textures for this feature.

## Validation and failure handling

Layout validation rejects:

- blocked doors, ladders, main routes, cross-routes, or evacuation access;
- disconnected room loops or unreachable branch ends;
- furniture, details, item bounds, or standing points that overlap colliders;
- missing furniture owners or duplicate physical spots;
- spots outside their declared region;
- invalid or non-finite clearances, positions, bounds, or route costs;
- end-deck item spots without a raised prop owner.

Placement validation rejects:

- missing regional coverage or a total other than 21;
- fewer than four or more than six branch items;
- occupied spots closer than 1.25 metres;
- items that do not fit their spot;
- heavy items outside their route-distance limit;
- layouts without an accepted expert route.

The checked fallback prevents generation failure from blocking a run. Invalid
static layout data remains a development error and fails fast.

## Verification

Automated checks must cover:

- the exact 60-second timer and 21-item scavenging catalog;
- 50 or more unique, owned, reachable placement spots;
- all room loops, deck routes, branches, and evacuation access;
- the required spot minimum in every region;
- collision-free furniture, details, standing points, and item models;
- category-free assignment across representative item and region pairs;
- regional counts, branch counts, separation, and heavy-item limits;
- deterministic output from repeated random sequences;
- accepted expert routes between 54 and 58 seconds;
- baseline routes that save 15 to 17 items;
- fallback use after 64 rejected candidates;
- movement multipliers for zero through three carried circles;
- immediate speed recalculation after deposit or drop;
- unchanged jump and ladder behavior;
- resource ownership and idempotent disposal.

Run property tests across at least 1,000 deterministic seeds. Run focused
layout, placement, route, session, player, physics, and world tests. Then run
the full Vitest suite, TypeScript check, and production build.

Inspect active scavenging at normal desktop play distance. Confirm that:

- furniture reads as purposeful room and deck equipment;
- every item rests on a believable surface;
- items remain visible when the player enters their route or branch;
- the loops feel dense without snagging normal movement;
- doors, ladders, and the lifeboat remain easy to identify;
- typical play saves 15 to 17 items;
- an optimized run can save all items and evacuate before the deadline.

## Acceptance criteria

The redesign is complete when:

- each room has fixed loops and short item branches;
- the central deck feels used and cluttered without losing connected routes;
- bow and stern items appear only on raised, wall-side props;
- item placement no longer follows semantic room categories;
- every run spreads items across all required regions;
- heavy items stay close enough for their loaded return speed;
- filled carry circles apply the approved speed multipliers;
- every accepted layout has a concrete sub-60-second all-item route;
- typical players save 15 to 17 items;
- all automated and visual checks pass.
