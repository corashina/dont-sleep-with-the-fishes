# Visual Audit Remediation Roadmap Design

**Date:** 2026-07-24

## Goal

Turn the recommendations in `docs/VISUAL_AUDIT.md` into an ordered visual
remediation program while preserving the authority and constraints of
`docs/VISUAL_STYLE_GUIDE.md`.

The program uses small vertical quality slices. Each slice has one bounded
visual outcome and owns its implementation, focused regression coverage, and
acceptance decision. The first slice, UI roles, will receive the first detailed
implementation plan. Later slices remain roadmap entries until the preceding
dependencies have been accepted.

## Scope Decisions

The approved program contains five slices:

1. UI roles and bundled typography.
2. Routine survival interaction composition.
3. Freighter construction.
4. Selective contact depth.
5. Print-treatment retuning.

The following audit recommendations are explicitly excluded from this
remediation program:

- local surface storytelling;
- a shared tactile-motion language;
- start-control and journal-navigation polish.

The program will not add a visual-state harness, screenshot automation,
pixel-diff tests, production debug hooks, development scenario routes, or a new
general-purpose UI component framework.

## Program Structure

Implement the slices in dependency order. Do not combine them into one visual
overhaul:

- UI roles establish the cross-phase presentation language used by subsequent
  interface work.
- Routine survival composition builds on those roles without changing gameplay
  commands.
- Freighter construction establishes the authored forms whose contacts will be
  shaped later.
- Contact-depth work evaluates seating cues against known geometry instead of
  compensating for unfinished construction.
- Print treatment is retuned last so effects support the accepted underlying
  image.

Each later slice requires its own focused design before implementation. A later
design may refine its technique, but it must not silently change this order,
expand the excluded recommendations, or weaken the repository's gameplay,
accessibility, ownership, and shared-wave contracts.

## Slice 1: UI Roles and Bundled Typography

### Outcome

Create a continuous typography and interface-role language from renderer-free
startup through scavenging and survival. Preserve the existing poster, timber,
parchment, brush, and illustrated-icon metaphors where they already have a clear
purpose.

### Typography roles

Bundle local, Latin-subset WOFF2 assets for three open-license families:

- **Display:** Bowlby One SC for major headings and short theatrical statements.
- **Narrative and contextual:** Alegreya Sans for prose, prompts, labels, and
  actions. Weight, case, spacing, and surrounding material treatment distinguish
  narrative copy from contextual commands.
- **Numerals:** IBM Plex Mono for timers, quantities, costs, meters, and folios.

Keep the current system stacks as fallbacks and use `font-display: swap`.
Startup, loading, and failure reporting must never wait for font completion.
Record font sources and licenses with the repository's third-party asset
documentation. Do not load fonts from a remote service at runtime.

### Presentation boundary

Apply the role map to:

- cold loading and every preload or WebGL failure;
- the scavenging start screen;
- the active scavenging HUD;
- the survival base HUD and projected contextual interface;
- the journal as the representative rich overlay;
- the shared role treatment used by pause, without redesigning its structure.

Introduce `src/styles/fonts.css` as the owner of font declarations. Define a
small semantic role layer for display, narrative, contextual, and numeral
treatment. Mark up the owning UI elements with explicit role classes rather than
assigning one novelty face through broad phase-level selectors.

Extract the renderer-free loading and failure surface builder from
`src/app/launchGame.ts` into `src/ui/SystemScreen.ts`. The presenter accepts a
typed description of the surface and constructs its DOM safely. Diagnostic text
continues to use `textContent`.

`launchGame` retains asset loading, failure precedence, cancellation, and
resource disposal. `GameUI` and `SurvivalUI` retain interaction state, focus,
modal behavior, and announcements. Typography roles remain presentation
metadata and do not flow into gameplay modules.

### Non-goals

This slice does not:

- redesign existing layouts;
- change copy or gameplay commands;
- relocate routine survival results;
- add motion behavior;
- alter journal navigation artwork;
- add a reusable component library;
- wait for fonts before showing a startup or error surface.

### Required preservation

Preserve renderer-independent error legibility, hostile-markup safety, keyboard
labels, focus visibility, semantic states that do not rely on color, short-height
containment, and the existing reduced-motion behavior. A font failure must
degrade to the declared system fallback without hiding or delaying content.

## Slice 2: Routine Survival Interaction Composition

### Outcome

Keep ordinary fishing results and broken-item repair choices connected to the
physical survival tableau instead of presenting them with the same full-screen
weight as pause, endings, or major decisions.

Fishing result feedback should remain near the fishing rod or catch area.
Broken-item repair selection should remain associated with the repair toolbox
and affected supply group. The focused design must decide the exact anchor and
containment behavior at both desktop viewports before implementation.

Preserve:

- the existing fishing and repair gameplay commands;
- repair eligibility and cost rules;
- busy-state gating;
- keyboard operation and focus return;
- pointer targets and unavailable reasons;
- live announcements;
- pause and terminal modal precedence.

Expected owners are `src/ui/SurvivalUI.ts`, `src/survival/SurvivalPhase.ts`,
`src/styles/main.css`, and the focused survival UI tests. Do not broaden this
slice into event, pause, journal, or ending redesign.

## Slice 3: Freighter Construction

### Outcome

Bring one repeatedly seen exterior area and one repeated interaction area toward
the lifeboat's authored-construction standard without changing gameplay space.

Use these concrete targets:

- **Exterior target:** the crew-cabin and wheelhouse superstructure, which
  dominates the title-screen vessel silhouette.
- **Interaction target:** the crew-cabin desk and bookcase cluster, which is
  immediately relevant because the player starts in the crew cabin.

Add economical details that explain construction: frames, seams, brackets,
fasteners, layered edges, attachments, and purposeful asymmetry. Do not use
indiscriminate polygon increases or mechanically exhaustive detail.

Preserve all authored layout coordinates, searchable surfaces, collision
contracts, player navigation, item placement, door and rail clearances,
deterministic construction, shared geometry policy, performance constraints,
and exactly-once geometry and material disposal.

Expected owners are `src/world/ShipGeometry.ts`,
`src/world/ShipDeckDetails.ts`, `src/world/ShipFurniture.ts`, and their focused
layout and geometry tests.

The current uncommitted ship-texture integration overlaps the freighter's
material ownership. Resolve or land that work before designing this slice, then
rebaseline the target areas so construction work complements rather than
duplicates the new material treatment.

## Slice 4: Selective Contact Depth

### Outcome

Make assembled pieces feel seated and layered without applying a dirty global
outline to the world.

Limit the prototype to:

- the approved crew-cabin and wheelhouse construction;
- the approved crew-cabin desk and bookcase cluster;
- the survival supply platform and its resting supplies.

Compare local geometry or material accents, baked or vertex-based cues, decals,
and a tightly limited screen-space method before selecting an implementation.
Prefer the smallest method that works across the chosen light and dark contacts.
Do not apply contact treatment to the sea, sky, or broad open surfaces.

The focused design must account for transparent materials, pixel ratio,
texture-size limits, resize behavior, renderer fallback, frame cost, resource
ownership, and disposal before adopting a method. A global AO stage is not the
default and requires evidence that the local approaches are insufficient.

Expected owners include `src/rendering/PostProcessingPipeline.ts`,
`src/rendering/PrintShader.ts`, `src/world/ShipGeometry.ts`,
`src/survival/BoatWorld.ts`, and `src/survival/BoatSupplyDisplay.ts`, depending
on the selected technique.

## Slice 5: Print-Treatment Retuning

### Outcome

Make the baseline print treatment recede behind authored form while preserving a
controlled increase in authored danger states.

Retune one calm baseline and one danger profile only after freighter construction
and contact depth are accepted. Separate the responsibilities of CSS interface
texture and scene-space posterization, ink framing, halftone, vignette, color
separation, and grain. Calm presentation should not make sky gradients or edge
pressure more legible than vessel construction. Danger treatment may intensify
selectively without obscuring controls, item colors, silhouettes, or weather.

Expected owners are `src/styles/main.css`,
`src/rendering/postProcessingProfiles.ts`, `src/rendering/PrintShader.ts`, and
`src/rendering/PostProcessingPipeline.ts`.

Preserve the direct-render fallback, CSS-pixel sampling behavior, maximum
texture-size limits, current danger semantics, stable reduced-motion grain
behavior, and renderer/resource disposal.

## Existing Validation Obligations

This roadmap adds no new validation infrastructure. Each implementation slice
still updates focused tests when it changes an authored layout, interaction
contract, presentation state, model or resource ownership, or rendering profile.
Use the normal game entry for browser observation and the existing typecheck,
build, and Vitest commands for regression coverage.

Visual claims must distinguish observed behavior from source- or test-supported
behavior when the environment cannot reach a pointer-locked or otherwise active
state.

## Completion Criteria

The remediation program is complete when all five slices have separately passed
their focused designs and implementation plans, their scoped code and regression
work is complete, and the resulting presentation conforms to the visual style
guide without changing gameplay scope.

Completion does not require implementing the three explicitly excluded audit
recommendations.
