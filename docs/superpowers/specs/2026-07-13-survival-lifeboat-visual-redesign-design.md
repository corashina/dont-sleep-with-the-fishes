# Last Boat Out — Survival Lifeboat Visual Redesign

- **Status:** Approved
- **Date:** 2026-07-13
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest
- **Scope:** Survival-phase presentation only

## 1. Objective

Improve the survival-phase lifeboat from the seated player's perspective. The boat should feel roomier, rounder, more detailed, and more grounded without changing survival rules or the scavenging-phase presentation.

The redesign must:

1. Increase the survival boat's width and length by approximately 20 percent.
2. Replace the box-like survival silhouette with a visibly rounded, tapered low-poly hull.
3. Add deterministic procedural surface detail for worn paint, wood, rope, and aged metal.
4. Add two full paddles secured outside the port and starboard gunwales.
5. Give every recoverable item instance a stable, type-aware perimeter position.
6. Keep the central floor visually open and prevent props from intersecting or obscuring one another.
7. Improve the seated camera composition while preserving interaction clarity, reduced-motion behavior, and surrounding-ocean visibility.

## 2. Scope

### Included

- A dedicated procedural lifeboat build used only by `BoatWorld` in survival.
- A hull approximately 20 percent wider and longer than the scavenging lifeboat.
- Rounded and tapered hull geometry, a recessed wooden floor, structural ribs, thicker gunwales, fittings, fasteners, seams, scuffs, and the existing repair-patch affordance.
- Deterministic procedural textures generated locally at runtime.
- Two decorative paddles mounted outside the gunwales.
- A survival-only, type-aware layout for all supported recovered-item instances.
- A revised fixed seated camera position and look target.
- Updated water-exclusion bounds for the larger survival hull.
- Automated and browser verification of geometry, layout, interaction, cleanup, and presentation.

### Excluded

- Changes to the scavenging lifeboat geometry or storage positions.
- Changes to item counts, inventory rules, action balance, events, outcomes, or survival progression.
- Paddle interaction, rowing mechanics, or boat steering.
- New downloaded models, image textures, runtime network requests, or third-party asset attribution.
- Mobile or touch-specific composition.
- Free camera movement or walking inside the lifeboat.

## 3. Architecture and Component Boundaries

The scavenging phase continues to use `createLifeboat()` and `boatStorageTransform()` without visual or behavioral changes.

Survival receives a dedicated builder that returns the same practical objects `BoatWorld` already consumes: a named lifeboat root, storage root, repair patch, fishing-line cue, catch cue, interior bounds, and survival water-exclusion dimensions. Keeping the survival builder separate prevents detailed presentation code and dimensions from leaking into scavenging.

The responsibilities are:

- The survival lifeboat builder owns hull geometry, decorative components, materials, textures, shadow settings, named cue objects, interior bounds, and water-exclusion dimensions.
- A survival storage-layout module owns stable item transforms and reserved spatial envelopes.
- `BoatWorld` creates the survival boat, places recovered props with the survival layout, positions the camera, projects interaction anchors, applies weather and motion, runs presentation cues, and disposes owned resources.
- Existing survival session and UI modules continue to own rules, inventory state, actions, tooltips, accessibility, and dialogs.

The new builder must preserve the names used by current behavior and tests: `lifeboat`, `lifeboat-storage`, `damaged-plank-patch`, `fishing-line`, and `fishing-catch`. Saved prop names and instance IDs remain unchanged.

## 4. Boat Shape and Dimensions

The current survival boat is replaced by a low-poly procedural hull with an overall width and length approximately 1.2 times the scavenging boat's corresponding extents. The exact final dimensions may vary slightly to align segment joins and prevent water-mask seams, but neither dimension may differ from the 20-percent target by more than two percentage points.

Roundness must come from geometry rather than smooth shading alone. The hull uses tapered curved side bands, rounded bow and stern sections, a recessed inner floor, and softened gunwale transitions. Faceting remains visible enough to match the project's low-poly style.

Interior detail includes:

- a weathered wooden floor;
- structural ribs or short bench supports that do not block item positions;
- thicker port and starboard gunwales;
- rope, aged metal mounts, seams, and fasteners;
- the visible damaged-plank repair patch;
- restrained scuffs and paint wear concentrated on edges and high-contact areas.

Two complete paddles are secured along the outside of the port and starboard gunwales. Their blades and handles must be visible from the survival camera without occupying prop storage space. Paddles are decorative and have no interaction anchors.

## 5. Materials and Procedural Textures

The art direction is a weathered, grounded lifeboat that remains compatible with the existing stylized low-poly world.

Surface families are:

- worn rescue-orange painted hull;
- dark, recessed interior seams;
- weathered wood for the floor, structural details, and paddle blades;
- dark rope;
- dull, aged metal fittings.

Textures are deterministic data textures built from seeded byte data. They require no DOM canvas, file asset, or network access. Patterns should add broad discoloration, fine wear, wood grain, and modest roughness variation without producing photographic noise or obscuring silhouettes.

Texture resolution and repetition must remain modest. The redesign should reuse texture and material instances across repeated boat parts. Geometry, materials, and textures created for the survival boat are explicitly tracked and disposed when the phase restarts or ends.

## 6. Player Camera and Composition

The camera remains fixed to the boat's motion rig. It moves slightly higher and farther toward the stern than the current survival camera and looks gently downward through the interior toward the bow.

The final composition must show:

- the rounded bow and meaningful portions of both gunwales;
- both outside-mounted paddles or clearly readable portions of them;
- every present recovered prop without another prop physically obscuring it;
- an open central floor that reinforces depth;
- a strip of surrounding ocean and the horizon hotspot.

The camera should preserve the current 65-degree field of view unless browser verification proves a small adjustment is required. Any adjustment must stay between 60 and 68 degrees, avoid wide-angle distortion, and retain readable projected anchors. Existing pointer parallax limits remain unchanged. Reduced-motion mode still removes parallax and boat-induced camera heave without changing the base composition.

## 7. Type-Aware Item Layout

Survival no longer places recovered items by saved-array index. A dedicated layout maps each item type and duplicate ordinal to a stable transform and reserved envelope. A prop therefore occupies the same location whether the player saved every supply or only that prop.

The maximum supported inventory distribution remains the source of layout capacity:

- one flare gun;
- two duct-tape rolls;
- one fishing rod;
- two bait tins;
- one medical kit;
- two water containers;
- three food cans;
- one flashlight;
- one scuba set.

Placement follows these rules:

- Large scuba gear and water containers occupy separated bow-side zones.
- The fishing rod rests along an inner gunwale and retains enough clearance for its fishing cue.
- Food cans and bait tins each receive separate positions rather than forming piles.
- The medical kit, flashlight, flare gun, and duct tape alternate between port and starboard perimeter zones.
- The central longitudinal floor remains open.
- Item-specific rotation and modest scale tuning may improve recognition, but no prop may be made implausibly small merely to fit.

Each reserved envelope is derived from the measured normalized model bounds at its final transform, with at least 0.05 world units of clearance on each horizontal side. Reserved envelopes must not intersect at the maximum supported inventory. Duplicate items must have distinct transforms. Missing items leave empty positions; remaining items never repack or shift.

## 8. Interaction and Presentation Behavior

The redesign is presentation-only. `SurvivalSession`, inventory aggregation, depletion, action availability, costs, events, and outcomes are unchanged.

`BoatWorld` continues to create a projected interaction anchor from each prop's world position. Stable layout positions make anchors predictable across runs. At the base camera orientation, visible item-anchor centers must remain at least 40 CSS pixels apart at 1280×720; the 1920×1080 check must preserve at least the same separation. This requirement applies when all fourteen props are present and prevents transparent interaction targets from collapsing into one apparent control.

Inventory synchronization retains current behavior:

- consumed food cans disappear individually;
- depleted finite-use props remain and receive subdued coloring;
- descriptive non-action props remain visible;
- duplicate charges are assigned per instance as they are today.

Fishing uses the recovered fishing rod at its new gunwale transform. The line and catch cues are repositioned to align with the new rod and hull. Repair continues to target the named damaged-plank patch. Horizon interaction and presentation cues remain available.

## 9. Ocean, Motion, and Lighting

The survival water-exclusion footprint expands to match the larger hull interior. Bounds sit slightly inside the visible sides and rounded ends so waves cannot appear through the floor while exterior crests remain visible close to the hull.

Existing wave sampling, weather amplitude, pitch, roll, heave, presentation cues, fog, and day/night lighting remain unchanged. New hull materials and textures must stay legible under calm daylight, night lighting, overcast weather, and squalls without becoming self-illuminated or losing their material distinction.

## 10. Resource Ownership and Failure Behavior

The survival boat remains synchronous and self-contained, so there is no asset-loading state or network failure path. Deterministic texture generation works in both browser and Vitest environments.

The survival builder exposes or registers every owned geometry, material, and texture. `BoatWorld.dispose()` releases each owned resource exactly once and restores the shared camera as it does today. A missing recovered item creates no placeholder mesh and leaves its reserved layout position empty.

If a fishing rod is absent, the existing no-fishing-cue behavior remains. If any nonessential named decorative object is absent because the builder changes later, the current defensive optional lookup behavior must avoid a runtime crash; required roots and layout definitions are covered by construction tests.

## 11. Verification

Automated tests cover:

- survival hull width and length within two percentage points of the 20-percent target;
- curved and tapered hull sections, rounded ends, two paddles, fittings, and textured surface families;
- deterministic texture generation without DOM or network dependencies;
- matching survival interior and water-exclusion bounds;
- stable type-and-ordinal transforms for every supported item instance;
- distinct transforms for duplicates;
- nonintersecting measured reserved envelopes with the required horizontal clearance at maximum inventory;
- unchanged transforms when other items are absent;
- fishing cue alignment, repair patch lookup, projected anchors, depletion, and consumed-can visibility;
- reduced-motion camera behavior;
- exact-once disposal of geometry, materials, and textures;
- unchanged scavenging lifeboat dimensions, storage behavior, acceptance bounds, and tests.

Browser verification runs at 1280×720 and 1920×1080 with the maximum-density recovered inventory. It checks calm daylight, night, and squall states and confirms:

- a readable seated first-person composition;
- a visibly larger, rounded hull;
- recognizable worn paint, wood, rope, and metal surfaces;
- visible mounted paddles;
- an open center and no intersecting or visually stacked props;
- individually distinguishable interaction targets with the required projected separation;
- no water visible inside the boat;
- no camera clipping, extreme distortion, or hidden required interaction;
- acceptable motion and stable composition with reduced motion enabled.

The full Vitest suite, TypeScript typecheck, and production build must pass.

## 12. Acceptance Criteria

The redesign is complete when:

1. Only the survival phase uses the enhanced boat.
2. The survival hull is approximately 20 percent wider and longer than the scavenging hull.
3. The hull reads as rounded and tapered from the seated view.
4. Procedural wear, wood grain, rope, and aged metal add visible surface detail without external assets.
5. Two full paddles are secured outside the gunwales and visible from the player camera.
6. Every supported recovered-item instance has a stable type-aware position.
7. Maximum-density props do not intersect, overlap into piles, or block the open center.
8. Items remain recognizable and individually targetable at both supported desktop viewports.
9. Water does not render inside the enlarged hull.
10. Existing survival rules, interactions, accessibility, cues, weather, motion, and reduced-motion behavior continue to work.
11. Repeated phase restart disposes all newly owned GPU resources without leaks or duplicate disposal.
12. Automated tests, browser checks, typecheck, and production build pass.
