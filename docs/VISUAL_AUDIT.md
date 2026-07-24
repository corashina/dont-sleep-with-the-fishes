# Visual Audit

**Snapshot date:** 2026-07-24
**Authority:** [Visual Style Guide](VISUAL_STYLE_GUIDE.md)

## Purpose and evidence

This audit compares the current desktop presentation with the guide so later
visual work can be scoped without changing gameplay. It records the current
state, distinguishes cross-phase systems from phase-specific defects, and
recommends focused design slices rather than selecting an implementation in
advance.

Live observation used the connected Chrome browser because the in-app browser
backend was unavailable in this environment. The game was served from the
isolated worktree with `npm.cmd run dev -- --host 127.0.0.1`.

- `Browser-observed (Chrome)` means the state was visibly inspected in the
  running game at the stated viewport. The cold-loading interstitial and
  scavenging start screen were observed at 1280×720; the start screen was also
  observed at 1920×1080. The animated ocean and vessel motion were visible in
  those start-screen observations.
- `Source-inspected` means implementation and focused tests were inspected, but
  the appearance was not claimed as observed. Chrome rejected pointer lock
  after both semantic and direct-input activation, leaving the game on its
  start overlay with the game's own pointer-lock warning. No production debug
  hook was added, so active scavenging, pause, late sinking, survival, and
  active reduced-motion states use this evidence class.
- Source evidence was limited to files named in each finding. Tests were used
  to confirm presentation contracts and reachability, not as substitutes for
  visual observation.

## Executive summary

The current game already has a recognizable illustrated maritime direction.
The observed start screen preserves an open horizon and moving sea, presents
the freighter beside rather than behind its copy, and remains legible at both
desktop viewports. Source inspection also shows a stronger survival foundation:
projected actions, a sparse perimeter HUD, a physical journal, a constructed
lifeboat, shared-wave motion, explicit reduced-motion paths, semantic states,
and deterministic resource ownership.

The largest gaps are upstream of additional effects. UI role and typography do
not remain continuous from loading through overlays; construction detail is
substantially richer on the lifeboat than on the freighter; contact depth
depends mainly on ordinary lighting and shadows; and many authored actions use
generic fades, smooth arcs, or repeating jolts instead of tactile keyed beats.
Routine survival results also interrupt the world with a full-screen treatment,
and broad procedural surface variation does more work than local wear on the
freighter. Finally, print treatment is plainly visible over the observed sky
and ship and is configured more strongly in several baseline survival profiles.

Later work should therefore establish the UI language, construction,
contact-depth, composition, and motion systems before retuning print effects.
The audit does not recommend new gameplay, saves, touch controls, crewmates,
multiplayer, or persistent progression.

## Priority definitions

- **Foundational:** a systemic mismatch shaping many screens or assets.
- **High-impact:** a conspicuous mismatch in an important repeated experience.
- **Polish:** a bounded improvement best applied after the foundation is
  coherent.

## Foundational findings

### Foundational — UI roles lose continuity between loading, play, and reading

- **Where:** Cross-phase startup loading, scavenging start/HUD, and survival HUD, journal, and cinematic overlays; `src/app/launchGame.ts`, `src/styles/main.css`, `src/ui/GameUI.ts`, `src/ui/SurvivalUI.ts`, and `src/ui/uiArtwork.ts`.
- **Evidence:** `Browser-observed (Chrome)` at 1280×720, the cold-loading interstitial was a flat dark field with a large smooth centered heading, then yielded to the markedly different left-weighted poster screen. `Source-inspected`, the poster headings use Impact/Arial Black, the broad survival UI and journal narrative use Segoe Print/Trebuchet fallbacks, and numerals use monospace; illustrated SVG artwork exists, but the expressive, narrative, and contextual roles are not consistently separated across the complete flow.
- **Mismatch:** The guide asks for a continuous scene-integrated interface with distinct expressive display, readable narrative, and stable-numeral roles, each using a coherent material metaphor.
- **Impact:** The loading screen feels like generic software before the authored poster appears, while long journal copy and compact contextual labels share the same handwritten treatment. The identity is recognizable in individual screens but not yet a durable cross-phase system.
- **Recommendation:** Define a small role map for loading/error, display, narrative, contextual action, and numeral treatments, then apply it to one complete cold-load-to-play path before expanding it. Preserve the current poster, timber, parchment, brush, and illustrated-icon metaphors where each already has a clear purpose.
- **Dependencies:** Loading and WebGL-error copy must remain immediately legible without a renderer; keyboard labels, focus visibility, short-height layout, font fallback behavior, and asset-loading performance must remain intact.
- **Verify:** Cold load, WebGL failure, scavenging start and active HUD, survival base tableau, journal, and pause at 1280×720 and 1920×1080, including keyboard focus.

### Foundational — Construction detail is uneven across the two vessels

- **Where:** Cross-phase vessel silhouette and focal prop construction; scavenging start and active freighter in `src/world/ShipGeometry.ts`, `src/world/ShipFurniture.ts`, and `src/world/ShipMaterials.ts`; survival lifeboat and supply platform in `src/world/Lifeboat.ts`, `src/survival/BoatWorld.ts`, and `src/survival/BoatSupplyDisplay.ts`.
- **Evidence:** `Browser-observed (Chrome)` on the scavenging start screen at both viewports, the freighter reads clearly as a long working vessel, but its large cabin, machinery, and furniture masses resolve mainly as clean rectangular blocks at presentation distance. `Source-inspected`, the freighter deliberately adds a tapered hull, rails, window divisions, stacks, and isolated rust streaks, but much of its shell and furniture is built from scaled shared box geometry. The lifeboat separately authors strakes, floorboards, ribs, bench rails, gunwales, edge wear, a waterline, a crooked patch, and lashings.
- **Mismatch:** The authored-forms and model-shape pillars call for economical geometry to explain construction through seams, ribs, fasteners, handles, joints, layered profiles, and purposeful irregularity rather than stopping at a smooth primitive assembly.
- **Impact:** The transition from freighter to lifeboat risks looking like a jump in authorship rather than two parts of the same world. Broad freighter shapes are readable, but focal areas can feel basic beside the survival boat's construction story.
- **Recommendation:** Establish a gameplay-distance construction checklist for focal vessel zones, then apply one small slice to the freighter's most repeated silhouette and interaction areas. Favor explanatory layers and attachments over indiscriminate polygon increases, and use the lifeboat's purposeful irregularity as a quality bar rather than a template to copy.
- **Dependencies:** Authored ship layout, door and rail clearances, collision contracts, item placement, performance, shared geometry, deterministic construction, and exactly-once geometry/material disposal must remain unchanged.
- **Verify:** Scavenging start, active deck traversal, representative interior interaction, and survival base tableau at both viewports, with silhouette comparisons from near and normal play distances.

### Foundational — Contact depth is not an explicit cross-phase art layer

- **Where:** Freighter furniture-to-deck, wall seams, rail bases, lifeboat ribs and benches, and survival supplies resting on the platform; `src/rendering/PostProcessingPipeline.ts`, `src/rendering/PrintShader.ts`, `src/world/ShipGeometry.ts`, `src/survival/BoatWorld.ts`, and `src/survival/BoatSupplyDisplay.ts`.
- **Evidence:** `Browser-observed (Chrome)` on the start screen at both viewports, small deck props and cabin parts share close mid-values and several contacts merge into their support surfaces; the ocean and sky retain clearer separation than the assembled deck details. `Source-inspected`, the rendering pipeline contains a scene pass, print pass, and output pass but no contact-depth or AO stage, while the survival tableau uses ambient light, one shadow-casting directional light, and ordinary mesh shadows.
- **Mismatch:** The guide calls for selective AO or equivalent contact shaping at contacts, overlaps, seams, interiors, and crevices, without turning it into a global dirty outline.
- **Impact:** Correctly constructed pieces can still look placed beside or pasted onto one another, and dark materials lose assembly information. Adding more texture or grain would not solve the missing seating cue.
- **Recommendation:** Prototype a narrowly targeted contact-depth approach on one freighter furniture cluster and one lifeboat supply cluster, comparing geometry, baked, decal, lighting, and limited screen-space options before choosing a shared method. Keep broad sea, sky, and open surfaces clean.
- **Dependencies:** Renderer fallback, pixel-ratio and texture-size limits, shadow ownership, disposal, frame budget, transparent materials, and reduced-motion behavior must remain intact.
- **Verify:** Active scavenging near furniture, doors, rails, and carried props plus survival base and projected-item interaction at 1280×720 and 1920×1080, checking both dark and light material contacts.

### Foundational — Authored motion lacks a shared tactile beat vocabulary

- **Where:** Cross-phase prompt and overlay reveals, critical indicators, survival sleep/fishing transitions, event-item use, and presentation cues; `src/styles/main.css`, `src/ui/SurvivalUI.ts`, `src/survival/BoatSupplyDisplay.ts`, and `src/survival/BoatWorld.ts`.
- **Evidence:** `Source-inspected`, many UI elements share 160–180 ms `ease` opacity/transform transitions, sleep uses a 2500 ms eased cover, and warning meters use repeating step jolts. Event-item use applies a symmetric smoothstep/sine lift and rotation before restoring the exact base transform; many world cues use one ease-out or sine pulse. Fishing has authored phases and terminal cues can hold a settled state, but there is no consistent anticipation, decisive travel, restrained impact, imperfect hold, and restoration pattern across materials.
- **Mismatch:** The tactile keyed-motion and animation pillars ask for intent, mass-specific timing, restrained overshoot, imperfect settling, held poses, and clean base restoration, while continuous wave systems remain fluid.
- **Impact:** Paper, timber, supplies, danger, and camera beats can feel like variations of the same web transition or smooth arc. Repeating jolts create agitation but not weight or theatrical timing.
- **Recommendation:** Specify a small set of material- and mass-aware motion beats, then validate one paper reveal, one timber action, one handled item, and one camera cue. Reuse timing principles rather than one universal curve, and preserve the existing exact base-state restoration.
- **Dependencies:** `prefers-reduced-motion`, deterministic delta-driven updates, focus and modal order, cancellation and disposal, no per-frame allocation, terminal held states, and the shared wave field must remain authoritative.
- **Verify:** Scavenging prompt, pause, and critical sinking; survival projected item use, journal, fishing, pause, and one event/result at 1280×720 under normal and reduced motion.

## High-impact findings

### High-impact — Routine survival outcomes leave the physical scene

- **Where:** Survival fishing result and broken-item repair choice; `src/ui/SurvivalUI.ts` and `src/styles/main.css`.
- **Evidence:** `Source-inspected`, fishing results and repair choices are modal `survival-overlay` sections using the same centered `cinematic-overlay` field and bounded content treatment as pause and endings. In contrast, the base survival UI already projects transparent anchors and tooltips over the physical rod, toolbox, and supplies.
- **Mismatch:** The scene-integrated interface pillar reserves full panels for journals, major decisions, pauses, and endings; ordinary outcomes and choices should remain beside their physical subject when practical.
- **Impact:** Common fishing and repair loops interrupt the strong boat tableau and make routine confirmation feel as visually important as a major event.
- **Recommendation:** Explore keeping routine result copy and repair selection attached to the rod, toolbox, or affected supply group, reserving the cinematic overlay treatment for genuinely major transitions. Validate the information hierarchy before changing interaction mechanics.
- **Dependencies:** Modal focus trapping, keyboard casting/reeling, repair eligibility, busy-state gating, live announcements, unavailable reasons, pointer targets, and command-origin focus restoration must remain intact.
- **Verify:** Survival fishing aim, bite, catch/miss result, repair-tool projection, broken-item selection, cancel, pause, and keyboard-only operation at both viewports.

### High-impact — Freighter surfaces vary broadly but tell few local stories

- **Where:** Scavenging hull, painted panels, metal, floors, rails, stacks, and furniture; `src/world/ShipMaterials.ts`, `src/world/ShipGeometry.ts`, and `src/world/ShipFurniture.ts`.
- **Evidence:** `Browser-observed (Chrome)` at both start-screen viewports, broad wood, steel, dark hull, canvas, and rust value families are distinguishable, but local wear does not consistently survive the presentation distance. `Source-inspected`, deterministic color, roughness, and bump textures provide material-wide variation; local geometry includes stack and rail-opening rust streaks, while most other handled edges, drainage paths, repairs, and joints rely on the shared surface treatment.
- **Mismatch:** The material pillar asks for wear that follows use and exposure—handled edges, salt, drainage, repairs, folds, and compression—rather than uniform procedural variation.
- **Impact:** The freighter reads as weather-colored more than weather-lived-in, weakening both melancholic human history and the dark-comic specificity of its props.
- **Recommendation:** Choose a few repeatedly seen interaction zones and author restrained, causally placed wear there first. Compare their visibility at gameplay distance before expanding the vocabulary, and keep material classes distinct rather than adding universal dirt.
- **Dependencies:** Seeded texture determinism, texture memory and ownership, anisotropy limits, authored item placement, collision clarity, and current palette contrast must remain intact.
- **Verify:** Scavenging start plus active close views of one wood, painted-steel, exposed-metal, rope/canvas, and repair area at 1280×720 and 1920×1080.

### High-impact — Print treatment competes with the underlying image

- **Where:** Cross-phase sky gradients, ocean, freighter silhouette, UI edge treatment, and survival weather profiles; `src/styles/main.css`, `src/rendering/PostProcessingPipeline.ts`, `src/rendering/postProcessingProfiles.ts`, and `src/rendering/PrintShader.ts`.
- **Evidence:** `Browser-observed (Chrome)` at both start-screen viewports, fine line/grain structure and irregular dark edge pressure are readily visible across the bright sky and the left side of the ship rather than disappearing into the composed image. `Source-inspected`, a CSS treatment overlays repeating radial and linear texture while the scene shader also applies posterization, ink frame, halftone, vignette, chromatic separation, and grain. Baseline calm survival uses a stronger ink-frame value than scavenging, with stronger values again across several ordinary weather/night profiles.
- **Mismatch:** Restrained print treatment should quietly unify authored geometry, materials, lighting, and composition, becoming stronger conditionally rather than acting as the most legible surface layer at baseline.
- **Impact:** The image can feel processed before its construction and contact cues are read, and clear sky gradients reveal the treatment more strongly than small physical details.
- **Recommendation:** After UI, construction, lighting, and contact work, retune one calm baseline and one danger profile together. Separate the responsibilities of CSS UI texture and scene-space print treatment, protect the central play area and controls, and compare effect-off captures before deciding profile values.
- **Dependencies:** Post-processing fallback, stable CSS-pixel sampling, maximum texture size, reduced-motion grain timing, weather readability, danger signaling, and frame budget must remain intact.
- **Verify:** Scavenging start, active HUD, and critical sinking plus survival calm day, overcast, squall/night, and journal at both viewports, comparing sky gradients, silhouettes, item color, and control legibility.

## Polish findings

### Polish — The start control legend stops at text treatment

- **Where:** Scavenging start controls; `src/ui/GameUI.ts`, `src/styles/main.css`, and `src/ui/uiArtwork.ts`.
- **Evidence:** `Browser-observed (Chrome)` at 1280×720 and 1920×1080, the MOVE, LOOK, SPRINT, and ACT instructions are clear and neatly grouped, but they are four similarly shaped text strips without illustrated input or action silhouettes. `Source-inspected`, the screen already has a project-authored SVG artwork path for watch and warning symbols, while the control legend is plain definition-list copy.
- **Mismatch:** The icon and artwork guidance favors illustrated, internally consistent silhouettes that remain recognizable before texture, while preserving readable keyboard labels.
- **Impact:** The legend is functional but is one of the more generic-looking elements in an otherwise authored poster.
- **Recommendation:** Explore a small control-mark vocabulary that supports—rather than replaces—the explicit W A S D, mouse, Shift, and left-click labels, then judge it at normal viewing distance.
- **Dependencies:** Keyboard accuracy, label contrast, start-screen width at 1280×720, localization-safe spacing, and no reliance on icon recognition alone must remain intact.
- **Verify:** Start screen at both viewports, high zoom, and keyboard focus/error states, confirming every control remains readable without interpreting artwork.

### Polish — Journal navigation uses generic glyphs inside a richly built object

- **Where:** Survival journal previous/next controls and close affordance; `src/ui/SurvivalUI.ts` and `src/styles/main.css`.
- **Evidence:** `Source-inspected`, the journal is constructed with a cover, rings, colored tabs, paper grain, uneven edges, and stable page folios, but page navigation uses `&lsaquo;` and `&rsaquo;` text glyphs in transparent buttons while the close action is a separate paper strip.
- **Mismatch:** The artwork guidance asks controls and icons to share the same illustrated construction and stroke language as the surrounding physical object.
- **Impact:** The small page controls read as software symbols laid over an otherwise convincing binder.
- **Recommendation:** Explore navigation marks that behave like authored page edges, tabs, or ink marks while retaining the current accessible names, disabled state, hit areas, folio, and close action.
- **Dependencies:** Focus visibility, disabled legibility, page order, focus trapping, Escape behavior, short-height scrolling, and keyboard target size must remain intact.
- **Verify:** Empty, first, middle, and last journal pages at 1280×720 and 1920×1080, including Tab/Shift+Tab, disabled controls, Escape, and reduced motion.

## Strengths to preserve

- **Maritime atmosphere and world-first staging:** `Browser-observed (Chrome)`,
  the start screen keeps a broad cool sea and sky visible at both viewports,
  preserves negative space around the freighter, and uses a restrained warm
  button and flag accents. The world remains legible beside the justified major
  start decision.
- **Coherent continuous water motion:** `Browser-observed (Chrome)`, ocean and
  vessel motion remain active behind the start screen. `Source-inspected` in
  `src/survival/BoatWorld.ts` and related tests, survival ocean rendering,
  fishing water, vessel motion, and buoyancy sample the shared wave field, while
  reduced motion keeps hull flotation and removes optional secondary motion.
- **Scene-integrated survival interaction:** `Source-inspected` in
  `src/ui/SurvivalUI.ts` and `src/survival/BoatWorld.ts`, actions are projected
  onto the rod, toolbox, and saved supplies with contextual costs, quantities,
  conditions, unavailable states, semantic descriptions, and focus behavior.
- **Constructed lifeboat and local history:** `Source-inspected` in
  `src/world/Lifeboat.ts`, the boat includes strakes, ribs, floorboards, bench
  rails, gunwales, waterline wear, scuffs, a repair patch, and lashings. This is
  the clearest existing example of the guide's economical authored forms.
- **Physical journal metaphor:** `Source-inspected` in `src/ui/SurvivalUI.ts`
  and `src/styles/main.css`, the binder, rings, tabs, parchment, folio,
  narrative sections, focus isolation, and short-height containment justify a
  full panel and establish a useful material vocabulary.
- **Accessibility and semantic state:** `Source-inspected` in
  `src/ui/GameUI.ts`, `src/ui/SurvivalUI.ts`, and `src/styles/main.css`, focus
  treatments, labels, reasons, non-color danger text, live regions, keyboard
  shortcuts, reduced-motion CSS, and direct-pose world fallbacks are explicit.
- **Determinism and ownership:** `Source-inspected` in
  `src/world/ShipMaterials.ts`, `src/rendering/PostProcessingPipeline.ts`,
  `src/survival/BoatWorld.ts`, and `src/survival/BoatSupplyDisplay.ts`,
  procedural variation is seeded, per-frame state is reused, and created
  geometries, materials, textures, render targets, listeners, and active
  sequences have explicit cleanup paths.

## Recommended implementation sequence

1. **UI role slice:** define the loading/error, display, narrative, contextual,
   and numeral roles; apply them to cold load, scavenging start, active HUD,
   survival base, and one overlay. Verify keyboard and both desktop viewports.
2. **Routine interaction composition slice:** keep one fishing result and one
   repair choice close to their physical subjects, preserving modal semantics
   only where still necessary. Verify pointer and keyboard paths.
3. **Freighter construction slice:** bring one repeatedly seen exterior zone
   and one interaction cluster to the lifeboat's construction standard without
   changing layout, collisions, or item placement.
4. **Contact-depth slice:** test selective seating cues on those same two
   clusters and one survival supply cluster. Choose a technique only after
   performance, transparency, fallback, and disposal verification.
5. **Local surface-story slice:** add causally placed wear to the validated
   construction slice, keeping broad procedural variation subordinate.
6. **Motion-language slice:** author and compare one paper, timber, handled
   item, and camera beat under normal and reduced motion, including
   interruption and exact restoration.
7. **Print retune slice:** establish calm baseline and danger/storm deltas only
   after the underlying image is coherent; compare effect-off, CSS-only, and
   complete frames at both viewports.
8. **Bounded polish slice:** integrate the start control marks and journal
   navigation with the established artwork language.

Each slice is intentionally small enough for a focused design specification,
visual matrix, performance check, accessibility pass, and targeted regression
tests before the next slice begins.

## Verification matrix

| Phase | State | Viewport | Evidence on 2026-07-24 | Later verification target |
| --- | --- | --- | --- | --- |
| Scavenging | Cold loading interstitial | 1280×720 | `Browser-observed (Chrome)` | Repeat at 1280×720 and 1920×1080 after UI-role work. |
| Scavenging | Start screen, normal motion | 1280×720 | `Browser-observed (Chrome)` | Preserve open horizon, world visibility, copy contrast, and continuous sea/vessel motion. |
| Scavenging | Start screen, normal motion | 1920×1080 | `Browser-observed (Chrome)` | Preserve the same hierarchy without over-scaling UI or weakening the vessel focal point. |
| Scavenging | Active HUD and pause | 1280×720 and 1920×1080 | `Source-inspected`; Chrome pointer lock was rejected, so appearance was not observed. `src/ui/GameUI.ts`, `src/styles/main.css`, and `tests/GameUI.test.ts` confirm the states and contracts. | Observe both states live with pointer lock, keyboard focus, normal motion, and representative carried items. |
| Scavenging | Late or critical sinking | At least 1280×720 | `Source-inspected`; `src/ui/GameUI.ts`, `src/styles/main.css`, `src/rendering/postProcessingProfiles.ts`, and `tests/GameUI.test.ts` confirm thresholds, critical treatment, and profile escalation. | Observe danger entry, sustained critical state, failure, and effect restraint without relying on color or continuous jolt alone. |
| Survival | Base tableau and projected item interaction | 1280×720 and 1920×1080 | `Source-inspected`; `src/ui/SurvivalUI.ts`, `src/survival/BoatWorld.ts`, `src/survival/BoatSupplyDisplay.ts`, `tests/SurvivalUI.test.ts`, and `tests/BoatWorld.test.ts` confirm the fixed authored camera, platform, projected anchors, quantities, conditions, and tooltip bounds. | Observe world/UI dominance, maximum-inventory silhouette, contacts, tooltip containment, focus, and unavailable reasons. |
| Survival | Fishing and result | At least 1280×720 | `Source-inspected`; `src/ui/SurvivalUI.ts`, `src/survival/BoatWorld.ts`, and their focused tests confirm aim, bite, cast/reel phases, shared-wave placement, result modal, keyboard input, and restoration. | Observe anticipation, cast weight, splash, held catch/miss, result composition, focus, and exact camera restoration. |
| Survival | Journal and pause | At least 1280×720 | `Source-inspected`; `src/ui/SurvivalUI.ts`, `src/styles/main.css`, and `tests/SurvivalUI.test.ts` confirm construction, short-height bounds, focus trapping, Escape, disabled paging, and modal order. | Observe material readability, type roles, page navigation, pause hierarchy, and reduced-motion entry/exit. |
| Survival | One event or result | At least 1280×720 | `Source-inspected`; `src/ui/SurvivalUI.ts`, `src/survival/BoatWorld.ts`, and `src/survival/BoatSupplyDisplay.ts` confirm scene captioning, physical eligible-item selection, semantic state, item-use animation, feedback, and terminal cues. | Observe one safe and one dangerous event, item highlight/contact, event timing, feedback, and any terminal held pose. |
| Both | `prefers-reduced-motion: reduce`, one active state per phase | At least 1280×720 | `Source-inspected`; `src/styles/main.css`, `src/ui/SurvivalUI.ts`, `src/survival/BoatWorld.ts`, `src/survival/BoatSupplyDisplay.ts`, `src/rendering/postProcessingProfiles.ts`, `tests/SurvivalUI.test.ts`, and `tests/BoatWorld.test.ts` confirm direct/near-zero transitions, no optional secondary loops, stable grain time, and continued shared-wave flotation. Appearance was not observed. | Observe one active state per phase with state order, focus, readability, ocean/buoyancy continuity, and no decorative travel or continuous jolt. |
