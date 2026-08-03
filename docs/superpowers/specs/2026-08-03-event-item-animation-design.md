# Event Item Animation Design

## Goal

Add correct item animations to survival events.

Each item must first lift from its place. It must then move toward the player.
The animation must show a clear pickup before item use.

The player camera must stay in one position. It can change yaw, pitch, and field
of view. Player hands must never appear during survival animations.

## Visual Direction

Use tactile keyed motion. Start with anticipation. Use decisive travel, a short
hold, and a clean final pose. Keep overshoot small. Show weight through timing.

Keep the scene dominant. Add screen treatment only when the item requires it.
Use authored effect shapes. Do not use basic placeholders as final effects.

## Architecture

Use a hybrid animation system.

Add a pure choreography module. It samples item pose, camera look, field of
view, and effect cues from normalized progress. Keep this module deterministic.
Do not allocate objects during a frame update.

Add one presentation owner for shared transient effects. It owns flare meshes,
lights, beams, smoke, the thrown net, projectiles, and the binocular mask. It
creates each resource once. It disposes each resource once.

Reuse the current borrowed supply actor. Do not clone an inventory item for
normal item motion.

Each event provides a target anchor and a context type. Existing event classes
keep their reveal, entity motion, and outcome reaction. The shared presentation
owns only the item-use sequence.

Route event item use through the shared system. Keep the current event-specific
item animator as a fallback while the new coverage is added.

## Item Context

An item-use request contains these values:

- Event ID.
- Choice ID.
- Item type and item instance ID.
- Target anchor or target direction.
- Context type.

Supported context types include entity attack, entity offer, water retrieval,
weather cover, ocean search, sky signal, and overboard drop.

If an event has no target anchor, use a stable direction for that event. A
missing target must not stop the action or change game rules.

## Shared Sequence

Each item follows these stages:

1. Lift from its stored pose.
2. Move toward the player.
3. Hold in a readable first-person pose.
4. Perform the item action.
5. Hold the result briefly.
6. Hand the item actor to the event outcome presentation.

Items with an explicit return rule move back to the held pose before the event
outcome. Thrown items stay near their target. The outcome presentation then
returns, breaks, consumes, or loses the item. Other usable items restore their
stored pose during cleanup.

## Item Behaviors

### Thrown items

Food, Bait, Medkit, Energy Bar, Swim Ring, and Bottled Paper travel toward the
event target. Their arcs use item mass and shape. They do not share one exact
rotation or height curve.

### Duct Tape

Raise the roll near the camera. Unroll tape between two implied grip points.
Stretch the tape, hold tension, and let it settle. Do not show hands. Play the
duct tape sound. Return the item to the held pose.

### Compass

Raise the compass near the camera. Look across several ocean directions. Return
the view to the compass. Return the compass to the held pose. Do not translate
the camera.

### Map

Raise and unfold the map. Hold it in a readable pose. Use small paper movement
and an imperfect settled fold.

### Binoculars

Raise the binoculars toward the view. Narrow the camera field of view. Add two
visible circular lenses with dark outer edges. Look at the event target. Restore
the field of view and return the item to the held pose.

### Fishing Net

Replace the small held net during the throw with a larger rectangular net. Use
a purpose-built mesh with visible knots and an irregular edge. Bend the mesh as
it opens, travels, and settles around the target. Restore or remove it during
cleanup based on the outcome.

### Bucket

Use a scoop motion for fish, flowers, bottles, and other water retrieval. Dip
the bucket below the rail and raise it with a heavy arc.

For protection, raise the bucket over the player. Let it block most of the view.
Keep a small irregular rim gap so the shape stays readable.

### Flare Gun

Aim at an event entity when danger is present. Otherwise, aim into the sky for
rescue. Add a bright flare, a short light flash, sound, and gun recoil. Let the
flare travel and illuminate the sky. Fade it after a readable hold. Return the
gun to the held pose.

### Anchor

Move the anchor over the boat side. Extend a taut chain. Drop the anchor below
the water. Use a heavy catch when the event needs the anchor to hold.

### Umbrella

Open the umbrella above the player for rain and similar weather. Open it forward
as a shield for an event entity. Keep its canopy between the view and the threat.

### Flashlight

Aim the flashlight at the event target. Produce a narrow beam with several clear
flashes. Keep the beam attached to the flashlight direction.

### Harpoon Gun

Aim at the event target. Fire one visible harpoon. Add sound, a quick smoke
burst, and sharp recoil. Return the gun to the held pose.

## Camera Rules

Capture the camera base before item use. Restore it after completion or
cancellation.

Never change the camera position. Use yaw and pitch for looking. Use field of
view only for the binocular zoom. Ignore camera roll requests from old item
choreography.

Boat and wave motion can still move the shared parent rig. Item animation must
not add camera translation.

## Audio

Use current survival audio where a matching sound exists. Add cues for duct
tape, flare fire, and harpoon fire. Keep audio optional so a missing sound does
not block animation completion.

## Data Flow

The player selects an event item. The boat world builds an item-use request.
The active event supplies its target and context. The shared presentation
borrows the item actor and runs the sequence.

After item use completes, the current event resolver applies the outcome. The
existing event reaction presents damage, breakage, loss, or consumption. The
supply display then restores or releases the actor during inventory sync.

Visual failure must never change event selection, outcome weights, inventory,
resources, or event timing rules.

## Cancellation and Cleanup

Cancellation resolves every pending promise. It restores the camera look,
field of view, item pose, mask, lights, particles, and transient meshes.

Visibility changes settle or cancel the current sequence through one path.
Disposal calls the same cleanup path, then disposes owned resources once.

## Tests

Add pure choreography tests for every listed item and supported context.

Test these shared rules:

- Every animation includes lift, approach, and hold stages.
- Camera position does not change.
- Binocular field of view and mask restore correctly.
- Returned items reach the held pose.
- Outcome reactions keep lost and consumed items away.
- Light, smoke, beam, net, chain, and projectile cues use correct time windows.
- Sampling is deterministic and allocation-free in update paths.

Add presentation tests for routing, target fallback, cancellation, visibility
settling, promise completion, and disposal.

Keep current event outcome tests unchanged. Add integration coverage for every
event choice that uses a listed item.

Run the full test suite, typecheck, production build, and focused visual event
checks before completion.

## Scope

This work changes survival event item presentation only. It does not change
event balance, outcome rules, inventory rules, day actions, scavenging, item
models, or reduced-motion behavior.
