# Captain Whiskers Design

## Goal

Add Captain Whiskers as a comforting, decorative passenger who uses the
existing item lifecycle. The player can find, carry, save, lose, and see him
aboard the lifeboat like any other scavenged item. He does not change survival
rules.

The unofficial wiki is the behavior reference: Captain Whiskers is rescued
from the ship, has no needs, dialogue, support actions, or healing, and is
primarily a cosmetic passenger. This feature intentionally omits the wiki's
later fishing-weight bonus, Fishlet-eating presentation, and drifting-crate
recovery because the requested scope is decoration and comfort.

Reference:
<https://unoffdontsleepwiththefishes.fandom.com/wiki/Characters>

## Player-Facing Behavior

- Add one `captainWhiskers` item instance with the label
  `CAPTAIN WHISKERS`.
- Give the item weight two, no charges, no day action, no durability damage,
  and no event eligibility.
- Spawn him seated on a crew-cabin bunk in the scavenging phase.
- Use the existing focus, pickup, carry, deposit, saved-item summary,
  inventory, loss, and hover presentation.
- Display a saved Captain Whiskers at an authored floor perch in the lifeboat,
  positioned as a companion rather than packed among supplies.
- Add a concise comfort-focused item description and an illustrated seated-cat
  silhouette in the existing item artwork language.
- Add no new panels, meters, prompts, controls, needs, dialogue, fishing
  modifiers, or other gameplay effects.

## Visual Interpretation

Captain Whiskers is a small, weathered black-and-white ship cat with a readable
seated silhouette, purposeful asymmetry, and a crooked rust-red collar tag. His
coat uses broad muted value groups rather than photoreal fur. The face, paws,
chest, ears, tail, collar, and tag remain legible at gameplay distance.

The model interprets the visual guide through authored illustrated form,
scene-integrated item presentation, tactile keyed motion, and restrained
material treatment. Local wear belongs on the collar and tag rather than being
spread uniformly over the animal. Ambient occlusion supports the paws, seated
body contact, collar overlap, and ear interiors without outlining the whole
model.

The model is an adaptation of Daily Lowpoly's rigged
[`Lowpoly Cat Rig + Run Animation`](https://sketchfab.com/3d-models/lowpoly-cat-rig-run-animation-c36df576c9ae4ed28e89069b1a2f427a),
published under
[Creative Commons Attribution](https://creativecommons.org/licenses/by/4.0/).
The repository attribution file will credit the creator and link the source and
license. The 794-triangle source provides an economical rigged base; its run
clip is not used. The mesh proportions, seated pose, coat treatment, collar,
tag, and idle animation are authored for this project.

## Animation

The adapted GLB contains one required clip named `CaptainWhiskersIdle`.
It is an irregular seated loop with:

1. Slow, restrained breathing.
2. Long held stillness.
3. One short ear twitch with anticipation and clean settling.
4. One restrained tail-tip flick with imperfect settling.

The clip avoids whole-body bobbing, elastic motion, and constant equal-rate
activity. It plays while Captain Whiskers is visible during scavenging,
carrying, or lifeboat survival. The runtime starts instances at a stable
instance-ID-derived phase so presentation is repeatable without introducing
gameplay randomness.

## Item and Placement Architecture

Extend the item catalog with `captainWhiskers`, update the approved instance
count, and add exhaustive artwork, description, model, storage, and test
records.

Add a focused `comfort` ship placement category. A crew-bunk surface accepts
that category, ensuring Captain Whiskers is found in an authored rescue
location instead of being randomly placed among tools or provisions. The
normal placement solver, physics, carry controller, interaction system, and
deposit flow remain authoritative after spawn.

Add a dedicated lifeboat floor transform that keeps the seated silhouette
clear of stored equipment and within the existing supply display's interaction
and highlighting flow.

## Model and Animation Ownership

The GLTF loading boundary will preserve both the scene and animation clips.
Static items continue to behave as they do now.

Animated item creation uses skeleton-safe cloning. A small animated-prop
controller owns one `AnimationMixer` per visible Captain Whiskers clone. The
world that owns the clone also owns the controller:

- Scavenging `World` updates and disposes controllers for ship item instances.
- `BoatSupplyDisplay` updates and disposes the saved lifeboat clone.

Controllers allocate no transient objects in their update path. Hiding an item
pauses its mixer. Disposal stops actions, uncaches the root and clip, and
releases the controller exactly once. Geometry, materials, textures, and scene
roots retain their existing owners.

## Validation and Failure Behavior

Loading fails through `ItemModelLoadError` when Captain Whiskers has:

- no `CaptainWhiskersIdle` clip;
- an empty or invalid mesh;
- non-finite bounds;
- invalid animation tracks;
- geometry above the approved per-model or aggregate budget.

The failure is explicit rather than silently replacing the character with a
static model. Hiding, phase changes, and disposal restore a clean base state
and leave no running mixer.

## Testing

Automated coverage will verify:

- catalog exhaustiveness, one instance, weight two, and the updated total;
- absence of charges, day actions, breakage, event eligibility, fishing
  bonuses, and survival needs;
- crew-bunk placement, reachability, bounds, and collision clearance;
- normal focus, pickup, carry, deposit, save, loss, and lifeboat display;
- model metadata, triangle budget, source attribution, and item artwork;
- required clip validation and skeleton-safe independent clones;
- deterministic phase selection, hidden-instance pause, clean reset, and
  exactly-once mixer disposal;
- no regression to static item loading or existing event-use animation.

Visual verification will inspect the scavenging bunk, carried view, and
lifeboat perch at gameplay distance, checking silhouette, material separation,
contact, animation restraint, and clearance from surrounding props.

## Out of Scope

- Passive fishing bonuses.
- Fishlet-eating animation.
- Feeding, healing, dialogue, support actions, or character needs.
- Drifting Loot recovery.
- New events, endings, or crewmate systems.
- Reduced-motion variants.
