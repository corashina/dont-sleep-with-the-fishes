# Survival Fishing Presentation Polish Design

**Date:** 2026-07-24

**Status:** Approved

**Scope:** Survival-phase fishing composition, bite bubbles, and energy-cost tooltips

## Goal

Improve the readability and physical coherence of survival-phase fishing without
changing its rules. The fishing rod should sit naturally on the lifeboat, the
line should visibly begin at the rod tip, the fishing viewpoint and target
should keep the bite interaction over open water, and bite bubbles should feel
alive. Physical action tooltips should also communicate energy costs at a
glance.

## Approved Approach

Make a targeted authored-presentation pass within the existing ownership
boundaries:

- `BoatWorld` owns fishing scene transforms, the fishing camera, cast geometry,
  line geometry, bubble animation state, render resources, and disposal.
- `SurvivalPhase` continues to own the deterministic fishing lifecycle and
  input-to-action flow.
- `SurvivalUI` owns fishing overlay markup, physical-action tooltips, accessible
  action descriptions, and energy-cost presentation.

This approach avoids both brittle CSS-only offsets and a new generalized
effects framework. It preserves the existing gameplay model and focuses changes
on the presentation paths already responsible for these elements.

## Spatial Fishing Composition

### Rod placement and pose

- Move the permanent fishing-rod mount onto the lifeboat's longitudinal
  centerline at the bow.
- Give the resting rod pivot a forward lean of 22 degrees.
- Treat that forward lean as the base pose. Existing cast, reel, and miss
  animations remain relative to it, so they return to the same leaned resting
  position.
- Preserve the rod's permanent-equipment interaction anchor and minimum
  keyboard/pointer hit area.

### Fishing-line origin

- Keep a dedicated line-origin marker parented to the rod.
- Place the marker at the visible rod tip in rod-local space.
- Use the marker's transformed world position as the first point of the line
  during casting, waiting, biting, reeling, and missing.
- Do not approximate the line start from the rod pivot or boat center.

### Camera and cast region

- Move the fishing camera farther aft and slightly higher than the current bow
  camera endpoint.
- Keep the rod, bow, and open water readable in the same composition.
- Move the centered cast point farther forward into open water.
- Move the pointer-cast bounds outward with the centered point, keeping pointer
  and keyboard casts in the same authored water region.
- At supported desktop 16:9 and 4:3 aspect ratios, the centered reticle and
  projected bite target must clear the visible bow rather than overlap the
  boat.
- Camera, cast point, and cast-bound values remain authored constants in
  `BoatWorld`; gameplay code does not infer them from screen pixels.

## Fishing Interface

- Remove the fishing instruction panel from the DOM entirely. This includes the
  visible aiming, waiting, and bite messages.
- Keep the aiming reticle while the player is choosing a cast point.
- Keep the projected bite target during the bite window.
- Keep the fishing live region so state changes are still announced
  accessibly.
- Preserve pointer casting, pointer reeling, and the existing `Enter`/`Space`
  cast-and-reel controls.
- Removing the panel must not change the fishing state machine, bite window, or
  focus restoration.

## Bite Bubble Animation

- Retain a fixed bubble pool constructed once by `BoatWorld`.
- Assign each bubble a stable phase offset based on its pool index.
- While the fishing phase is `bite`, each bubble continuously cycles through:
  fade in, rise, slight growth and outward drift, fade out, and reset.
- Stagger the phase offsets so the bubbles loop continuously rather than moving
  as a single cluster.
- Keep the bubble group's world position synchronized to the same shared wave
  sample used by the bobber and bite projection.
- Allocate no objects, geometry, materials, or temporary collections in the
  per-frame update path.
- Bubble resources have one owner and are disposed exactly once with the rest
  of the fishing presentation.

When `prefers-reduced-motion` is active, show a static, softly faded bubble
cluster. Do not run the looping rise, drift, growth, or opacity cycle.

## Energy-Cost Tooltips

Show one lightning emoji per energy point on every physical action tooltip that
spends energy:

| Physical action | Energy cost | Visible indicator |
| --- | ---: | --- |
| Fishing rod / Fish | 1 | `⚡` |
| Scuba gear / Dive | 3 | `⚡⚡⚡` |
| Repair tools / Repair hull | 2 | `⚡⚡` |
| Bottled paper / Send message | 1 | `⚡` |

- Derive the indicator count from the action-cost definitions used by the
  survival UI rather than maintaining a separate per-item cost table.
- Do not add lightning indicators to actions that spend food, medkits, duct
  tape, or other items but no energy.
- Keep the visible tooltip compact: its item/tool label followed by the
  lightning suffix.
- Keep accessible text explicit, using “one energy,” “two energy,” or “three
  energy.” Screen-reader meaning must not depend on how the lightning emoji is
  pronounced.
- If an action is unavailable, preserve its existing unavailable reason and
  accessible description.

## State and Data Flow

1. `SurvivalPhase` starts and advances the existing deterministic
   `FishingSession`.
2. `BoatWorld` applies the authored fishing camera and rod pose, maps accepted
   pointer or keyboard casts into the outward water region, and renders the
   fishing presentation.
3. During a bite, `BoatWorld` samples the shared wave field for the bobber,
   bubbles, and projected bite target, then advances bubble phases from elapsed
   time and stable indices.
4. `SurvivalUI` shows the reticle or projected bite target for the current
   fishing mode and publishes state changes through its live region without a
   visible instruction panel.
5. When interaction anchors are rendered, `SurvivalUI` combines the existing
   action preview with the energy cost to produce the visible lightning suffix
   and explicit accessible description.

No randomness is added to presentation behavior. Bubble staggering is a pure
function of elapsed time and bubble index.

## Edge Cases and Failure Behavior

- Invalid or out-of-bounds pointer casts remain ignored.
- Keyboard casting continues to use the immutable centered cast point.
- If a bite target projects offscreen, its pointer target remains hidden while
  keyboard reeling remains available.
- Pausing, document hiding, or leaving fishing retains the existing lifecycle
  behavior and clears or freezes presentation state through current phase
  ownership.
- Reduced motion removes continuous bubble animation and retains the existing
  minimal camera and rod motion behavior.
- Fishing resource creation or disposal must not be duplicated when a run is
  restarted or a phase is disposed.

## Testing and Acceptance

### Automated tests

- Assert the rod pivot is centered on the boat and has a forward base lean.
- Assert cast, reel, and miss presentation returns to the leaned base pose.
- Assert the fishing line's first vertex matches the line-origin marker's world
  position after transforms.
- Assert the fishing camera endpoint is farther aft than the previous bow
  endpoint and the centered cast point lies farther beyond the bow.
- Assert centered cast and bite projections clear the boat composition at
  desktop 16:9 and 4:3 dimensions.
- Assert the bubble pool size is constant across repeated bite cycles.
- Assert normal-motion bubbles have staggered position, scale, and opacity
  phases.
- Assert reduced-motion bubbles remain static and softly visible.
- Assert the fishing instruction panel is absent while the live region,
  reticle, bite target, and keyboard controls remain functional.
- Assert all four energy-consuming physical actions display the correct
  lightning count and explicit accessible energy wording.
- Assert non-energy actions do not receive lightning indicators.

### Verification

Run:

- Focused `BoatWorld`, `SurvivalPhase`, and `SurvivalUI` tests
- `bun run test`
- `bun run typecheck`
- `bun run build`

Inspect the survival phase in a browser at desktop 16:9 and 4:3 sizes with both
normal and reduced-motion preferences. Confirm that the rod is centered and
leaning forward, the line meets its tip, the reticle and bite target stay over
open water, the instruction panel never appears, bubble loops are readable but
not distracting, and every energy tooltip is correct.

## Non-Goals

- No changes to fishing odds, rewards, bait use, energy balance, bite timing, or
  day progression.
- No changes to scavenging, world construction outside the survival lifeboat,
  saved progression, touch controls, or mobile-specific interaction.
- No new particle framework, tooltip framework, or generalized presentation
  director.
- No new third-party assets or model changes.
