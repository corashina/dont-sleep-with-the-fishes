# Narrower Scavenging Boat Design

## Goal

Reduce the side walkway gaps by about 50%.

Keep all enclosed rooms and their contents unchanged.

## Dimensions

Reduce the freighter width from 20 to 16.25 units.

Keep the freighter length at 55 units.

Move each rail inner face from 9.75 to 7.875 units from the center.

The cabin and workroom gaps become 2.125 units. This is a 46.875% reduction.

The wheelhouse gaps become 2.375 units. This is a 44.1% reduction.

## Layout

Keep each room wall, door, roof, ladder, fixture, and decoration in its current position.

Move the hull, deck edge, rails, outer cargo bounds, and side route bounds inward.

Keep the side route width at 1.4 units. Mark these routes as secondary access routes.

Move the lifeboat station inward. Keep its current width, length, and rail opening.

Move the evacuation target and bounds with the lifeboat station.

Move only deck details that cross the new hull or route bounds.

## Visual Result

The narrower beam gives the freighter a denser working-ship silhouette.

The rooms remain authored focal forms. The smaller gaps remove unused deck space.

The length, vertical scale, materials, lighting, motion, and print treatment remain unchanged.

## Ownership and Data Flow

`ShipLayout` remains the source of truth for dimensions, zones, routes, rails, and targets.

`ShipGeometry` derives the hull, deck, floors, rail geometry, and collision from that layout.

`Ship` derives the lifeboat anchor from the new freighter width.

Gameplay reads the updated evacuation zone through the existing world interface.

No renderer rule or random source changes.

## Validation

Keep the 1.4-unit secondary access minimum.

Keep all door approaches, evacuation access, and navigation targets reachable.

Reject details, fixtures, or routes that cross the new hull bounds.

Keep rail collision and the starboard opening aligned with visible geometry.

## Tests

Update layout tests for the new width, rail faces, routes, cargo bounds, and evacuation zone.

Update geometry tests for the narrower hull, deck, floors, rails, and lifeboat station.

Run layout, geometry, collision, navigation, world, and scavenging tests.

Inspect the scavenging start view and active traversal at normal play distance.

Confirm both side gaps feel about half as wide without blocking the player.
