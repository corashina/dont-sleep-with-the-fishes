# Sparse Perimeter Deck Decorations

## Goal

Reduce visual clutter on the scavenging freighter while keeping the remaining decoration counts. Place decorations in separate perimeter pockets near corners, walls, and rails. Preserve all player routes and searchable item access.

## Scope

Remove these decoration types from the authored layout and procedural geometry:

- toolbox
- bollard
- cleat
- lamp
- vent
- covered hatch
- folded canvas

Keep this exact catalog:

| Type | Count | Collision |
| --- | ---: | --- |
| Barrel | 6 | Yes |
| Rope coil | 4 | No |
| Life ring | 4 | No |
| Spare timber | 2 | Yes |

The resulting catalog contains 16 decorations and 8 decoration colliders. This change does not alter furniture, item slots, rigging, hull geometry, player movement, interaction rules, the lifeboat, or either game phase.

## Placement

Use a natural, asymmetric arrangement. Each decoration occupies its own perimeter pocket. Keep a minimum one-metre edge-to-edge gap between declared visual footprints.

The approved local deck positions are:

| ID | Position `[x, y, z]` | Placement intent |
| --- | --- | --- |
| `barrel-1` | `[-6.0, 2.22, 18.2]` | Bow port corner |
| `barrel-2` | `[6.0, 2.22, 18.2]` | Bow starboard corner |
| `barrel-3` | `[-6.0, 2.22, -18.2]` | Stern port corner |
| `barrel-4` | `[6.0, 2.22, -18.2]` | Stern starboard corner |
| `barrel-5` | `[-1.8, 2.22, 4.4]` | Crew-cabin aft wall |
| `barrel-6` | `[1.9, 2.22, -7.3]` | Workroom forward wall |
| `ropeCoil-1` | `[-6.85, 2.22, 13.0]` | Port wall and rail edge |
| `ropeCoil-2` | `[6.85, 2.22, 10.1]` | Starboard wall and rail edge |
| `ropeCoil-3` | `[-6.85, 2.22, -9.0]` | Port workroom wall edge |
| `ropeCoil-4` | `[6.85, 2.22, -12.9]` | Starboard aft wall edge |
| `lifeRing-1` | `[-7.2, 2.22, 9.5]` | Port rail beside the cabin |
| `lifeRing-2` | `[7.2, 2.22, 14.0]` | Starboard rail beside the wheelhouse |
| `lifeRing-3` | `[-7.2, 2.22, -13.8]` | Port aft rail |
| `lifeRing-4` | `[7.2, 2.22, -7.0]` | Starboard rail beside the workroom |
| `spareTimber-1` | `[2.8, 2.22, 12.8]` | Cabin and wheelhouse wall corner |
| `spareTimber-2` | `[-2.8, 2.22, -13.9]` | Workroom aft wall corner |

These coordinates pass the current hull, lane, door, machinery, furniture, item-access, evacuation, and navigation checks. Their closest pair of visual footprints has more than 2.7 metres of clearance, which exceeds the one-metre requirement.

## Code Changes

`src/world/ShipLayout.ts` will:

- reduce `ShipDeckDetailKind` to `barrel`, `ropeCoil`, `lifeRing`, and `spareTimber`;
- reduce the count and visual-size records to those four keys;
- replace the current position catalog with the approved coordinates;
- keep colliders for barrels and spare timber;
- remove toolbox rotation data;
- validate a one-metre gap between decoration visual footprints.

`src/world/ShipDeckDetails.ts` will remove the seven unused geometry builders and switch cases. It will keep shared box, cylinder, and torus geometry for the remaining types. The owner will continue to dispose each generated geometry once and leave shared ship materials to `ShipMaterials`.

## Validation

`validateShipLayout` will reject decoration pairs whose visual footprints have less than one metre of edge-to-edge separation. The calculation will use the rotated, scaled `visualSize` rectangles that already protect furniture and item-access areas. Error messages will name both decoration IDs.

Existing rules remain in force:

- decoration centres and collider corners stay inside the cargo-deck polygon;
- collidable decorations stay outside primary lanes, doors, machinery, furniture, evacuation space, and other obstacles;
- all visual footprints stay clear of searchable furniture and standing-point access rectangles;
- navigation reaches all required targets.

## Tests

Update tests to prove:

- the kind union and procedural builder expose only the four retained types;
- the catalog has exactly 16 decorations with counts `6/4/4/2`;
- the approved coordinates remain unchanged;
- removed detail IDs and primitive parts do not appear in the scene;
- the generated scene has exactly 8 decoration colliders;
- each declared visual footprint covers its generated mesh;
- a mutated pair with less than one metre of separation fails with both IDs;
- the production layout passes the spacing validator and navigation analysis;
- construction rollback and idempotent disposal still pass;
- collision and world integration tests use the reduced collider count.

Run `bun run test`, `bun run typecheck`, `bun run build`, and `git diff --check`. Inspect the scavenging phase in the browser to confirm the deck reads as sparse, each remaining object sits near a wall or corner, and no object interferes with movement or item prompts.

## Acceptance Criteria

1. Toolboxes, bollards, cleats, deck lamps, vents, the covered hatch, and folded-canvas bundles no longer exist as supported layout types, authored instances, or generated meshes.
2. Six barrels, four rope coils, four life rings, and two spare-timber stacks remain.
3. The 16 decorations use the approved positions and preserve at least one metre between visual footprints.
4. Eight decoration colliders remain, all belonging to barrels or spare timber.
5. Player routes, item access, evacuation, and phase behavior remain unchanged.
6. Automated verification and browser inspection pass.
