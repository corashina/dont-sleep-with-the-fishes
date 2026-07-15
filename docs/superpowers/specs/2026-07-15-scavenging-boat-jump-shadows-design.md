# Scavenging Boat Distance, Low-Object Landing, and Shadow Coverage Design

## Goal

Improve three parts of the scavenging phase:

- leave a visible water gap between the freighter and lifeboat while keeping the boat within normal throwing range;
- let the player jump onto and stand on low objects up to 0.6 units above the deck;
- give the freighter and lifeboat stable shadow coverage from one directional light.

The survival phase keeps its current boat position, movement, and lighting.

## Lifeboat Position

Move the scavenging lifeboat anchor from X `7.6` to X `9.0`. Keep Y `0.35` and Z `-6.5`.

The freighter reaches X `6.0`, and the lifeboat extends about 1.6 units from its center. The new anchor leaves about 1.4 units of visible water between the hulls. The evacuation point stays at `[5.4, 3.72, -6.5]`, so the player throws supplies across the gap from the existing rail opening. The current throw speed of `7.5` covers this distance.

`ShipBuild.lifeboatAnchor` remains the source for the World position and buoyancy sample point. Ocean exclusion and the acceptance box continue to use the lifeboat's world transform, so they follow the new anchor without duplicate coordinates.

## Low-Object Landing

Space keeps its current jump behavior. The player gains support detection for collider tops no more than `0.6` units above the deck.

The controller treats the player's local Y coordinate as eye height. The player's feet remain `PLAYER_BODY_HEIGHT` below that point. During a downward movement, the collision system checks whether the feet cross the top of a low collider while the player's horizontal body circle overlaps its footprint. A valid crossing snaps the eye height to the collider top plus `PLAYER_BODY_HEIGHT` and clears downward velocity.

The player can remain on the support while their horizontal body circle overlaps it. Stepping beyond the footprint removes that support and gravity returns the player to deck height. The controller does not auto-step onto objects. Furniture taller than `0.6` units above the deck continues to block horizontal movement.

The collision system chooses the highest valid support crossed during a frame. It rejects a landing that would place the player's body inside another collider. Deck height remains the fallback support.

## Shadow Coverage

The scavenging `Environment` keeps one shadow-casting directional light and configures its orthographic shadow camera for the full freighter, the moved lifeboat, and their vertical motion. A fixed frustum prevents coverage from changing as the player walks.

Use a `2048 x 2048` shadow map with `PCFSoftShadowMap`. Export a scavenging shadow configuration with camera bounds `left=-24`, `right=24`, `top=24`, `bottom=-24`, `near=0.5`, and `far=80`; set `bias=-0.0005` and `normalBias=0.03`. These bounds contain the ship extents, lifeboat extents at X `9.0`, and the highest ship geometry throughout the sinking animation.

Ship geometry, furniture, collectible models, and lifeboat meshes keep casting and receiving shadows. The ocean continues receiving shadows. The change does not add another light or another shadow map.

## Data Flow and Ownership

`Ship.ts` publishes the new lifeboat anchor. `World.ts` copies it into the lifeboat position and passes it to buoyancy through the existing `boatAnchor` path.

`PlayerController` owns jump velocity and current support height. The collision module owns geometric support queries and horizontal blocking. Neither component reads scene meshes; both use the existing collision-box contract.

`Environment` owns the scavenging directional light and its shadow resources. `Game` continues enabling renderer shadows and selecting `PCFSoftShadowMap`.

## Tests

World and ship tests will assert the X `9.0` anchor, the unchanged evacuation point, buoyancy sampling at the new anchor, and a normal throw trajectory entering the lifeboat acceptance box.

Collision and controller tests will cover:

- landing on a `0.6`-unit support while descending;
- remaining supported while standing;
- falling back to deck height after stepping off;
- horizontal blocking by furniture taller than `0.6` units;
- choosing the highest valid support and rejecting an obstructed landing.

Environment tests will inspect the directional light and assert the shadow-map size, camera planes, bias values, and coverage of the freighter and lifeboat bounds. Existing mesh tests will continue checking `castShadow` and `receiveShadow` on geometry, furniture, props, and the lifeboat.

After focused tests pass, run `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build` as separate commands.

## Scope

This change affects the scavenging lifeboat anchor, scavenging player collision support, and scavenging shadow configuration. It does not change item counts, carrying capacity, throw speed, evacuation timing, survival behavior, ship layout, furniture placement, or the sinking sequence.
