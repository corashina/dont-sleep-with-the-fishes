# Original-Inspired Survival Presentation Redesign

- **Status:** Approved design
- **Date:** 2026-07-23
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, HTML/CSS, Vitest
- **Scope:** Survival-phase composition, UI, journal, animation, and post-processing

## 1. Objective

Bring the survival phase visibly closer to the supplied screenshots and GIFs from the original Steam game without copying their assets. The result should feel like a staged, hand-printed survival tableau: the boat and physical props dominate the frame, interactions happen in the world, overlays stay sparse, the journal resembles a worn physical binder, and the final image uses stronger posterization, grain, halftone, and an irregular ink-black border.

The redesign preserves the current game's stronger ocean, shared wave field, sky, PBR models, deterministic rules, readable HTML controls, and accessibility behavior.

The supplied references establish these priorities:

- a fixed boat tableau with the horizon above and physical supplies across the lower frame;
- sparse top-center prompts instead of generic panels;
- physical item lifts and activity-specific foreground animations;
- environmental event setpieces revealed from darkness;
- a tall parchment journal inside a thick brown cover with rings, colored tabs, and a bottom close strip;
- compressed highlights, deep ink-like shadows, visible print texture, and a rough dark frame.

## 2. Fixed Constraints

The current upper-left condition indicators are out of scope. Their artwork, values, danger states, order, scale, and layout remain unchanged.

This milestone does not add or change:

- crewmates;
- survival rules, resources, event weights, event outcomes, or randomness;
- inventory capacity or item functionality;
- saves, progression, touch controls, multiplayer, or mobile layouts;
- the shared wave-field contract for ocean rendering, buoyancy, and vessel motion;
- third-party runtime assets.

All new visual art is original and committed locally. CSS, inline SVG, procedural textures, and small locally generated monochrome masks are allowed.

## 3. Relationship to Existing Designs

This design extends `2026-07-23-survival-event-interaction-and-journal-redesign-design.md`.

The earlier design remains authoritative for event eligibility, exact item-instance validation, deterministic resolution, Endure behavior, journal content, focus behavior, and phase lifecycle. This document supersedes its presentation constraints in these areas:

- an inspected or selected physical prop may lift into the foreground and approach screen center;
- an authored first-person hand or tool gesture is allowed for short activity and sleep beats;
- the journal composition follows the taller screenshot-like binder specified here;
- event reveals use reusable staged setpieces rather than only restrained camera, light, and weather changes.

No presentation sequence may commit or predict a gameplay result.

## 4. Chosen Approach: Staged Tableau System

The survival view becomes a reusable stage rather than a collection of unrelated overlays.

The base composition reserves the lower half for the lifeboat, gunwales, storage, and recovered physical props. The horizon and weather occupy the upper half. The central viewing area stays readable and is not permanently covered by opaque UI.

The surviving screen-level elements are:

- the unchanged condition indicators at upper-left;
- the journal marker at upper-right;
- small day and weather text near the journal without competing with it;
- End Day at lower-right;
- transient prompts and captions near top-center;
- transient physical inspection, event, and activity presentations.

The existing reticle and developer-facing FPS display are not part of the normal survival composition. Debug data may remain available behind an explicit development mode.

Every temporary presentation returns to one authored base camera, base prop transforms, committed weather, base lighting, and normal input state.

## 5. Module Responsibilities

### `SurvivalPhase`

`SurvivalPhase` remains the phase orchestrator. It:

- receives gameplay snapshots and typed player actions;
- requests presentation sequences at the correct lifecycle points;
- awaits or cancels those sequences;
- commits gameplay commands only after the required presentation stage;
- invalidates pending work on restart or disposal.

It does not directly tween Three.js objects or build presentation DOM.

### `SurvivalPresentationDirector`

A new presentation director owns sequencing state but no gameplay state. It:

- serializes inspection, event reveal, item-use, activity, sleep, dawn, and return-to-base cues;
- allows only one exclusive sequence at a time;
- exposes explicit cancellation;
- selects normal or reduced-motion timings;
- coordinates world and UI presentation through narrow interfaces;
- restores the base presentation in `finally`-style cleanup.

The director accepts authored cue descriptors and returns completion or cancellation. It does not read randomness, choose event outcomes, mutate resources, or allocate renderer resources.

### `BoatWorld`

`BoatWorld` owns all scene-side presentation resources and delegates cohesive behavior to focused helpers where useful. It:

- owns base, inspection, event, fishing, and sleep camera poses;
- owns prop focus/lift transforms and reusable event-family setpieces;
- owns temporary light, tint, weather, and visibility overrides;
- applies poses after shared boat motion and before final matrices and projections;
- restores authored transforms after completion, cancellation, restart, or disposal;
- disposes every geometry, material, texture, render target, and helper once.

Reusable vectors, quaternions, arrays, and setpiece objects are allocated during construction, not in the frame loop.

### `SurvivalUI`

`SurvivalUI` owns:

- the unchanged upper-left indicator markup and styling;
- journal, day/weather marker, End Day control, prompts, captions, and Endure;
- keyboard routing, visible focus, focus restoration, and live-region announcements;
- reduced-motion and high-contrast-friendly DOM states;
- pointer hit targets projected from physical world anchors.

HTML controls remain crisp above the WebGL post-processing pass.

### Post-processing

The existing print shader remains the single full-scene treatment. It gains bounded controls needed by this design rather than adding a stack of expensive passes. The post-processing owner creates and disposes the local irregular-frame texture and all related GPU resources.

## 6. Base Layout and HUD

The base camera presents a wider, lower boat tableau than the current survival composition. The boat fills roughly the lower 45 to 55 percent of the viewport. Supplies form a readable physical cluster across the boat without covering the horizon or permanent controls.

The upper-left indicators remain pixel-for-pixel unchanged by this milestone.

The journal marker sits at upper-right and reads as a small tilted physical book. A subtle attention badge may indicate a new entry. Day and weather information stays secondary and compact.

End Day moves to lower-right as a rough wooden or paper-backed sign. It remains a real button with the current command semantics, focus visibility, accessible name, and disabled/busy states.

Transient copy uses one short title or sentence near top-center. Choice prompts use sparse scene-level controls. Event and activity UI does not return to a centered generic modal.

Supported compositions are authored and tested at 1280 by 720 and 1920 by 1080. The central 75 percent of the viewport remains free from the opaque portion of the irregular frame.

## 7. Journal

The journal closely follows the supplied screenshot while using original local artwork and CSS:

- a tall, narrow parchment page centered over the visible boat;
- a thick dark-brown cover extending around and behind the page;
- a rounded, worn outer silhouette with depth and a strong shadow;
- visible metal ring or clip details along the left binding;
- three or four colored cloth or paper tabs protruding from the right edge;
- uneven paper edges, fibers, salt marks, stains, and restrained horizontal variation;
- a paper-strip `X Close Journal` control near the bottom edge;
- subtle page-edge previous and next controls;
- a title and readable handwritten-style body typography.

The journal keeps the existing history, newest-entry selection, browsing behavior, page facts, focus trap, Escape handling, focus restoration, and no-gameplay-side-effect contract. Tabs remain decorative unless a later design explicitly assigns categories.

At short supported desktop heights, story content scrolls inside the parchment. The title, navigation, folio, and close control remain visible or reachable. Reduced motion uses direct opacity changes without page translation or scale.

## 8. Physical Inspection and Item Use

Physical supplies remain anchored to the boat during ordinary play. Pointer hover or keyboard focus highlights the corresponding prop and shows only the appropriate concise label.

An inspection or selection sequence uses one reusable rig:

1. lock conflicting commands;
2. move the camera a restrained amount toward the prop;
3. lift, tilt, and enlarge the exact physical prop into the foreground;
4. show one sparse prompt or state label;
5. resolve, cancel, or return the prop to its authored transform;
6. restore focus and normal input.

The sequence targets the exact item instance selected by the player. It does not clone the item, change inventory state, or resolve an event early.

Normal sequences last approximately 0.6 to 1.5 seconds excluding player decision time. Reduced motion replaces travel and tilt with an immediate selected state and short fades while preserving callback order.

## 9. Environmental Event Setpieces

Events use a reusable theatrical reveal:

1. an ink-black or eyelid-like cover closes;
2. the committed event scene is prepared while covered;
3. an irregular opening reveals the setpiece;
4. a short top-center prompt or caption appears;
5. scene-level choices or physical eligible items activate;
6. resolution presentation plays;
7. temporary resources and transforms return to base.

Setpieces are grouped into reusable families:

- **island or sighting:** distant silhouette, landform, vessel, or signal at the horizon;
- **floating object:** an authored object or debris near the boat;
- **creature or impact:** water disturbance, silhouette, hull reaction, and controlled camera jolt;
- **storm:** darker sky, stronger lighting contrast, rain or spray cues, and existing shared-wave-driven boat motion;
- **darkness:** reduced scene lighting and a localized readable focus area.

Family objects are constructed once and toggled or repositioned per cue. They do not allocate new materials or geometry each time an event runs.

Event choices stay sparse. Red/green scene-level choices are permitted when the gameplay contract calls for direct choices; item-driven events continue to use eligible physical props and the existing Endure fallback rules.

## 10. Activity, Fishing, and Sleep Presentation

Activities may switch to short authored camera poses. Fishing keeps its existing gameplay and line simulation but presents a stronger fixed viewpoint with the rod or tool in the foreground, a readable horizon, and short staged action beats.

Short first-person hand or tool gestures are allowed when they clarify an action. They are presentation-only, locally authored, and owned by `BoatWorld` or a dedicated helper. They do not imply a full player-character system.

End Day uses:

- a brief foreground hand or cover gesture where appropriate;
- an eyelid or ink-cover close;
- a short black hold with optional day transition label;
- the committed night event or dawn reveal.

Reduced motion replaces gestures, jolts, and large camera travel with fades and static authored poses.

## 11. Visual Treatment

The design keeps the current ocean, wave-linked buoyancy, sky, and physically based models, then applies a stronger original-inspired print treatment:

- cool cyan-blue water and sky separated from warmer boat and parchment tones;
- deep, slightly crushed ink-like shadows that preserve prop silhouettes;
- compressed highlights with brighter foam and grazing reflections;
- restrained tonal posterization rather than flat cel shading;
- stable screen-space halftone and fine grain;
- subtle bounded chromatic separation;
- a locally authored monochrome irregular-border mask;
- stronger vignette near the perimeter without obscuring permanent controls.

The print shader gains a bounded posterization parameter and phase-specific profiles. Effects that shimmer must remain screen-space stable. Grain or frame-pressure animation is optional and freezes under reduced motion.

`OceanRenderer` may brighten foam and grazing reflection response using its existing shared wave data. This milestone does not add a costly full-screen bloom pass.

The WebGL scene receives the grade. HTML UI receives only restrained CSS grain, shadow, and frame overlap so text and focus outlines remain readable.

## 12. Sequence State, Cancellation, and Error Handling

Only one exclusive presentation sequence may run at once. A new phase transition, restart, or disposal cancels the active sequence before starting another.

Cancellation must restore:

- base camera pose and presentation offsets;
- exact prop transforms;
- material, highlight, light, weather, tint, and visibility overrides;
- input locks and pointer routing;
- DOM prompts, captions, and busy states;
- keyboard focus to the appropriate surviving control.

Each awaited boundary checks the phase lifecycle generation. Late callbacks cannot mutate a replaced phase or disposed world.

Missing optional decorative resources disable that detail and log a development warning. Missing required anchors or cue mappings remain development errors covered by tests. A rejected gameplay response returns to the valid selection state if the phase is still active.

Pause and terminal overlays keep precedence over presentation prompts. Pausing blocks new presentation input without committing or discarding gameplay state.

## 13. Accessibility and Performance

- All permanent and transient actions remain keyboard operable.
- Pointer hover and keyboard focus produce equivalent prop identification.
- Focused and eligible states use shape, outline, and text in addition to color.
- Live regions announce event reveals, choice availability, and results once.
- Reduced motion preserves state order while removing optional camera travel, prop movement, gestures, frame animation, and jolts.
- The print grade and vignette retain sufficient contrast for UI text and focus outlines.
- No frame update allocates materials, geometries, textures, vectors, or growing arrays.
- Presentation helpers have explicit owners and idempotent disposal.
- Existing shared-wave and water-exclusion update order remains intact.

## 14. Testing and Visual Verification

Implementation follows test-driven development.

Automated tests cover:

- presentation-director serialization, cancellation, reduced-motion timing, and base-state restoration;
- lifecycle invalidation after every awaited sequence boundary;
- unchanged upper-left indicator structure and layout contract;
- journal structure, navigation, focus trap, Escape, focus restoration, and scroll behavior;
- End Day location contract and command semantics;
- exact-instance physical prop selection and transform restoration;
- authored base, inspection, event, fishing, and sleep camera poses;
- event-family activation, reuse, and cleanup;
- shader profile bounds, posterization controls, and frame-texture ownership;
- no repeated material creation in update and render paths;
- exact disposal of all added scene and post-processing resources.

Run:

```text
bun run test
bun run typecheck
bun run build
```

If local models or runtime assets change, also run `bun run models:check` and update `THIRD_PARTY_ASSETS.md` when required by repository policy.

Browser checks cover:

- base survival tableau at 1280 by 720 and 1920 by 1080;
- unchanged top-left indicators;
- journal open, browsing, short-height scrolling, and close behavior;
- item inspection and eligible event-item selection;
- island/sighting, floating-object, creature/impact, storm, and darkness families;
- fishing and End Day sleep/dawn transitions;
- daytime, night, overcast, and squall print profiles;
- keyboard-only play;
- `prefers-reduced-motion`;
- interruption by pause, restart, terminal state, and disposal.

Visual checks compare composition and visual hierarchy against the supplied references rather than requiring pixel matching.

## 15. Acceptance Criteria

1. The upper-left condition indicators are unchanged in artwork, values, behavior, order, scale, and position.
2. The base survival view reads as a fixed boat tableau with physical props across the lower frame and a clear horizon above.
3. The journal closely resembles the supplied tall binder screenshot and preserves all existing journal behavior.
4. Journal sits at upper-right, End Day sits at lower-right, and transient prompts remain sparse and scene-led.
5. Physical item inspection and event selection lift the exact prop into a readable foreground presentation and restore it afterward.
6. Environmental events use reusable staged reveals and visible world setpieces instead of generic centered dialogs.
7. Fishing, activities, and sleep use short authored camera, tool, hand, or cover beats without changing gameplay rules.
8. The final image has stronger posterization, stable grain and halftone, compressed highlights, ink-like shadows, and an irregular dark frame while remaining readable.
9. Every sequence cancels safely and restores camera, props, scene overrides, input, prompts, and focus.
10. Keyboard operation and reduced-motion behavior remain complete.
11. The frame loop avoids repeated setup and resource allocation, and every new Three.js or post-processing resource has one disposing owner.
12. Automated tests, type checking, production build, and required browser checks pass.
