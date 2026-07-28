# Weather Event Animation Flows Design

## Goal

Give Shower Night, Windy Night, Thunderstorm, Restless Waves, and Man in the
Fog complete scene-led animation flows. Each event first demonstrates its
danger through a short authored camera scan, returns the camera to the normal
lifeboat view, and only then unlocks physical item choices. Selecting a usable
item plays a distinct handling animation before the existing deterministic
outcome is applied and presented.

The implementation interprets the original event beats documented by the
[unofficial event wiki](https://unoffdontsleepwiththefishes.fandom.com/wiki/Events)
without copying proprietary artwork, layouts, animation, audio, or textures.

## Scope

This change covers physical item responses only:

- Shower Night: Bucket, Umbrella, Map
- Windy Night: Fishing Net, Map, Umbrella
- Thunderstorm: Anchor, Bucket, Umbrella
- Restless Waves: Anchor, Swim Ring
- Man in the Fog: Compass, Binoculars, Flashlight

The Sleep response keeps the existing event-resolution flow and receives no
new item or player animation. Event weights, eligibility, resource effects,
inventory mutations, weather mappings, journal records, and outcome messages
remain unchanged.

## Experience Flow

The existing full-screen sleep cover remains the boundary for staging:

1. While covered, `SurvivalPhase` applies the event weather and stages the
   weather-event presentation.
2. The cover reveals the scene and the event title.
3. A 3.4-4.2 second event-specific camera sequence uses anticipation, a
   decisive left or right scan, one or two readable holds, and a clean return
   to the exact authored base camera transform.
4. Physical item anchors remain muted and commands remain locked for the
   entire camera sequence.
5. Once the reveal promise settles and the base camera is restored,
   `SurvivalPhase` publishes eligible items and enters its existing choosing
   state.
6. Selecting an eligible item locks input and plays an event-and-choice
   specific use animation.
7. The survival session resolves the choice using its injected random source.
8. The world plays an outcome reaction informed by resource loss and the
   selected item's resulting condition, then the existing feedback, hold,
   cover, dawn, and cleanup sequence continues.

Reveal and item-use promises must settle on completion, clear, restart, or
disposal so stale lifecycle continuations cannot leave input locked.

## Event Reveal Choreography

All camera motion is additive relative to the lifeboat's authored base camera.
It never replaces buoyancy or the shared wave field. Camera keys use a small
anticipation, decisive travel, short imperfect hold, restrained overshoot, and
clean base-state restoration.

### Shower Night

Rain is already active when the scene is uncovered. The camera glances port
toward rain striking the gunwale, crosses starboard to show water gathering
among the supplies, then returns to center. Rain impacts and existing mist
provide the event action; no freestanding event prop is added.

### Windy Night

A visible gust travels port-to-starboard through the existing wind particles.
The camera follows it across the boat while available supply groups lean,
rattle, and settle with small differences based on their mass. The final gust
pulls toward open water before the camera and supplies return to their exact
base transforms.

### Thunderstorm

The camera scans one dark horizon, pauses through a distant flash, then turns
toward a stronger lightning strike on the opposite side. The strike uses the
existing deterministic lightning presentation and a restrained camera impact.
Rain, mist, spray, shared waves, and vessel motion remain the substance of the
scene.

### Restless Waves

The camera lowers toward the port gunwale, crosses the bow, and looks over the
starboard side while the largest existing wave profile drives the boat.
Supplies sway against the motion to communicate risk. The camera follows the
boat's mass instead of adding an unrelated shake and returns to its base view
after the final wave passes.

### Man in the Fog

Purple-gray fog is active before the reveal. The camera searches one empty
side, crosses through center, and discovers a distant dark human silhouette on
the opposite side. It holds long enough to read the figure, the silhouette
recedes into fog, and the camera searches the now-empty position before
returning to center. The figure is an original procedural silhouette owned by
the weather-event presentation.

## Physical Item Choreography

The selected physical supply remains the visible actor. Animations use its
existing model and restore its canonical transform before inventory sync or
scene cleanup unless the resolved condition is `lost` or `consumed`.

### Shower Night

- Bucket: lift from storage, place under the strongest rain, catch a brief
  splash, tip water over the gunwale, and settle.
- Umbrella: lift above the camera line, brace into the rain, tilt to shed
  water, and return.
- Map: unfold above the leaking supply area as an improvised cover, sag under
  water, crease sharply, and return for the existing broken-state treatment.

### Windy Night

- Fishing Net: lift and spread across the supply cluster, pull taut under a
  gust, strain, and sag back for the existing broken-state treatment.
- Map: lift into the gust, flutter decisively, and travel out toward open
  water. Its authored outcome always loses the Map, so the actor may finish
  offscreen before inventory sync.
- Umbrella: raise into the wind, invert or wrench sideways, then either return
  or finish carried away according to the selected item's resolved condition.

### Thunderstorm

- Anchor: lift to the gunwale, drop below the waterline, show a taut chain
  proxy and a restrained boat check, then restore the onboard model for the
  unchanged non-consuming outcome.
- Bucket: scoop accumulated water, heave it overboard, and receive a sharp
  lightning or wave jolt before returning or settling broken.
- Umbrella: raise overhead, brace into rain, snap down under a nearby flash,
  and return or settle broken according to the outcome.

### Restless Waves

- Anchor: carry to the side, drop below the waterline, pull the chain taut,
  and visibly reduce only the additive event sway while the shared wave field
  continues unchanged.
- Swim Ring: lift to the struck gunwale, press against the rail as a bumper,
  compress on the final wave, and return or settle broken.

### Man in the Fog

- Compass: raise into the foreground, let its needle oscillate and settle,
  turn the camera slightly toward the chosen bearing, and return.
- Binoculars: raise into view and apply a short optical push toward the
  figure's former position; the fog remains empty, matching the wiki's danger
  increase without fabricating a second encounter.
- Flashlight: raise and sweep a restrained volumetric beam through the fog.
  If the outcome damages health, the silhouette reappears close to the boat
  for a brief grab-like camera impact. Otherwise it remains distant and
  dissolves into the fog.

## Architecture and Ownership

### Pure choreography catalog

Create a focused module that defines supported event IDs, supported physical
choice IDs, durations, camera keys, supply-motion keys, ambient supply sway,
and transient-effect commands. Pure sampling functions accept normalized
progress and write into caller-owned output objects. They allocate nothing and
use no randomness.

### `WeatherEventAnimator`

Add a scene presentation component owned by `BoatWorld`. It receives narrow
references to the camera, camera rig, boat, and `BoatSupplyDisplay`, plus the
shared-wave sampling seam it needs for placement. It owns:

- the Man in the Fog silhouette;
- temporary anchor-chain and flashlight-beam geometry;
- active reveal, item-use, and outcome timelines;
- reusable vectors, quaternions, colors, and wave samples;
- the promises for those timelines.

It does not own the camera, boat, supply models, ocean, weather effects, or
wave field. It restores every borrowed transform on clear and disposal and
disposes only the geometry and materials it creates.

### `BoatSupplyDisplay`

Keep supply-model ownership in `BoatSupplyDisplay`. Add a narrow animation
actor seam that allows the weather animator to identify the selected visible
group, apply a caller-supplied additive pose, apply ambient event sway, and
restore the canonical transform. The display remains responsible for exact
base transforms, highlighted and broken materials, instance-to-group
selection, and disposal.

### `BoatWorld`

`BoatWorld` constructs, updates, clears, and disposes the weather animator.
Its event methods carry the event and choice context needed for choreography:

- reveal receives the event ID and waits for both any existing tableau reveal
  and the weather-event camera sequence;
- physical item use receives event ID, choice ID, and instance ID;
- outcome reaction receives the selected physical-response context plus the
  post-resolution item condition.

The animator updates after base camera, boat, and supply transforms have been
restored for the frame, allowing its motion to remain additive and preventing
drift.

### `SurvivalPhase`

`SurvivalPhase` remains the lifecycle owner. It passes event and physical
choice context into the world, keeps choices locked until reveal completion,
captures the selected item's condition after session resolution, and supplies
that condition to the outcome presentation. Contextual choices and Sleep keep
their current path.

No gameplay rule moves into rendering code.

## Determinism and Performance

- Every timeline is advanced only by the existing frame `delta`.
- Reveal and physical-use choreography contains no random calls.
- Lightning continues to use the existing deterministic weather sequence.
- The shared wave field remains the source of truth for ocean rendering,
  buoyancy, vessel motion, and wave-relative event placement.
- Per-frame paths reuse fixed scratch objects and mutate existing scene
  objects; they create no arrays, vectors, quaternions, materials, geometries,
  promises, or render objects.
- Restart, clear, disposal, hidden-document pauses, and lifecycle
  supersession restore borrowed transforms and settle active handles exactly
  once.
- No reduced-motion or `prefers-reduced-motion` variant is added.

## Testing

### Pure choreography tests

- Each supported event has a finite reveal duration and returns an exact
  identity pose at completion.
- Left/right camera holds are event-specific and the Man in the Fog includes
  a discoverable then absent silhouette interval.
- Every listed physical choice maps to one choreography and unsupported
  event-choice pairs return no choreography.
- Each physical-use pose returns to identity unless its explicit terminal
  condition permits an offscreen lost or consumed pose.
- Outcome sampling distinguishes a damaging Flashlight result from a
  non-damaging result.

### World tests

- Reveal promises remain pending through the scan and settle only after the
  camera has returned exactly to its base transform.
- Weather animation does not change the wave multiplier contract between
  ocean, buoyancy, and boat motion.
- Wind and Restless Waves apply ambient supply sway without changing canonical
  storage transforms.
- Each physical item animation uses the selected instance's visible group.
- Clear and disposal settle reveal/use/outcome handles, remove transient
  effects, restore borrowed transforms, and dispose owned resources once.

### Phase tests

- Eligible items remain locked until the weather-event reveal resolves.
- Physical response calls include event ID, choice ID, and selected instance
  ID.
- Session resolution occurs after the item-use animation and before the
  outcome reaction.
- The selected item's post-resolution condition reaches the world outcome
  reaction.
- Sleep does not call physical item choreography.
- Restart and disposal prevent stale reveal or response continuations.

### Verification

Run the focused event, world, phase, and weather tests first, followed by the
complete test suite, typecheck, and production build. Perform a rendered smoke
check of all five reveals and every physical response using the system-tuning
weather override only as a diagnostic aid.

## Compatibility

The working tree already contains active survival weather, fishing, camera,
and UI changes. Implementation must preserve those changes and integrate
through the current interfaces rather than restoring older file versions.
Only files required by this animation flow may be changed.
