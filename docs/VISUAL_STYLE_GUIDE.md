# Visual Style Guide

## Purpose and authority

This document is the canonical source for the game's intended visual identity.
Feature specifications may interpret it for a particular scene or asset, but
they should not silently replace it. Existing gameplay, accessibility,
engineering, ownership, and shared-wave contracts remain authoritative.

Use the original game as a character reference, not as artwork to reproduce.
This project makes its own cleaner, authored interpretation: never copy
proprietary artwork, icons, fonts, textures, layouts, or presentation
one-for-one. The guide is descriptive rather than a universal component
library, asset recipe, numeric token set, or shader prescription.

## Visual north star

The intended identity combines **dark comedy** with **melancholic maritime
isolation**. It should look composed and made by people: an illustrated,
weathered sea world whose eccentric objects and theatrical moments remain
believable enough to feel lonely when the horizon opens up.

Let loneliness come from weather, distance, negative space, and worn human
objects. Let comedy come from eccentric silhouettes, proportions,
juxtapositions, timing, and small theatrical details. Do not make the comedy
elastic, bright, or frivolous, and do not make melancholy depend on universal
darkness or dirt.

## Four visual pillars

### Authored illustrated forms

Build recognizable, moderately detailed stylized forms with deliberate
proportions, purposeful asymmetry, and selective wear. Low-poly construction
is economical stylization, not unfinished work: it should simplify a form
without leaving it as a large, smooth primitive.

Support silhouettes with seams, ribs, fasteners, handles, folds, joints,
layered profiles, and purposeful irregularity. Preserve believable weight,
balance, attachment, and resting behavior even when a proportion is exaggerated
for recognition or dark comedy.

### Scene-integrated interface

Keep the world dominant. Persistent UI is sparse and illustrated; attach
contextual information to physical subjects; reserve full panels for journals,
major decisions, pauses, and endings. A prompt near a projected item or a short
top-center caption belongs to the scene more readily than a generic central
software panel.

### Tactile keyed motion

Author discrete interactions with anticipation, decisive travel, restrained
overshoot, imperfect settling, held poses, and clean base-state restoration.
The sequence should show intent and weight, then leave a readable result rather
than continuously drifting or bouncing.

### Restrained print treatment

Use selective contact depth, tonal shaping, fine grain, mild halftone, and
quiet edge pressure to unify an image that geometry, materials, lighting,
composition, and motion have already authored. Print treatment supports that
substance; it does not conceal weak assets.

## Emotional tone

Stage maritime melancholy through a hostile sea, muted weather, separation,
and meaningful empty space. A repaired bucket, a salt-marked rail, or a lone
lamp can carry more human presence than a crowded set. Stage dark comedy with
a stubbornly oversized tool, a crooked stack, an awkward pause, or an object
whose silhouette slightly overcommits to its job.

Favor contrast between fragile human-made objects and broad sea or sky. Let
the staging stay legible and quiet enough for a small theatrical detail to
land; do not fill every gap with decoration, motion, or noise.

## UI

### Hierarchy and placement

Use a sparse illustrated corner hierarchy for persistent condition symbols, a
physical journal marker, and only the controls needed during play. Keep the
center open for world observation, transient prompts, and event staging.

Place contextual item names, actions, costs, and unavailable reasons beside
their physical subject when possible. Use a concise top-center caption when
the subject or moment needs a shared focal point. Full parchment, journal,
timber, or ink-backed panels are justified for journal reading, major
decisions, pauses, and endings—not ordinary confirmation or status display.

### Component materials and shapes

Make every UI component feel like one coherent material metaphor at a time.
Paper may have torn, worn, or uneven edges; timber has thickness, grain
direction, and weight; brush and ink strips remain compact and high-contrast.
Do not combine unrelated paper, metal, cloth, and neon treatments merely to
make a control look busy.

Deliberate imperfection is structural, not random damage. A worn paper edge or
slightly irregular ink contour should reinforce the component's construction,
remain readable at interaction distance, and repeat consistently across the
screen.

### Typography

Assign separate roles to expressive display lettering, readable narrative
lettering, and stable numerals. Use expressive, slightly irregular display
lettering for titles and short prompts; use a readable handwritten or humanist
face for narrative and contextual copy; use stable numerals for timers,
quantities, and values scanned quickly.

Do not ask one novelty face to serve every role. Preserve readable sizing,
spacing, contrast, and keyboard-operable labels even where display treatment
is expressive.

### Icons and artwork

Use illustrated icons with strong silhouettes, dark contours, selective
highlights, and consistent internal irregularity. Their construction and stroke
language should agree across screens, so a status icon reads as part of the
same world as a journal marker or contextual action.

Avoid generic vector-library symbols, perfectly uniform strokes, or decoration
that hides a symbol's purpose. An icon should remain recognizable before its
small highlights and texture are noticed.

### Interaction and semantic states

Color reinforces meaning but never carries it alone. Communicate hover, focus,
selected, danger, unavailable, and disabled states through shape, text,
outline, or value in addition to color. For example, focus can gain a clear
outline and label treatment; unavailable can state its reason beside a reduced
value treatment; danger can combine a warning shape with contrast.

Keep keyboard operation visible and reliable: focus should be evident without a
pointer, selected state should remain distinct from hover, and disabled styling
must not erase legibility. Contextual UI should explain constraints where the
player encounters them rather than hiding the reason in a distant panel.

### Motion and reduced motion

For UI reveals, journal movement, activity gestures, event staging, and short
camera beats, use a small anticipation, decisive action, restrained overshoot
or impact, an imperfect settled held pose, and clean return to the authored
base state. Match the beat to material and mass: paper snaps or flutters,
timber shifts heavily, and metal lands sharply.

When `prefers-reduced-motion` is active, preserve state order and clarity but
replace travel, jolts, and decorative loops with direct poses or short fades.
Do not use constant idle wobble, identical easing, long floaty transitions, or
exaggerated squash-and-stretch as the default interaction language.

## Models and shape language

Start with a readable silhouette, then add only construction details that
explain form or use. Favor varied planes, selective beveling, layered profiles,
slight asymmetry, and edge treatments over smooth primitive assemblies, perfect
symmetry, razor-sharp manufactured edges, or mechanically exhaustive realism.

Low-poly assets should read as consciously constructed at gameplay distance.
Keep the plane economy, but use seams, ribs, fasteners, handles, folds, joints,
and purposeful irregularity where they clarify mass, attachment, or use.

## Materials and surface storytelling

Give paper, timber, ink, metal, and cloth components one coherent material
metaphor at a time. World materials such as wood, painted steel, rope, cloth,
paper, glass, and rubber need distinct value structure, roughness, edge
behavior, and restrained surface variation that read at gameplay distance.

Tell surface stories locally: handled edges show contact; salt and water follow
exposed surfaces; repairs interrupt original construction; rust follows joints,
damage, and drainage; folds and compression respond to a material's placement.
Avoid uniform grime and photoreal micro-detail that obscure illustrated forms.

## Lighting and ambient occlusion

Light form, placement, and hierarchy first. Use ambient occlusion selectively
for contact, overlaps, seams, interiors, and crevices; never apply it as a
global dirty outline or use it to crush already dark materials. It should make
an object feel seated, layered, or assembled—not simply dirtier.

Use lighting and selective AO to support authored geometry and material
separation at play distance. Do not depend on global shadowing to create depth
that construction, staging, or values have not established.

## Composition and staging

Compose maritime scenes as authored tableaus with clear foreground, midground,
and horizon relationships. Group props for silhouette and narrative association
rather than scattering them to fill space. Reserve negative space for weather,
distance, and loneliness; use an eccentric form or juxtaposition as a measured
comic accent.

Make important physical subjects readable before surrounding decoration. The
world should leave room for contextual UI and staged interactions without
turning every moment into a centered panel or a crowded prop display.

## Color and atmosphere

Favor cool cyan, blue-grey, and storm tones for sea and sky; use deep warm
browns, rusts, and parchment for human-made objects; reserve small safety-color
accents for interaction and dark comedy. Use value and material contrast to
keep a focal subject readable when the palette is subdued.

Atmosphere is conditional. Weather, time, distance, and scene purpose can
change the balance, but not by making every state uniformly dark, noisy, or
dramatic. Color is meaningful support, never the only carrier of a UI state.

## Animation language

Use tactile keyed beats for authored interactions: anticipation establishes
intent, the main movement travels decisively, a restrained overshoot or impact
shows weight, and the element settles imperfectly into a held pose before a
clean base-state restoration. Make timing and pose communicate the joke or the
effort.

Keep ocean, buoyancy, vessel motion, rope, smoke, and other continuous
physical systems fluid and coherent. The shared wave field remains the source
of truth for ocean rendering, buoyancy, and vessel motion; continuous systems
must not be mechanically stepped merely to imitate keyed animation.

## Post-processing

Post-processing is a finishing layer. Selective screen-space or baked AO
supports authored contacts and overlaps; mild tonal compression and controlled
contrast support graphic cohesion; fine stable grain and sparse halftone
support a print-like surface; a soft irregular frame and restrained vignette
support edge pressure while protecting controls and the central play area.
Subtle posterization and color separation can support the illustrated palette
without damaging gradients, item colors, or silhouettes.

Keep grain, halftone, posterization, color separation, vignette, and irregular
framing quiet at baseline and conditionally stronger for authored danger,
storm, night, dreamlike, or ending profiles. Effects must reveal and unify
underlying authored work, never compensate for weak models, lighting, materials,
or composition.

## Prefer and avoid

| Prefer | Avoid |
| --- | --- |
| Scene-integrated controls beside props or concise captions | Generic centered software panels for routine actions |
| Constructed stylized models with readable seams, layers, and attachments | Smooth primitive assemblies that stop at a silhouette |
| Local wear at handles, drainage paths, repairs, and folds | Uniform grime spread evenly over every surface |
| Selective AO at contacts, overlaps, seams, interiors, and crevices | Crushed global crevices or a dirty outline around everything |
| Tactile keyed beats with held poses and decisive travel | Long floaty easing, constant wobble, or default bounce |
| Quiet print cohesion that supports art direction | Effects used to conceal weak assets, staging, or lighting |
| Clear material identity at gameplay distance | Photoreal micro-detail that clashes with illustrated forms |
| Authored asymmetry that explains history or construction | Random distortion mistaken for character |

## Applying the guide

Read this guide before authoring a visual feature, then state how that feature
interprets the north star and four pillars. Put specific UI decisions before
world-art details in feature specifications when both are in scope, because UI
is the primary guidance need and shares the player's attention with play.

Choose methods appropriate to the feature; do not turn this document into a
local exception or universal numeric rule. Existing gameplay rules,
accessibility, keyboard operation, reduced-motion behavior, deterministic
systems, explicit resource ownership, desktop scope, and shared-wave contracts
remain authoritative. Update this guide only when the intended identity
changes; record local variations in the feature specification instead.
