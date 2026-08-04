# Event Item Pickup and Stow Design

## Goal

Improve survival event item motion.

Items must lift from their real boat position. They must settle below the camera in a believable held pose.

Directional items must face the event entity. Reusable items must stay off the shelf until dawn.

This design refines the existing event item animation design. Its pickup, aim, outcome, and shelf lifecycle rules take priority.

## Approved Decisions

- Do not show first-person hands.
- Use shared staged choreography.
- Give each item class an authored lower-camera hold zone.
- Aim only directional items at event entities.
- Assume one night event occurs before dawn.
- Keep reusable items off the shelf after use.
- Restore valid shelf items during the dawn transition.
- Keep item gameplay rules unchanged.
- Do not add reduced-motion behavior.

## Motion Structure

The shared choreography samples six stages:

1. Anticipate: dip and tilt the item slightly at its stored position.
2. Lift: follow a curved path toward the camera hold zone.
3. Ready: settle with a small overshoot and an imperfect correction.
4. Act: perform the item-specific action.
5. Recover: return reusable items to the ready pose.
6. Stow: slide reusable items below the camera and hide them.

The event result separates the use sequence from recovery.

Item use ends in a short held pose. The outcome sequence continues from the same pose after game resolution.

This split prevents an item from returning before its outcome is known.

## Held Placement

Use authored placement groups instead of one camera point.

- One-hand tools use a lower-right zone.
- Large or two-hand tools use a lower-center zone.
- Reading and navigation tools use a center-low zone.

Each item can add a small position and rotation offset. These offsets preserve its silhouette and apparent weight.

Keep the model at its authored size. Do not shrink it to solve camera clipping.

The near plane and hold depth must keep the item clear of the player view.

## Pickup Path

Start from the borrowed actor's current stored transform.

Use a curved path with a low first control point. This makes the object clear the shelf before approaching the camera.

Blend rotation separately from position. Delay final grip alignment until the object has cleared nearby boat props.

Use mass-based timing groups for light, medium, and heavy items. Keep each group deterministic.

## Directional Aim

Directional items include the flashlight, harpoon gun, flare gun, net, and thrown objects.

Each directional item defines:

- Its model forward axis.
- Its camera hold zone.
- Its readable grip rotation.
- Its action origin, such as a muzzle or lens.

Each supported event exposes one world-space aim anchor on its main entity.

The adapter aligns the item forward axis with the direction from its action origin to the anchor.

Blend toward the solved aim quaternion. Preserve the authored grip roll and avoid sudden rotation changes.

Update moving aim anchors each frame. Reuse vectors, matrices, and quaternions in the update path.

Maps, compasses, tape, buckets, anchors, and umbrellas keep action-specific poses. They do not use automatic aim.

## Outcome Motion

Reusable items return from their action pose to their ready pose. They then slide below view at a slow, weighted speed.

Broken items can show their event reaction first. They then use the same downward stow motion.

Thrown or lost objects continue toward the event anchor. They disappear after impact or after leaving the visible frame.

Projectile tools keep the held tool. Only the projectile leaves the tool and follows its effect path.

Consumable stock uses the resolved inventory quantity at dawn. The action object can disappear before that inventory sync.

## Shelf Lifecycle

The supply display owns a set of item instances hidden until dawn.

Borrowing an actor removes its shelf representation without creating a duplicate.

After stowing, release the borrowed actor once. Keep the related shelf instance hidden through event cleanup.

Do not restore hidden shelf instances when the night event clears.

At dawn, clear the hidden set while the screen cover remains closed. Then sync the resolved inventory state.

The player sees the restored shelf only after the day reveal.

Inventory state controls the result:

- Usable items return normally.
- Broken items return with their broken presentation.
- Lost items do not return.
- Consumable groups show their resolved quantity.

For a day event, hide the item until that event closes. Restore it when the normal day view returns.

## Architecture and Ownership

`eventItemUseChoreography` remains a pure deterministic sampler.

`EventItemUseAdapter` converts sampled poses into actor transforms. It also solves directional aim.

The adapter owns all temporary math objects. It does not own event entities or borrowed supply actors.

Each event presentation owns its aim anchor and keeps it attached to the correct entity.

`BoatSupplyDisplay` owns borrowed actors, hidden shelf state, and shelf restoration.

`BoatWorld` coordinates item use, result motion, event cleanup, and dawn release.

Keep one borrowed actor across item use and outcome motion. Release it once after departure or stowing.

## Cancellation and Failure

Visibility changes settle the active sequence through one cleanup path.

Cancellation resolves pending promises. It restores camera yaw, pitch, and field of view.

Cancellation must not reveal a night-stowed shelf item before dawn.

Disposal releases every borrowed actor once. It also clears transient item effects and camera state.

A directional animation keeps its last valid aim when an anchor becomes unavailable.

Tests must require an aim anchor for every directional event choice. Missing coverage is a development error.

Presentation failure must not change event results, inventory, resources, or timing rules.

## Performance

Do not allocate objects during update or render loops.

Create item metadata, temporary math objects, and effect resources during setup.

Keep sampling deterministic. Pass target state as input instead of reading hidden global state.

## Tests

Pure choreography tests verify:

- Pickup begins at the stored pose.
- Stage boundaries remain continuous.
- Held items remain below camera center.
- Item scale stays authored.
- Reusable items return to ready before stowing.
- Stowed items finish below the visible frame.
- Sampling is deterministic.

Aim tests verify each directional forward axis points toward its event anchor.

Lifecycle tests verify:

- Pickup removes the shelf model.
- Event cleanup keeps the used shelf item hidden.
- Dawn restores only valid inventory items.
- Broken items do not return as usable.
- Lost items never return.
- Cancellation and visibility changes release actors once.

Scene checks cover wide and narrow view ratios. They also check near-camera clipping and readable item silhouettes.

Run focused tests, the full test suite, typecheck, and the production build before completion.

## Scope

This work changes survival event item presentation and shelf visibility only.

It does not add player hands. It does not change event selection, item balance, inventory rules, or event outcomes.
