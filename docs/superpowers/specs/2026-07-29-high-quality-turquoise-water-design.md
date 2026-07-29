# High-Quality Turquoise Water Design

## Goal

Add an optional high-quality ocean. High water looks richer, smoother, and
more realistic. It uses a turquoise daylight palette that responds to weather.

Keep the current ocean as the default Low setting. Separate water quality from
ambient occlusion quality in the system tuning menu.

## Menu

Rename the current `VISUAL QUALITY` control to `AO QUALITY`. Keep its saved
Low and High values and its immediate ambient occlusion update.

Add a second `WATER QUALITY` control below it. It has Low and High buttons,
visible selected state, keyboard focus, and this helper text:

`High adds smoother waves and richer surface detail.`

Water quality uses its own local storage key. Invalid or unavailable storage
falls back to Low. A change applies at once to the active game phase.

## Water modes

### Low

Low remains the default. It preserves the current ocean shader, palette,
geometry density, detail distance, foam, reflections, and GPU cost.

### High

High keeps the four shared gameplay waves. It improves only ocean rendering:

- denser nearby geometry creates smoother wave silhouettes;
- crossed wind ripples add strong medium and fine normal detail;
- ripple strength stays clearly visible beside Low during calm daylight;
- turquoise body color gains stronger crest transmission and trough depth;
- sky reflections gain clearer normal variation and surface contrast;
- sun glints stretch into restrained wind-aligned highlights;
- crest caps use lower High-only thresholds to produce more foam;
- broken foam streaks trail from crests and drift with the wind;
- layered noise breaks foam edges and prevents regular bands;
- small detail fades before the horizon to prevent shimmer and wasted work.

The High setting must change surface structure, foam coverage, reflections,
and depth. A color-only difference does not meet the design.

High water reads as an authored, illustrated sea. It does not use a photo
texture, screen-space reflection, scene-depth refraction, or simulated
caustics. These features add cost and conflict with the current renderer.

## Weather response

High water derives its final color from the existing ocean atmosphere.
Daylight supports the strongest turquoise. Fog color, sky color, horizon
color, and direct-light strength mute it during storms, fog, and night.

Weather still controls the shared wave amplitude. Water quality never changes
wave height, buoyancy, vessel motion, fishing placement, or gameplay rules.

## Architecture

Add a dedicated `WaterQuality` preference with Low and High values. The game
owns this preference and passes it through `PhaseContext`.

`GamePhase` gains an optional `setWaterQuality` method. The game calls it after
a menu change. New phases read the saved value during construction.

`ScavengePhase` and `SurvivalPhase` forward the value to their owned world.
`World` and `BoatWorld` forward it to their owned `OceanRenderer`.

`OceanRenderer` owns all quality-dependent geometry and shader state. Its
`setQuality` method:

1. returns when the value did not change;
2. replaces the nearby and horizon geometry when density changes;
3. disposes each replaced geometry exactly once;
4. enables or removes the high-quality shader define;
5. updates quality-specific detail distances and water colors;
6. marks the material for shader recompilation.

The update and render paths create no objects. Quality changes can allocate
because they happen only after a menu action or phase construction.

The existing AO preference can keep its internal compatibility names. It only
drives the post-processing ambient occlusion pass. Player-facing text calls it
AO Quality.

## Error and lifecycle behavior

Blocked storage does not stop either quality control. The in-memory selection
still applies.

An inactive phase receives no update. A new phase reads the latest saved water
quality. Phase disposal removes its ocean and disposes the current geometry and
material once.

The ocean keeps one material. Shader mode changes use the same owned material.
No texture asset, loader, listener, timer, or random source is added.

## Verification

Automated tests cover:

- Low is the default for AO and water;
- each preference uses a separate storage key;
- both controls expose correct labels, helper text, pressed state, and focus;
- a water menu change reaches the active phase immediately;
- a new phase receives the current water quality;
- Low keeps the current ocean configuration;
- High selects denser geometry, longer detail range, turquoise colors, and the
  high shader define;
- High uses visibly stronger crossed ripple normals than Low;
- High uses separate foam thresholds and adds drifting foam streaks;
- equal quality values do not rebuild resources;
- a quality change disposes replaced geometry once;
- final disposal cleans the active geometry and material once;
- water quality does not change the shared wave data.

Run the focused unit tests, full test suite, type check, and production build.
Visually compare Low and High in calm daylight, storm, fog, and night scenes.
The calm comparison must show more than a palette change. High must show
stronger ripples, more crest foam, broken foam streaks, and deeper troughs.

## Out of scope

- Changes to gameplay waves or buoyancy
- Image-based water textures
- Screen-space reflections or refraction
- Underwater rendering or shore caustics
- New weather rules
- Alternate reduced-motion behavior
