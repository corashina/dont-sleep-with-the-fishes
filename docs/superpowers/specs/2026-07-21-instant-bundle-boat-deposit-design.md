# Instant Bundle Boat Deposit Design

## Goal

Replace item throwing at the scavenging lifeboat with one-click bundle deposits. A click on the lifeboat or the ship deck at the lifeboat station saves all carried items and plays a short smoke confirmation.

## Scope

This change affects the scavenging phase interaction, carry state, session state, and world effects. It keeps the three-unit carry capacity, item pickup order, ordinary deck drops, evacuation rules, boat storage transforms, survival handoff, and two-minute timer.

The deposit zone covers the authored `lifeboatStation` deck area at local `x = 3.8..6` and `z = -1.6..1.6`. The lifeboat remains a deposit target. The player must aim at either target and press the existing primary interaction control.

## Interaction Contract

`InteractionSystem` will return one deposit target for the lifeboat and the station deck. The context action will use a deposit name and a prompt that states that the player will store the carried supplies. Item targeting keeps precedence for available ship items that sit inside the station area.

One deposit action transfers the full carried bundle. The session marks each carried instance as saved, increments the saved count for each instance, clears carried weight, and preserves the pickup order in the returned bundle. `CarryController` releases the matching object references without starting a flight. `World` moves each object to its existing type-aware boat storage transform.

The operation checks session state before changing visual state. If the session rejects the deposit, the controller keeps its carried objects and the world shows no smoke. A successful deposit updates session state, carried objects, storage objects, and confirmation effect within the same input frame.

Ordinary drops keep the current short flight, deck landing, and water-loss behavior. The deposit path removes the normal throw, lifeboat collision test, flight lock, and repeated per-item clicks.

## Deposit Target

`World` will own a raycast-only mesh that follows the sinking ship. Its bounds match the authored lifeboat station, and its shallow height covers the visible deck surface. The mesh will render no color or depth and will carry a deposit-target tag. `InteractionSystem` will raycast available items before the deposit surfaces so an item under the crosshair remains selectable.

`World` will create and dispose the target geometry and material. The lifeboat keeps its current visible highlight. The invisible deck target will not add a highlight mesh or alter the deck material.

## Smoke Confirmation

A focused `BoatDepositSmoke` component will own a small particle buffer, material, and point object under the lifeboat root. A successful bundle deposit restarts one short puff above the boat storage area. Fixed particle offsets and velocities keep the effect deterministic and avoid per-frame allocations.

The effect will expand, rise, fade, and stop within one second. Another deposit during the effect restarts the same particle buffer. Reduced-motion mode will keep the particles near their origin and fade them without vertical motion. The component will hide inactive particles and dispose its geometry and material once when `World` disposes.

## Ownership and Data Flow

1. `InteractionSystem` resolves an available item, the lifeboat, or the station deposit mesh.
2. `chooseContextAction` converts either deposit surface into one bundle-deposit action when the player carries supplies.
3. `ScavengePhase` asks `ScavengeSession` to save the full bundle.
4. After session acceptance, `CarryController` clears the matching carried objects and `World` stores each accepted instance.
5. `World` starts one smoke puff and updates it from the scavenging world frame.

`ScavengeSession` owns item status and counts. `CarryController` owns camera-attached carried objects and flight state. `World` owns deposit targets, stored item transforms, smoke resources, and their cleanup. `ScavengePhase` coordinates the transaction.

## Testing

Focused tests will cover:

- lifeboat and station-deck rays resolving to the same deposit target;
- available item targeting taking precedence over the station mesh;
- one deposit saving every carried instance and clearing carried weight;
- session rejection leaving carried objects unchanged;
- controller bundle release without flight state;
- ordinary drops retaining flight, landing, and loss behavior;
- one smoke trigger per accepted bundle, deterministic particle updates, reduced-motion behavior, restart behavior, and exact-once resource disposal;
- scavenging world ownership and disposal of the deck target and smoke resources.

The final verification will run `bun run test`, `bun run typecheck`, and `bun run build`. Browser inspection will test the lifeboat and station deck from several aim points, a three-item bundle, an ordinary deck drop, smoke on the moving boat, and reduced-motion presentation.

## Acceptance Criteria

1. Clicking the scavenging lifeboat with carried supplies saves the full carried bundle in one frame.
2. Clicking the lifeboat-station deck with carried supplies performs the same deposit.
3. Deposited items use their current stable boat storage slots.
4. A successful deposit produces one short smoke confirmation on the lifeboat.
5. Reduced-motion mode shows a stationary fading confirmation.
6. The deposit path starts no item flight and cannot lose a deposited item to water or deck collision.
7. Clicking away from the deposit targets keeps the current drop behavior.
8. Picking up items, carry capacity, evacuation, timer behavior, and survival handoff remain unchanged.
9. New Three.js resources have one owner and dispose once.
