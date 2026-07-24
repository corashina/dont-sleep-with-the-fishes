# Visual Style Guide and Audit Design

**Date:** 2026-07-24

**Status:** Approved design

## Goal

Create a durable visual direction for *Don't Sleep With The Fishes* and audit
the current game against it.

The direction should prevent future work from feeling basic, overly smooth,
generic, or demo-like. It should give UI the most detailed treatment while
also guiding models, shapes, materials, lighting, composition, animation, and
post-processing. The result will be descriptive rather than rigid: it should
help contributors make coherent judgments without prescribing one exact
component library, modeling recipe, or shader implementation.

This documentation effort will also produce a dated current-state audit with
prioritized findings and concrete recommendations. It will not implement the
recommended visual changes.

## Context

The repository currently distributes its visual intent across feature-specific
designs and implementation details. Those sources use overlapping terms such as
official-inspired, hand-printed, moderately detailed low-poly, grounded
maritime, and restrained print-horror, but no canonical document defines how
those ideas relate.

The supplied original-game screenshots and animations establish the reference
character: illustrated status icons, painterly low-poly objects, tactile
controls, staged physical interactions, a world-dominant interface, print
texture, and deliberately simple theatrical movement. This project will use
that character as a north star without reproducing the original game's
proprietary artwork or matching its presentation one-for-one.

The selected direction is a cleaner, more polished interpretation with its own
coherent authorship.

## Documentation Architecture

Use a layered documentation structure.

### `docs/VISUAL_STYLE_GUIDE.md`

This is the canonical, durable source of truth for visual intent. It will
describe:

- the emotional and aesthetic direction;
- visual principles and failure modes;
- UI hierarchy, materials, typography, icons, states, and placement;
- model construction, shape language, proportions, and silhouettes;
- material, surface-detail, lighting, and composition principles;
- animation rhythm and reduced-motion behavior;
- post-processing purpose, restraint, and escalation;
- practical prefer/avoid examples;
- how future visual specifications should interpret the guide.

The guide will remain descriptive. It will not impose a fixed component
library, universal numeric style tokens, one asset source, or exact shader
settings.

### `AGENTS.md`

Add a compact `Visual direction` section that:

- summarizes the identity in a few paragraphs;
- names the four core visual pillars;
- directs visual work to read `docs/VISUAL_STYLE_GUIDE.md`;
- states that post-processing supports authored substance rather than replacing
  it;
- keeps the existing engineering and milestone rules intact.

The detailed guide will not be duplicated in `AGENTS.md`, avoiding divergence
and keeping the always-loaded agent context focused.

### `README.md`

Add a short player- and developer-facing description of the visual identity.
Link to the canonical style guide and current audit. Do not turn the README
into an art-production manual.

### `docs/VISUAL_AUDIT.md`

Keep the current-state audit separate because it is time-sensitive. Each
finding will record:

- scene, state, component, and relevant files;
- the observed mismatch;
- the style principle it conflicts with;
- the player-facing impact;
- a concrete recommended direction;
- priority;
- dependencies and verification.

Resolved findings can be marked complete or removed without rewriting the
durable guide.

### Existing specifications

Existing feature specifications remain historical records. The canonical
visual style guide governs future visual intent when an older specification
uses a conflicting aesthetic description. Existing gameplay rules,
accessibility contracts, engineering boundaries, and resource-ownership
requirements remain authoritative.

## Core Visual Doctrine

The game is a cleaner, authored interpretation of the original game's
character, not a replica. Its emotional center combines **dark comedy** with
**melancholic maritime isolation**.

The melancholy comes from weather, distance, negative space, worn materials,
and the survivor's physical relationship with a hostile sea. The comedy comes
from eccentric silhouettes, proportions, objects, juxtapositions, timing, and
small theatrical details. The comedy should not turn the whole game elastic,
bright, or frivolous.

Four principles organize the direction.

### Authored illustrated forms

Use recognizable silhouettes, deliberate proportions, purposeful asymmetry,
secondary construction forms, selective wear, and enough detail to feel made
rather than generated from primitives. Stylization may exaggerate recognition
and personality while preserving believable weight and function.

### Scene-integrated interface

Keep the world dominant. Persistent UI is sparse and illustrated. Contextual
information appears beside physical subjects or during meaningful moments.
Large panels are reserved for experiences that justify them.

### Tactile keyed motion

Use anticipation, decisive movement, restrained overshoot or irregular
settling, and readable held poses. Avoid long, weightless continuous easing and
excessive cartoon elasticity.

### Restrained print treatment

Use selective ambient occlusion, tonal shaping, fine grain, mild halftone, and
quiet edge pressure to unify the authored image. Geometry, materials, lighting,
composition, and motion must create the substance before post-processing is
applied.

## Visual Failure Modes

The guide will explicitly discourage:

- generic modern web panels and uniform rounded components;
- smooth primitives with little structural or surface authorship;
- photorealistic assets that clash with illustrated surroundings;
- treating low-poly construction as permission for unfinished geometry;
- heavy post-processing used to disguise weak models, lighting, or composition;
- uniform grime, noise, ambient occlusion, or vignette across every scene;
- long, frictionless UI easing that makes interaction feel like a prototype;
- mechanically exhaustive realism that loses the illustrated shape language;
- exaggerated squash and bounce as the default motion language;
- direct copying of proprietary reference artwork, fonts, icons, or textures.

## UI Language

Persistent UI uses a sparse illustrated corner hierarchy: bold condition
symbols, a physical journal marker, and a small number of materially grounded
controls. The center remains available for the world, transient prompts, and
event staging.

Contextual UI should feel attached to its subject. Item names, actions, costs,
and unavailable reasons appear near projected physical props or in short
top-center captions. Full parchment, journal, timber, or ink-backed panels are
reserved for journal reading, major decisions, pause states, and endings.

UI shapes are deliberately imperfect rather than randomly distorted:

- paper has torn, worn, or uneven edges;
- timber has thickness, grain direction, and weight;
- brush and ink strips stay compact and high-contrast;
- one component uses one clear material metaphor instead of accumulating
  unrelated decoration.

Typography has distinct roles:

- expressive, slightly irregular display lettering for titles and short
  prompts;
- a readable handwritten or humanist face for narrative and contextual copy;
- stable numerals for timers, quantities, and rapidly scanned values.

Icons should appear illustrated rather than sourced from a generic vector
library. They use strong silhouettes, dark contours, selective highlights, and
small internal irregularities. Construction and stroke language remain
consistent across screens.

Color reinforces meaning but never carries it alone. Focus, hover, selected,
dangerous, unavailable, and disabled states also use outline, shape, text, or
value contrast. Keyboard operation, readable sizing, and reduced-motion
behavior remain part of the visual standard.

## Models and Shape Language

Models target moderately detailed stylization. Silhouette comes first, but
silhouettes are supported by construction details that explain the object's
form or use: seams, ribs, fasteners, handles, folds, joints, edge treatments,
and similar secondary elements.

Low-poly describes an economical shape language, not an unfinished asset.
Avoid large uninterrupted primitives, perfect symmetry, razor-sharp
manufactured edges, and needless mechanical completeness. Use slight
asymmetry, varied planes, selective beveling, layered profiles, and purposeful
irregularity.

Proportions may be exaggerated for recognition or dark comedy, but objects
retain believable mass, balance, attachment, and resting behavior.

## Materials, Lighting, and Composition

Materials must read at gameplay distance. Wood, painted steel, rope, cloth,
paper, glass, and rubber receive distinct value structure, roughness, edge
behavior, and restrained surface variation.

Wear tells a local story:

- handled edges show contact;
- salt and water exposure follow believable surfaces;
- repairs interrupt the original construction;
- rust follows joints, damage, and drainage;
- folds and compression respond to material and placement.

Uniform dirt and photographic micro-detail should not obscure the illustrated
forms.

The palette emphasizes cool cyan, blue-grey, and storm tones for sea and sky;
deep warm browns, rusts, and parchment for human-made objects; and small safety
color accents for interaction and dark comedy.

Compose scenes as authored maritime tableaus with clear foreground, midground,
and horizon relationships. Group props for readable silhouettes and narrative
association rather than scattering them to fill space. Negative space,
weather, and distance carry melancholy; eccentric forms and juxtapositions
carry comedy.

Lighting establishes form first. Selective ambient occlusion then strengthens
contact points, overlaps, deck seams, interiors, and crevices. AO must not
become a global dirty outline or crush already dark materials.

## Motion Language

Authored interactions use tactile keyed beats:

1. a small anticipation establishes intent;
2. the main action travels decisively;
3. restrained overshoot, tilt, or impact communicates weight;
4. the element settles imperfectly into a readable held pose;
5. the sequence returns cleanly to its authored base state.

This applies to item inspection, UI reveals, journal movement, activity
gestures, event staging, and short camera beats.

Continuous physical systems remain fluid. The ocean, buoyancy, vessel motion,
rope, smoke, and similar systems should not be mechanically stepped to imitate
keyed animation. The shared wave field continues to govern ocean and vessel
motion.

Motion varies by material and mass. Paper snaps or flutters, timber shifts
heavily, metal lands sharply, and suspended objects lag slightly. Avoid
constant idle wobble, identical easing everywhere, long floaty transitions,
and exaggerated squash-and-stretch.

Reduced motion preserves state order and clarity while replacing travel,
jolts, and decorative loops with direct poses or short fades.

## Post-Processing

Post-processing is a finishing layer:

- selective screen-space or baked AO strengthens contact and depth;
- mild tonal compression and controlled contrast add graphic cohesion;
- fine, stable grain and sparse halftone suggest print;
- a soft irregular frame and restrained vignette create edge pressure while
  protecting controls and the central play area;
- posterization and color separation remain subtle enough to preserve
  gradients, item colors, and silhouettes.

The baseline remains quiet. Squalls, danger, night, dreamlike events, and
endings may temporarily intensify selected effects through authored profiles.
No profile should make every scene equally dirty, dark, noisy, or dramatic.

## Visual Audit

Inspect both game phases through repository source and browser observation.
Cover representative states:

- start and pause screens;
- active and critical scavenging;
- normal lifeboat survival;
- projected item interactions;
- fishing;
- journal;
- events and endings where reachable;
- day, night, and weather variation;
- reduced motion;
- supported desktop viewports.

Group findings by:

- UI and typography;
- models and silhouettes;
- materials and surface detail;
- lighting and post-processing;
- composition and visual hierarchy;
- animation and transitions;
- consistency between phases.

Use three priorities:

- **Foundational:** a systemic mismatch that shapes many screens or assets.
- **High-impact:** a conspicuous mismatch in an important repeated experience.
- **Polish:** a bounded improvement that adds finish after the foundation is
  coherent.

Prioritize coherent UI language, model construction, contact depth, authored
composition, and motion before cosmetic filters.

The audit is dated and described as a current-state snapshot. Recommendations
should be concrete enough to seed later implementation specifications without
pretending to be the implementation plan themselves.

## Validation and Maintenance

Validate the documentation by:

- confirming `AGENTS.md`, README, guide, and audit agree on terminology and
  authority;
- checking that accessibility, keyboard operation, reduced motion, desktop
  scope, deterministic gameplay, explicit ownership, and shared-wave
  requirements remain intact;
- reviewing the current game in the browser at representative states and
  desktop viewports;
- verifying each audit finding against visible behavior or current source;
- distinguishing foundational visual problems from optional polish;
- scanning for vague placeholders, contradictions, and advice that can be
  misread as “add more effects.”

Future visual specifications should state how they interpret the guide. Change
the guide only when the intended identity changes, not whenever one feature
chooses a local variation.

The original game may be named as inspiration, but its proprietary screenshots
and artwork will not be committed as project assets. Use original project
artwork and written principles.

## Implementation Scope

The implementation following this design changes documentation only:

- add `docs/VISUAL_STYLE_GUIDE.md`;
- add `docs/VISUAL_AUDIT.md`;
- add a concise visual-direction section to `AGENTS.md`;
- add a short visual-identity summary and documentation links to `README.md`.

Browser observation, source inspection, and temporary local captures may be
used to support the audit. Temporary visual-companion and inspection artifacts
remain ignored and uncommitted.

## Non-Goals

- Implementing visual remediation from the audit.
- Changing gameplay, balance, phase lifecycle, input, world construction, or
  survival rules.
- Adding saves, touch or mobile controls, crewmates, multiplayer, or persistent
  progression.
- Replacing existing engineering or asset-ownership requirements.
- Committing proprietary reference images or copying original-game assets.
- Standardizing every visual decision into mandatory numeric tokens.
- Selecting a specific AO implementation, rendering pass, font license, model
  source, or animation framework before a focused implementation design.
