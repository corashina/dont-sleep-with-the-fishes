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

`highWaterLook` owns the approved lab's day and night lighting presets.
Scavenging, survival, and the lab use the same High sun direction, colors, and water fog.
Reflection depth separates real object reflections from the shared reflected sky background.
Deep water uses the lab's shallow optical background without adding a floor to gameplay worlds.
Nearby submerged objects retain scene refraction. Weather still drives the shared waves and foam.
Low water continues to use scene lighting.

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

## Shader performance

Both settings skip vortex calculations when its strength is zero.
Low skips detail past its existing fade distance and foam where coverage is zero.
High computes wave height and displaced normals in one wave loop.
High skips foam noise below the minimum density and bubbles where coverage is zero.
Screen derivatives run before the foam coverage branch.

On 2026-09-08, paired 1080p water draws were measured on an RTX 4070 Ti.
Each case used 120 warm-up frames, then 300 alternating before/after pairs.
Each timing covered eight draws and was divided by eight to reduce timing noise.
Both versions used the same geometry, capture textures, foam texture, camera, and simulation time.

| View | Low before / after | High before / after |
| --- | --- | --- |
| Calm, day | 0.208 / 0.127 ms | 0.307 / 0.240 ms |
| Rough, day | 0.241 / 0.168 ms | 0.318 / 0.269 ms |
| Horizon, rough, night | 0.216 / 0.146 ms | 0.213 / 0.183 ms |
| Active vortex, day | 0.236 / 0.151 ms | 0.230 / 0.181 ms |

These are median water draw times, excluding capture, foam simulation, and the rest of the frame.
They do not measure an equivalent gain in full-game FPS.
Pixel comparisons covered all eight cases at the same simulation time.
Low differed by at most one channel level in six pixels per image.
The largest High difference affected 462 of 2,073,600 pixels by more than one channel level.
Its mean channel error was below 0.001 on the 0–255 scale.
No shader or WebGL errors occurred.

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
