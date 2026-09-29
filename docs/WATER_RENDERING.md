# Water rendering

[Game overview](../README.md) · [Architecture](ARCHITECTURE.md) · [Development](DEVELOPMENT.md)

This document describes the working tree reviewed on September 29, 2026.

## Quality settings

Water quality has two values: `low` and `high`.
The saved preference defaults to High. Invalid stored values also select High.
The `OceanRenderer` constructor defaults to Low when no quality is supplied.

Both settings share waves, hull contact, surface detail, fog, and event effects.
Low uses scene lighting and a procedural sky reflection.
High adds scene refraction and planar reflections.

## Modules

All modules below are in [`src/ocean`](../src/ocean).

| Module | Responsibility |
| --- | --- |
| `OceanRenderer` | Owns geometry, material, capture resources, quality changes, and preparation. |
| `oceanGeometry` | Builds the central surface and eight horizon panels. |
| `WaveField`, `waveModulation` | Share wave calculations between rendering and buoyancy. |
| `oceanShader` | Combines displacement, Low shading, event effects, and fog. |
| `oceanOptics` | Provides High normals, refraction, reflections, and sun highlights. |
| `highWaterLook` | Defines shared High day and night colors, light strength, fog, and open-water radiance. |
| `oceanFoam`, `oceanSurfaceDetail` | Generate procedural foam filaments, surface colors, and fine ripple normals. |
| `WaterExclusion`, `oceanHullProfile`, `waterContactShader` | Shape water around hulls and remove water inside them. |
| `OceanCapture` | Captures scene color, scene depth, and planar reflection color. |
| `UnderwaterGlowCapture` | Captures luminous bodies for both quality settings. |
| `UnderwaterGlowScattering` | Blurs captured light into a soft scattering texture. |

## Waves and geometry

Both settings use the same four modulated Gerstner waves as buoyancy.
Vortex settings deform the surface. The shader discards the vortex core.
High normals include horizontal wave displacement and vortex deformation.
Small High ripples fade with pixel footprint. Unresolved normal variation increases highlight roughness.

The central surface spans 180 metres. The horizon extends 1,100 metres from the center on each horizontal axis.
Eight horizon panels use frustum culling. Their bounds include wave and vortex displacement.
Panel edges share matching vertex positions. Horizon spacing increases toward the outer edge.

| Setting | Central grid | Horizon radial segments | Total triangles before culling |
| --- | --- | --- | --- |
| Low | 192 by 192 | 24 | 115,200 |
| High | 288 by 288 | 36 | 259,200 |

Up to two hull exclusion regions remove interior water.
Hull profiles support different widths, lengths, and tapers across their height.
Contact shaping adjusts water height and normals near the hull.

## Surface detail and lighting

Foam and ripples are procedural shader detail. There is no persistent foam texture or stored wake history.
Wind-aligned noise produces moving filaments and broken patches. Wave height changes their width and strength.
Fine ripple normals use pixel filtering. Filament opacity fades between 45 and 150 metres of view depth.
Both settings apply this detail before blood color, underwater glow, and fog.

Scavenging and survival share the High lighting presets.
Sea fog modifies High colors, fog density, and direct light strength.
Open water uses authored radiance without a physical floor.
Nearby submerged objects use captured color and depth.

## Capture preparation

The first water color draw after an ocean update prepares capture textures.
Depth and outline override draws skip preparation. Horizon draws reuse the prepared textures.
A camera change triggers preparation again. A guard prevents recursive preparation during capture draws.
When enabled, underwater glow is captured before the High scene captures.

High scene capture hides the water and renders scene color and depth.
It hides the registered refraction background, including the procedural sky.
Three.js `Reflector` supplies the clipped reflected view.
Reflections retain sky color and transparent effects, even when those effects do not write depth.
The reflection camera hides sky clouds and excludes the weather particle layer. Lightning remains visible.

Scene captures use half resolution, capped at 1,024 pixels per axis, while preserving aspect ratio.
They reuse world transforms from the outer render.
Capture restores water visibility, background visibility, matrix updates, render targets, viewports, scissor, XR, and shadow state after errors.

Refraction rejects foreground depth samples. Underwater path length controls RGB absorption.
Long paths blend toward the authored open-water background.
Reflection distortion is applied in world space before projection. Reflection edges blend into the procedural sky reflection.
Fresnel controls reflection strength. GGX controls sun highlights.
Planar reflections approximate the sea at its mean plane. They do not trace reflections between waves.

## Underwater glow

The Jellyfish event (`flowers`) enables glow capture. Event cleanup disables it.
Luminous jellyfish meshes also use `UNDERWATER_GLOW_LAYER`.
Glow works in both quality settings and survives quality changes.

The capture renders only that layer against a transparent black background.
It records linear color and depth at viewport resolution, capped at 2,048 pixels per axis.
This preserves thin tentacles better than the High scene capture's half resolution.

Scattering downsamples the captured color to one quarter of each dimension.
Two horizontal and vertical blur cycles reuse two targets.
The passes use Three.js blur shaders and a full-screen quad.

The water shader adds three light components:

- Drifting plankton noise, with wave-height modulation and distance fade.
- Soft scattering sampled from the blurred creature capture.
- Direct creature color, attenuated by underwater path length when captured depth lies behind the surface.

Scattering is a screen-space blur. It is not a volume simulation.
The capture restores camera layers, background, clear color, render target, viewport, scissor, XR, and shadow state after errors.

## Resource lifecycle

High owns three sampled textures: scene color, scene depth, and reflection color.
Switching to Low releases those capture resources and replaces the surface geometry.
Glow resources remain independent of quality. Disabling glow releases its capture and blur targets and clears its uniforms.
Disposal releases all capture resources, geometry, and the water material.
Steady updates reuse vectors, matrices, uniforms, and targets. Capture targets resize only when their required dimensions change.

## Verification

Run the development server with `bun run dev`.
Use System Tuning to inspect water in the game. See [Development](DEVELOPMENT.md#inspect-the-game).

- Check both water quality settings in daytime and nighttime scenes.
- Check hull edges, reflections, and waves during scavenging and survival.
- Change weather and post-processing settings. Check for shader or WebGL errors.
- Check weather particles and their exclusion from reflections.
- Check Jellyfish glow in the game at both quality settings, then close the event and check cleanup.

Existing tests cover capture sizing, state restoration, preparation reuse, quality changes, and glow cleanup:

```powershell
bun run test tests/OceanCapture.test.ts tests/OceanRenderer.test.ts tests/UnderwaterGlowCapture.test.ts
```

Run a browser check after rendering changes. Unit checks do not measure GPU performance.
Profile the current renderer on representative hardware to assess the 1080p, 60 FPS target.
