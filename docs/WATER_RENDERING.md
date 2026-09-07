# Water rendering

Water quality has two values: `low` and `high`. High is the default.
Invalid stored values use the default. There is no obsolete quality migration.

## Modules

- `OceanRenderer` owns the surface, horizon, material, and High resources.
- `oceanShader` contains shared geometry and Low shading.
- `oceanOptics` contains High shading. Colors and capture textures use linear light.
- `OceanFoam` owns a persistent 512-square foam field covering 128 metres.
- `OceanCapture` owns scene color, depth, and planar reflection captures.

Both quality levels use the same Gerstner waves as buoyancy.
High normals include horizontal wave displacement and vortex deformation.
Small ripples fade with pixel footprint. Unresolved normal variation increases highlight roughness.

## High preparation

The first water color draw after an ocean update prepares its textures.
Depth and outline override draws do not run preparation.
The horizon reuses the same textures. Another camera gets its own preparation.

Foam moves through a bounded texture. Moving the ocean origin reprojects the previous texture.
Wave compression deposits whitecaps. Hull contact and movement deposit foam trails.
Exponential source and decay integration controls foam lifetime. Time reversal and teleport clear history.
The shader adds filtered bubble detail and broken patch edges.

Scene capture hides the water and renders color and depth.
Three.js Reflector supplies the clipped reflected view.
Each capture uses half resolution, capped at 1024 pixels per axis.
Capture restores render targets, viewports, scissor state, XR, and shadow update state.

Refraction rejects foreground depth samples. Underwater distance controls RGB absorption.
Fresnel controls reflection strength. GGX controls sun highlights.
Planar reflections approximate the sea with its mean plane. Large waves remain an approximation.

Switching to Low releases all five High textures. Disposal releases geometry and material resources.
Steady frame updates reuse vectors, matrices, arrays, and targets.

## Visual checks

Start Vite, then open `/dont-sleep-with-the-fishes/scripts/water-lab/`.
The lab is a development fixture. It is not part of the production menu.
It includes submerged objects, reflection markers, a moving hull, and game post-processing.

Checked on 2026-09-07:

- Calm and rough High water compiled without shader or WebGL errors.
- Scene reflections, submerged objects, hull trails, and broken whitecaps were visible.
- Night foam followed scene lighting.
- Direct rendering and game post-processing both rendered correctly.
- High to Low reduced allocated textures by five. High could then be restored.
- Full suite: 109 files and 1,710 tests passed.
- Final water checks: six files and 29 tests passed.
- TypeScript, ESLint, and production build passed.

The fixture showed roughly 7 ms frame intervals at 1280 by 720 on this machine.
This is not a full-game GPU benchmark. The 1080p, 60 FPS desktop target still needs representative hardware profiling.
The production build retains its large-chunk warning.
