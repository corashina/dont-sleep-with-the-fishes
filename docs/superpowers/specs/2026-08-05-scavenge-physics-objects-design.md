# Scavenge Physics Objects Design

Date: 2026-08-05

## Goal

Expand scavenging physics from two barrels to seven distinct obstacles.

Keep every physics visual hidden on the title screen. Reveal them after the player clicks Start.

Place the objects in useful route obstructions. Let player contact push them with low force.

## Scope

The run contains these physics objects:

1. One existing barrel.
2. [Pumpkin](https://poly.pizza/m/bvLvqnU1jX).
3. [Propane Tank](https://poly.pizza/m/3revwBHxDC).
4. [Can Red](https://poly.pizza/m/IuoYedcdXQ).
5. [Box by Kay Lousberg](https://poly.pizza/m/ykZ23x9d6p).
6. [Box by Kenney](https://poly.pizza/m/HvjissDrdr).
7. [Package](https://poly.pizza/m/mWkgWyrCfM).

Remove one current physics barrel. Remove all three static Kay box details from the ship.

The Kay box appears once as a physics object.

## Architecture

Replace barrel-specific physics records with generic physics-object records.

Each object record defines:

- Runtime ID.
- Model ID.
- Collider shape and size.
- Visual base offset.
- Mass.
- Friction.
- Restitution.
- Linear damping.
- Angular damping.

`World` owns the seven visual groups. `ScavengePhysics` owns their Rapier bodies and pose records.

The ship-furniture asset library supplies the existing barrel and Kay box. Extend it with the five new models.

Use a separate physics-object catalog for physics settings. Do not place physics settings in the ship layout.

Use a separate placement module for candidate positions and run selection.

Rename barrel-only fields and methods to physics-object names. Remove obsolete barrel paths.

## Player Contact

Keep the current player movement, jump, ladder, and static collision code.

Add a kinematic Rapier capsule for dynamic-object contact. Use Rapier's character controller.

Pass the player's intended planar movement to Rapier after static ship collision resolution.

The character controller returns corrected movement. Apply it to the player before the final camera placement.

Enable impulses on dynamic bodies. Use a virtual character mass of 6 kg.

Walking produces a soft push. Sprinting produces a stronger push through its larger movement delta.

Keep the virtual mass low. Do not add a separate high-force impulse.

Filter the Rapier character controller to the seven dynamic object colliders. Existing code continues to handle ship structure.

## Physics Profiles

| Object | Collider | Mass | Friction | Restitution | Linear damping | Angular damping |
|---|---|---:|---:|---:|---:|---:|
| Existing barrel | Cylinder | 36 kg | 0.30 | 0.03 | 0.08 | 0.06 |
| Pumpkin | Sphere | 8 kg | 0.22 | 0.08 | 0.06 | 0.025 |
| Propane tank | Cylinder | 30 kg | 0.34 | 0.025 | 0.10 | 0.08 |
| Red can | Cylinder | 16 kg | 0.40 | 0.04 | 0.14 | 0.12 |
| Kay box | Cuboid | 7 kg | 0.62 | 0.015 | 0.26 | 0.32 |
| Kenney box | Cuboid | 10 kg | 0.56 | 0.02 | 0.22 | 0.28 |
| Package | Cuboid | 5 kg | 0.68 | 0.01 | 0.30 | 0.38 |

Use each normalized model bound to derive its collider size. Apply a small inset to prevent visible separation.

Use the average friction combine rule. This keeps each object distinct against the deck's friction.

Spawn cylinders upright. Spawn cuboids upright with authored yaw. The pumpkin needs no fixed yaw.

## Placement Pool

Define 14 candidate positions:

- Four doorway positions: both cabin side doors, the wheelhouse aft door, and the wheelhouse port door.
- Four exterior-lane positions: port and starboard beside the cabin, plus port and starboard beside storage.
- Four central-deck positions: port and starboard, both forward and aft of the deck hatch.
- Two storage-room positions: port and starboard of the room's center aisle.

Each new run selects:

- Two doorway positions.
- Two exterior-lane positions.
- Two central-deck positions.
- One storage-room position.

Shuffle the seven objects across the seven selected positions.

Center doorway objects so the player cannot pass without moving them. Leave enough relief space for each object to move.

Candidate positions must avoid:

- Initial object overlap.
- Static colliders.
- The player start.
- The intro route.
- Ladders.
- The lifeboat station.
- The evacuation area.

Use the random function already supplied to `World`. Tests can inject a seeded function.

## Visibility and Lifecycle

Create object visuals during world construction. Create bodies when physics is enabled.

Start visual groups and debug meshes hidden.

When the player clicks Start, reveal all object visuals and physics debug meshes. Keep the reveal operation idempotent.

Objects remain still during the intro. Start simulation when active scavenging begins.

During active play:

1. The player controller computes intended movement.
2. Rapier corrects movement against physics objects.
3. Rapier applies low contact impulses.
4. The fixed-step world advances.
5. `World` copies physics poses into the visual groups.

Reuse pose, vector, and quaternion storage. Do not allocate objects in update paths.

On scavenging failure, attach all physics visuals to the ship. Freeze them for the sinking scene.

On restart, dispose the old bodies and visuals. Build new state and select new positions.

Physics-off mode uses the same hidden and revealed visuals. These visuals remain static after reveal.

## Assets and Attribution

All six requested Poly Pizza pages identify their models as CC0.

Reuse the pinned Kay box asset. Add pinned source records for the five new assets.

For each new source, record:

- Public model ID.
- Poly Pizza resource ID.
- Creator.
- License.
- Source triangle count.
- Source SHA-256.
- Download date.

Use the existing ship-model fetch, validation, normalization, and publication process.

Update the committed model list, aggregate triangle limit, manifest bounds, source script, fetch script, checks, and attribution ledger.

Do not create fallback geometry. A missing or invalid required model stops launch through the current asset error screen.

## Validation and Recovery

Validate the position pool during development and tests.

Reject duplicate IDs, duplicate positions, invalid categories, unsafe clearances, and static overlap.

The selector must return seven unique positions with the required category counts.

If an object pose becomes invalid or leaves the safe ship bounds, return it to its selected run position.

Reset its linear and angular velocity during recovery.

## Tests

Add or update tests for these requirements:

- The catalog contains seven unique objects.
- The world contains one barrel.
- The world contains one Kay box.
- No static Kay box detail remains.
- Object visuals remain hidden on the title screen.
- Physics debug meshes remain hidden on the title screen.
- Clicking Start reveals visuals and debug meshes.
- The selector uses two door, two exterior, two center, and one storage position.
- The position pool contains 14 unique candidates.
- Seeded selection is deterministic.
- Different run seeds can select different positions and assignments.
- No selected spawn overlaps a static collider or protected area.
- Player contact blocks passage until the object moves.
- Walking contact pushes softly.
- Sprint contact pushes farther than walking contact.
- Movement without contact does not push an object.
- Each collider uses its specified shape and physics profile.
- Invalid poses recover at the selected run position.
- Restart creates fresh physics state and a new selection.
- Disposal removes physics bodies, visuals, and debug resources.
- Physics-off mode reveals static visuals after Start.

Run focused physics, layout, lifecycle, model, and world tests. Then run the full test, typecheck, build, and model-check commands.

## Success Criteria

The title screen shows no physics objects or debug physics meshes.

Clicking Start reveals seven distinct physics objects. The intro shows them without simulation.

Active play lets contact push each object. Sprinting pushes more than walking.

Two objects fully obstruct selected doorways. One object appears inside storage.

Every restart uses a valid new selection from a pool larger than the object set.

The ship contains no static Kay box and only one physics Kay box.
