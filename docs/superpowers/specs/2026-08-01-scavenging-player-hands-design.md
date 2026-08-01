# Scavenging Player Hands Design

## Goal

Add visible first-person hands during the scavenging phase.

The hands support idle, walk, sprint, pickup, ground-drop, and boat-deposit animation.

The hands give visual feedback only. They do not change gameplay rules or hold item models.

## Scope

This work changes the active scavenging presentation.

It does not change carry capacity, item placement, action timing, movement, or interaction range.

It does not add survival hands or dedicated climbing, jumping, swimming, injury, title, or ending gestures.

It does not add reduced-motion behavior.

## Visual direction

The hands follow the visual style guide.

Use two bare, weathered hands with no sleeves. Keep both wrists below the viewport edge.

Use muted salt-worn skin tones, high roughness, flat shading, and a small warm fill value.

Use different wrist angles and finger curls on each side. Avoid mechanical mirrored symmetry.

The existing post-processing supplies restrained grain and edge treatment.

The hands interpret the four visual pillars as follows:

- The rigged forms provide authored joints and clear finger silhouettes.
- The camera-mounted presentation stays inside the world view and adds no UI.
- Keyed gestures use anticipation, decisive travel, held contact, and clean return.
- Existing print treatment unifies the hands with the scene.

The worn bare hands add human fragility to the sinking ship. Their effort supports restrained dark comedy.

## Animation behavior

Two hands sit low in the camera view. They never grip the carried item models.

Idle uses relaxed fingers, long held poses, and a small breathing shift. Avoid constant wobble.

Walk uses a light alternating arm swing and soft vertical impact.

Sprint uses a faster swing, stronger rise, and tighter finger curl.

Pickup moves both hands forward. The fingers close at contact, hold briefly, then return.

Ground drop moves both hands forward. The fingers open at release, hold briefly, then return.

Boat deposit uses the drop gesture with lower travel and a heavier settle.

Interaction gestures override locomotion. A new gesture blends from the current pose without a queue.

Pickup and drop rules commit immediately. Their gestures follow as visual feedback.

## Timing

Use these target gesture lengths:

- Pickup: 0.55 seconds.
- Ground drop: 0.50 seconds.
- Boat deposit: 0.62 seconds.

Each gesture includes anticipation, decisive travel, finger action, a short hold, and clean return.

Walking and sprinting advance from actual moved distance. This keeps motion tied to player travel.

Use walk during grounded movement. Use sprint during grounded movement with sprint held.

Use idle when grounded movement stops. Use a steady low pose during airborne and ladder travel.

## Architecture

### Pure choreography

Add a pure hand animation sampler.

It receives locomotion state, locomotion phase, gesture state, and gesture time.

It returns wrist transforms and finger curls for both hands.

The sampler is deterministic. It has no renderer, input, session, or model dependency.

The sampler writes into reusable pose objects. It creates no frame-loop objects.

### Presentation owner

Add `ScavengeHands` as the hand presentation owner.

It owns two `riggedHand` model instances from the existing event model library.

It owns camera-space roots, base poses, joint references, state, blend time, and disposal.

The left hand uses a mirrored view-model root. Its skinned subtree keeps a valid internal rig.

`ScavengeHands` applies sampled poses to the roots and finger joints.

It exposes locomotion update, gesture start, visibility reset, and disposal operations.

### Phase integration

`ScavengePhase` creates one `ScavengeHands` owner.

The phase sends `PlayerMotionSample` data and sprint state during direct control.

The phase starts pickup only after a successful session pickup.

The phase starts ground drop only after a successful carried-item release.

The phase starts deposit only after `commitBoatDeposit` succeeds.

`PlayerController`, `ScavengeSession`, `InteractionSystem`, and `CarryController` keep their current rules.

The hands never attach item models or change carry model transforms.

## Lifecycle and visibility

Show the hands only during active direct scavenging control.

Hide them during the title, pause screen, help overlays, document hiding, and sinking sequence.

Pause and hidden states cancel the active gesture. Resume starts from the base idle pose.

Disposal removes both camera roots. It disposes each owned model instance exactly once.

The presentation does not own the shared event model library.

## Failure behavior

If either hand instance is unavailable, hide the pair.

Model failure must not change gameplay, interaction, carry state, or phase cleanup.

Invalid rig joints also hide the pair. Do not show one complete hand and one broken hand.

## Tests

Test the pure sampler at key idle, walk, sprint, pickup, drop, and deposit poses.

Test movement phase from actual moved distance.

Test state priority, gesture restart, pause reset, and reusable pose object identity.

Test successful action signals:

- Pickup triggers pickup.
- Ground drop triggers drop.
- Boat deposit triggers deposit.
- Failed actions trigger no gesture.
- Gameplay changes before gesture start.

Test hand visibility during title, play, overlays, document hiding, sinking, and disposal.

Test that each model instance disposes once.

Test that a missing model does not stop scavenging.

Test that hand updates do not change carried item parents or transforms.

Run focused tests, type checking, the full test suite, and the production build.

Inspect active scavenging at common desktop sizes and both camera pitch limits.

Inspect idle, walk, sprint, pickup, ground drop, and boat deposit.

Inspect every carry weight. Confirm that hands and carried items remain readable and separate.
